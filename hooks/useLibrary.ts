
import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SplashScreen } from '@capacitor/splash-screen';
import * as mm from 'music-metadata';
import { Book, Chapter, AppMode, PersistedState } from '../types';
import { getAllPersistentBooks, saveBookToDB, deleteBookFromDB } from '../utils/db';
import { parseM4AChapters } from '../utils/mp4chapters';

interface UseLibraryProps {
    isNative: boolean;
    mode: AppMode;
    setMode: React.Dispatch<React.SetStateAction<AppMode>>;
    currentBook: Book | null;
    setCurrentBook: React.Dispatch<React.SetStateAction<Book | null>>;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    bookProgressMap: Record<string, PersistedState>;
    setBookProgressMap: React.Dispatch<React.SetStateAction<Record<string, PersistedState>>>;
    setBookMetadataMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
    saveMetadata: (id: string, title: string, author: string, coverUrl?: string) => void;
    deleteBookHistory: (id: string) => Promise<void>;
    handleSelectBook: (book: Book, specificProgressMap?: Record<string, PersistedState>) => Promise<void>;
    saveState: (isClosingApp?: boolean) => Promise<PersistedState | null>;
    books: Book[];
    setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
    deletedBookIds: string[];
    setDeletedBookIds: React.Dispatch<React.SetStateAction<string[]>>;
    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    permissionError: boolean;
    setPermissionError: React.Dispatch<React.SetStateAction<boolean>>;
    audioBookQueue: { folderName: string, author?: string, extractedCover?: string, generatedChapters?: Chapter[], files: File[], allFiles: File[] }[];
    setAudioBookQueue: React.Dispatch<React.SetStateAction<{ folderName: string, author?: string, extractedCover?: string, generatedChapters?: Chapter[], files: File[], allFiles: File[] }[]>>;
    isAudioModalOpen: boolean;
    setIsAudioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useLibrary({
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
}: UseLibraryProps) {

  // --- Mode Switching ---
  const switchMode = async () => {
    let latestState: PersistedState | null = null;
    if (currentBook) {
        if (mode === 'audio') setIsPlaying(false);
        latestState = await saveState(true);
    }

    const newMode = mode === 'audio' ? 'ebook' : 'audio';
    setMode(newMode);
    
    const effectiveMap = latestState 
        ? { ...bookProgressMap, [latestState.bookId]: latestState } 
        : bookProgressMap;

    let bestBookId: string | null = null;
    let maxTime = 0;

    (Object.values(effectiveMap) as PersistedState[]).forEach(state => {
        const matchingBook = books.find(b => b.id === state.bookId);
        if (matchingBook && matchingBook.type === newMode) {
            if (state.lastUpdated > maxTime) {
                maxTime = state.lastUpdated;
                bestBookId = state.bookId;
            }
        }
    });

    if (bestBookId) {
        const book = books.find(b => b.id === bestBookId);
        if (book) handleSelectBook(book, effectiveMap);
    } else {
        setCurrentBook(null);
    }
  };

  const handleExternalFilePicked = async (files: File | File[] | FileList) => {
      setIsLoading(true);
      try {
          let fileArray: File[] = [];
          if (files instanceof File) {
              fileArray = [files];
          } else if (files instanceof FileList) {
              fileArray = Array.from(files);
          } else if (Array.isArray(files)) {
              fileArray = files;
          }
          
          if (fileArray.length === 0) return;

          const addedBooks: Book[] = [];
          let lastBook: Book | null = null;
          let lastType: 'audio' | 'ebook' = 'ebook';

          for (let i = 0; i < fileArray.length; i++) {
              const file = fileArray[i];
              const lowerName = file.name.toLowerCase();
              let newType: 'audio' | 'ebook' = 'ebook';
              let format = '';
              
              if (lowerName.match(/\.(mp3|m4b|m4a|mp4)$/)) {
                  newType = 'audio';
              } else {
                  newType = 'ebook';
                  if (lowerName.endsWith('.pdf')) format = 'pdf';
                  else if (lowerName.endsWith('.fb2')) format = 'fb2';
                  else if (lowerName.endsWith('.epub')) format = 'epub';
                  else if (lowerName.endsWith('.cbr') || lowerName.endsWith('.cbz') || lowerName.endsWith('.rar') || lowerName.endsWith('.zip')) format = 'comic';
                  else if (lowerName.endsWith('.bin')) format = 'fb2';
              }
              
              const newBookId = "external_" + Date.now() + "_" + i + "_" + Math.random().toString(36).substring(2, 6);
              
              const newBook: Book = {
                  id: newBookId,
                  title: file.name,
                  type: newType,
                  format: format || (lowerName.endsWith('.epub') ? 'epub' : (lowerName.endsWith('.fb2') ? 'fb2' : '')),
                  size: file.size,
                  chapters: [{
                      name: file.name,
                      path: newBookId,
                      file: file,
                      url: newType === 'audio' ? URL.createObjectURL(file) : ''
                  }]
              };
              
              addedBooks.push(newBook);
              lastBook = newBook;
              lastType = newType;
              await saveBookToDB(newBook);
          }
          
          if (addedBooks.length > 0) {
              setBooks(prev => [...addedBooks, ...prev]);
              
              // Select it automatically
              setMode(lastType);
              if (lastBook) {
                  handleSelectBook(lastBook);
              }
          }
      } finally {
          setIsLoading(false);
      }
  };

  const handleExternalFilePickedRef = useRef(handleExternalFilePicked);
  useEffect(() => { handleExternalFilePickedRef.current = handleExternalFilePicked; }, [handleExternalFilePicked]);

  // PWA File Handling API support
  useEffect(() => {
    if ('launchQueue' in window) {
      try {
        (window as any).launchQueue?.setConsumer(async (launchParams: any) => {
          if (!launchParams.files || !launchParams.files.length) return;
          const files: File[] = [];
          for (const handle of launchParams.files) {
            try {
              const file = await handle.getFile();
              files.push(file);
            } catch (e) {
              console.error("Could not get file from handle", e);
            }
          }
          if (files.length > 0) {
            handleExternalFilePickedRef.current(files);
          }
        });
      } catch (e) {
        console.error("Error setting up launchQueue", e);
      }
    }
  }, []);

  const handleExternalFolderPicked = async (files: FileList | File[]) => {
    setIsLoading(true);
    try {
      const fileArray = Array.from(files);
      const audioFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(mp3|m4b|m4a|mp4)$/));
      const imageFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|bmp)$/));
      
      if (audioFiles.length === 0) {
          setIsLoading(false);
          return;
      }
      
      // Group files by their parent folder
      const foldersMap: Record<string, { audio: File[], images: File[] }> = {};
      
      const getFolderName = (file: File) => {
          const relPath = (file as any).webkitRelativePath || '';
          const parts = relPath.split('/');
          return parts.length > 1 ? parts[parts.length - 2] : 'Audio Book';
      };

      audioFiles.forEach(file => {
          const folderName = getFolderName(file);
          if (!foldersMap[folderName]) foldersMap[folderName] = { audio: [], images: [] };
          foldersMap[folderName].audio.push(file);
      });

      imageFiles.forEach(file => {
          const folderName = getFolderName(file);
          // Only add images to folders that actually contain audio files
          if (foldersMap[folderName]) {
              foldersMap[folderName].images.push(file);
          }
      });

      const newQueue = [];
      for (const [folderName, { audio: folderFiles, images: folderImages }] of Object.entries(foldersMap)) {
        let folderTitle = folderName;
        let folderAuthor = '';
        let extractedCover: string | undefined = undefined;

        // PRIORITIZE EXTERNAL COVER FILE
        if (folderImages && folderImages.length > 0) {
            const coverFile = folderImages.find(f => {
                const lower = f.name.toLowerCase();
                return lower.includes('cover') || lower.includes('folder') || lower.includes('front');
            }) || folderImages[0];
            extractedCover = URL.createObjectURL(coverFile);
        }
        
        folderFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        const fileMetas: any[] = new Array(folderFiles.length);
      const batchSize = 5;
      for (let i = 0; i < folderFiles.length; i += batchSize) {
          const batch = folderFiles.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(async (file, idx) => {
              try {
                  const ext = file.name.split('.').pop()?.toLowerCase() || "";
                  const isMp4 = ['mp4', 'm4b', 'm4a'].includes(ext);

                  // For MP4 files, mm.parseBlob can hang if duration or chapters are requested,
                  // so we disable them, and only get basic tags (which includes the cover).
                  const parsePromise = mm.parseBlob(file, { 
                      duration: !isMp4, 
                      includeChapters: !isMp4,
                      skipCovers: (i + idx) > 0
                  });
                  
                  // Add a 60 second timeout to prevent infinite hangs on large files
                  const meta: any = await Promise.race([
                      parsePromise,
                      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout parsing metadata")), 60000))
                  ]);
                  
                  return { file, meta };
              } catch (e) {
                  console.error("Metadata parsing error for file", file.name, e);
                  return { file, meta: null };
              }
          }));
          for (let j = 0; j < results.length; j++) {
              fileMetas[i + j] = results[j];
          }
      }

      const firstValidMeta = fileMetas.find(fm => fm.meta)?.meta;
      if (firstValidMeta) {
          folderTitle = firstValidMeta.common.album || firstValidMeta.common.title || folderTitle;
          folderAuthor = firstValidMeta.common.artist || firstValidMeta.common.albumartist || firstValidMeta.common.composer || '';
          if (!extractedCover && firstValidMeta.common.picture && firstValidMeta.common.picture.length > 0) {
              const pic = firstValidMeta.common.picture[0];
              const blob = new Blob([pic.data], { type: pic.format });
              extractedCover = URL.createObjectURL(blob);
          }
      }
      
      const firstFileName = fileMetas[0]?.file.name.replace(/\.[a-zA-Z0-9]+$/, "") || folderTitle;
      
      if (!folderAuthor || folderTitle === folderName) {
           const match = firstFileName.match(/^(.*?)\s*[-—]\s*(.*)$/);
           if (match) {
               if (!folderAuthor) folderAuthor = match[1].trim();
               if (folderTitle === folderName) folderTitle = match[2].trim();
           } else {
               if (folderTitle === folderName) folderTitle = firstFileName;
           }
      }

      const generatedChapters: Chapter[] = [];
      for (let i = 0; i < fileMetas.length; i++) {
          const fm = fileMetas[i];
          const url = URL.createObjectURL(fm.file);
          const hasMmChapters = fm.meta && fm.meta.format && (fm.meta as any).format.chapters && (fm.meta as any).format.chapters.length > 0;
          
          let chs: any[] = [];
          
          if (['mp4', 'm4b', 'm4a'].includes(fm.file.name.split('.').pop()?.toLowerCase() || "")) {
             const hasDuration = fm.meta?.format?.duration && fm.meta.format.duration > 0;
             if (!hasMmChapters || !hasDuration) {
                 try {
                     const res: any = await parseM4AChapters(fm.file);
                     if (res.chapters && res.chapters.length > 0) {
                         chs = res.chapters;
                     }
                     if (res.fileDuration && res.fileDuration > 0) {
                        if (!fm.meta) fm.meta = { format: {}, common: {} } as any;
                        if (!fm.meta.format) fm.meta.format = {} as any;
                        fm.meta.format.duration = res.fileDuration;
                     }
                 } catch (e) {
                     console.warn("M4A fallback parsing failed:", e);
                 }
             }
          }

          if (chs.length === 0 && hasMmChapters) {
             chs = (fm.meta as any).format.chapters;
          }

          if (chs.length > 0) {
              const sampleRate = fm.meta?.format.sampleRate || 44100;
              chs.forEach((ch: any, idx: number) => {
                  let startTime = 0;
                  if (ch.sampleOffset !== undefined) startTime = ch.sampleOffset / sampleRate;
                  else if (ch.start !== undefined && ch.timeScale) startTime = ch.start / ch.timeScale;
                  else if (ch.start !== undefined) startTime = ch.start; // fallback if no timeScale!
                  else if (ch.time_offset !== undefined) startTime = ch.time_offset;
                  else if (ch.startTime !== undefined) startTime = ch.startTime;

                  const nextCh = chs[idx + 1];
                  let endTime = fm.meta?.format.duration;
                  if (nextCh) {
                      if (nextCh.sampleOffset !== undefined) endTime = nextCh.sampleOffset / sampleRate;
                      else if (nextCh.start !== undefined && nextCh.timeScale) endTime = nextCh.start / nextCh.timeScale;
                      else if (nextCh.start !== undefined) endTime = nextCh.start; // fallback if no timeScale!
                      else if (nextCh.time_offset !== undefined) endTime = nextCh.time_offset;
                      else if (nextCh.startTime !== undefined) endTime = nextCh.startTime;
                  } else if (ch.duration !== undefined) {
                      endTime = startTime + ch.duration;
                  }

                  generatedChapters.push({
                      name: ch.title || ch.name || `Chapter ${generatedChapters.length + 1}`,
                      path: "embedded_chapter_" + Math.random().toString(36).substring(2, 6) + "_" + idx,
                      file: fm.file,
                      url,
                      startTime, // ensure it's defined
                      endTime: endTime,
                      duration: endTime !== undefined ? endTime - startTime : undefined
                  });
              });
          } else {
              generatedChapters.push({
                  name: fm.meta?.common.title || fm.meta?.common.album || fm.file.name.replace(/\.[^/.]+$/, ""),
                  path: "file_chapter_" + Math.random().toString(36).substring(2, 6),
                  file: fm.file,
                  url,
                  duration: fm.meta?.format.duration 
              });
          }
      }

      newQueue.push({
        folderName: folderTitle,
        author: folderAuthor,
        extractedCover,
        generatedChapters,
        files: folderFiles,
        allFiles: fileArray
      });
    }

    setAudioBookQueue(prev => [...prev, ...newQueue]);
    if (!isAudioModalOpen) setIsAudioModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioBookConfirm = async (title: string, author: string) => {
    if (audioBookQueue.length === 0) return;
    
    // Close immediately to show progress/disappear
    setIsAudioModalOpen(false);
    
    const current = audioBookQueue[0];
    const { files: folderFiles, allFiles: fileArray, extractedCover, generatedChapters } = current;

    const newBookId = "external_folder_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    
    const imageFile = fileArray.find(f => {
      const isImage = f.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|bmp)$/);
      if (!isImage) return false;
      
      const fRelPath = (f as any).webkitRelativePath || '';
      const folderFilesRelPath = (folderFiles[0] as any).webkitRelativePath || '';
      
      if (fRelPath && folderFilesRelPath) {
        const fDir = fRelPath.substring(0, fRelPath.lastIndexOf('/'));
        const bookDir = folderFilesRelPath.substring(0, folderFilesRelPath.lastIndexOf('/'));
        return fDir === bookDir;
      }
      return true;
    });

    const coverUrl = extractedCover || (imageFile ? URL.createObjectURL(imageFile) : undefined);
    const totalChaptersSize = folderFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    
    let cumulativeOffset = 0;
    const finalChapters = (generatedChapters && generatedChapters.length > 0 
        ? generatedChapters.map(ch => ({ ...ch, path: newBookId + "/" + ch.path })) 
        : folderFiles.map(f => ({
            name: f.name,
            path: newBookId + "/" + f.name,
            file: f,
            url: URL.createObjectURL(f)
          })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    ).map((ch, idx) => {
        const d = ch.duration || 0;
        // startTime should only be non-zero for embedded chapters within a single file.
        // For separate files, they each start at 0:00.
        const chStart = ch.startTime !== undefined ? ch.startTime : 0;
        const chEnd = ch.endTime !== undefined ? ch.endTime : chStart + d;
        return {
            ...ch,
            startTime: chStart,
            endTime: chEnd,
            duration: d
        };
    });

    const newBook: Book = {
      id: newBookId,
      title: title,
      author: author,
      type: 'audio',
      coverUrl,
      coverFile: imageFile,
      size: totalChaptersSize,
      chapters: finalChapters
    };
    
    setBooks(prev => [newBook, ...prev]);
    await saveBookToDB(newBook);
    
    // Persist metadata properly (base64 cover, etc.)
    if (newBook.coverUrl) {
      saveMetadata(newBook.id, title, author, newBook.coverUrl);
    } else {
      saveMetadata(newBook.id, title, author);
    }
    
    // Always select the newly added audiobook
    setMode('audio');
    handleSelectBook(newBook);

    const nextQueue = audioBookQueue.slice(1);
    setAudioBookQueue(nextQueue);
    
    // If there are more in the queue, re-open after a short animation delay
    if (nextQueue.length > 0) {
      setTimeout(() => setIsAudioModalOpen(true), 400);
    }
  };

  const addFolderAsBook = async (title: string, files: File[]) => {
    // This is now redundant but kept for any other calls
    handleExternalFolderPicked(files);
  };

  const handleDeleteBook = async (bookId: string) => {
      if (currentBook?.id === bookId) {
          setIsPlaying(false);
          setCurrentBook(null);
      }

      // 1. Release Blob URLs from browser RAM memory
      const bookToDelete = books.find(b => b.id === bookId);
      if (bookToDelete) {
          if (bookToDelete.coverUrl && bookToDelete.coverUrl.startsWith('blob:')) {
              try {
                  URL.revokeObjectURL(bookToDelete.coverUrl);
              } catch (e) {
                  console.error("Failed to revoke coverUrl", e);
              }
          }
          bookToDelete.chapters?.forEach(ch => {
              if (ch.url && ch.url.startsWith('blob:')) {
                  try {
                      URL.revokeObjectURL(ch.url);
                  } catch (e) {
                      console.error("Failed to revoke chapter url", e);
                  }
              }
          });
      }

      // 2. Add to deleted IDs log (so native scans won't re-detect it)
      const updated = [...deletedBookIds, bookId];
      setDeletedBookIds(updated);
      
      const str = JSON.stringify(updated);
      try {
          if (isNative) {
              await Preferences.set({ key: 'cool_read_deleted', value: str });
          } else {
              localStorage.setItem('cool_read_deleted', str);
          }
      } catch (e) {
          console.error("Failed to save deleted list", e);
      }

      // 3. Remove book metadata and progress history
      try {
          await deleteBookHistory(bookId);
      } catch (e) {
          console.error("Failed to delete book history and metadata", e);
      }

      // 4. Delete from IndexedDB persistence and memory books state
      try {
          await deleteBookFromDB(bookId);
      } catch (e) {
          console.error("Failed to delete book from IndexedDB", e);
      }
      
      setBooks(prev => prev.filter(b => b.id !== bookId));
  };

  // --- Filesystem Scanning (Native) ---
  const scanNativeDirectory = async (path: string, directory: Directory) => {
    const audioFiles: { path: string, name: string }[] = [];
    const ebookFiles: { path: string, name: string }[] = [];
    const imageFiles: { url: string, path: string }[] = [];

    try {
      const result = await Filesystem.readdir({ path, directory });
      for (const file of (result.files as any[])) {
        const fullPath = path + "/" + file.name;
        if (file.type === 'directory') {
           const sub = await scanNativeDirectory(fullPath, directory);
           audioFiles.push(...sub.audioFiles);
           ebookFiles.push(...sub.ebookFiles);
           imageFiles.push(...sub.imageFiles);
        } else {
           const lower = file.name.toLowerCase();
           if (lower.match(/\.(mp3|m4b|m4a|mp4)$/)) {
              audioFiles.push({ path: fullPath, name: file.name });
           } else if (lower.match(/\.(epub|fb2|pdf|cbr|cbz)$/)) {
              ebookFiles.push({ path: fullPath, name: file.name });
           } else if (lower.match(/\.(jpg|jpeg|png|webp)$/)) {
             const uriResult = await Filesystem.getUri({ path: fullPath, directory });
             const webViewSrc = Capacitor.convertFileSrc(uriResult.uri);
             imageFiles.push({ url: webViewSrc, path: fullPath });
           }
        }
      }
    } catch (e) {}
    return { audioFiles, ebookFiles, imageFiles };
  };

  const loadNativeLibrary = async (initialBooks: Book[] = []) => {
      try {
          let loadedMeta: Record<string, any> = {};
          try {
             const mVal = isNative ? (await Preferences.get({ key: 'cool_read_metadata' })).value : localStorage.getItem('cool_read_metadata');
             if (mVal) loadedMeta = JSON.parse(mVal);
          } catch(e){}

          // Explicitly handle storage permissions on native platform
          if (isNative) {
            try {
              const permStatus = await Filesystem.checkPermissions();
              
              // Standard permissions first
              if (permStatus.publicStorage !== 'granted') {
                const req = await Filesystem.requestPermissions();
                if (req.publicStorage !== 'granted') {
                    setPermissionError(true);
                }
              }

              // Special "All Files Access" check (requires user to toggle in settings)
              // We check if we can actually read from a test path in external storage
              try {
                await Filesystem.readdir({
                  path: '',
                  directory: Directory.ExternalStorage
                });
                setPermissionError(false);
              } catch (e) {
                // If this fails on Android 11+, we show the prompt
                console.log("Full storage access check failed");
                if (permStatus.publicStorage === 'granted') {
                   setPermissionError(true);
                }
              }
            } catch (e) {
              console.error("Permission check failed", e);
            }
          }

          const p = { path: 'Download/CoolRead', dir: Directory.ExternalStorage };
          try { await Filesystem.mkdir({ path: p.path, directory: p.dir, recursive: true }); } catch (e) {}
          const { audioFiles, ebookFiles, imageFiles } = await scanNativeDirectory(p.path, p.dir);
          processUnifiedFiles(audioFiles, ebookFiles, imageFiles, loadedMeta, initialBooks);
      } catch (err) { console.error("Load failed", err); } 
      finally { 
          setIsLoading(false);
          if (isNative) await SplashScreen.hide();
      }
  };

  const processUnifiedFiles = (
      rawAudio: { path: string, name: string }[], 
      rawEbooks: { path: string, name: string }[],
      rawImages: { url: string, path: string }[],
      metaMap: Record<string, {title: string, author?: string, coverUrl?: string}>,
      initialBooks: Book[] = []
  ) => {
    const bookMap = new Map<string, Book>();
    
    // Start with manually added books from DB
    initialBooks.forEach(b => bookMap.set(b.id, b));
    
    const imageMap = new Map<string, string>();

    rawImages.forEach(item => {
      const parts = item.path.split('/');
      const dirPath = parts.slice(0, parts.length - 1).join('/');
      imageMap.set(dirPath, item.url);
    });

    rawAudio.forEach(item => {
      const parts = item.path.split('/');
      
      const partsOffset = parts.length > 1 ? 2 : 1;
      const folderName = parts.length > 1 ? parts[parts.length - 2] : "Local Audio";
      const bookId = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : "root";
      
      const meta = metaMap[bookId] || metaMap[item.path];
      const displayTitle = meta?.title || folderName;
      const displayAuthor = meta?.author || (parts.length > 2 ? parts[parts.length - 3] : undefined);
      const displayCover = meta?.coverUrl || imageMap.get(bookId);

      if (!bookMap.has(bookId)) {
          bookMap.set(bookId, { 
              id: bookId, 
              title: displayTitle, 
              author: displayAuthor,
              chapters: [], 
              coverUrl: displayCover, 
              type: 'audio' 
          });
      }
      bookMap.get(bookId)!.chapters.push({ name: item.name, path: item.path, url: '' });
    });

    rawEbooks.forEach(item => {
       const bookId = item.path;
       const filenameTitle = item.name.replace(/\.(epub|fb2|pdf|cbr|cbz)$/i, '');
       const parts = item.path.split('/');
       const dirPath = parts.slice(0, parts.length - 1).join('/');
       
       const meta = metaMap[bookId];
       const displayTitle = meta?.title || filenameTitle;
       const displayAuthor = meta?.author || (parts.length > 2 ? parts[parts.length - 3] : undefined);
       const displayCover = meta?.coverUrl || imageMap.get(dirPath);
       let displayFormat = (meta as any)?.format || undefined;
       if (!displayFormat) {
           const lowerName = item.name.toLowerCase();
           if (lowerName.endsWith('.pdf')) displayFormat = 'pdf';
           else if (lowerName.endsWith('.fb2')) displayFormat = 'fb2';
           else if (lowerName.endsWith('.epub')) displayFormat = 'epub';
           else if (lowerName.endsWith('.cbr') || lowerName.endsWith('.cbz')) displayFormat = 'comic';
       }

       bookMap.set(bookId, {
           id: bookId,
           title: displayTitle,
           author: displayAuthor,
           chapters: [{ name: item.name, path: item.path, url: '' }],
           coverUrl: displayCover,
           type: 'ebook',
           format: displayFormat
       });
    });

    const sortedBooks = Array.from(bookMap.values()).map(book => ({
      ...book,
      chapters: book.chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    }));

    if (sortedBooks.length > 0) {
        setBooks(sortedBooks);
        restoreLastActiveBook(sortedBooks);
    }
  };

  const restoreLastActiveBook = async (loadedBooks: Book[]) => {
     let historyMap: Record<string, PersistedState> = {};
     try {
        const val = isNative ? (await Preferences.get({ key: 'cool_read_history' })).value : localStorage.getItem('cool_read_history');
        if (val) historyMap = JSON.parse(val);
        setBookProgressMap(historyMap);
     } catch(e){}

     let latestId: string | null = null;
     let maxTime = 0;
     (Object.values(historyMap) as PersistedState[]).forEach(s => {
         if (s.lastUpdated > maxTime) { maxTime = s.lastUpdated; latestId = s.bookId; }
     });

     if (latestId) {
         const matching = loadedBooks.find(b => b.id === latestId);
         if (matching) {
             setMode(matching.type);
             await handleSelectBook(matching, historyMap);
         }
     }
  };

  useEffect(() => {
    // Safety net: force loading to false after 6 seconds in case of unresolved Promises
    const maxLoadingTimer = setTimeout(() => {
        setIsLoading(p => {
           if (p) console.warn('Forced loading state to false after timeout.');
           return false;
        });
        if (isNative) {
           try { SplashScreen.hide(); } catch(e){}
        }
    }, 6000);
    return () => clearTimeout(maxLoadingTimer);
  }, [isNative]);

  useEffect(() => {
    const loadAll = async () => {
      try {
        setIsLoading(true);

        // Load Metadata, History and Deleted List
        try {
          const metaVal = isNative ? (await Preferences.get({ key: 'cool_read_metadata' })).value : localStorage.getItem('cool_read_metadata');
          if (metaVal) setBookMetadataMap(JSON.parse(metaVal));

          const delVal = isNative ? (await Preferences.get({ key: 'cool_read_deleted' })).value : localStorage.getItem('cool_read_deleted');
          if (delVal) setDeletedBookIds(JSON.parse(delVal));
        } catch (e) {
          console.error("Failed to load initial settings", e);
        }
        
        // Always load manually added books from IndexedDB first
        const persistentBooks = await getAllPersistentBooks();
        let hydratedPersistent: Book[] = [];
        
        // Ensure metadata map is available for hydration
        let loadedMeta: Record<string, any> = {};
        try {
          const metaVal = isNative ? (await Preferences.get({ key: 'cool_read_metadata' })).value : localStorage.getItem('cool_read_metadata');
          if (metaVal) loadedMeta = JSON.parse(metaVal);
        } catch (e) {}

        if (persistentBooks && persistentBooks.length > 0) {
          // Recreate Blob URLs for persistent books, filtering out pre-downloaded Wharton book
          hydratedPersistent = persistentBooks
            .filter(book => {
              const lowerTitle = (book.title || '').toLowerCase();
              const lowerAuthor = (book.author || '').toLowerCase();
              const lowerId = (book.id || '').toLowerCase();
              return !(
                lowerId.includes('wharton') ||
                lowerId.includes('probny-kamen') ||
                lowerTitle.includes('пробный камень') ||
                lowerAuthor.includes('уортон')
              );
            })
            .map(book => {
            const meta = loadedMeta[book.id];
            
            return {
              ...book,
              title: meta?.title || book.title,
              author: meta?.author || book.author,
              coverUrl: meta?.coverUrl || (book.coverFile && (book.coverFile instanceof Blob || book.coverFile instanceof File)
                ? URL.createObjectURL(book.coverFile)
                : book.coverUrl),
              chapters: book.chapters.map((ch: any) => ({
                ...ch,
                // Recreate URL from stored File/Blob if it exists
                url: (ch.file && (ch.file instanceof Blob || ch.file instanceof File)) ? URL.createObjectURL(ch.file) : ch.url
              }))
            };
          });
        }

        if (hydratedPersistent.length > 0) {
          setBooks(hydratedPersistent);
          await restoreLastActiveBook(hydratedPersistent);
        }
      } catch (err) {
        console.error("Critical boot failure", err);
      } finally {
        setIsLoading(false);
        if (isNative) {
          try {
            await SplashScreen.hide();
          } catch (e) {
            console.log("Splash hide failed", e);
          }
        }
      }
    };
    loadAll();
  }, [isNative]);



    return {
        switchMode,
        handleExternalFilePicked,
        handleExternalFolderPicked,
        handleAudioBookConfirm,
        handleDeleteBook
    };
}
