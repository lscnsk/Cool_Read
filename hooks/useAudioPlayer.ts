import { useState, useRef, useEffect, useCallback } from 'react';
import { Book } from '../types';

export const useAudioPlayer = (currentBook: Book | null, currentChapterIndex: number) => {
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const loadedUrlRef = useRef<string | null>(null); // Track loaded URL explicitly

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const pendingSeekRef = useRef<number | null>(null);

  const currentBookRef = useRef(currentBook);
  const currentChapterIndexRef = useRef(currentChapterIndex);

  // Synchronously update refs during render to avoid stale references in callbacks
  currentBookRef.current = currentBook;
  currentChapterIndexRef.current = currentChapterIndex;

  const togglePlay = useCallback(() => {
     if (audioRef.current.paused) {
         audioRef.current.play().catch(e => console.warn(e));
         setIsPlaying(true);
     } else {
         audioRef.current.pause();
         setIsPlaying(false);
     }
  }, []);

  // Restore State helper
  const restoreState = useCallback((time: number, rate: number, autoPlay: boolean) => {
      if (Number.isFinite(time)) {
          if (audioRef.current.readyState >= 1) {
              audioRef.current.currentTime = time;
          } else {
              pendingSeekRef.current = time;
          }
          
          const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
          if (chapter && chapter.startTime !== undefined) {
              setCurrentTime(Math.max(0, time - chapter.startTime));
          } else {
              setCurrentTime(time);
          }
      }
      if (rate) setPlaybackRate(rate);
      if (autoPlay) setIsPlaying(true);
  }, []);

  // Handle Source Change
  useEffect(() => {
    if (!currentBook || currentBook.type !== 'audio') {
        audioRef.current.pause();
        return;
    }
    
    // Immediately reset chapter progress to beginning when switching chapters or books
    setCurrentTime(0);
    
    const audio = audioRef.current;
    const chapter = currentBook.chapters[currentChapterIndex];
    
    // Check if we need to load a new Source
    if (chapter?.url && loadedUrlRef.current !== chapter.url) {
      loadedUrlRef.current = chapter.url;
      setIsLoading(true);
      audio.src = chapter.url;
      audio.load();
      audio.playbackRate = playbackRate;
    }

    // Handle jumping to chapter start for embedded chapters or fresh selection
    // For embedded chapters, we must ensure we stay within [startTime, endTime]
    if (chapter && audio.src && !isLoading && pendingSeekRef.current === null) {
        const chStart = chapter.startTime || 0;
        // If the audio is currently outside the chapter bounds (considering a small margin), jump to start
        if (audio.currentTime < chStart - 1.0 || (chapter.endTime && audio.currentTime > chapter.endTime + 1.0)) {
            if (audio.readyState >= 1) {
                audio.currentTime = chStart;
            } else {
                pendingSeekRef.current = chStart;
            }
            setCurrentTime(0);
        }
    }
    
    // Media Session Update
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter?.name.replace(/\.[^/.]+$/, "") || "Audiobook",
        artist: currentBook.title,
        artwork: currentBook.coverUrl ? [{ src: currentBook.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    }
  }, [currentBook, currentChapterIndex]); 

  // Handle Playback Rate & Play State
  useEffect(() => {
    const audio = audioRef.current;
    if (audio.playbackRate !== playbackRate) {
        audio.playbackRate = playbackRate;
    }
    
    // Explicitly re-trigger play if isPlaying is true, 
    // even if the source just changed or loaded.
    if (isPlaying && audio.paused) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.warn("Playback failed or interrupted", e);
                // We keep isPlaying=true to allow auto-retry or UI state consistency
            });
        }
    } else if (!isPlaying && !audio.paused) {
        audio.pause();
    }
  }, [isPlaying, playbackRate, currentBook?.chapters[currentChapterIndex]?.url]); // Re-run when source changes to ensure auto-play

  const seekTo = useCallback((relativeTime: number) => {
      const audio = audioRef.current;
      const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
      const chStart = chapter?.startTime || 0;
      const targetAbs = chStart + relativeTime;
      
      if (audio.readyState >= 1) {
          audio.currentTime = targetAbs;
      } else {
          pendingSeekRef.current = targetAbs;
      }
      setCurrentTime(relativeTime);
  }, []);

  // Event Listeners
  useEffect(() => {
    const audio = audioRef.current;
    
    const updateTime = () => {
        if (pendingSeekRef.current !== null) return;
        const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
        
        if (chapter && chapter.startTime !== undefined) {
            setCurrentTime(Math.max(0, audio.currentTime - chapter.startTime));
        } else {
            setCurrentTime(audio.currentTime);
        }
    };

    const updateDuration = () => {
        const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
        if (chapter && chapter.startTime !== undefined && (chapter.duration || chapter.endTime !== undefined)) {
            const d = chapter.duration || (chapter.endTime! - chapter.startTime);
            setDuration(d);
            return;
        }

        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
            setDuration(audio.duration);
        }
    };
    
    // Initial sync
    updateTime();
    updateDuration();

    const onTimeUpdate = updateTime;
    const onLoadedMetadata = () => {
        updateDuration();
        if (pendingSeekRef.current !== null) {
            audio.currentTime = pendingSeekRef.current;
            // Do not clear it here. Some mobile browsers ignore seeks during loadedmetadata.
            // We will clear it in onCanPlay.
        }
        if (isPlayingRef.current && audio.paused) {
            audio.play().catch(e => console.warn("Auto-play on loadedmetadata failed:", e));
        }
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => {
        setIsLoading(false);
        if (pendingSeekRef.current !== null) {
            audio.currentTime = pendingSeekRef.current;
        }
        if (isPlayingRef.current && audio.paused) {
            audio.play().catch(e => console.warn("Auto-play on canplay failed:", e));
        }
    };
    const onPlaying = () => {
        setIsLoading(false);
        if (pendingSeekRef.current !== null) {
            audio.currentTime = pendingSeekRef.current;
        }
        updateTime();
    };
    const onSeeked = () => {
        if (pendingSeekRef.current !== null) {
            const diff = Math.abs(audio.currentTime - pendingSeekRef.current);
            if (diff < 2.0) {
                pendingSeekRef.current = null;
            } else {
                audio.currentTime = pendingSeekRef.current;
            }
        }
    };
    const onError = (e: Event) => {
        console.error("Audio playback error", e);
        setIsLoading(false);
        setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('error', onError);
    
    // Smooth progress update while playing
    let interval: any;
    if (isPlaying) {
        interval = setInterval(updateTime, 250);
    }

    return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('durationchange', onLoadedMetadata);
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('waiting', onWaiting);
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('seeked', onSeeked);
        audio.removeEventListener('error', onError);
        if (interval) clearInterval(interval);
    };
  }, [isPlaying]); 

  return {
    audioRef,
    isPlaying,
    setIsPlaying,
    togglePlay,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    isLoading,
    restoreState,
    seekTo,
    setCurrentTime
  };
};