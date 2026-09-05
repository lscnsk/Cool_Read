import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Book, PersistedState } from '../types';
import { ChevronDown } from 'lucide-react';
import { PRESET_FONTS, getFontFamilyCSS } from '../utils/fonts';

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
        (b.author && b.author.toLowerCase().includes(q))
    );
  }, [books, searchQuery]);

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
                    <span className="font-marcel text-2xl font-medium leading-none pt-0.5">Marcel</span>
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
                          className="text-base font-medium truncate"
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
                                className={`p-2.5 rounded border flex items-center justify-between cursor-pointer transition-all ${
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
                                <span 
                                  className="text-base truncate"
                                  style={{ fontFamily: getFontFamilyCSS(f.name) }}
                                >
                                  {f.name}
                                </span>
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

                        {/* Add Font Button (Styled matching Add eBook / Add Audiobook buttons) */}
                        <button
                          onClick={() => fontInputRef.current?.click()}
                          className={`w-full py-3 px-3 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-1 group mt-1 ${
                            isMarcel
                              ? 'border-[#C4B5E6] bg-[#E8E0F5]/50 text-[#544372] hover:bg-[#DBD0EF] hover:text-[#2F2440] hover:border-[#AC97D7]'
                              : isBimbo
                              ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50'
                              : isSurf
                              ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]'
                              : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'
                          }`}
                        >
                          <span className="text-xl group-hover:scale-110 transition-transform emoji">➕</span>
                          <div className="flex flex-col items-center text-center">
                            <span className="text-xs font-bold uppercase tracking-widest">Add font</span>
                            <span className="text-[10px] opacity-60 font-mono">ttf, otf, woff, woff2</span>
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
            {filteredBooks.length > 0 && filteredBooks.map((book) => {
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
                    className={`group relative w-full text-left p-2 rounded transition-all flex items-start gap-3 border overflow-hidden cursor-pointer mb-2 ${
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
                        className={`mt-1 shrink-0 bg-[#23211f] flex items-center justify-center border relative z-10 overflow-hidden ${isSelected ? 'border-[#57534e]' : 'border-[#45413e]'} ${isAudio ? 'w-12 h-12' : 'w-10 h-14'}`}
                    >
                        {book.coverUrl ? (
                            <img src={book.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-lg opacity-50 text-[#666] emoji">
                              {book.type === 'audio' ? (isDragon ? '📯' : (isFF ? '🎼' : (isBimbo ? '💿' : (isSurf ? '🏄' : '💿')))) : (isDragon ? '📜' : (isFF ? '📜' : (isBimbo ? '🩰' : (isSurf ? '🌊' : '📖'))))}
                            </span>
                        )}
                    </div>
                    
                    <div className="flex flex-col min-w-0 relative z-10 flex-1 py-1 gap-0.5">
                      <span className={`font-medium text-sm leading-tight line-clamp-2 break-words ${isSelected ? (isSurf ? 'text-[#0c4a6e]' : 'text-[#fffff0]') : (isSurf ? 'text-[#0ea5e9]' : 'text-[#ccc]')}`}>
                        {book.title}
                      </span>
                      
                      {book.author && (
                          <span className="text-xs italic text-[#777] line-clamp-1">
                              {book.author}
                          </span>
                      )}
                      
                      <div className="flex items-center gap-2 mt-1">
                        {hasStarted && (
                          <span className={`text-[10px] px-1 rounded font-sans ${isSurf ? 'bg-sky-100 text-[#0284c7]' : 'bg-[#45413e] text-[#999]'}`}>
                            {Math.round(progressPercent)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 z-20">
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
                            className={`self-center select-none px-2 py-0.5 text-[11px] font-bold rounded shadow-sm border transition-all duration-200 shrink-0 ${
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
                      <span className={`text-[10.5px] font-mono whitespace-nowrap px-1 select-none font-medium ${
                        isSelected 
                          ? (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]/60' : isSurf ? 'text-[#0284c7]' : 'text-[#888]')
                          : (isMarcel ? 'text-[#9B8EAE]' : isBimbo ? 'text-[#BE123C]/40' : isSurf ? 'text-[#7dd3fc]' : 'text-[#555] group-hover:text-[#777]')
                      }`}>
                        {getBookSizeFormatted(book)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteBook) onDeleteBook(book.id);
                        }}
                        className="p-1 rounded text-[#666] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 md:opacity-0 group-hover:opacity-100 focus:opacity-100"
                        
                      >
                        <span className="text-sm">🗑️</span>
                      </button>
                    </div>
                  </div>
                );
              })
            }

            {/* Add Book Buttons Area */}
            {!isSearchMode && !searchQuery && (
              <div className="mt-4 pb-12 space-y-3">
                 {mode === 'ebook' && (
                   <>
                   <button 
                     onClick={() => bookInputRef.current?.click()}
                     className={`w-full py-4 px-4 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-1.5 group ${isMarcel ? 'border-[#C4B5E6] bg-[#E8E0F5]/50 text-[#544372] hover:bg-[#DBD0EF] hover:text-[#111111] hover:border-[#AC97D7]' : isBimbo ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' : isSurf ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'}`}
                   >
                     <span className="text-3xl group-hover:scale-110 transition-transform">➕</span>
                     <div className="flex flex-col items-center">
                        <span className="text-sm font-bold uppercase tracking-widest">Add books</span>
                        <span className="text-[10px] opacity-60 font-mono">fb2, epub, pdf, cbz, cbr</span>
                     </div>
                   </button>

                   <button 
                     onClick={() => {
                       if (onOpenCatalog) onOpenCatalog();
                       onClose();
                     }}
                     className={`w-full py-4 px-4 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-1.5 group ${isMarcel ? 'border-[#C4B5E6] bg-[#E8E0F5]/50 text-[#544372] hover:bg-[#DBD0EF] hover:text-[#111111] hover:border-[#AC97D7]' : isBimbo ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' : isSurf ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'}`}
                   >
                     <span className="text-3xl group-hover:scale-110 transition-transform emoji">📥</span>
                     <div className="flex flex-col items-center">
                        <span className="text-sm font-bold uppercase tracking-widest">DOWNLOAD BOOKS</span>
                        <span className="text-[10px] opacity-60 font-mono">lscnsk</span>
                     </div>
                   </button>
                   </>
                 )}

                 {mode === 'audio' && (
                   <button 
                     onClick={() => bookInputRef.current?.click()}
                     className={`w-full py-4 px-4 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-1.5 group ${isMarcel ? 'border-[#C4B5E6] bg-[#E8E0F5]/50 text-[#544372] hover:bg-[#DBD0EF] hover:text-[#111111] hover:border-[#AC97D7]' : isBimbo ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' : isSurf ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'}`}
                   >
                     <span className="text-3xl group-hover:scale-110 transition-transform emoji">➕</span>
                     <div className="flex flex-col items-center text-center">
                        <span className="text-sm font-bold uppercase tracking-widest">Add audiobook files</span>
                        <span className="text-[10px] opacity-80 mt-1 max-w-[240px] leading-snug">
                          Select all mp3 files (and cover) from the audiobook folder, or m4b, m4a, mp4
                        </span>
                     </div>
                   </button>
                 )}
              </div>
            )}

            <input 
              type="file" 
              ref={bookInputRef} 
              className="hidden" 
              multiple
              accept={mode === 'audio' ? ".mp3,.m4b,.m4a,.mp4,audio/*,.jpg,.jpeg,.png,.webp,.bmp" : ".fb2,.epub,.pdf,.cbz,.cbr,.bin"}
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                   if (mode === 'audio') {
                      const hasAudio = Array.from(files).some(f => f.name.toLowerCase().match(/\.(mp3|m4b|m4a|mp4)$/));
                      if (hasAudio && onExternalFolderPicked) onExternalFolderPicked(files);
                   } else {
                      const filteredFiles = Array.from(files).filter(f => !f.name.toLowerCase().match(/\.(mp3|m4b|m4a)$/));
                      if (filteredFiles.length > 0 && onExternalFilePicked) {
                         onExternalFilePicked(filteredFiles);
                      }
                   }
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