import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Book, PersistedState } from '../types';
import { ChevronDown } from 'lucide-react';
import { PRESET_FONTS, getFontFamilyCSS } from '../utils/fonts';
import { SmartCoverImage } from './SmartCoverImage';

interface LibrarySidebarProps {
  books: Book[];
  currentBookId: string | null;
  onSelectBook: (book: Book, forceFormatAsFb2?: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
  bookProgressMap?: Record<string, PersistedState>; 
  appStyle: string;
  onAppStyleChange: (style: string) => void;
  currentBookFormat?: string | null;
  onExternalFilePicked?: (files: FileList | File[] | File) => void;
  onExternalFolderPicked?: (files: FileList) => void;
  onDeleteBook?: (bookId: string) => void;
  mode: 'ebook' | 'audio';
  readerFont?: string;
  onReaderFontChange?: (font: string) => void;
  customFonts?: { name: string; dataUrl: string }[];
  onAddCustomFont?: (file: File) => void;
  onDeleteCustomFont?: (name: string) => void;
  onOpenCatalog?: () => void;
}

const LibrarySidebar: React.FC<LibrarySidebarProps> = ({ 
  books, 
  currentBookId, 
  onSelectBook, 
  isOpen,
  onClose,
  bookProgressMap = {},
  appStyle,
  onAppStyleChange,
  currentBookFormat = null,
  onExternalFilePicked,
  onExternalFolderPicked,
  onDeleteBook,
  mode,
  readerFont = 'Literata',
  onReaderFontChange,
  customFonts = [],
  onAddCustomFont,
  onDeleteCustomFont,
  onOpenCatalog
}) => {
  const [view, setView] = useState<'library' | 'settings'>('library');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});

  const toggleSeries = (seriesName: string) => {
    setExpandedSeries(prev => ({
      ...prev,
      [seriesName]: !prev[seriesName]
    }));
  };

  useEffect(() => {
    if (!currentBookId) return;
    const currentBook = books.find(b => b.id === currentBookId);
    const seriesName = currentBook?.series?.trim();
    if (seriesName) {
      setExpandedSeries(prev => {
        if (prev[seriesName]) return prev;
        return {
          ...prev,
          [seriesName]: true
        };
      });
    }
  }, [currentBookId, books, isOpen]);

  const allFonts = useMemo(() => {
    const customOptions = (customFonts || []).map(f => ({
      id: f.name,
      name: f.name,
      css: `'${f.name}', sans-serif`,
      isCustom: true
    }));
    const filteredPresets = PRESET_FONTS.filter(p => !customOptions.some(c => c.name === p.name));
    return [...filteredPresets, ...customOptions];
  }, [customFonts]);
  const bookInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsSearchMode(false);
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books;
    const q = searchQuery.toLowerCase().trim();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.series && b.series.toLowerCase().includes(q))
    );
  }, [books, searchQuery]);

  const { seriesGroups, standaloneBooks } = useMemo(() => {
    const seriesMap = new Map<string, Book[]>();
    const standalone: Book[] = [];

    filteredBooks.forEach(b => {
      const sName = b.series?.trim();
      if (sName) {
        if (!seriesMap.has(sName)) {
          seriesMap.set(sName, []);
        }
        seriesMap.get(sName)!.push(b);
      } else {
        standalone.push(b);
      }
    });

    const groups = Array.from(seriesMap.entries()).map(([name, groupBooks]) => ({
      name,
      books: groupBooks
    }));

    return { seriesGroups: groups, standaloneBooks: standalone };
  }, [filteredBooks]);

  const getBookSizeFormatted = (book: Book): string => {
    let bytes = book.size;
    if (!bytes && book.chapters && book.chapters.length > 0) {
      bytes = book.chapters.reduce((acc, ch) => {
        if (ch.file && typeof ch.file.size === 'number') {
          return acc + ch.file.size;
        }
        return acc;
      }, 0);
    }
    if (!bytes || bytes <= 0) {
      if (book.type === 'audio') {
        bytes = book.chapters.length * 8.5 * 1024 * 1024;
      } else {
        if (book.format === 'pdf') {
          bytes = book.chapters.length * 1.8 * 1024 * 1024;
        } else if (book.format === 'comic') {
          bytes = book.chapters.length * 5.2 * 1024 * 1024;
        } else {
          bytes = Math.max(1, book.chapters.length) * 240 * 1024;
        }
      }
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = bytes / Math.pow(k, i);
    return `${val.toFixed(val >= 100 ? 0 : 1)} ${sizes[i]}`;
  };

  // Handle closing - reset view to library if it was open
  const handleClose = () => {
    setView('library');
    setIsSearchMode(false);
    setSearchQuery('');
    onClose();
  };

  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';
  const isMarcel = appStyle === 'Marcel';

  const renderBookItem = (book: Book) => {
    const progressState = bookProgressMap[book.id];
    const rawPercent = progressState?.totalProgress || 0;
    const progressPercent = Math.min(100, Math.max(0, rawPercent));
    const hasStarted = progressPercent > 0;
    const isSelected = currentBookId === book.id;
    const isAudio = book.type === 'audio';
    const isPdf = book.type === 'ebook' && (
      book.format === 'pdf' || 
      book.id.toLowerCase().endsWith('.pdf') || 
      (book.chapters && book.chapters[0]?.name?.toLowerCase().endsWith('.pdf')) ||
      (book.chapters && book.chapters[0]?.path?.toLowerCase().endsWith('.pdf')) ||
      (book.chapters && (book.chapters[0]?.file as File)?.name?.toLowerCase()?.includes('.pdf')) ||
      (book.title && book.title.toLowerCase().includes('.pdf')) ||
      (book.format === 'fb2' && (
          book.id.toLowerCase().endsWith('.pdf') || 
          (book.chapters && book.chapters[0]?.name?.toLowerCase().endsWith('.pdf')) ||
          (book.chapters && book.chapters[0]?.path?.toLowerCase().endsWith('.pdf')) ||
          (book.chapters && (book.chapters[0]?.file as File)?.name?.toLowerCase()?.includes('.pdf')) ||
          (book.title && book.title.toLowerCase().includes('.pdf'))
      ))
    );

    return (
      <div
        key={book.id}
        onClick={() => {
          onSelectBook(book);
          onClose();
        }}
        className={`group relative w-full h-[64px] shrink-0 text-left px-2.5 py-1 rounded transition-all flex items-center gap-3 border overflow-hidden cursor-pointer mb-2 ${
          isSelected 
            ? (isMarcel ? 'bg-[#F3EFFB] text-[#2F2440] border-[#C4B5E6] shadow-md' : isBimbo ? 'bg-white text-[#BE123C] border-[#FBCFE8] shadow-md' : isSurf ? 'bg-white text-[#0369a1] border-[#7dd3fc] shadow-md' : 'bg-[#363330] text-[#fffff0] border-[#57534e] shadow-md')
            : (isMarcel ? 'text-[#544372] hover:bg-[#E8E0F5] hover:text-[#111111] border-transparent' : isBimbo ? 'text-[#BE123C]/70 hover:bg-white/50 hover:text-[#BE123C] border-transparent' : isSurf ? 'text-[#0284c7] hover:bg-sky-50/50 hover:text-[#0c4a6e] border-transparent' : 'text-[#999] hover:bg-[#363330] hover:text-[#ddd] border-transparent')
        }`}
      >
        {/* Progress Bar Background Overlay */}
        {hasStarted && (
          <div 
            className="absolute bottom-0 left-0 h-[3px] bg-[#fffff0] opacity-40 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        )}

        {/* Cover Image */}
        <div 
            className={`shrink-0 bg-[#23211f] flex items-center justify-center border relative z-10 overflow-hidden rounded ${isSelected ? 'border-[#57534e]' : 'border-[#45413e]'} ${isAudio ? 'w-12 h-12' : 'w-10 h-14'}`}
        >
            {book.coverUrl ? (
                <SmartCoverImage
                  src={book.coverUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  fallbackComponent={
                    <span className="text-lg opacity-50 text-[#666] emoji">
                      {book.type === 'audio' ? (isDragon ? '📯' : (isFF ? '🎼' : (isBimbo ? '💿' : (isSurf ? '🏄' : '💿')))) : (isDragon ? '📜' : (isFF ? '📜' : (isBimbo ? '🩰' : (isSurf ? '🌊' : '📖'))))}
                    </span>
                  }
                />
            ) : (
                <span className="text-lg opacity-50 text-[#666] emoji">
                  {book.type === 'audio' ? (isDragon ? '📯' : (isFF ? '🎼' : (isBimbo ? '💿' : (isSurf ? '🏄' : '💿')))) : (isDragon ? '📜' : (isFF ? '📜' : (isBimbo ? '🩰' : (isSurf ? '🌊' : '📖'))))}
                </span>
            )}
        </div>
        
        <div className="flex flex-col min-w-0 relative z-10 flex-1 justify-between h-full py-0.5">
          <div className="min-w-0 flex flex-col">
            <span className={`font-medium text-xs leading-snug line-clamp-1 break-words ${isSelected ? (isSurf ? 'text-[#0c4a6e]' : 'text-[#fffff0]') : (isSurf ? 'text-[#0ea5e9]' : 'text-[#ccc]')}`}>
              {book.title}
            </span>
            
            {book.author && (
                <span className="text-[11px] italic text-[#777] line-clamp-1 break-words leading-tight">
                    {book.author}
                </span>
            )}
          </div>
          
          <div className="flex items-center justify-between gap-1.5 min-w-0 leading-none">
            <div className="flex items-center gap-1.5 min-w-0">
              {hasStarted && (
                <span className={`text-[9.5px] px-1 py-0.5 rounded font-sans shrink-0 ${isSurf ? 'bg-sky-100 text-[#0284c7]' : 'bg-[#45413e] text-[#999]'}`}>
                  {Math.round(progressPercent)}%
                </span>
              )}
              {isPdf && (() => {
                const isCurrentlyFb2 = isSelected && currentBookFormat === 'fb2';
                return (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isCurrentlyFb2) {
                        onSelectBook(book, false);
                      } else {
                        onSelectBook(book, true);
                      }
                      onClose();
                    }}
                    className={`select-none px-1.5 py-0.5 text-[9.5px] font-bold rounded shadow-sm border transition-all duration-200 shrink-0 ${
                      isBimbo
                        ? (isCurrentlyFb2 
                            ? 'bg-[#BE123C] border-[#BE123C] text-white hover:bg-[#9f1239]' 
                            : 'bg-[#FFF0F5] border-[#FBCFE8] text-[#BE123C]/80 hover:bg-[#FBCFE8] hover:text-[#BE123C]')
                        : isSurf
                        ? (isCurrentlyFb2 
                            ? 'bg-[#0ea5e9] border-[#0ea5e9] text-white hover:bg-[#0284c7]' 
                            : 'bg-white border-[#bae6fd] text-[#0ea5e9]/80 hover:bg-sky-50 hover:text-[#0c4a6e]')
                        : (isCurrentlyFb2 
                            ? 'bg-[#fffff0] border-[#fffff0] text-[#1c1c1c]'
                            : 'bg-[#45413e]/40 border-[#57534e] text-[#666]')
                    }`}
                  >
                    <span>FB2</span>
                  </button>
                );
              })()}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-auto z-20">
              <span className={`text-[10px] font-mono whitespace-nowrap select-none font-medium ${
                isSelected 
                  ? (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]/60' : isSurf ? 'text-[#0284c7]' : 'text-[#888]')
                  : (isMarcel ? 'text-[#9B8EAE]' : isBimbo ? 'text-[#BE123C]/40' : isSurf ? 'text-[#7dd3fc]' : 'text-[#666]')
              }`}>
                {getBookSizeFormatted(book)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDeleteBook) onDeleteBook(book.id);
                }}
                className="p-0.5 rounded text-[#777] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                title="Delete book"
              >
                <span className="text-xs">🗑️</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`fixed inset-y-0 left-0 z-40 w-80 bg-[#2c2a28] border-r border-[#45413e] transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } flex flex-col h-full shadow-2xl bimbo-sidebar`}
    >
      <div className="h-20 shrink-0 px-4 border-b border-[#45413e] flex justify-between items-center bg-[#23211f] gap-1">
        {isSearchMode && view === 'library' ? (
          <div className="flex-1 flex items-center min-w-0 mr-1">
            <span className="text-2xl cursor-default select-none mr-2">🔍</span>
            <input 
              autoFocus
              className="flex-1 min-w-0 bg-[#2c2a28] border border-[#45413e] rounded px-3 py-2 text-sm text-[#fffff0] placeholder-[#888] focus:outline-none focus:border-[#57534e]"
              placeholder="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLElement)?.blur();
                }
              }}
            />
          </div>
        ) : (
          <h2 className="text-xl font-bold flex items-center gap-1.5 text-[#fffff0] min-w-0 flex-1 overflow-hidden">
            {view === 'library' ? (
              <>
                <span className="text-3xl leading-none flex-shrink-0 emoji">{isMarcel ? '🪶' : isDragon ? '🍻' : (isFF ? '🎒' : (isBimbo ? '💖' : (isSurf ? '🏖️' : '📚')))}</span>
                <span className={`leading-normal whitespace-nowrap ${isMarcel ? 'font-marcel font-medium text-[26px] tracking-wide translate-y-[1px]' : isBimbo ? 'font-bimbo font-medium text-[26px] tracking-wide translate-y-[1px]' : (isSurf ? 'font-surf font-medium text-[28px] tracking-wide translate-y-[1px]' : (isFF ? 'font-ff font-semibold text-[21px] tracking-wider translate-y-[1px]' : (isDragon ? 'font-dragon font-medium text-[22px] tracking-wide text-[#fffff0] translate-y-[1px]' : 'font-literata font-bold text-[22px] tracking-wide')))}`}>Library</span>
              </>
            ) : (
              <>
                <span className="text-3xl leading-none flex-shrink-0 emoji">⚙️</span>
                <span className={`leading-normal whitespace-nowrap ${isMarcel ? 'font-marcel font-medium text-[26px] tracking-wide translate-y-[1px]' : isBimbo ? 'font-bimbo font-medium text-[26px] tracking-wide translate-y-[1px]' : (isSurf ? 'font-surf font-medium text-[28px] tracking-wide translate-y-[1px]' : (isFF ? 'font-ff font-semibold text-[21px] tracking-wider translate-y-[1px]' : (isDragon ? 'font-dragon font-medium text-[22px] tracking-wide text-[#fffff0] translate-y-[1px]' : 'font-literata font-bold text-[22px] tracking-wide')))}`}>Settings</span>
              </>
            )}
          </h2>
        )}
        <div className="flex items-center gap-0 shrink-0">
          {view === 'library' && !isSearchMode && (
            <>
              <button 
                onClick={() => { setView('settings'); setIsSearchMode(false); setSearchQuery(''); }} 
                className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
                title="Settings"
              >
                <span className="text-2xl leading-none emoji">⚙️</span>
              </button>
              <button 
                onClick={() => {
                  setIsSearchMode(true);
                }} 
                className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
                title="Search"
              >
                <span className="text-2xl leading-none emoji">🔍</span>
              </button>
            </>
          )}
          <button 
            onClick={() => {
              if (isSearchMode) {
                setIsSearchMode(false);
                setSearchQuery('');
              } else if (view === 'settings') {
                setView('library');
              } else {
                handleClose();
              }
            }} 
            className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
            title="Close"
          >
            <span className="text-2xl leading-none emoji">❌</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scroll">
        {view === 'settings' ? (
           <div className="flex flex-col gap-4 p-2">
               <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => onAppStyleChange('Cool')}
                    className={`p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                      appStyle === 'Cool' 
                        ? 'bg-[#363330] border-[#57534e] text-[#fffff0] shadow-sm' 
                        : 'border-[#363330] text-[#999] hover:bg-[#363330] hover:text-[#ddd]'
                    }`}
                  >
                    <span className="text-base font-semibold">Cool</span>
                    <span className="text-xl emoji leading-none shrink-0">💀</span>
                  </button>
                  <button 
                    onClick={() => onAppStyleChange('Bimbo')}
                    className={`p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                      appStyle === 'Bimbo' 
                        ? 'bg-white border-[#FBCFE8] text-[#BE123C] shadow-sm' 
                        : 'border-[#363330] text-[#999] hover:bg-[#363330] hover:text-[#ddd]'
                    }`}
                  >
                    <span className="font-bimbo text-xl leading-none">Bimbo</span>
                    <span className="text-xl emoji leading-none shrink-0">💖</span>
                  </button>
                  <button 
                    onClick={() => onAppStyleChange('Final')}
                    className={`p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                      isFF 
                        ? 'bg-[#363330] border-[#57534e] text-[#fffff0] shadow-sm' 
                        : 'border-[#363330] text-[#999] hover:bg-[#363330] hover:text-[#ddd]'
                    }`}
                  >
                    <span className="font-ff text-base tracking-widest leading-none">Final</span>
                    <span className="text-xl emoji leading-none shrink-0">☄️</span>
                  </button>
                  <button 
                    onClick={() => onAppStyleChange('Dragon')}
                    className={`p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                      isDragon 
                        ? 'bg-[#363330] border-[#57534e] text-[#fffff0] shadow-sm' 
                        : 'border-[#363330] text-[#999] hover:bg-[#363330] hover:text-[#ddd]'
                    }`}
                  >
                    <span className="font-dragon text-base tracking-wider leading-none">Roll</span>
                    <span className="text-xl emoji leading-none shrink-0">🐉</span>
                  </button>
                  <button 
                    onClick={() => onAppStyleChange('Surf')}
                    className={`p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                      isSurf 
                        ? 'bg-white border-[#BAE6FD] text-[#0ea5e9] shadow-sm' 
                        : 'border-[#363330] text-[#999] hover:bg-[#363330] hover:text-[#ddd]'
                    }`}
                  >
                    <span className="font-surf text-2xl leading-none pt-0.5">Surf</span>
                    <span className="text-xl emoji leading-none shrink-0">🏄</span>
                  </button>
                  <button 
                    onClick={() => onAppStyleChange('Marcel')}
                    className={`p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                      appStyle === 'Marcel' 
                        ? 'bg-[#F3EFFB] border-[#C4B5E6] text-[#2F2440] shadow-sm' 
                        : 'border-[#363330] text-[#999] hover:bg-[#363330] hover:text-[#ddd]'
                    }`}
                  >
                    <span className="font-marcel text-base font-medium leading-none">Marcel</span>
                    <span className="text-xl emoji leading-none shrink-0">🪻</span>
                  </button>
                </div>

                {/* Font Selection Button & Dropdown (Hidden in audio mode) */}
                {mode !== 'audio' && (
                  <div className="pt-2">
                    <button
                      onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
                      className={`w-full p-3 rounded border flex items-center justify-between min-h-[52px] transition-all ${
                        isMarcel 
                          ? 'bg-[#F3EFFB] border-[#C4B5E6] text-[#2F2440] shadow-sm' 
                          : isBimbo
                          ? 'bg-white border-[#FBCFE8] text-[#BE123C] shadow-sm'
                          : isSurf
                          ? 'bg-white border-[#BAE6FD] text-[#0ea5e9] shadow-sm'
                          : 'bg-[#363330] border-[#57534e] text-[#fffff0] shadow-sm hover:bg-[#3d3a37]'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-sm font-semibold opacity-75">Font:</span>
                        <span 
                          className="text-sm font-medium truncate"
                          style={{ fontFamily: getFontFamilyCSS(readerFont) }}
                        >
                          {readerFont || 'Literata'}
                        </span>
                      </div>
                      <ChevronDown 
                        size={18} 
                        className={`transition-transform duration-200 shrink-0 opacity-80 ${isFontDropdownOpen ? 'rotate-180' : ''}`} 
                      />
                    </button>

                    {/* Expanded Font List */}
                    {isFontDropdownOpen && (
                      <div className="flex flex-col gap-2 pt-2">
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scroll pr-1">
                          {allFonts.map(f => {
                            const isSelected = (readerFont || 'Literata') === f.name;
                            return (
                              <div
                                key={f.name}
                                onClick={() => {
                                  if (onReaderFontChange) onReaderFontChange(f.name);
                                }}
                                className={`px-3 py-2.5 rounded border flex items-center justify-between cursor-pointer transition-all ${
                                  isSelected
                                    ? isMarcel
                                      ? 'bg-[#E8E0F5] border-[#AC97D7] text-[#2F2440] font-semibold'
                                      : isBimbo
                                      ? 'bg-[#FFF0F5] border-[#FBCFE8] text-[#BE123C] font-semibold'
                                      : isSurf
                                      ? 'bg-sky-50 border-[#7dd3fc] text-[#0c4a6e] font-semibold'
                                      : 'bg-[#45413e] border-[#666] text-[#fffff0] font-semibold'
                                    : isMarcel
                                    ? 'border-transparent text-[#544372] hover:bg-[#E8E0F5]/50'
                                    : isBimbo
                                    ? 'border-transparent text-[#BE123C]/80 hover:bg-white/40'
                                    : isSurf
                                    ? 'border-transparent text-[#0284c7] hover:bg-white/40'
                                    : 'border-transparent text-[#aaa] hover:bg-[#363330] hover:text-[#fff]'
                                }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="text-sm font-semibold opacity-0 select-none pointer-events-none">Font:</span>
                                  <span 
                                    className="text-sm truncate"
                                    style={{ fontFamily: getFontFamilyCSS(f.name) }}
                                  >
                                    {f.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isSelected && <span className="text-xs">✓</span>}
                                  {f.isCustom && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (onDeleteCustomFont) onDeleteCustomFont(f.name);
                                      }}
                                      className="p-1 rounded text-[#888] hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                                      title="Delete font"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add Font Button (Styled matching Add eBook button) */}
                        <button
                          onClick={() => fontInputRef.current?.click()}
                          className={`w-full h-[64px] shrink-0 px-2.5 py-1 border-2 border-dashed rounded transition-all flex items-center gap-3 group text-left mb-1 mt-1 ${
                            isMarcel
                              ? 'border-[#C4B5E6] bg-[#E8E0F5] text-[#544372] hover:bg-[#DBD0EF] hover:text-[#2F2440] hover:border-[#AC97D7]'
                              : isBimbo
                              ? 'border-[#FBCFE8] bg-[#FFF0F5] text-[#BE123C] hover:bg-pink-100 hover:border-[#F472B6]'
                              : isSurf
                              ? 'border-[#BAE6FD] bg-[#F0F9FF] text-[#0c4a6e] hover:bg-sky-100 hover:border-[#7dd3fc]'
                              : isDragon
                              ? 'border-[#7f1d1d] bg-[#3a1a0e] text-[#fcd34d] hover:bg-[#4a2511] hover:border-[#991b1b]'
                              : isFF
                              ? 'border-[#406da3] bg-[#0d2347] text-[#f0deba] hover:bg-[#17335e] hover:border-[#dfc894]'
                              : 'border-[#57534e] bg-[#363330] text-[#fffff0] hover:bg-[#45413e] hover:border-[#666]'
                          }`}
                        >
                          <span className="text-xl group-hover:scale-110 transition-transform emoji pl-1 pr-1">➕</span>
                          <div className="flex flex-col min-w-0 flex-1 justify-center">
                             <span className="text-xs font-bold uppercase tracking-wider">Add font</span>
                             <span className="text-[10px] opacity-60 font-mono mt-0.5">ttf, otf, woff, woff2</span>
                          </div>
                        </button>

                        <input
                          type="file"
                          ref={fontInputRef}
                          className="hidden"
                          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              if (onAddCustomFont) {
                                Array.from(files).forEach((file) => onAddCustomFont(file));
                              }
                            }
                            e.target.value = '';
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
           </div>
        ) : view === 'library' ? (
          <>
            {isSearchMode && filteredBooks.length === 0 && (
              <div className="text-center text-[#777] py-8 text-sm font-normal">
                nothing
              </div>
            )}

            {/* 1. Series Groups (Expandable Sections) */}
            {seriesGroups.length > 0 && seriesGroups.map((group) => {
              const isExpanded = !!expandedSeries[group.name];
              return (
                <div key={group.name} className="mb-2">
                  <div 
                    onClick={() => toggleSeries(group.name)}
                    className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between cursor-pointer select-none transition-all border ${
                      isMarcel
                        ? 'bg-[#E8E0F5] text-[#2F2440] border-[#C4B5E6]/70 hover:bg-[#DBD0EF]'
                        : isBimbo
                        ? 'bg-[#FFF0F5] text-[#BE123C] border-[#FBCFE8] hover:bg-pink-100'
                        : isSurf
                        ? 'bg-[#F0F9FF] text-[#0c4a6e] border-[#BAE6FD] hover:bg-sky-100'
                        : isDragon
                        ? 'bg-[#2a140b] text-[#fcd34d] border-[#7f1d1d] hover:bg-[#3a1a0e]'
                        : isFF
                        ? 'bg-[#081832] text-[#f0deba] border-[#406da3] hover:bg-[#0d2347]'
                        : 'bg-[#23211f] text-[#fffff0] border-[#45413e] hover:bg-[#2c2a28]'
                    }`}
                  >
                    <span className="text-xs font-bold truncate pr-2">{group.name}</span>
                    <ChevronDown 
                      className={`w-4 h-4 text-[#888] shrink-0 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : 'rotate-0'
                      }`} 
                    />
                  </div>

                  {isExpanded && (
                    <div className="pt-2">
                      {group.books.map((book) => renderBookItem(book))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 2. Standalone Books (Not part of a series) */}
            {standaloneBooks.length > 0 && standaloneBooks.map((book) => renderBookItem(book))}

             {/* Add Book Buttons Area */}
            {!isSearchMode && !searchQuery && (
              <div className="mt-2 pb-12 space-y-2">
                 {/* 1. Add books button */}
                 <button 
                   onClick={() => bookInputRef.current?.click()}
                   className={`w-full h-[64px] shrink-0 px-2.5 py-1 border-2 border-dashed rounded transition-all flex items-center gap-3 group text-left ${
                     isMarcel 
                       ? 'border-[#C4B5E6] bg-[#E8E0F5] text-[#544372] hover:bg-[#DBD0EF] hover:text-[#2F2440] hover:border-[#AC97D7]' 
                       : isBimbo 
                       ? 'border-[#FBCFE8] bg-[#FFF0F5] text-[#BE123C] hover:bg-pink-100 hover:border-[#F472B6]' 
                       : isSurf 
                       ? 'border-[#BAE6FD] bg-[#F0F9FF] text-[#0c4a6e] hover:bg-sky-100 hover:border-[#7dd3fc]' 
                       : isDragon
                       ? 'border-[#7f1d1d] bg-[#3a1a0e] text-[#fcd34d] hover:bg-[#4a2511] hover:border-[#991b1b]'
                       : isFF
                       ? 'border-[#406da3] bg-[#0d2347] text-[#f0deba] hover:bg-[#17335e] hover:border-[#dfc894]'
                       : 'border-[#57534e] bg-[#363330] text-[#fffff0] hover:bg-[#45413e] hover:border-[#666]'
                   }`}
                 >
                   <div className={`w-10 h-14 shrink-0 rounded flex items-center justify-center ${
                     isMarcel
                       ? 'bg-[#C4B5E6]/40 text-[#544372]'
                       : isBimbo
                       ? 'bg-[#FBCFE8]/60 text-[#BE123C]'
                       : isSurf
                       ? 'bg-[#BAE6FD]/60 text-[#0284c7]'
                       : isDragon
                       ? 'bg-[#7f1d1d]/60 text-[#fcd34d]'
                       : isFF
                       ? 'bg-[#406da3]/60 text-[#dfc894]'
                       : 'bg-[#45413e]/70 text-[#fffff0]'
                   }`}>
                     <span className="text-xl group-hover:scale-110 transition-transform emoji">➕</span>
                   </div>
                   <div className="flex flex-col min-w-0 flex-1 justify-center">
                      <span className="text-xs font-bold uppercase tracking-wider">Add books</span>
                      <span className="text-[8.5px] opacity-60 font-mono mt-0.5 leading-snug line-clamp-1">fb2, epub, pdf, cbz, cbr, mp3, m4b, m4a, mp4</span>
                   </div>
                 </button>

                 {/* 2. Add folder button */}
                 <button 
                   onClick={() => folderInputRef.current?.click()}
                   className={`w-full h-[64px] shrink-0 px-2.5 py-1 border-2 border-dashed rounded transition-all flex items-center gap-3 group text-left ${
                     isMarcel 
                       ? 'border-[#C4B5E6] bg-[#E8E0F5] text-[#544372] hover:bg-[#DBD0EF] hover:text-[#2F2440] hover:border-[#AC97D7]' 
                       : isBimbo 
                       ? 'border-[#FBCFE8] bg-[#FFF0F5] text-[#BE123C] hover:bg-pink-100 hover:border-[#F472B6]' 
                       : isSurf 
                       ? 'border-[#BAE6FD] bg-[#F0F9FF] text-[#0c4a6e] hover:bg-sky-100 hover:border-[#7dd3fc]' 
                       : isDragon
                       ? 'border-[#7f1d1d] bg-[#3a1a0e] text-[#fcd34d] hover:bg-[#4a2511] hover:border-[#991b1b]'
                       : isFF
                       ? 'border-[#406da3] bg-[#0d2347] text-[#f0deba] hover:bg-[#17335e] hover:border-[#dfc894]'
                       : 'border-[#57534e] bg-[#363330] text-[#fffff0] hover:bg-[#45413e] hover:border-[#666]'
                   }`}
                 >
                   <div className={`w-10 h-14 shrink-0 rounded flex items-center justify-center ${
                     isMarcel
                       ? 'bg-[#C4B5E6]/40 text-[#544372]'
                       : isBimbo
                       ? 'bg-[#FBCFE8]/60 text-[#BE123C]'
                       : isSurf
                       ? 'bg-[#BAE6FD]/60 text-[#0284c7]'
                       : isDragon
                       ? 'bg-[#7f1d1d]/60 text-[#fcd34d]'
                       : isFF
                       ? 'bg-[#406da3]/60 text-[#dfc894]'
                       : 'bg-[#45413e]/70 text-[#fffff0]'
                   }`}>
                     <span className="text-xl group-hover:scale-110 transition-transform emoji">📁</span>
                   </div>
                   <div className="flex flex-col min-w-0 flex-1 justify-center">
                      <span className="text-xs font-bold uppercase tracking-wider">Add folder</span>
                      <span className="text-[8.5px] opacity-60 font-mono mt-0.5 leading-snug line-clamp-1">folders with mp3, cbz, cbr, images</span>
                   </div>
                 </button>

                 {/* 3. Catalog Download button */}
                 {onOpenCatalog && (
                   <button 
                     onClick={() => {
                       onOpenCatalog();
                       onClose();
                     }}
                     className={`w-full h-[64px] shrink-0 px-2.5 py-1 border-2 border-dashed rounded transition-all flex items-center gap-3 group text-left ${
                       isMarcel 
                         ? 'border-[#C4B5E6] bg-[#E8E0F5] text-[#544372] hover:bg-[#DBD0EF] hover:text-[#2F2440] hover:border-[#AC97D7]' 
                         : isBimbo 
                         ? 'border-[#FBCFE8] bg-[#FFF0F5] text-[#BE123C] hover:bg-pink-100 hover:border-[#F472B6]' 
                         : isSurf 
                         ? 'border-[#BAE6FD] bg-[#F0F9FF] text-[#0c4a6e] hover:bg-sky-100 hover:border-[#7dd3fc]' 
                         : isDragon
                         ? 'border-[#7f1d1d] bg-[#3a1a0e] text-[#fcd34d] hover:bg-[#4a2511] hover:border-[#991b1b]'
                         : isFF
                         ? 'border-[#406da3] bg-[#0d2347] text-[#f0deba] hover:bg-[#17335e] hover:border-[#dfc894]'
                         : 'border-[#57534e] bg-[#363330] text-[#fffff0] hover:bg-[#45413e] hover:border-[#666]'
                     }`}
                   >
                     <div className={`w-10 h-14 shrink-0 rounded flex items-center justify-center ${
                       isMarcel
                         ? 'bg-[#C4B5E6]/40 text-[#544372]'
                         : isBimbo
                         ? 'bg-[#FBCFE8]/60 text-[#BE123C]'
                         : isSurf
                         ? 'bg-[#BAE6FD]/60 text-[#0284c7]'
                         : isDragon
                         ? 'bg-[#7f1d1d]/60 text-[#fcd34d]'
                         : isFF
                         ? 'bg-[#406da3]/60 text-[#dfc894]'
                         : 'bg-[#45413e]/70 text-[#fffff0]'
                     }`}>
                       <span className="text-xl group-hover:scale-110 transition-transform emoji">📥</span>
                     </div>
                     <div className="flex flex-col min-w-0 flex-1 justify-center">
                        <span className="text-xs font-bold uppercase tracking-wider">DOWNLOAD</span>
                        <span className="text-[8.5px] opacity-60 font-mono mt-0.5">lscnsk</span>
                     </div>
                   </button>
                 )}
              </div>
            )}

            {/* Hidden File Input for Add Books */}
            <input 
              type="file" 
              ref={bookInputRef} 
              className="hidden" 
              multiple
              accept=".fb2,.epub,.pdf,.cbz,.cbr,.bin,.mp3,.m4b,.m4a,.mp4,audio/*"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                   if (onExternalFilePicked) onExternalFilePicked(files);
                }
                e.target.value = '';
              }}
            />

            {/* Hidden Folder Input for Add Folder */}
            <input 
              type="file" 
              ref={folderInputRef} 
              className="hidden" 
              multiple
              {...({ webkitdirectory: "", directory: "" } as any)}
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                   if (onExternalFolderPicked) onExternalFolderPicked(files);
                }
                e.target.value = '';
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default LibrarySidebar;