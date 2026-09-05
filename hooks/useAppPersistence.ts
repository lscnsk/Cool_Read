
import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Book, Chapter, AppMode, PersistedState } from '../types';
import { calculateTotalProgress } from '../utils/time';
import { parseEpub, parseFb2 } from '../utils/ebook';
import { parsePdf, parsePdfAsText } from '../utils/pdf';
import { parseComic } from '../utils/archive';
import { getAudioDuration } from '../utils/audio';

interface UseAppPersistenceProps {
    isNative: boolean;
    mode: AppMode;
    currentBook: Book | null;
    setCurrentBook: React.Dispatch<React.SetStateAction<Book | null>>;
    currentChapterIndex: number;
    setCurrentChapterIndex: React.Dispatch<React.SetStateAction<number>>;
    currentTime: number;
    setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
    readerProgress: number;
    setReaderProgress: React.Dispatch<React.SetStateAction<number>>;
    playbackRate: number;
    setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
    fontSize: number;
    setFontSize: React.Dispatch<React.SetStateAction<number>>;
    duration: number;
    isPlaying: boolean;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
    bookProgressMap: Record<string, PersistedState>;
    setBookProgressMap: React.Dispatch<React.SetStateAction<Record<string, PersistedState>>>;
    restoreAudioState: (time: number, rate: number, playAfterRestore?: boolean) => void;
    saveMetadata: (id: string, title: string, author: string, coverUrl?: string, format?: string) => void;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setIsImmersive: React.Dispatch<React.SetStateAction<boolean>>;
    closeAllSidebars: () => void;
    setDeletedBookIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useAppPersistence({
    isNative,
    mode,
    currentBook,
    setCurrentBook,
    currentChapterIndex,
    setCurrentChapterIndex,
    currentTime,
    setCurrentTime,
    readerProgress,
    setReaderProgress,
    playbackRate,
    setPlaybackRate,
    fontSize,
    setFontSize,
    duration,
    isPlaying,
    setIsPlaying,
    setBooks,
    bookProgressMap,
    setBookProgressMap,
    restoreAudioState,
    saveMetadata,
    setIsLoading,
    setIsImmersive,
    closeAllSidebars,
    setDeletedBookIds
}: UseAppPersistenceProps) {
  const isRestoringRef = useRef<boolean>(false);
  const shouldRestoreAudioRef = useRef<boolean>(false);
  const pendingAudioRestoreRef = useRef<{ time: number, rate: number } | null>(null);
  
  // Scanner Refs
  const scanningBookIdRef = useRef<string | null>(null);
  const isScanningRef = useRef<boolean>(false);

  // --- Refs for Persistence Helper ---
  const currentBookRef = useRef(currentBook);
  const currentChapterIndexRef = useRef(currentChapterIndex);
  const currentTimeRef = useRef(currentTime);
  const readerProgressRef = useRef(readerProgress);
  const playbackRateRef = useRef(playbackRate);
  const fontSizeRef = useRef(fontSize);
  const modeRef = useRef(mode);
  const durationRef = useRef(duration);

  useEffect(() => { currentBookRef.current = currentBook; }, [currentBook]);
  useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { readerProgressRef.current = readerProgress; }, [readerProgress]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // --- Duration Discovery Sync ---
  // When a chapter duration is discovered, sync it back into the currentBook object
  // and the global books list so that totalProgress calculations remain consistent globally.
  useEffect(() => {
    if (mode === 'audio' && currentBook && duration > 0) {
        const ch = currentBook.chapters[currentChapterIndex];
        if (ch && !ch.duration) {
            // Update the current book
            setCurrentBook(prev => {
                if (!prev || prev.id !== currentBook.id) return prev;
                const newChapters = prev.chapters.map((c, i) => 
                    i === currentChapterIndex ? { ...c, duration: duration } : c
                );
                return { ...prev, chapters: newChapters };
            });
            // Update the library list
            setBooks(prev => prev.map(b => {
                if (b.id !== currentBook.id) return b;
                const newChapters = b.chapters.map((c, i) => 
                    i === currentChapterIndex ? { ...c, duration: duration } : c
                );
                return { ...b, chapters: newChapters };
            }));
        }
    }
  }, [duration, currentChapterIndex, mode, currentBook?.id]);

  // --- Persistence Logic ---
  const saveState = useCallback(async (force = false): Promise<PersistedState | null> => {
    const book = currentBookRef.current;
    if (!book) return null;
    if (isRestoringRef.current && !force) return null;

    let state: PersistedState;
    const activeMode = modeRef.current;
    const activeChapterIndex = currentChapterIndexRef.current;

    if (activeMode === 'audio') {
        const timeInChapter = currentTimeRef.current;
        const currentDur = durationRef.current || 0;
        
        const knownDurations: Record<number, number> = {};
        book.chapters.forEach((ch, idx) => {
          if (ch.duration) knownDurations[idx] = ch.duration;
        });
        if (currentDur > 0) {
            knownDurations[activeChapterIndex] = currentDur;
        }

        // Create a temporary version of chapters with the current duration for accurate progress calculation
        const chaptersWithCurrentDur = book.chapters.map((ch, idx) => {
            if (idx === activeChapterIndex && currentDur > 0) {
                return { ...ch, duration: currentDur };
            }
            return ch;
        });

        const currentProgressPercent = calculateTotalProgress(
          activeChapterIndex, 
          chaptersWithCurrentDur, 
          timeInChapter, 
          currentDur
        );

        state = {
          bookId: book.id,
          chapterIndex: activeChapterIndex,
          time: timeInChapter + (book.chapters[activeChapterIndex]?.startTime || 0), // Save ABSOLUTE time in database
          rate: playbackRateRef.current,
          lastUpdated: Date.now(),
          totalProgress: currentProgressPercent,
          chapterDurations: knownDurations
        };
    } else {
        const activeReaderProgress = readerProgressRef.current;
        const globalProgress = calculateTotalProgress(
            activeChapterIndex,
            book.chapters,
            activeReaderProgress,
            1
        );

        state = {
            bookId: book.id,
            chapterIndex: activeChapterIndex, 
            time: activeReaderProgress, 
            rate: 1, 
            lastUpdated: Date.now(),
            totalProgress: globalProgress,
            fontSize: fontSizeRef.current
        };
    }
    
    setBookProgressMap(prev => {
        const updated = { ...prev, [book.id]: state };
        const saveStr = JSON.stringify(updated);
        try {
            if (isNative) {
                Preferences.set({ key: 'cool_read_history', value: saveStr });
            } else {
                localStorage.setItem('cool_read_history', saveStr);
            }
        } catch (e) {
            console.error("Save failed", e);
        }
        return updated;
    });
    
    return state;
    
  }, [isNative]);

  // Save immediately on major state changes
  useEffect(() => {
    saveState();
  }, [isPlaying, currentBook?.id, currentChapterIndex, saveState]);

  // Periodic autosave while playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      saveState();
    }, 5000);
    return () => clearInterval(interval);
  }, [isPlaying, saveState]);

  // General periodic save (keeps ebook & comic scroll position persisted)
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentBookRef.current) {
        saveState();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [saveState]);

  // Debounced save for ebook/comic scrolling & chapter changes
  useEffect(() => {
    if (!currentBook) return;
    const timer = setTimeout(() => {
      saveState();
    }, 1500); // Save 1.5 seconds after user stops scrolling/changing chapters
    return () => clearTimeout(timer);
  }, [readerProgress, currentChapterIndex, currentBook?.id, saveState]);

  // Save on tab hide / app close
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveState();
      }
    };
    const handleBeforeUnload = () => {
      saveState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveState]);

  // Load History & Settings
  useEffect(() => {
    const loadData = async () => {
      let deletedStr: string | null = null;

      if (isNative) {
        const d = await Preferences.get({ key: 'cool_read_deleted' });
        deletedStr = d.value;
      } else {
        deletedStr = localStorage.getItem('cool_read_deleted');
      }
      
      if (deletedStr) {
        try {
          const parsed = JSON.parse(deletedStr);
          if (Array.isArray(parsed)) setDeletedBookIds(parsed);
        } catch (e) { console.error("Failed to parse deleted log", e); }
      }
    };
    loadData();
  }, [isNative]);

  // Save Metadata Helper (Removed as it is now in useBookHistory)

  // --- Background Metadata Scanner (Audio only) ---
  useEffect(() => {
    if (!currentBook || mode !== 'audio') return;

    const chaptersNeedingScan = currentBook.chapters
        .map((ch, idx) => ({ ...ch, originalIndex: idx }))
        .filter(ch => !ch.duration && ch.url);
    
    if (chaptersNeedingScan.length === 0) return;
    
    if (isScanningRef.current && scanningBookIdRef.current === currentBook.id) return;
    
    scanningBookIdRef.current = currentBook.id;
    isScanningRef.current = true;

    const scan = async () => {
        for (const ch of chaptersNeedingScan) {
            if (scanningBookIdRef.current !== currentBook.id) break;
            try {
                const duration = await getAudioDuration(ch.url);
                if (duration > 0) {
                    setBooks(prevBooks => {
                        return prevBooks.map(b => {
                            if (b.id === currentBook.id) {
                                const newChapters = [...b.chapters];
                                newChapters[ch.originalIndex] = { ...newChapters[ch.originalIndex], duration };
                                return { ...b, chapters: newChapters };
                            }
                            return b;
                        });
                    });
                    
                    setCurrentBook(prev => {
                        if (!prev || prev.id !== currentBook.id) return prev;
                        const newChapters = [...prev.chapters];
                        newChapters[ch.originalIndex] = { ...newChapters[ch.originalIndex], duration };
                        return { ...prev, chapters: newChapters };
                    });
                }
            } catch (e) { console.warn(`Scan fail ${ch.name}`); }
        }
        isScanningRef.current = false;
    };
    scan();
  }, [currentBook?.id, currentBook?.chapters.length, mode]);

  // --- Delayed Audio Restoration Logic ---
  useEffect(() => {
    if (shouldRestoreAudioRef.current && currentBook && mode === 'audio') {
        const pending = pendingAudioRestoreRef.current;
        if (pending) {
            restoreAudioState(pending.time, pending.rate, false);
            shouldRestoreAudioRef.current = false;
            pendingAudioRestoreRef.current = null;
            isRestoringRef.current = false;
        } else {
            const state = bookProgressMap[currentBook.id];
            if (state) {
                restoreAudioState(state.time, state.rate, false);
                shouldRestoreAudioRef.current = false;
                isRestoringRef.current = false;
            } else if (Object.keys(bookProgressMap).length > 0) {
                 shouldRestoreAudioRef.current = false;
                 isRestoringRef.current = false;
            }
        }
    }
  }, [currentBook, mode, bookProgressMap, restoreAudioState]);


  // --- Book Selection Logic ---
  // Cleanup Blob URLs when currentBook changes to prevent memory leaks
  useEffect(() => {
    return () => {
        if (currentBook && currentBook.type === 'ebook') {
            currentBook.chapters.forEach(ch => {
                if (ch.content) {
                    const matches = ch.content.match(/blob:(https?|capacitor|localhost)[^\s"']+/g);
                    if (matches) {
                        matches.forEach(url => URL.revokeObjectURL(url));
                    }
                }
            });
            if (currentBook.coverUrl && currentBook.coverUrl.startsWith('blob:')) {
                URL.revokeObjectURL(currentBook.coverUrl);
            }
        }
    };
  }, [currentBook]);

  const handleSelectBook = async (
    book: Book, 
    historyOverrideOrForce?: Record<string, PersistedState> | boolean, 
    injectedGlobalProgress?: number
  ) => {
    // Save current book progress before switching
    if (currentBookRef.current) {
        await saveState(true);
    }

    let bookToPlay = book;
    setIsPlaying(false);

    let forceFormatAsFb2 = false;
    let historyOverride: Record<string, PersistedState> | undefined = undefined;

    if (typeof historyOverrideOrForce === 'boolean') {
        forceFormatAsFb2 = historyOverrideOrForce;
    } else {
        historyOverride = historyOverrideOrForce;
    }

    // Ebook Parsing Logic JIT
    if (book.type === 'ebook' && (!book.chapters.length || !book.chapters[0].content || typeof historyOverrideOrForce === 'boolean')) {
        setIsLoading(true);
        try {
            let fileToParse: File | Blob | null = null;
            if (book.chapters[0].file) {
                fileToParse = book.chapters[0].file;
            } else if (book.chapters[0].path && isNative) {
                const uriResult = await Filesystem.getUri({ path: book.chapters[0].path, directory: Directory.ExternalStorage });
                const webViewSrc = Capacitor.convertFileSrc(uriResult.uri);
                const res = await fetch(webViewSrc);
                fileToParse = await res.blob();
            }

            if (fileToParse) {
                const filePath = (book.chapters[0]?.path || book.id || '').toLowerCase();
                const fileName = ((book.chapters[0]?.file as File)?.name || book.title || '').toLowerCase();
                const formatHint = (book.format || '').toLowerCase();

                const isPdf = filePath.endsWith('.pdf') || 
                              fileName.endsWith('.pdf') || 
                              formatHint === 'pdf' || 
                              filePath.includes('.pdf') || 
                              fileName.includes('.pdf') ||
                              book.format === 'pdf' ||
                              (book.format === 'fb2' && (
                                filePath.endsWith('.pdf') || 
                                fileName.includes('.pdf') || 
                                book.id.toLowerCase().endsWith('.pdf') || 
                                (book.title && book.title.toLowerCase().includes('.pdf'))
                              ));
                const isComic = filePath.includes('.cbr') || filePath.includes('.cbz') || fileName.includes('.cbr') || fileName.includes('.cbz') || formatHint === 'comic';
                const isFb2 = filePath.endsWith('.fb2') || fileName.endsWith('.fb2') || formatHint === 'fb2' || filePath.includes('.fb2') || fileName.includes('.fb2') || filePath.endsWith('.bin') || fileName.endsWith('.bin');
                
                let parsedBook;
                if (isPdf) {
                     if (typeof historyOverrideOrForce === 'boolean' ? forceFormatAsFb2 : (formatHint === 'fb2')) {
                         parsedBook = await parsePdfAsText(fileToParse, book.id);
                     } else {
                         parsedBook = await parsePdf(fileToParse, book.id);
                      }
                } else if (isComic) {
                     parsedBook = await parseComic(fileToParse, book.id);
                } else if (isFb2) {
                     parsedBook = await parseFb2(fileToParse, book.id);
                } else {
                     parsedBook = await parseEpub(fileToParse, book.id);
                }
                
                if (parsedBook.title) {
                    await saveMetadata(book.id, parsedBook.title, parsedBook.author, parsedBook.coverUrl, parsedBook.format);
                }

                if (parsedBook.chapters && parsedBook.chapters.length > 0 && book.chapters && book.chapters.length > 0) {
                    parsedBook.chapters[0].file = book.chapters[0].file;
                    parsedBook.chapters[0].path = book.chapters[0].path;
                    parsedBook.chapters[0].url = book.chapters[0].url || '';
                }

                bookToPlay = { ...book, ...parsedBook };
                
                // Update books array with metadata only, NOT the heavy chapter content
                // IMPORTANT: Preserve the original path/file in the first chapter so we can re-parse it later!
                const metadataOnlyChapters = parsedBook.chapters?.map((ch, idx) => {
                    if (idx === 0) {
                        return { ...ch, content: undefined, path: book.chapters[0].path, file: book.chapters[0].file };
                    }
                    return { ...ch, content: undefined };
                }) || book.chapters;
                
                const metadataOnlyBook = { ...book, ...parsedBook, chapters: metadataOnlyChapters };
                setBooks(prevBooks => prevBooks.map(b => b.id === book.id ? metadataOnlyBook : b));
            }
        } catch (e) {
            console.error("Parse error", e);
            alert("Failed to open book format: " + (e as Error).message);
            setIsLoading(false);
            return;
        } finally {
            setIsLoading(false);
        }
    }

    // Audio JIT Resolution
    if (book.type === 'audio' && isNative && book.chapters.length > 0 && !book.chapters[0].url && book.chapters[0].path) {
      try {
        const updatedChapters = await Promise.all(book.chapters.map(async (ch) => {
           if (ch.url) return ch;
           const uriResult = await Filesystem.getUri({ path: ch.path!, directory: Directory.ExternalStorage });
           const webViewSrc = Capacitor.convertFileSrc(uriResult.uri);
           return { ...ch, url: webViewSrc };
        }));
        bookToPlay = { ...book, chapters: updatedChapters };
        setBooks(prev => prev.map(b => b.id === book.id ? bookToPlay : b));
      } catch (e) { console.error("URL Resolve fail", e); }
    }
    
    const mapToUse = historyOverride || bookProgressMap;
    const savedState = mapToUse[bookToPlay.id];
    
    // Update ref early to ensure any progress updates from the "old" book during transition are ignored
    currentBookRef.current = bookToPlay;

    let finalGlobalProgress = injectedGlobalProgress;
    if (typeof historyOverrideOrForce === 'boolean' && book.id === currentBook?.id && finalGlobalProgress === undefined) {
        finalGlobalProgress = calculateTotalProgress(
            currentChapterIndex,
            currentBook.chapters,
            readerProgress,
            1
        );
    }

    if (finalGlobalProgress !== undefined && bookToPlay.type === 'ebook') {
        let targetChapterIndex = 0;
        let targetTime = 0;
        
        let totalLength = 0;
        for (const ch of bookToPlay.chapters) totalLength += (ch.length || 0);
        
        if (totalLength === 0) {
            const totalChapters = bookToPlay.chapters.length;
            if (totalChapters > 0) {
                const theoreticalTotal = (finalGlobalProgress / 100) * totalChapters;
                targetChapterIndex = Math.floor(theoreticalTotal);
                if (targetChapterIndex >= totalChapters) {
                    targetChapterIndex = totalChapters - 1;
                    targetTime = 1;
                } else {
                    targetTime = theoreticalTotal - targetChapterIndex;
                }
            }
        } else {
            const targetLength = (finalGlobalProgress / 100) * totalLength;
            let accum = 0;
            for (let i = 0; i < bookToPlay.chapters.length; i++) {
                const chLen = bookToPlay.chapters[i].length || 0;
                if (accum + chLen >= targetLength || i === bookToPlay.chapters.length - 1) {
                    targetChapterIndex = i;
                    targetTime = chLen > 0 ? (targetLength - accum) / chLen : 0;
                    break;
                }
                accum += chLen;
            }
        }
        
        isRestoringRef.current = true;
        setCurrentChapterIndex(targetChapterIndex);
        setReaderProgress(targetTime);
        currentChapterIndexRef.current = targetChapterIndex;
        readerProgressRef.current = targetTime;
        if (savedState) setFontSize(savedState.fontSize || 1.2);
        setTimeout(() => { isRestoringRef.current = false; }, 2000);
    } else if (savedState) {
        const safeIndex = Math.min(savedState.chapterIndex, bookToPlay.chapters.length - 1);
        isRestoringRef.current = true;
        setCurrentChapterIndex(safeIndex);
        currentChapterIndexRef.current = safeIndex;
        
        if (bookToPlay.type === 'audio') {
            if (savedState.chapterDurations) {
                const hydrated = bookToPlay.chapters.map((ch, i) => ({...ch, duration: savedState.chapterDurations?.[i] || ch.duration}));
                bookToPlay = { ...bookToPlay, chapters: hydrated };
            }
            shouldRestoreAudioRef.current = true;
            pendingAudioRestoreRef.current = { time: savedState.time, rate: savedState.rate || 1.0 };
        } else {
            const restoredTime = savedState.time || 0;
            setReaderProgress(restoredTime); 
            readerProgressRef.current = restoredTime;
            setFontSize(savedState.fontSize || 1.2);
            setTimeout(() => { isRestoringRef.current = false; }, 2000);
        }
    } else {
        isRestoringRef.current = false;
        setCurrentChapterIndex(0);
        setCurrentTime(0);
        setReaderProgress(0);
        setPlaybackRate(1.0);
        currentChapterIndexRef.current = 0;
        currentTimeRef.current = 0;
        readerProgressRef.current = 0;
    }
    
    if (bookToPlay.type === 'ebook' && (bookToPlay.format === 'pdf' || bookToPlay.format === 'comic')) {
        setIsImmersive(true);
    } else {
        setIsImmersive(false);
    }
    
    setCurrentBook(bookToPlay);
    closeAllSidebars();
  };

  const isCurrentBookOriginallyPdf = currentBook ? (
    currentBook.format === 'pdf' ||
    (currentBook.chapters?.[0]?.path || '').toLowerCase().endsWith('.pdf') || 
    (currentBook.chapters?.[0]?.name || '').toLowerCase().endsWith('.pdf') || 
    (currentBook.chapters?.[0]?.file as File)?.name?.toLowerCase()?.includes('.pdf') || 
    (currentBook.title || '').toLowerCase().includes('.pdf') ||
    (currentBook.id || '').toLowerCase().endsWith('.pdf') ||
    (currentBook.format === 'fb2' && (
      (currentBook.chapters?.[0]?.path || '').toLowerCase().endsWith('.pdf') || 
      (currentBook.chapters?.[0]?.name || '').toLowerCase().endsWith('.pdf') || 
      (currentBook.chapters?.[0]?.file as File)?.name?.toLowerCase()?.includes('.pdf') || 
      (currentBook.title || '').toLowerCase().includes('.pdf') ||
      (currentBook.id || '').toLowerCase().endsWith('.pdf')
    ))
  ) : false;

  const handleTogglePdfFormat = useCallback(() => {
    if (!currentBook) return;
    const isCurrentlyFb2 = currentBook.format === 'fb2';
    const globalProgress = calculateTotalProgress(
         currentChapterIndexRef.current, 
         currentBook.chapters, 
         readerProgressRef.current, 
         1
    );
    handleSelectBook(currentBook, !isCurrentlyFb2, globalProgress);
  }, [currentBook]);




  return {
      saveState,
      handleSelectBook,
      isCurrentBookOriginallyPdf,
      handleTogglePdfFormat,
      isRestoringRef,
      shouldRestoreAudioRef,
      pendingAudioRestoreRef
  };
}
