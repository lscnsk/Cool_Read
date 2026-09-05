import { useAppPersistence } from "./hooks/useAppPersistence";
import { useLibrary } from "./hooks/useLibrary";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import LibrarySidebar from './components/LibrarySidebar';
import ChapterSidebar from './components/ChapterSidebar';
import PlayerControls from './components/PlayerControls';
import EBookReader from './components/EBookReader';
import EBookControls from './components/EBookControls';
import { Book, PersistedState, AppMode, Chapter } from './types';
import { calculateTotalProgress } from './utils/time';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { TextZoom } from '@capacitor/text-zoom';
import { parseEpub, parseFb2 } from './utils/ebook';
import { parsePdf, parsePdfAsText } from './utils/pdf';
import { parseComic } from './utils/archive';
import { getAllPersistentBooks, saveBookToDB, deleteBookFromDB } from './utils/db';
import PDFReader from './components/PDFReader';
import { ImageLightbox } from './components/ImageLightbox';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { X } from 'lucide-react';
import { AppStyles } from './components/AppStyles';
import { EmptyState } from './components/EmptyState';
import { PermissionOverlay } from './components/PermissionOverlay';
import { AppHeader } from './components/AppHeader';
import { AudioBookDetailsModal } from './components/AudioBookDetailsModal';
import { useSettings } from './hooks/useSettings';
import { useBookHistory } from './hooks/useBookHistory';
import * as mm from 'music-metadata';

import { parseM4AChapters } from './utils/mp4chapters';
import { CatalogView } from './components/CatalogView';
import { CatalogSidebar } from './components/CatalogSidebar';
import { CATALOG_BOOKS, CatalogBook } from './data/catalogData';
import { fetchRepositoryCatalog, getCatalogSeriesFromBooks, getCachedCatalog } from './utils/catalogSync';


function App() {
  // --- State ---
  const [mode, setMode] = useState<AppMode>('audio');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const currentBookRef = useRef(currentBook);
  useEffect(() => { currentBookRef.current = currentBook; }, [currentBook]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  const [books, setBooks] = useState<Book[]>([]);
  const [deletedBookIds, setDeletedBookIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  
  const [audioBookQueue, setAudioBookQueue] = useState<{ 
      folderName: string, 
      author?: string,
      extractedCover?: string,
      generatedChapters?: Chapter[],
      files: File[], 
      allFiles: File[] 
  }[]>([]);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  
  // Custom Hook for Audio
  const { 
      audioRef, 
      isPlaying, 
      setIsPlaying, 
      togglePlay,
      currentTime, 
      setCurrentTime, 
      duration, 
      playbackRate, 
      setPlaybackRate, 
      isLoading: isAudioLoading,
      restoreState: restoreAudioState,
      seekTo: seekAudio
  } = useAudioPlayer(mode === 'audio' ? currentBook : null, currentChapterIndex);
  
  // Reader State
  const { 
    fontSize, 
    setFontSize, 
    theme, 
    setTheme, 
    isStyledMode, 
    setIsStyledMode, 
    isBionic, 
    setIsBionic, 
    appStyle, 
    setAppStyle, 
    isSettingsLoadedRef, 
    isRsvpMode, 
    setIsRsvpMode, 
    rsvpWpm, 
    setRsvpWpm, 
    isPagedMode, 
    setIsPagedMode,
    readerFont,
    setReaderFont,
    customFonts,
    addCustomFont,
    deleteCustomFont
  } = useSettings();
  const [readerProgress, setReaderProgress] = useState(0); 
  const [highlightText, setHighlightText] = useState<string>("");
  const [highlightMatchIndex, setHighlightMatchIndex] = useState<number>(-1);

  // Animation triggers for emojis
  const [titleClickKey, setTitleClickKey] = useState(0);
  const [libraryClickKey, setLibraryClickKey] = useState(0);
  const [chaptersClickKey, setChaptersClickKey] = useState(0);

  // Modal States
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChapterListOpen, setIsChapterListOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCatalogSidebarOpen, setIsCatalogSidebarOpen] = useState(false);
  const [catalogBooks, setCatalogBooks] = useState<CatalogBook[]>(CATALOG_BOOKS);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState<boolean>(false);
  const [catalogFilter, setCatalogFilter] = useState<{
    type: 'all' | 'series' | 'author';
    value?: string;
    searchQuery?: string;
  }>({ type: 'all' });
  const [downloadingBookIds, setDownloadingBookIds] = useState<Set<string>>(new Set());
  const [isImmersive, setIsImmersive] = useState(false);

  
  // Persistence State
  const { bookProgressMap, setBookProgressMap, bookMetadataMap, setBookMetadataMap, saveMetadata, deleteBookHistory } = useBookHistory();
  
  const isNative = Capacitor.isNativePlatform();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef<boolean>(false);
  const shouldRestoreAudioRef = useRef<boolean>(false);
  const pendingAudioRestoreRef = useRef<{ time: number, rate: number } | null>(null);
  
  
  const [navStack, setNavStack] = useState<{ chapterIndex: number, progress: number }[]>([]);
  
  const uiStateRef = useRef({
    isSidebarOpen,
    isChapterListOpen,
    isCatalogOpen,
    isCatalogSidebarOpen,
    lightboxImage,
    hasCurrentBook: !!currentBook,
    isAudioModalOpen,
    navStack,
    isRsvpMode
  });

  // Update ref when state changes
  useEffect(() => {
    uiStateRef.current = {
      isSidebarOpen,
      isChapterListOpen,
      isCatalogOpen,
      isCatalogSidebarOpen,
      lightboxImage,
      hasCurrentBook: !!currentBook,
      isAudioModalOpen,
      navStack,
      isRsvpMode
    };
  }, [isSidebarOpen, isChapterListOpen, isCatalogOpen, isCatalogSidebarOpen, lightboxImage, !!currentBook, isAudioModalOpen, navStack, isRsvpMode]);

  // Turn off RSVP mode when switching away from ebook mode or switching books
  useEffect(() => {
    if (mode !== 'ebook' && isRsvpMode) {
      setIsRsvpMode(false);
    }
  }, [mode, isRsvpMode, setIsRsvpMode]);

  useEffect(() => {
    if (isRsvpMode) {
      setIsRsvpMode(false);
    }
  }, [currentBook?.id]);

  const getBookIllustrations = useCallback(() => {
    if (!currentBook) return [];
    const urls: string[] = [];
    currentBook.chapters.forEach(ch => {
      if (!ch.content) return;
      const matches = ch.content.matchAll(/src="([^"]+)"/g);
      for (const m of matches) {
        if (m[1]) urls.push(m[1]);
      }
    });
    return urls;
  }, [currentBook]);

  const handleLightboxNavigate = useCallback((newSrc: string) => {
    if (!currentBook || !lightboxImage) return;
    setLightboxImage(newSrc);
    
    // Find chapter index matching this image url, and synchronize the active chapter index!
    const idx = currentBook.chapters.findIndex(ch => ch.content && ch.content.includes(newSrc));
    if (idx !== -1) {
      setCurrentChapterIndex(idx);
    }
  }, [currentBook, lightboxImage]);

  // --- Hardware Back Button ---
  const handleHardwareBack = useCallback(() => {
    const {
      isSidebarOpen,
      isChapterListOpen,
      isCatalogOpen,
      isCatalogSidebarOpen,
      lightboxImage,
      hasCurrentBook,
      isAudioModalOpen,
      navStack,
      isRsvpMode
    } = uiStateRef.current;
    
    if (isAudioModalOpen) { setIsAudioModalOpen(false); return true; }
    if (lightboxImage) { setLightboxImage(null); return true; }
    if (isRsvpMode) { setIsRsvpMode(false); return true; }
    if (isCatalogSidebarOpen) { setIsCatalogSidebarOpen(false); return true; }
    if (isChapterListOpen) { setIsChapterListOpen(false); return true; }
    if (isSidebarOpen) { setIsSidebarOpen(false); return true; }
    if (isCatalogOpen) { setIsCatalogOpen(false); return true; }
    
    if (navStack.length > 0) {
        const lastState = navStack[navStack.length - 1];
        setCurrentChapterIndex(lastState.chapterIndex);
        setReaderProgress(lastState.progress);
        setNavStack(prev => prev.slice(0, -1));
        return true;
    }
    
    if (hasCurrentBook) {
      // Go back to the library view
      setCurrentBook(null);
      setCurrentChapterIndex(0);
      setNavStack([]); // Clear stack when returning to library
      return true;
    }
    
    return false;
  }, []);

  useEffect(() => {
    // 1. Capacitor native hardware back button and text scaling settings
    let backListener: any = null;
    if (isNative) {
        backListener = CapacitorApp.addListener('backButton', () => {
          const handled = handleHardwareBack();
          if (!handled) CapacitorApp.exitApp();
        });
        
        // Prevent system/accessibility font scaling from affecting the app layout
        try {
            TextZoom.set({ value: 1.0 }).catch(e => console.error("TextZoom error:", e));
        } catch (e) {
            console.error("TextZoom execution error:", e);
        }
    }

    // 2. Web PWA hash/history based back button
    // We constantly push a state forward when a UI modal opens so there's always something to pop,
    // but the easiest robust way is just ensuring one state entry in history and intercepting:
    const onPopState = (e: PopStateEvent) => {
        const handled = handleHardwareBack();
        if (handled) {
            // Push it back so we maintain the trap
            window.history.pushState({ appTrap: true }, '');
        }
    };
    
    if (!isNative) {
        if (!window.history.state?.appTrap) {
            window.history.replaceState({ appTrap: true }, '');
            window.history.pushState({ appTrap: true }, '');
        }
        window.addEventListener('popstate', onPopState);
    }
    
    return () => { 
        if (backListener) backListener.then((l: any) => l.remove()); 
        if (!isNative) window.removeEventListener('popstate', onPopState);
    };
  }, [isNative, handleHardwareBack]);

  const toggleLibrary = () => {
    setIsSidebarOpen(prev => !prev);
    setIsChapterListOpen(false);
  };

  const toggleChapterList = () => {
    setIsChapterListOpen(prev => !prev);
    setIsSidebarOpen(false);
    if (!isChapterListOpen) {
        setHighlightText("");
        setHighlightMatchIndex(-1);
    }
  };
  
  const toggleSearch = () => {
      setIsChapterListOpen(true);
      setIsSidebarOpen(false);
  };

  const clearHighlight = () => {
      setHighlightText("");
      setHighlightMatchIndex(-1);
  };

  const closeAllSidebars = () => {
    setIsSidebarOpen(false);
    setIsChapterListOpen(false);
    setIsCatalogSidebarOpen(false);
  };

  const handleAppStyleChange = (style: string) => {
    setAppStyle(style);
    setTitleClickKey(k => k + 1);
    if (style === 'Bimbo' || style === 'Surf' || style === 'Marcel') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };


  const {
      saveState,
      handleSelectBook,
      isCurrentBookOriginallyPdf,
      handleTogglePdfFormat
  } = useAppPersistence({
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
  });


  const {
      switchMode,
      handleExternalFilePicked,
      handleExternalFolderPicked,
      handleAudioBookConfirm,
      handleDeleteBook
  } = useLibrary({
      isNative,
      mode,
      setMode,
      currentBook,
      setCurrentBook,
      setIsPlaying,
      bookProgressMap,
      setBookProgressMap,
      setBookMetadataMap,
      saveMetadata,
      deleteBookHistory,
      handleSelectBook,
      saveState,
      books,
      setBooks,
      deletedBookIds,
      setDeletedBookIds,
      isLoading,
      setIsLoading,
      permissionError,
      setPermissionError,
      audioBookQueue,
      setAudioBookQueue,
      isAudioModalOpen,
      setIsAudioModalOpen
  });


  const lastBumpedTimeRef = useRef<number>(0);
  const lastAdvancedChapterRef = useRef<number | null>(null);

  // Handle Track Auto-Next
  useEffect(() => {
    const audio = audioRef.current;
    
    // Existing onEnded listener for independent files (when audio reaches physical EOF)
    const onEnded = () => {
         if (mode === 'audio' && currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
            const now = Date.now();
            if (lastAdvancedChapterRef.current === currentChapterIndex || now - lastBumpedTimeRef.current < 2000) {
               return;
            }
            lastAdvancedChapterRef.current = currentChapterIndex;
            lastBumpedTimeRef.current = now;

            const nextCh = currentBook.chapters[currentChapterIndex + 1];
            setCurrentChapterIndex(p => p + 1);
            setCurrentTime(0);
            if (audioRef.current && nextCh.startTime !== undefined) {
               audioRef.current.currentTime = nextCh.startTime;
            }
            // Force play after a tick to let React render and hook source change
            setTimeout(() => {
               setIsPlaying(true);
               if (audioRef.current && audioRef.current.paused) {
                   audioRef.current.play().catch(e => console.warn(e));
               }
            }, 50);
        } else {
            setIsPlaying(false);
        }
    };
    
    // Virtual end listener for embedded chapters sharing the same physical file
    const onTimeUpdate = () => {
       if (mode !== 'audio' || !currentBook) return;
       const ch = currentBook.chapters[currentChapterIndex];
       if (!ch) return;
       
       const now = Date.now();
       if (lastAdvancedChapterRef.current === currentChapterIndex || now - lastBumpedTimeRef.current < 2000) return;

       if (ch.endTime && audio.currentTime >= ch.endTime) {
           if (currentChapterIndex < currentBook.chapters.length - 1) {
              lastAdvancedChapterRef.current = currentChapterIndex;
              lastBumpedTimeRef.current = now;
              const nextCh = currentBook.chapters[currentChapterIndex + 1];
              setCurrentChapterIndex(p => p + 1);
              if (nextCh.startTime !== undefined && Math.abs(audio.currentTime - nextCh.startTime) > 1.0) {
                  audio.currentTime = nextCh.startTime;
              }
              setCurrentTime(0);
              // Force play
              setIsPlaying(true);
              if (audio.paused) {
                  audio.play().catch(e => console.warn(e));
              }
           } else {
              // End of the book
              setIsPlaying(false);
              audio.pause();
           }
       }
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
       audio.removeEventListener('ended', onEnded);
       audio.removeEventListener('timeupdate', onTimeUpdate);
    }
  }, [currentBook, currentChapterIndex, mode]);


  // --- Catalog logic ---
  const syncCatalog = useCallback(async (forceFresh: boolean = false) => {
    setIsSyncingCatalog(true);
    try {
      const updated = await fetchRepositoryCatalog(forceFresh);
      if (Array.isArray(updated)) {
        setCatalogBooks(updated);
      }
    } catch (e) {
      console.warn('Failed to sync catalog:', e);
    } finally {
      setIsSyncingCatalog(false);
    }
  }, []);

  const catalogSessionSyncedRef = useRef(false);

  // Sync catalog strictly once per catalog opening
  useEffect(() => {
    if (isCatalogOpen) {
      if (!catalogSessionSyncedRef.current) {
        catalogSessionSyncedRef.current = true;
        syncCatalog(true);
      }
    } else {
      // Reset so that opening the catalog next time will sync again
      catalogSessionSyncedRef.current = false;
    }
  }, [isCatalogOpen, syncCatalog]);

  useEffect(() => {
    // Only load from local offline cache on initial launch - no network requests
    getCachedCatalog().then((cached) => {
      if (Array.isArray(cached)) {
        setCatalogBooks(cached);
      }
    });
  }, []);

  const seriesList = React.useMemo(() => getCatalogSeriesFromBooks(catalogBooks), [catalogBooks]);

  const filteredCatalogBooks = React.useMemo(() => {
    return catalogBooks.filter(book => {
      if (catalogFilter.searchQuery) {
        const q = catalogFilter.searchQuery.toLowerCase();
        const matchTitle = book.title.toLowerCase().includes(q);
        const matchAuthor = book.author.toLowerCase().includes(q);
        const matchSeries = (book.series || '').toLowerCase().includes(q);
        const matchDesc = (book.description || '').toLowerCase().includes(q);
        return matchTitle || matchAuthor || matchSeries || matchDesc;
      }
      if (catalogFilter.type === 'series' && catalogFilter.value) {
        return book.series === catalogFilter.value;
      }
      if (catalogFilter.type === 'author' && catalogFilter.value) {
        return book.author === catalogFilter.value;
      }
      return true;
    });
  }, [catalogBooks, catalogFilter]);

  const handleDownloadCatalogBook = async (catalogBook: CatalogBook) => {
    if (!catalogBook.downloadUrl && !catalogBook.fallbackUrl) return;
    setDownloadingBookIds(prev => new Set(prev).add(catalogBook.id));
    try {
      let res: Response | null = null;
      if (catalogBook.downloadUrl) {
        try {
          res = await fetch(catalogBook.downloadUrl);
        } catch {
          res = null;
        }
      }
      if (!res || !res.ok) {
        if (catalogBook.fallbackUrl) {
          res = await fetch(catalogBook.fallbackUrl);
        }
      }
      if (!res || !res.ok) throw new Error(`HTTP ${res?.status || 500}`);
      const blob = await res.blob();
      const targetUrl = catalogBook.downloadUrl || catalogBook.fallbackUrl || '';
      const ext = targetUrl.split('.').pop()?.split('?')[0] || 'fb2';
      const authorPrefix = catalogBook.author && catalogBook.author !== 'Автор не указан' ? `${catalogBook.author} - ` : '';
      const fileName = `${authorPrefix}${catalogBook.title}.${ext}`;
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      await handleExternalFilePicked(file);
    } catch (err) {
      console.error('Failed to download catalog book:', err);
    } finally {
      setDownloadingBookIds(prev => {
        const next = new Set(prev);
        next.delete(catalogBook.id);
        return next;
      });
    }
  };

  const handleReadCatalogBook = (catalogBook: CatalogBook) => {
    const matched = books.find(b => {
      const cleanLibTitle = b.title.toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
      const cleanCatTitle = catalogBook.title.toLowerCase().trim();
      return cleanLibTitle === cleanCatTitle || cleanLibTitle.includes(cleanCatTitle);
    });

    if (matched) {
      setIsCatalogOpen(false);
      setIsCatalogSidebarOpen(false);
      setMode('ebook');
      handleSelectBook(matched);
    }
  };

  const handleOpenCatalog = () => {
    setIsCatalogOpen(true);
    setIsCatalogSidebarOpen(false);
    setCatalogFilter({ type: 'all' });
    setIsSidebarOpen(false);
    setMode('ebook');
  };

  const handleBackFromCatalog = () => {
    setIsCatalogOpen(false);
    setIsCatalogSidebarOpen(false);
  };

  // --- Render ---
  const filteredBooks = books.filter(b => b.type === mode && !deletedBookIds.includes(b.id));

  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';
  const isMarcel = appStyle === 'Marcel';

  return (
    <div className={`flex fixed inset-0 w-full bg-[#23211f] text-[#fffff0] font-serif overflow-hidden ${isBimbo ? 'bimbo-mode' : ''} ${isSurf ? 'surf-mode' : ''} ${isFF ? 'ff-mode' : ''} ${isDragon ? 'dragon-mode' : ''} ${isMarcel ? 'marcel-mode' : ''}`}>
      <AppStyles appStyle={appStyle} theme={theme} />
      
      {/* Font Preloader - ensures theme fonts are loaded before settings menu opens */}
      <div className="fixed opacity-0 pointer-events-none -z-50 select-none overflow-hidden h-0 w-0" aria-hidden="true">
        <span className="font-bimbo">.</span>
        <span className="font-ff">.</span>
        <span className="font-dragon">.</span>
        <span className="font-surf">.</span>
        <span className="font-marcel">.</span>
        <span className="font-literata">.</span>
      </div>
      
      {(isSidebarOpen || isChapterListOpen || isCatalogSidebarOpen) && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={closeAllSidebars} />
      )}

      {/* --- Lightbox Modal (Zoom, Drag & Side Navigation) --- */}
      {lightboxImage && (
          <ImageLightbox 
            src={lightboxImage}
            onClose={() => setLightboxImage(null)}
            illustrations={getBookIllustrations()}
            onNavigate={handleLightboxNavigate}
          />
      )}

      <LibrarySidebar 
        books={filteredBooks}
        currentBookId={currentBook?.id || null}
        onSelectBook={handleSelectBook}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        bookProgressMap={bookProgressMap}
        appStyle={appStyle}
        onAppStyleChange={handleAppStyleChange}
        currentBookFormat={currentBook?.format || null}
        onExternalFilePicked={handleExternalFilePicked}
        onExternalFolderPicked={handleExternalFolderPicked}
        onDeleteBook={handleDeleteBook}
        mode={mode}
        readerFont={readerFont}
        onReaderFontChange={setReaderFont}
        customFonts={customFonts}
        onAddCustomFont={addCustomFont}
        onDeleteCustomFont={deleteCustomFont}
        onOpenCatalog={handleOpenCatalog}
      />

      {isCatalogOpen && (
        <CatalogSidebar
          isOpen={isCatalogSidebarOpen}
          onClose={() => setIsCatalogSidebarOpen(false)}
          seriesList={seriesList}
          allBooks={catalogBooks}
          currentFilter={catalogFilter}
          onSelectFilter={(newFilter) => setCatalogFilter(newFilter)}
          appStyle={appStyle}
        />
      )}

      {currentBook && (
        <ChapterSidebar 
            chapters={currentBook.chapters}
            currentChapterIndex={currentChapterIndex}
            bookTitle={currentBook.title}
            bookId={currentBook.id}
            appStyle={appStyle}
            isAudio={mode === 'audio'}
            onSelectChapter={(i) => { 
                setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                setCurrentChapterIndex(i); 
                if (mode === 'audio') {
                    const baseTime = currentBook.chapters[i]?.startTime || 0;
                    setCurrentTime(0);
                    audioRef.current.currentTime = baseTime;
                    audioRef.current.pause();
                    setIsPlaying(false);
                } else {
                    setReaderProgress(0); 
                    setIsImmersive(false);
                }
            }}
            isOpen={isChapterListOpen}
            onClose={() => setIsChapterListOpen(false)}
            onSearchResultClick={(idx, text, matchIndex) => {
                setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                setReaderProgress(0); 
                setCurrentChapterIndex(idx);
                setHighlightText(text);
                setHighlightMatchIndex(matchIndex);
                setIsChapterListOpen(false);
            }}
            onClearHighlight={clearHighlight}
            showSearch={mode === 'ebook'}
        />
      )}

      {/* Main Layout */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden transition-all duration-300 z-10">
        
        {/* Top Header */}
        <AppHeader
            isImmersive={isImmersive}
            mode={mode}
            appStyle={appStyle}
            libraryClickKey={libraryClickKey}
            titleClickKey={titleClickKey}
            chaptersClickKey={chaptersClickKey}
            currentBook={currentBook}
            isCatalogOpen={isCatalogOpen}
            onBackFromCatalog={handleBackFromCatalog}
            onToggleCatalogSidebar={() => setIsCatalogSidebarOpen(prev => !prev)}
            onToggleLibrary={() => {
                setLibraryClickKey(k => k + 1);
                toggleLibrary();
            }}
            onSwitchMode={() => {
                setTitleClickKey(k => k + 1);
                if (isCatalogOpen) {
                  setIsCatalogOpen(false);
                }
                switchMode();
            }}
            onToggleChapters={() => {
                setChaptersClickKey(k => k + 1);
                toggleChapterList();
            }}
        />

        {/* Content Area - No Margin Top, allowing full height */}
        <div className={`flex-1 overflow-hidden flex flex-col relative h-full w-full`} data-reader-container>
          
          {isCatalogOpen ? (
            <CatalogView
              books={filteredCatalogBooks}
              libraryBooks={books}
              currentFilter={catalogFilter}
              onResetFilter={() => setCatalogFilter({ type: 'all' })}
              onDownloadBook={handleDownloadCatalogBook}
              onReadBook={handleReadCatalogBook}
              downloadingIds={downloadingBookIds}
              appStyle={appStyle}
              isLoading={isSyncingCatalog}
              onRefresh={() => syncCatalog(true)}
            />
          ) : (books.length === 0 && !isLoading) || !currentBook ? (
             <EmptyState 
                isLoading={isLoading} 
                booksCount={books.length} 
                mode={mode} 
                isNative={isNative} 
                appStyle={appStyle} 
                onExternalFilePicked={handleExternalFilePicked}
                onExternalFolderPicked={handleExternalFolderPicked}
                currentBook={currentBook}
                onOpenCatalog={handleOpenCatalog}
             />
          ) : (
            mode === 'audio' ? (
                // Audio Player needs padding to not be hidden by header
                <div className="flex-1 flex flex-col items-center justify-center p-4 pt-20 pb-4 md:pb-8 w-full min-h-0 overflow-hidden">
                    <div className="w-full flex-1 flex flex-col items-center justify-center gap-4 md:gap-8 min-h-0">
                        <div className="relative w-full flex-1 flex items-center justify-center min-h-0 h-0 shrink overflow-hidden">
                            <div 
                                onClick={togglePlay} 
                                className={`h-full aspect-square max-w-full flex items-center justify-center relative overflow-hidden cursor-pointer active:scale-95 transition-transform rounded-2xl md:rounded-3xl shadow-xl ${
                                    currentBook.coverUrl ? 'bg-[#2c2a28]' : '' 
                                }`}
                            >
                                {currentBook.coverUrl ? (
                                    <img src={currentBook.coverUrl} className="w-full h-full object-cover" alt="Cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <span className="text-[5rem] md:text-[7rem] leading-none select-none opacity-80 emoji" style={{ fontSize: '5rem' }}>
                                            {isMarcel ? '☕' : isBimbo ? '💿' : isSurf ? '🏄' : '💽'}
                                        </span>
                                    </div>
                                )}

                                {isAudioLoading && (
                                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-20 transition-opacity">
                                        <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
                                            isBimbo ? 'border-pink-200 border-t-pink-600' : 
                                            isSurf ? 'border-sky-200 border-t-sky-600' : 
                                            isMarcel ? 'border-[#C4B5E6] border-t-[#766594]' :
                                            'border-[#fffff0]/20 border-t-[#fffff0]'
                                        }`}></div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1 w-full max-w-2xl text-center shrink-0 px-2">
                            <h2 className={`text-lg md:text-2xl font-bold font-literata leading-snug line-clamp-2 ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0C4A6E]' : 'text-[#fffff0]'}`}>{currentBook.title}</h2>
                            {currentBook.author && <p className={`text-sm md:text-base italic ${isMarcel ? 'text-[#766594]' : isBimbo ? 'text-[#BE123C]/70' : isSurf ? 'text-[#0369A1]' : 'text-[#888]'}`}>{currentBook.author}</p>}
                            <p className={`text-xs line-clamp-1 mt-1 ${isMarcel ? 'text-[#9B8EAE]' : isBimbo ? 'text-[#BE123C]/50' : isSurf ? 'text-[#0EA5E9]' : 'text-[#666]'}`}>{currentBook.chapters[currentChapterIndex]?.name}</p>
                        </div>
                        <div className="w-full max-w-2xl shrink-0 pb-2 md:pb-6">
                            <PlayerControls 
                                isPlaying={isPlaying}
                                onTogglePlay={togglePlay}
                                onNext={() => { 
                                    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) { 
                                        setCurrentChapterIndex(p=>p+1); 
                                    } 
                                }}
                                onPrev={() => { 
                                    if (!currentBook) return;
                                    if (currentTime > 5) { 
                                        seekAudio(0);
                                    } else if (currentChapterIndex > 0) { 
                                        setCurrentChapterIndex(p=>p-1); 
                                    } 
                                }}
                                playbackRate={playbackRate}
                                onRateChange={setPlaybackRate}
                                currentTime={currentTime}
                                duration={duration}
                                onSeek={(t) => { 
                                    if (!currentBook) return;
                                    const chDur = duration;
                                    
                                    if (t < -0.001) { // Skip backwards across chapters
                                        let remainingBack = Math.abs(t);
                                        let idx = currentChapterIndex;
                                        while (idx > 0 && remainingBack > 0) {
                                            idx--;
                                            const prevCh = currentBook.chapters[idx];
                                            const prevDur = prevCh.duration || 0;
                                            if (prevDur >= remainingBack) {
                                                setCurrentChapterIndex(idx);
                                                seekAudio(prevDur - remainingBack);
                                                return;
                                            }
                                            remainingBack -= prevDur;
                                        }
                                        setCurrentChapterIndex(0);
                                        seekAudio(0);
                                    } else if (t > chDur + 0.001) { // Skip forwards across chapters
                                        let remainingForward = t - chDur;
                                        let idx = currentChapterIndex;
                                        while (idx < currentBook.chapters.length - 1 && remainingForward > 0) {
                                            idx++;
                                            const nextCh = currentBook.chapters[idx];
                                            const nextDur = nextCh.duration || 0;
                                            if (nextDur >= remainingForward) {
                                                setCurrentChapterIndex(idx);
                                                seekAudio(remainingForward);
                                                return;
                                            }
                                            remainingForward -= nextDur;
                                        }
                                        setCurrentChapterIndex(currentBook.chapters.length - 1);
                                        seekAudio(currentBook.chapters[currentBook.chapters.length-1].duration || 0);
                                    } else {
                                        seekAudio(t);
                                    }
                                }}
                                totalProgress={calculateTotalProgress(
                                    currentChapterIndex,
                                    currentBook.chapters,
                                    currentTime,
                                    duration
                                )}
                                currentBook={currentBook}
                                currentChapterIndex={currentChapterIndex}
                                appStyle={appStyle}
                                globalCurrentTime={currentBook.chapters.some(ch => ch.startTime !== undefined) ? currentTime : ((currentBook.chapters[currentChapterIndex]?.startTime || 0) + currentTime)}
                                globalDuration={currentBook.chapters.reduce((acc, ch) => acc + (ch.duration || 0), 0) || duration}
                                onGlobalSeek={(targetGlobalTime) => {
                                    const isEmbeddedCh = currentBook.chapters.some(ch => ch.startTime !== undefined);
                                    
                                    const matchedIndex = currentBook.chapters.findIndex(ch => {
                                        const start = ch.startTime || 0;
                                        const end = ch.endTime || (start + (ch.duration || 0));
                                        return targetGlobalTime >= start && targetGlobalTime <= end;
                                    });
                                    
                                    if (matchedIndex !== -1) {
                                        const matchedChapter = currentBook.chapters[matchedIndex];
                                        setCurrentChapterIndex(matchedIndex);
                                        
                                        if (isEmbeddedCh) {
                                            audioRef.current.currentTime = targetGlobalTime;
                                            setCurrentTime(targetGlobalTime);
                                        } else {
                                            const localSeek = targetGlobalTime - (matchedChapter.startTime || 0);
                                            setCurrentTime(localSeek);
                                            if (currentChapterIndex === matchedIndex) {
                                                audioRef.current.currentTime = localSeek;
                                            } else {
                                                const onMetadata = () => {
                                                    audioRef.current.currentTime = localSeek;
                                                    audioRef.current.removeEventListener('loadedmetadata', onMetadata);
                                                };
                                                audioRef.current.addEventListener('loadedmetadata', onMetadata);
                                            }
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {currentBook.format === 'pdf' || currentBook.format === 'comic' ? (
                        <PDFReader 
                            key={currentBook.id}
                            book={currentBook}
                            currentChapterIndex={currentChapterIndex}
                            initialProgressRatio={readerProgress}
                            theme={theme}
                            appStyle={appStyle}
                            uiVisible={!isImmersive}
                            onToggleUI={() => setIsImmersive(!isImmersive)}
                            onProgressUpdate={(ratio) => {
                                // Guard against updating progress for a book that is being swapped out
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setReaderProgress(ratio);
                                }
                            }}
                            onChapterChange={(idx, align) => {
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setCurrentChapterIndex(idx);
                                    setReaderProgress(align === 'end' ? 1 : 0);
                                }
                            }}
                        />
                    ) : (
                        <EBookReader 
                            key={currentBook.id}
                            book={currentBook}
                            currentChapterIndex={currentChapterIndex}
                            initialProgressRatio={readerProgress}
                            fontSize={fontSize}
                            theme={theme}
                            uiVisible={!isImmersive}
                            onToggleUI={() => setIsImmersive(!isImmersive)}
                            onProgressUpdate={(ratio) => {
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setReaderProgress(ratio);
                                }
                            }}
                            onChapterChange={(idx, align) => {
                                if (currentBookRef.current?.id === currentBook.id) {
                                    setCurrentChapterIndex(idx);
                                    setReaderProgress(align === 'end' ? 1 : 0);
                                }
                            }}
                            highlightText={highlightText}
                            highlightMatchIndex={highlightMatchIndex}
                            onHighlightClear={clearHighlight}
                            isStyledMode={isStyledMode}
                            isBionic={isBionic}
                            appStyle={appStyle}
                            isRsvpMode={isRsvpMode}
                            rsvpWpm={rsvpWpm}
                            onRsvpWpmChange={setRsvpWpm}
                            isPagedMode={isPagedMode}
                            onTogglePagedMode={() => setIsPagedMode(!isPagedMode)}
                            readerFont={readerFont}
                            onImageClick={(src) => setLightboxImage(src)}
                            onExternalLinkClick={(href) => {
                                if (href.startsWith('#') && href.length > 1) {
                                    const id = href.substring(1);
                                    (window as any).__pendingScrollTarget = id;
                                    let targetChapterIndex = currentBook.chapters.findIndex((ch: any) => ch.content && ch.content.includes(`id="${id}"`));
                                    
                                    // Sometimes id has extra characters or different casing
                                    if (targetChapterIndex === -1 && id.includes('-')) {
                                         targetChapterIndex = currentBook.chapters.findIndex((ch: any) => ch.content && ch.content.includes(id));
                                    }

                                    // Fallback finding literal string representation of ID inside content
                                    if (targetChapterIndex === -1) {
                                        targetChapterIndex = currentBook.chapters.findIndex((ch: any) => ch.content && ch.content.includes(id));
                                    }

                                    if (targetChapterIndex !== -1) {
                                        setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                                        setCurrentChapterIndex(targetChapterIndex);
                                        
                                        let attempts = 0;
                                        const scrollIter = () => {
                                            const el = document.getElementById(id);
                                            if (el) {
                                                el.scrollIntoView({behavior: 'smooth', block: 'center'});
                                            } else if (attempts < 20) {
                                                attempts++;
                                                setTimeout(scrollIter, 30);
                                            }
                                        };
                                        setTimeout(scrollIter, 30);
                                    } else {
                                        // fallback for footnotes if not found in any chapter
                                        if (id.includes('note') || id.includes('cite') || id.includes('fn') || id.includes('ref')) {
                                            setNavStack(prev => [...prev, { chapterIndex: currentChapterIndex, progress: readerProgress }]);
                                            setCurrentChapterIndex(currentBook.chapters.length - 1);
                                            setReaderProgress(0);
                                            
                                            let attempts = 0;
                                            const scrollIter = () => {
                                                const el = document.getElementById(id);
                                                if (el) {
                                                    el.scrollIntoView({behavior: 'smooth', block: 'center'});
                                                } else if (attempts < 20) {
                                                    attempts++;
                                                    setTimeout(scrollIter, 30);
                                                }
                                            };
                                            setTimeout(scrollIter, 30);
                                        }
                                    }
                                }
                            }}
                        />
                    )}
                    {(() => {
                        const headerPages = currentBook.chapters
                            .map((ch, idx) => ({ idx, isHeader: ch.isHeader }))
                            .filter(item => item.isHeader)
                            .map(item => item.idx);
                        
                        let currentHeaderIdx = -1;
                        if (headerPages.length > 0) {
                            for (let i = 0; i < headerPages.length; i++) {
                                if (headerPages[i] <= currentChapterIndex) {
                                    currentHeaderIdx = i;
                                } else {
                                    break;
                                }
                            }
                        }

                        let computedProgress = readerProgress * 100;
                        if (currentBook.format === 'pdf' && headerPages.length > 0 && currentHeaderIdx !== -1) {
                            const A = headerPages[currentHeaderIdx];
                            const B = currentHeaderIdx + 1 < headerPages.length ? headerPages[currentHeaderIdx + 1] : currentBook.chapters.length;
                            const diff = B - A;
                            if (diff > 0) {
                                computedProgress = ((currentChapterIndex - A) / diff) * 100;
                            } else {
                                computedProgress = 100;
                            }
                        }

                        const computedChapterTitle = (currentBook.format === 'pdf' && headerPages.length > 0 && currentHeaderIdx !== -1)
                            ? currentBook.chapters[headerPages[currentHeaderIdx]]?.name
                            : currentBook.chapters[currentChapterIndex]?.name;

                        return (
                            <EBookControls 
                                fontSize={fontSize}
                                setFontSize={setFontSize}
                                chapterProgress={computedProgress}
                                bookProgress={calculateTotalProgress(currentChapterIndex, currentBook.chapters, readerProgress, 1)} 
                                chapterTitle={computedChapterTitle}
                                onOpenSearch={toggleSearch}
                                chapters={currentBook.chapters}
                                theme={theme}
                                onToggleTheme={() => setTheme(p => p === 'dark' ? 'light' : 'dark')}
                                show={!isImmersive}
                                isStyledMode={isStyledMode}
                                onToggleStyledMode={() => setIsStyledMode(!isStyledMode)}
                                isPdfSource={isCurrentBookOriginallyPdf}
                                currentBookFormat={currentBook?.format || null}
                                onTogglePdfFormat={handleTogglePdfFormat}
                                appStyle={appStyle}
                                isBionic={isBionic}
                                onToggleBionic={() => setIsBionic(!isBionic)}
                                isRsvpMode={isRsvpMode}
                                onToggleRsvpMode={() => setIsRsvpMode(!isRsvpMode)}
                                isPagedMode={isPagedMode}
                                onTogglePagedMode={() => setIsPagedMode(!isPagedMode)}
                            />
                        );
                    })()}
                </>
            )
          )}
        </div>
      </div>
        {/* Permission Overlay */}
        {permissionError && <PermissionOverlay onDismiss={() => setPermissionError(false)} />}
        
        {/* Global Loading Overlay */}
        {isLoading && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-300">
                <div className={`w-16 h-16 border-4 rounded-full animate-spin ${
                    isBimbo ? 'border-pink-200 border-t-pink-600' : 
                    isSurf ? 'border-sky-200 border-t-sky-600' : 
                    isDragon ? 'border-orange-200 border-t-orange-600' :
                    isMarcel ? 'border-[#C4B5E6] border-t-[#766594]' :
                    'border-[#fffff0]/20 border-t-[#fffff0]'
                }`}></div>
            </div>
        )}
        
        <AudioBookDetailsModal 
          isOpen={isAudioModalOpen}
          suggestedTitle={audioBookQueue[0]?.folderName || ''}
          suggestedAuthor={audioBookQueue[0]?.author || ''}
          appStyle={appStyle}
          onConfirm={handleAudioBookConfirm}
          onCancel={() => {
            setIsAudioModalOpen(false);
            setAudioBookQueue([]);
          }}
        />
    </div>
  );
}

export default App;