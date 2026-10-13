
import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SplashScreen } from '@capacitor/splash-screen';
import * as mm from 'music-metadata';
import { Book, Chapter, AppMode, PersistedState } from '../types';
import { getAllPersistentBooks, saveBookToDB, deleteBookFromDB, purgeDeletedBooksFromDB } from '../utils/db';
import { getAudioDuration } from '../utils/audio';
import { parseM4AChapters } from '../utils/mp4chapters';
import { parseComic, extractComicCover } from '../utils/archive';
import { parseFb2, parseEpub, extractFb2Metadata, extractEpubMetadata } from '../utils/ebook';

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
    deleteBookHistory: (id: string, title?: string) => Promise<void>;
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
    audioBookQueue: { folderName: string, author?: string, series?: string, extractedCover?: string, coverFile?: File, generatedChapters?: Chapter[], files: File[], allFiles: File[], bookObject?: Book, folderType?: string }[];
    setAudioBookQueue: React.Dispatch<React.SetStateAction<{ folderName: string, author?: string, series?: string, extractedCover?: string, coverFile?: File, generatedChapters?: Chapter[], files: File[], allFiles: File[], bookObject?: Book, folderType?: string }[]>>;
    isAudioModalOpen: boolean;
    setIsAudioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const extractEBookMetadata = async (file: File): Promise<{ title: string; author: string; series?: string; coverUrl?: string }> => {
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    let title = fileName;
    let author = "";
    let series = "";
    let coverUrl: string | undefined = undefined;

    const nameMatch = fileName.match(/^(.*?)\s*[-—–]\s*(.*)$/);
    if (nameMatch) {
        author = nameMatch[1].trim();
        title = nameMatch[2].trim();
    }

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.fb2') || lowerName.endsWith('.bin')) {
        try {
            const parsed = await extractFb2Metadata(file);
            if (parsed.title) title = parsed.title;
            if (parsed.author) author = parsed.author;
            if (parsed.series) series = parsed.series;
            if (parsed.coverUrl) coverUrl = parsed.coverUrl;
        } catch (e) {
            console.warn("Could not parse FB2 metadata", e);
        }
    } else if (lowerName.endsWith('.epub')) {
        try {
            const parsed = await extractEpubMetadata(file);
            if (parsed.title) title = parsed.title;
            if (parsed.author) author = parsed.author;
            if (parsed.series) series = parsed.series;
            if (parsed.coverUrl) coverUrl = parsed.coverUrl;
        } catch (e) {
            console.warn("Could not parse EPUB metadata", e);
        }
    } else if (lowerName.match(/\.(cbz|cbr|zip|rar)$/)) {
        try {
            const cover = await extractComicCover(file);
            if (cover) coverUrl = cover;
        } catch (e) {
            console.warn("Could not extract Comic cover", e);
        }
    }

    return { title, author, series: series || undefined, coverUrl };
};

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
  const deletedBookIdsRef = useRef(deletedBookIds);
  useEffect(() => { deletedBookIdsRef.current = deletedBookIds; }, [deletedBookIds]);

  const isBookDeleted = (id: string, title?: string) => {
    if (deletedBookIdsRef.current.includes(id)) return true;
    if (title && deletedBookIdsRef.current.includes(title)) return true;
    try {
      const delStr = localStorage.getItem('cool_read_deleted');
      if (delStr && JSON.parse(delStr).includes(id)) return true;
    } catch (e) {}
    return false;
  };

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

  const handleExternalFilePicked = async (
    files: File | File[] | FileList,
    metadata?: { title?: string; author?: string; coverUrl?: string; pageCount?: number }
  ) => {
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

          const audioFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(mp3|m4b|m4a|mp4)$/));
          const comicFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(cbz|cbr)$/));
          const ebookFiles = fileArray.filter(f => !f.name.toLowerCase().match(/\.(mp3|m4b|m4a|mp4)$/));

          if (audioFiles.length > 0) {
              await handleExternalFolderPicked(fileArray);
              return;
          }

          if (comicFiles.length > 1) {
              await handleExternalFolderPicked(comicFiles);
              return;
          }

          if (ebookFiles.length === 0) return;
          fileArray = ebookFiles;

          const newQueue: { folderName: string, author?: string, bookObject: Book, files: File[], allFiles: File[] }[] = [];

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
              
              const { title: parsedTitle, author: parsedAuthor, series: parsedSeries, coverUrl: parsedCoverUrl } = await extractEBookMetadata(file);
              const newBookId = "external_" + Date.now() + "_" + i + "_" + Math.random().toString(36).substring(2, 6);
              const finalTitle = parsedTitle || metadata?.title || file.name.replace(/\.[^/.]+$/, "");
              const finalCover = metadata?.coverUrl || parsedCoverUrl;
              
              const newBook: Book = {
                  id: newBookId,
                  title: finalTitle,
                  author: parsedAuthor || metadata?.author || '',
                  series: parsedSeries || metadata?.series || undefined,
                  coverUrl: finalCover,
                  pageCount: metadata?.pageCount,
                  type: newType,
                  format: format || (lowerName.endsWith('.epub') ? 'epub' : (lowerName.endsWith('.fb2') ? 'fb2' : '')),
                  size: file.size,
                  chapters: [{
                      name: finalTitle,
                      path: newBookId,
                      file: file,
                      url: newType === 'audio' ? URL.createObjectURL(file) : ''
                  }]
              };
              
              newQueue.push({
                  folderName: newBook.title,
                  author: newBook.author,
                  series: newBook.series,
                  extractedCover: finalCover,
                  bookObject: newBook,
                  files: [file],
                  allFiles: [file]
              });
          }
          
          if (newQueue.length > 0) {
              setAudioBookQueue(prev => [...prev, ...newQueue]);
              if (!isAudioModalOpen) setIsAudioModalOpen(true);
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
          const comicArchiveFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(cbz|cbr|zip|rar)$/));
          const looseImageFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|bmp)$/));
          const ebookFiles = fileArray.filter(f => f.name.toLowerCase().match(/\.(fb2|epub|pdf|bin)$/));

          // 1. Folder containing CBZ / CBR comic archive files
          if (comicArchiveFiles.length > 0) {
              comicArchiveFiles.sort((a, b) => 
                  (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' })
              );

              const firstPath = comicArchiveFiles[0].webkitRelativePath || comicArchiveFiles[0].name;
              const parts = firstPath.split('/');
              let folderTitle = parts.length > 1 ? parts[parts.length - 2] : comicArchiveFiles[0].name.replace(/\.[^/.]+$/, "");
              let folderAuthor = '';

              const nameMatch = folderTitle.match(/^(.*?)\s*[-—–]\s*(.*)$/);
              if (nameMatch) {
                  folderAuthor = nameMatch[1].trim();
                  folderTitle = nameMatch[2].trim();
              }

              setAudioBookQueue(prev => [...prev, {
                  folderName: folderTitle,
                  author: folderAuthor || "Comic",
                  folderType: 'comic_archives',
                  files: comicArchiveFiles,
                  allFiles: fileArray
              }]);
              if (!isAudioModalOpen) setIsAudioModalOpen(true);
              setIsLoading(false);
              return;
          }

          // 2. Folder containing loose image pages (manga/comics)
          if (looseImageFiles.length > 0) {
              looseImageFiles.sort((a, b) => 
                  (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' })
              );

              const firstPath = looseImageFiles[0].webkitRelativePath || looseImageFiles[0].name;
              const parts = firstPath.split('/');
              let folderTitle = parts.length > 1 ? parts[parts.length - 2] : "Manga / Comic";
              let folderAuthor = '';

              const nameMatch = folderTitle.match(/^(.*?)\s*[-—–]\s*(.*)$/);
              if (nameMatch) {
                  folderAuthor = nameMatch[1].trim();
                  folderTitle = nameMatch[2].trim();
              }

              const coverFile = looseImageFiles.find(f => {
                  const lower = f.name.toLowerCase();
                  return lower.includes('cover') || lower.includes('folder') || lower.includes('front');
              }) || looseImageFiles[0];

              let coverUrl = '';
              if (coverFile) {
                  coverUrl = URL.createObjectURL(coverFile);
              }

              setAudioBookQueue(prev => [...prev, {
                  folderName: folderTitle,
                  author: folderAuthor || "Manga",
                  folderType: 'comic_images',
                  extractedCover: coverUrl,
                  coverFile,
                  files: looseImageFiles,
                  allFiles: fileArray
              }]);
              if (!isAudioModalOpen) setIsAudioModalOpen(true);
              setIsLoading(false);
              return;
          }

          // 3. Folder containing loose ebook files
          if (ebookFiles.length > 0) {
              await handleExternalFilePicked(ebookFiles);
              setIsLoading(false);
              return;
          }

          setIsLoading(false);
          return;
      }
      
      // Deduce title and author from filenames when tags are missing or generic
      const deduceBookInfoFromFiles = (files: File[], fallbackFolderName: string): { title: string; author: string } => {
          let deducedTitle = fallbackFolderName && fallbackFolderName !== 'Audio Book' ? fallbackFolderName : '';
          let deducedAuthor = '';

          const cleanNames = files.map(f => f.name.replace(/\.[a-zA-Z0-9]+$/, '').trim());
          if (cleanNames.length === 0) {
              return { title: deducedTitle || 'Audio Book', author: deducedAuthor };
          }

          // 1. Longest Common Prefix across all audio filenames
          if (cleanNames.length > 1) {
              let prefix = cleanNames[0];
              for (let i = 1; i < cleanNames.length; i++) {
                  while (!cleanNames[i].startsWith(prefix) && prefix.length > 0) {
                      prefix = prefix.substring(0, prefix.length - 1);
                  }
              }
              let cleanPrefix = prefix.replace(/[\s._-]+$/, '');
              cleanPrefix = cleanPrefix.replace(/[-—–\s._]*(?:глава|часть|track|cd|диск|том|\d+)*\s*$/i, '').trim();

              if (cleanPrefix.length >= 3) {
                  const strippedPrefix = cleanPrefix.replace(/^(\d{1,3}[\s._-]+)+/i, '').trim();
                  const parts = strippedPrefix.split(/\s*[-—–]\s*/);
                  if (parts.length >= 2) {
                      const candidateAuthor = parts[0].trim();
                      const candidateTitle = parts.slice(1).join(' - ').trim();
                      if (!/^\d+$/.test(candidateAuthor)) {
                          deducedAuthor = candidateAuthor;
                          deducedTitle = candidateTitle;
                      }
                  } else if (strippedPrefix.length >= 3) {
                      deducedTitle = strippedPrefix;
                  }
              }
          }

          // 2. Individual filename inspection if not found from prefix
          if (!deducedTitle || !deducedAuthor) {
              for (const name of cleanNames) {
                  const stripped = name.replace(/^(\d{1,3}[\s._-]+)+/i, '').trim();
                  const parts = stripped.split(/\s*[-—–]\s*/);

                  if (parts.length >= 2) {
                      const candidateAuthor = parts[0].trim();
                      const candidateTitle = parts[1].trim();
                      const isTrackOnly = /^\d+$/.test(candidateAuthor) || /^track\s*\d+$/i.test(candidateAuthor);

                      if (!isTrackOnly && candidateAuthor.length > 1) {
                          if (!deducedAuthor) deducedAuthor = candidateAuthor;
                          if (!deducedTitle) {
                              const isChapterOnly = /^(?:глава|часть|track|\d+)\s*\d*$/i.test(candidateTitle);
                              if (!isChapterOnly) {
                                  deducedTitle = candidateTitle;
                              }
                          }
                      }
                  }
                  if (deducedTitle && deducedAuthor) break;
              }
          }

          // 3. Check fallback folder name
          if (fallbackFolderName && fallbackFolderName !== 'Audio Book') {
              const folderParts = fallbackFolderName.split(/\s*[-—–]\s*/);
              if (folderParts.length >= 2) {
                  if (!deducedAuthor && !/^\d+$/.test(folderParts[0])) {
                      deducedAuthor = folderParts[0].trim();
                  }
                  if (!deducedTitle || deducedTitle === fallbackFolderName) {
                      deducedTitle = folderParts.slice(1).join(' - ').trim();
                  }
              } else if (!deducedTitle) {
                  deducedTitle = fallbackFolderName;
              }
          }

          // 4. Final fallback
          if (!deducedTitle) {
              const firstClean = cleanNames[0] || 'Audio Book';
              const strippedFirst = firstClean.replace(/^(\d{1,3}[\s._-]+)+/i, '').trim();
              deducedTitle = strippedFirst || firstClean;
          }

          return { title: deducedTitle, author: deducedAuthor };
      };

      // Group files by their parent folder
      const hasRelativePaths = fileArray.some(f => (f as any).webkitRelativePath && (f as any).webkitRelativePath.includes('/'));
      const foldersMap: Record<string, { audio: File[], images: File[] }> = {};

      const getFolderName = (file: File) => {
          const relPath = (file as any).webkitRelativePath || '';
          const parts = relPath.split('/').filter(Boolean);
          return parts.length > 1 ? parts[parts.length - 2] : '';
      };

      if (!hasRelativePaths) {
          // Mobile file selection (no webkitRelativePath): all selected files belong to the same book
          foldersMap[''] = { audio: audioFiles, images: imageFiles };
      } else {
          audioFiles.forEach(file => {
              const folderName = getFolderName(file);
              if (!foldersMap[folderName]) foldersMap[folderName] = { audio: [], images: [] };
              foldersMap[folderName].audio.push(file);
          });

          imageFiles.forEach(file => {
              const folderName = getFolderName(file);
              if (foldersMap[folderName]) {
                  foldersMap[folderName].images.push(file);
              } else {
                  // Fallback: if image is at top level or slightly different path, attach to first folder
                  const firstKey = Object.keys(foldersMap)[0];
                  if (firstKey) {
                      foldersMap[firstKey].images.push(file);
                  }
              }
          });
      }

      const newQueue = [];
      for (const [folderName, { audio: folderFiles, images: folderImages }] of Object.entries(foldersMap)) {
        let folderTitle = folderName;
        let folderAuthor = '';
        let folderSeries = '';
        let extractedCover: string | undefined = undefined;
        let coverFile: File | undefined = undefined;

        // PRIORITIZE EXTERNAL COVER FILE
        if (folderImages && folderImages.length > 0) {
            coverFile = folderImages.find(f => {
                const lower = f.name.toLowerCase();
                return lower.includes('cover') || lower.includes('folder') || lower.includes('front') || lower.includes('poster') || lower.includes('oblozhka') || lower.includes('art');
            }) || folderImages[0];
            if (coverFile) {
                extractedCover = URL.createObjectURL(coverFile);
            }
        }
        
        folderFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        // Fast probe candidate audio files to detect metadata tags and embedded cover (up to 3 candidate files, 7s timeout)
        if (folderFiles.length > 0) {
            const candidateIndices = [0, 1, Math.floor(folderFiles.length / 2)].filter((idx, i, arr) => idx < folderFiles.length && arr.indexOf(idx) === i);

            for (const idx of candidateIndices) {
                const fileToProbe = folderFiles[idx];
                try {
                    const probePromise = mm.parseBlob(fileToProbe, { 
                        duration: false, 
                        includeChapters: false,
                        skipCovers: !!extractedCover
                    });
                    const meta: any = await Promise.race([
                        probePromise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 7000))
                    ]);

                    if (meta?.common) {
                        const common = meta.common;
                        const album = common.album?.trim();
                        const artist = (common.artist || common.albumartist || common.composer)?.trim();
                        const titleTag = common.title?.trim();

                        if (!folderTitle || folderTitle === 'Audio Book') {
                            if (album) {
                                folderTitle = album;
                            } else if (titleTag && !/^\d+$/.test(titleTag) && !/^track\s*\d+$/i.test(titleTag) && !/^глава\s*\d+$/i.test(titleTag)) {
                                folderTitle = titleTag;
                            }
                        }

                        if (!folderAuthor && artist) {
                            folderAuthor = artist;
                        }

                        if (!folderSeries && (common.series || common.movementName || common.grouping)) {
                            folderSeries = (common.series || common.movementName || common.grouping).trim();
                        }

                        if (!extractedCover && common.picture && common.picture.length > 0) {
                            const pic = common.picture[0];
                            const blob = new Blob([pic.data], { type: pic.format });
                            extractedCover = URL.createObjectURL(blob);
                            coverFile = blob as File;
                        }

                        if (folderTitle && folderAuthor && extractedCover) {
                            break;
                        }
                    }
                } catch (e) {
                    // Ignore and try next candidate
                }
            }
        }

        // Smart deduction from filenames if title or author still missing
        if (!folderTitle || folderTitle === 'Audio Book' || !folderAuthor) {
            const { title: deducedTitle, author: deducedAuthor } = deduceBookInfoFromFiles(folderFiles, folderName);
            if (!folderTitle || folderTitle === 'Audio Book') {
                folderTitle = deducedTitle;
            }
            if (!folderAuthor && deducedAuthor) {
                folderAuthor = deducedAuthor;
            }
        }

        newQueue.push({
          folderName: folderTitle || 'Audio Book',
          author: folderAuthor || '',
          series: folderSeries || undefined,
          folderType: 'audio',
          extractedCover,
          coverFile,
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

  const handleAudioBookConfirm = async (title: string, author: string, series?: string) => {
    if (audioBookQueue.length === 0) return;
    
    const current = audioBookQueue[0];
    const remainingQueue = audioBookQueue.slice(1);
    setAudioBookQueue(remainingQueue);

    if (remainingQueue.length > 0) {
      setIsAudioModalOpen(true);
    } else {
      setIsAudioModalOpen(false);
    }

    // If user provided a series string (even empty string ""), respect user choice.
    // If empty string/whitespace, user explicitly deleted/cleared the series.
    const finalSeries = series !== undefined 
      ? (series.trim() ? series.trim() : undefined) 
      : (current.series || current.bookObject?.series || undefined);

    // 1. Process pre-built eBook / Comic / PDF book object
    if (current.bookObject) {
      const finalTitle = title || current.bookObject.title;
      const finalAuthor = author || current.bookObject.author || '';

      const finalBook: Book = {
        ...current.bookObject,
        title: finalTitle,
        author: finalAuthor,
        series: finalSeries,
        coverUrl: current.bookObject.coverUrl || current.extractedCover,
        file: current.files?.[0] || current.bookObject.file || current.bookObject.chapters?.[0]?.file,
        chapters: current.bookObject.chapters.map((ch, idx) => ({
          ...ch,
          file: idx === 0 ? (current.files?.[0] || ch.file || current.bookObject?.file) : ch.file,
          name: (ch.name === current.bookObject!.title || !ch.name) ? finalTitle : ch.name
        }))
      };

      setBooks(prev => [finalBook, ...prev]);
      await saveBookToDB(finalBook);
      saveMetadata(finalBook.id, finalBook.title, finalBook.author || '', finalBook.coverUrl, finalBook.format, finalBook.series);

      if (remainingQueue.length === 0) {
        setMode(finalBook.type);
        handleSelectBook(finalBook);
      }
      return;
    }

    // 2. Folder of CBZ / CBR comic archives
    if (current.folderType === 'comic_archives') {
      const comicArchiveFiles = current.files;
      const finalTitle = title || current.folderName;
      const finalAuthor = author || current.author || 'Comic';
      const newBookId = "external_folder_comic_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

      // Parse first issue IMMEDIATELY so user can start reading right away
      setIsLoading(true);
      let initialChapters: Chapter[] = [];
      let primaryCoverUrl = '';

      try {
        const parsedFirst = await parseComic(comicArchiveFiles[0], `${newBookId}_0`);
        primaryCoverUrl = parsedFirst.coverUrl || '';
        const issueTitle = comicArchiveFiles[0].name.replace(/\.[^/.]+$/, "");

        if (parsedFirst.chapters && parsedFirst.chapters.length > 0) {
          if (comicArchiveFiles.length > 1) {
            parsedFirst.chapters.forEach((ch, pageIdx) => {
              initialChapters.push({
                ...ch,
                name: pageIdx === 0 ? issueTitle : `Page ${pageIdx + 1}`,
                level: pageIdx === 0 ? 0 : 1
              });
            });
          } else {
            parsedFirst.chapters.forEach((ch, pageIdx) => {
              initialChapters.push({
                ...ch,
                name: `Page ${pageIdx + 1}`,
                level: 0
              });
            });
          }
        }
      } catch (err) {
        console.error("Failed to parse first comic archive:", err);
      } finally {
        setIsLoading(false);
      }

      const newBook: Book = {
        id: newBookId,
        title: finalTitle,
        author: finalAuthor,
        series: finalSeries,
        type: 'ebook',
        format: 'comic',
        coverUrl: primaryCoverUrl,
        file: comicArchiveFiles[0],
        archiveFiles: comicArchiveFiles,
        _sessionActive: true,
        size: comicArchiveFiles.reduce((acc, f) => acc + f.size, 0),
        chapters: initialChapters
      };

      setBooks(prev => [newBook, ...prev]);
      await saveBookToDB(newBook);
      saveMetadata(newBook.id, finalTitle, finalAuthor, primaryCoverUrl, 'comic', finalSeries);

      // OPEN AND READ FIRST LOADED ISSUE IMMEDIATELY!
      if (remainingQueue.length === 0) {
        setMode('ebook');
        handleSelectBook(newBook);
      }

      // Progressively parse remaining issues in the background
      if (comicArchiveFiles.length > 1) {
        (async () => {
          let merged = [...initialChapters];
          for (let i = 1; i < comicArchiveFiles.length; i++) {
            if (isBookDeleted(newBookId, finalTitle)) return;
            const file = comicArchiveFiles[i];
            try {
              const parsed = await parseComic(file, `${newBookId}_${i}`);
              if (parsed.chapters && parsed.chapters.length > 0) {
                const issueTitle = file.name.replace(/\.[^/.]+$/, "");
                const formatted = parsed.chapters.map((ch, pageIdx) => ({
                  ...ch,
                  name: pageIdx === 0 ? issueTitle : `Page ${pageIdx + 1}`,
                  level: pageIdx === 0 ? 0 : 1
                }));
                merged = [...merged, ...formatted];
                newBook.chapters = merged;
                if (isBookDeleted(newBookId, finalTitle)) return;
                setBooks(prev => prev.map(b => b.id === newBookId ? { ...b, chapters: merged } : b));
                setCurrentBook(curr => curr?.id === newBookId ? { ...curr, chapters: merged } : curr);
              }
            } catch (err) {
              console.error("Progressive comic loading error:", file.name, err);
            }
          }
          if (!isBookDeleted(newBookId, finalTitle)) {
            await saveBookToDB(newBook);
          }
        })();
      }
      return;
    }

    // 3. Folder of loose image pages
    if (current.folderType === 'comic_images') {
      const looseImageFiles = current.files;
      const finalTitle = title || current.folderName;
      const finalAuthor = author || current.author || 'Manga';
      const newBookId = "external_folder_img_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

      // Immediately prepare first 10 pages so reading starts with zero delay
      const initialCount = Math.min(10, looseImageFiles.length);
      const initialChapters: Chapter[] = looseImageFiles.slice(0, initialCount).map((file, idx) => {
        const url = URL.createObjectURL(file);
        return {
          name: `Page ${idx + 1}`,
          url,
          file,
          content: `<img src="${url}" alt="Page ${idx + 1}" style="width: 100%; height: auto;" />`,
          level: 0,
          length: file.size || 1
        };
      });

      const newBook: Book = {
        id: newBookId,
        title: finalTitle,
        author: finalAuthor,
        series: finalSeries,
        type: 'ebook',
        format: 'comic',
        coverUrl: current.extractedCover,
        coverFile: current.coverFile,
        _sessionActive: true,
        size: looseImageFiles.reduce((acc, f) => acc + f.size, 0),
        chapters: initialChapters
      };

      setBooks(prev => [newBook, ...prev]);
      await saveBookToDB(newBook);
      saveMetadata(newBook.id, finalTitle, finalAuthor, newBook.coverUrl, 'comic', finalSeries);

      if (remainingQueue.length === 0) {
        setMode('ebook');
        handleSelectBook(newBook);
      }

      // Progressively load remaining pages in the background
      if (looseImageFiles.length > initialCount) {
        (async () => {
          let merged = [...initialChapters];
          const remainingFiles = looseImageFiles.slice(initialCount);
          const chunkSize = 20;
          for (let i = 0; i < remainingFiles.length; i += chunkSize) {
            if (isBookDeleted(newBookId, finalTitle)) return;
            const chunk = remainingFiles.slice(i, i + chunkSize);
            const chunkChapters = chunk.map((file, cIdx) => {
              const pageIdx = initialCount + i + cIdx + 1;
              const url = URL.createObjectURL(file);
              return {
                name: `Page ${pageIdx}`,
                url,
                file,
                content: `<img src="${url}" alt="Page ${pageIdx}" style="width: 100%; height: auto;" />`,
                level: 0,
                length: file.size || 1
              };
            });
            merged = [...merged, ...chunkChapters];
            newBook.chapters = merged;
            if (isBookDeleted(newBookId, finalTitle)) return;
            setBooks(prev => prev.map(b => b.id === newBookId ? { ...b, chapters: merged } : b));
            setCurrentBook(curr => curr?.id === newBookId ? { ...curr, chapters: merged } : curr);
            await new Promise(r => setTimeout(r, 10));
          }
          if (!isBookDeleted(newBookId, finalTitle)) {
            await saveBookToDB(newBook);
          }
        })();
      }
      return;
    }

    // 4. Audio Book Folder (Progressive loading & instant playback of first loaded chapters)
    const { files: folderFiles, allFiles: fileArray, extractedCover, coverFile } = current;
    const newBookId = "external_folder_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const finalTitle = title || current.folderName;
    const finalAuthor = author || current.author || '';

    const imageFile = coverFile || fileArray.find(f => {
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

    // Create chapters with live URLs immediately
    const initialChapters: Chapter[] = folderFiles.map((f, idx) => ({
      name: f.name.replace(/\.[a-zA-Z0-9]+$/, ""),
      path: newBookId + "/" + f.name,
      file: f,
      url: URL.createObjectURL(f),
      duration: 0
    }));

    const persistedCoverFile = imageFile || (coverFile && (coverFile instanceof Blob || coverFile instanceof File) ? (coverFile as File) : undefined);

    const newBook: Book = {
      id: newBookId,
      title: finalTitle,
      author: finalAuthor,
      series: finalSeries,
      type: 'audio',
      coverUrl,
      coverFile: persistedCoverFile,
      size: totalChaptersSize,
      chapters: initialChapters
    };

    setBooks(prev => [newBook, ...prev]);
    await saveBookToDB(newBook);
    saveMetadata(newBook.id, finalTitle, finalAuthor, newBook.coverUrl, undefined, finalSeries);

    // START PLAYING CHAPTER 1 IMMEDIATELY!
    if (remainingQueue.length === 0) {
      setMode('audio');
      handleSelectBook(newBook);
    }

    // Progressively extract metadata, embedded covers and durations in background
    (async () => {
      let hasChanges = false;
      // Probe index sequence: start with first chapter and last chapter, then remaining chapters
      const indicesToProbe: number[] = [];
      if (folderFiles.length > 0) indicesToProbe.push(0);
      if (folderFiles.length > 1) indicesToProbe.push(folderFiles.length - 1);
      for (let i = 1; i < folderFiles.length - 1; i++) {
        indicesToProbe.push(i);
      }

      for (const i of indicesToProbe) {
        if (isBookDeleted(newBookId, finalTitle)) return;
        const file = folderFiles[i];
        try {
          const ext = file.name.split('.').pop()?.toLowerCase() || "";
          const isMp4 = ['mp4', 'm4b', 'm4a'].includes(ext);
          let dur = 0;
          try {
            const meta = await mm.parseBlob(file, { duration: !isMp4, includeChapters: false, skipCovers: !!newBook.coverUrl });
            dur = meta.format?.duration || 0;
            if (!newBook.coverUrl && meta.common?.picture && meta.common.picture.length > 0) {
              const pic = meta.common.picture[0];
              const blob = new Blob([pic.data], { type: pic.format });
              const bgCoverUrl = URL.createObjectURL(blob);
              newBook.coverUrl = bgCoverUrl;
              newBook.coverFile = blob as File;
              hasChanges = true;
              saveMetadata(newBook.id, newBook.title, newBook.author || '', bgCoverUrl, undefined, newBook.series);
            }
          } catch (e) {}

          // Fallback to HTML Audio element if duration is not known (e.g. mp4/m4b/m4a or missing tags)
          if (dur <= 0 && initialChapters[i]?.url) {
            try {
              dur = await getAudioDuration(initialChapters[i].url);
            } catch (e) {}
          }

          if (dur > 0) {
            initialChapters[i].duration = dur;
            hasChanges = true;

            // Recalculate accumulated start and end times across all chapters
            let acc = 0;
            for (let c = 0; c < initialChapters.length; c++) {
              initialChapters[c].startTime = acc;
              const d = initialChapters[c].duration || 0;
              acc += d;
              initialChapters[c].endTime = acc;
            }
          }

          if (isBookDeleted(newBookId, finalTitle)) return;

          if (hasChanges && (i % 2 === 0 || i === folderFiles.length - 1)) {
            setBooks(prev => prev.map(b => b.id === newBookId ? { ...b, chapters: [...initialChapters], coverUrl: newBook.coverUrl, coverFile: newBook.coverFile } : b));
            setCurrentBook(curr => curr?.id === newBookId ? { ...curr, chapters: [...initialChapters], coverUrl: newBook.coverUrl, coverFile: newBook.coverFile } : curr);
          }
        } catch (e) {}
      }
      if (hasChanges && !isBookDeleted(newBookId, finalTitle)) {
        newBook.chapters = initialChapters;
        await saveBookToDB(newBook);
      }
    })();
  };

  const addFolderAsBook = async (title: string, files: File[]) => {
    // This is now redundant but kept for any other calls
    handleExternalFolderPicked(files);
  };

  const handleDeleteBook = async (bookId: string) => {
      // 1. Find book to delete first
      const bookToDelete = books.find(b => b.id === bookId);
      const targetTitle = bookToDelete?.title;

      // 2. Synchronously record in deleted IDs log FIRST to immediately cancel any background workers
      const updated = Array.from(new Set([
        ...deletedBookIds, 
        bookId, 
        ...(targetTitle ? [targetTitle] : [])
      ]));
      setDeletedBookIds(updated);
      deletedBookIdsRef.current = updated;
      
      const str = JSON.stringify(updated);
      try {
          if (isNative) {
              await Preferences.set({ key: 'cool_read_deleted', value: str });
          }
          localStorage.setItem('cool_read_deleted', str);
      } catch (e) {
          console.error("Failed to save deleted list", e);
      }

      // 3. If currently playing/open, immediately stop and detach audio
      if (currentBook?.id === bookId || (targetTitle && currentBook?.title === targetTitle)) {
          setIsPlaying(false);
          setCurrentBook(null);
      }

      // 4. Release Blob URLs from browser RAM memory
      if (bookToDelete) {
          if (bookToDelete.coverUrl && bookToDelete.coverUrl.startsWith('blob:')) {
              try {
                  URL.revokeObjectURL(bookToDelete.coverUrl);
              } catch (e) {}
          }
          bookToDelete.chapters?.forEach(ch => {
              if (ch.url && ch.url.startsWith('blob:')) {
                  try {
                      URL.revokeObjectURL(ch.url);
                  } catch (e) {}
              }
          });
      }

      // 5. Physical deletion for native files on device internal storage
      if (isNative && bookToDelete) {
          try {
              const directoriesToCheck = [
                  Directory.ExternalStorage,
                  Directory.Documents,
                  Directory.Data,
                  Directory.Cache
              ];

              // Delete individual files
              for (const ch of bookToDelete.chapters || []) {
                  if (ch.path) {
                      const cleanPath = ch.path.replace(/^\/+/, '');
                      for (const dir of directoriesToCheck) {
                          await Filesystem.deleteFile({ path: cleanPath, directory: dir }).catch(() => {});
                          await Filesystem.deleteFile({ path: ch.path, directory: dir }).catch(() => {});
                      }
                  }
              }

              // If bookId is a file path (e.g. single epub / audio file)
              if (bookId.match(/\.(epub|fb2|pdf|cbr|cbz|mp3|m4b|m4a|mp4)$/i)) {
                  const cleanPath = bookId.replace(/^\/+/, '');
                  for (const dir of directoriesToCheck) {
                      await Filesystem.deleteFile({ path: cleanPath, directory: dir }).catch(() => {});
                      await Filesystem.deleteFile({ path: bookId, directory: dir }).catch(() => {});
                  }
              }

              // If book was stored inside a directory (e.g. Download/CoolRead/Title)
              const candidateDirs = new Set<string>();
              if (bookId.includes('/') && !bookId.match(/\.[a-zA-Z0-9]+$/)) {
                  candidateDirs.add(bookId);
              }
              bookToDelete.chapters?.forEach(ch => {
                  if (ch.path && ch.path.includes('/')) {
                      const parent = ch.path.substring(0, ch.path.lastIndexOf('/'));
                      if (parent && parent !== 'Download' && parent !== 'Download/CoolRead') {
                          candidateDirs.add(parent);
                      }
                  }
              });

              for (const dirPath of candidateDirs) {
                  const cleanDirPath = dirPath.replace(/^\/+/, '');
                  for (const dir of directoriesToCheck) {
                      await Filesystem.rmdir({ path: cleanDirPath, directory: dir, recursive: true }).catch(() => {});
                      await Filesystem.rmdir({ path: dirPath, directory: dir, recursive: true }).catch(() => {});
                  }
              }
          } catch (e) {
              console.error("Failed to delete physical files on native storage", e);
          }
      }

      // 6. Remove book metadata, progress history, and bookmarks
      try {
          await deleteBookHistory(bookId, targetTitle);
      } catch (e) {
          console.error("Failed to delete book history and metadata", e);
      }

      try {
          const keysToRemove = [
              `cool_read_bookmarks_${bookId}`,
              targetTitle ? `cool_read_bookmarks_${targetTitle}` : null
          ].filter(Boolean) as string[];

          for (const key of keysToRemove) {
              if (isNative) {
                  await Preferences.remove({ key }).catch(() => {});
              }
              localStorage.removeItem(key);
          }
      } catch (e) {
          console.warn("Failed to delete book bookmarks", e);
      }

      // 7. Delete from IndexedDB persistence (and clean duplicate/aliased records)
      try {
          await deleteBookFromDB(bookId, targetTitle);
      } catch (e) {
          console.error("Failed to delete book from IndexedDB", e);
      }
      
      // 8. Nullify heavy references to allow JS Garbage Collection of Blobs and binary buffers
      if (bookToDelete) {
          bookToDelete.file = undefined as any;
          bookToDelete.coverFile = undefined as any;
          bookToDelete.archiveFiles = undefined as any;
          bookToDelete.chapters?.forEach(ch => {
              ch.file = undefined as any;
              ch.content = '';
              ch.url = '';
          });
      }

      // 9. Remove from library state
      setBooks(prev => prev.filter(b => b.id !== bookId && (!targetTitle || b.title !== targetTitle)));
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
      setIsLoading(true);
      try {
        // Load Metadata, History and Deleted List
        let currentDeletedIds: string[] = [];
        try {
          const metaVal = isNative ? (await Preferences.get({ key: 'cool_read_metadata' })).value : localStorage.getItem('cool_read_metadata');
          if (metaVal) setBookMetadataMap(JSON.parse(metaVal));

          const delVal = isNative ? (await Preferences.get({ key: 'cool_read_deleted' })).value : localStorage.getItem('cool_read_deleted');
          if (delVal) {
            currentDeletedIds = JSON.parse(delVal);
            setDeletedBookIds(currentDeletedIds);
          }
        } catch (e) {
          console.error("Failed to load initial settings", e);
        }
        
        // Always load manually added books from IndexedDB first, filtering out any deleted books
        const rawPersistentBooks = await getAllPersistentBooks();
        const persistentBooks = (rawPersistentBooks || []).filter(b => b && b.id && !currentDeletedIds.includes(b.id));
        
        // Purge any lingering deleted books from IndexedDB to permanently reclaim storage space
        if (currentDeletedIds.length > 0) {
          purgeDeletedBooksFromDB(currentDeletedIds).catch(() => {});
        }
        let hydratedPersistent: Book[] = [];
        
        // Ensure metadata map is available for hydration
        let loadedMeta: Record<string, any> = {};
        try {
          const metaVal = isNative ? (await Preferences.get({ key: 'cool_read_metadata' })).value : localStorage.getItem('cool_read_metadata');
          if (metaVal) loadedMeta = JSON.parse(metaVal);
        } catch (e) {}

        if (persistentBooks && persistentBooks.length > 0) {
          hydratedPersistent = persistentBooks.map(book => {
            const meta = loadedMeta[book.id];
            
            return {
              ...book,
              _sessionActive: false,
              title: meta?.title || book.title,
              author: meta?.author || book.author,
              series: meta?.series || book.series,
              coverUrl: meta?.coverUrl || (book.coverFile && (book.coverFile instanceof Blob || book.coverFile instanceof File)
                ? URL.createObjectURL(book.coverFile)
                : book.coverUrl),
              chapters: (book.chapters || []).map((ch: any) => {
                return {
                  ...ch,
                  url: ch.url || ''
                };
              })
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
