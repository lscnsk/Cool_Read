import { useState, useRef, useEffect, useCallback } from 'react';
import { Book } from '../types';

export const useAudioPlayer = (currentBook: Book | null, currentChapterIndex: number) => {
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const loadedUrlRef = useRef<string | null>(null); // Track loaded URL explicitly

  const [isPlaying, _setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);

  const setIsPlaying = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    _setIsPlaying(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      isPlayingRef.current = next;
      if (!next && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return next;
    });
  }, []);

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

  const isPlayingPromiseRef = useRef<Promise<void> | null>(null);

  const safePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (isPlayingPromiseRef.current) return;
    
    if (audio.paused && isPlayingRef.current) {
      const p = audio.play();
      if (p !== undefined) {
        isPlayingPromiseRef.current = p;
        p.then(() => {
          isPlayingPromiseRef.current = null;
        }).catch(e => {
          isPlayingPromiseRef.current = null;
          if (e.name === 'AbortError') {
            // If aborted due to new chapter/source load, retry safely if we should still be playing
            if (isPlayingRef.current && audio.paused && audio.readyState >= 2) {
              safePlay();
            }
          } else if (e.name === 'NotAllowedError') {
            console.warn("Autoplay blocked by browser policy");
            setIsPlaying(false);
          } else {
            console.warn("Playback error:", e);
            setIsPlaying(false);
          }
        });
      }
    }
  }, [setIsPlaying]);

  const togglePlay = useCallback(() => {
     if (audioRef.current.paused) {
         setIsPlaying(true);
         safePlay();
     } else {
         setIsPlaying(false);
         audioRef.current.pause();
     }
  }, [safePlay, setIsPlaying]);

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
      if (autoPlay) {
          setIsPlaying(true);
          safePlay();
      }
  }, [safePlay]);

  // Handle Source Change
  useEffect(() => {
    if (!currentBook || currentBook.type !== 'audio') {
        audioRef.current.pause();
        if (loadedUrlRef.current) {
            loadedUrlRef.current = null;
            audioRef.current.removeAttribute('src');
            audioRef.current.load();
        }
        return;
    }
    
    // Immediately reset relative chapter progress to beginning
    setCurrentTime(0);
    
    const audio = audioRef.current;
    const chapter = currentBook.chapters[currentChapterIndex];
    if (!chapter) return;
    
    const isSameUrl = loadedUrlRef.current === chapter.url && !!chapter.url;
    const chStart = chapter.startTime || 0;

    // Check if we need to load a new Source
    if (!isSameUrl) {
      let targetUrl = chapter.url;
      // Re-hydrate dead blob URLs from Blob file if necessary
      if ((!targetUrl || !targetUrl.startsWith('blob:')) && chapter.file instanceof Blob) {
        targetUrl = URL.createObjectURL(chapter.file);
        chapter.url = targetUrl;
      }

      if (targetUrl) {
        loadedUrlRef.current = targetUrl;
        setIsLoading(true);
        pendingSeekRef.current = chStart > 0 ? chStart : null;
        isPlayingPromiseRef.current = null;
        audio.src = targetUrl;
        audio.playbackRate = playbackRate;
        audio.load();
        // Playback will resume smoothly in onCanPlay if isPlayingRef.current is true
      }
    } else {
      // Same physical audio file (embedded chapter switch)
      if (audio.readyState >= 1) {
        audio.currentTime = chStart;
        pendingSeekRef.current = null;
      } else {
        pendingSeekRef.current = chStart;
      }
      if (isPlayingRef.current && audio.paused) {
        safePlay();
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
  }, [currentBook?.id, currentChapterIndex, safePlay]); 

  // Handle Playback Rate & Play State
  useEffect(() => {
    const audio = audioRef.current;
    if (audio.playbackRate !== playbackRate) {
        audio.playbackRate = playbackRate;
    }
    
    if (isPlaying && audio.paused) {
        safePlay();
    } else if (!isPlaying && !audio.paused) {
        audio.pause();
    }
  }, [isPlaying, playbackRate, safePlay]); 

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
        if (pendingSeekRef.current !== null) {
            if (Math.abs(audio.currentTime - pendingSeekRef.current) < 1.0) {
                pendingSeekRef.current = null;
            } else {
                return;
            }
        }
        const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
        
        if (chapter && chapter.startTime !== undefined) {
            setCurrentTime(Math.max(0, audio.currentTime - chapter.startTime));
        } else {
            setCurrentTime(audio.currentTime);
        }
    };

    const updateDuration = () => {
        const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
        if (chapter && chapter.startTime !== undefined && (chapter.duration || (chapter.endTime !== undefined && chapter.endTime > chapter.startTime))) {
            const d = chapter.duration || (chapter.endTime! - chapter.startTime);
            setDuration(d);
            return;
        }

        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
            const chStart = chapter?.startTime || 0;
            const effDur = chStart > 0 ? Math.max(0, audio.duration - chStart) : audio.duration;
            setDuration(effDur);
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
            pendingSeekRef.current = null;
        }
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => {
        setIsLoading(false);
        updateDuration();
        if (pendingSeekRef.current !== null) {
            audio.currentTime = pendingSeekRef.current;
            pendingSeekRef.current = null;
        }
        if (isPlayingRef.current && audio.paused) {
            safePlay();
        }
    };
    const onPlaying = () => {
        setIsLoading(false);
        if (pendingSeekRef.current !== null) {
            audio.currentTime = pendingSeekRef.current;
            pendingSeekRef.current = null;
        }
        updateTime();
    };
    const onSeeked = () => {
        pendingSeekRef.current = null;
    };
    const onError = (e: Event) => {
        if (!loadedUrlRef.current || !audio.getAttribute('src')) {
            setIsLoading(false);
            return;
        }
        // Attempt recovery if Blob URL expired
        const chapter = currentBookRef.current?.chapters[currentChapterIndexRef.current];
        if (chapter && chapter.file instanceof Blob) {
            const freshUrl = URL.createObjectURL(chapter.file);
            chapter.url = freshUrl;
            loadedUrlRef.current = freshUrl;
            audio.src = freshUrl;
            audio.load();
            return;
        }
        if (audio.error && audio.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
            console.warn("Audio playback issue:", e);
            setIsLoading(false);
            setIsPlaying(false);
        }
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
  }, [isPlaying, safePlay]); 

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