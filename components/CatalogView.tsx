import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { CatalogBook, formatTypography, getApproximatePageCount } from '../data/catalogData';
import { Book } from '../types';

interface CatalogViewProps {
  books: CatalogBook[];
  libraryBooks: Book[];
  currentFilter: {
    type: 'all' | 'series' | 'author';
    value?: string;
    searchQuery?: string;
  };
  onResetFilter: () => void;
  onDownloadBook: (book: CatalogBook) => Promise<void>;
  onReadBook: (book: CatalogBook) => void;
  downloadingIds: Set<string>;
  appStyle?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  books,
  libraryBooks,
  currentFilter,
  onResetFilter,
  onDownloadBook,
  onReadBook,
  downloadingIds,
  appStyle = 'Cool',
  isLoading = false,
  onRefresh
}) => {
  const catalogContainerRef = useRef<HTMLDivElement>(null);

  // Check which catalog books are already in user's library
  const isBookInLibrary = (catalogBook: CatalogBook): boolean => {
    return libraryBooks.some(libBook => {
      const cleanLibTitle = libBook.title.toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
      const cleanCatTitle = catalogBook.title.toLowerCase().trim();
      return cleanLibTitle === cleanCatTitle || cleanLibTitle.includes(cleanCatTitle);
    });
  };

  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';
  const isDragon = appStyle === 'Dragon';
  const isFF = appStyle === 'Final' || appStyle === 'Final Fantasy';

  // --- AUTOMATIC MICRO-TYPOGRAPHY OPTIMIZATION FOR CATALOG ANNOTATIONS ---
  useEffect(() => {
    const container = catalogContainerRef.current;
    if (!container) return;

    const optimizeCatalogTypography = () => {
      const paragraphs = Array.from(container.querySelectorAll<HTMLElement>('.catalog-annotation-p'));
      if (!paragraphs.length) return;

      const getMaxSpaceInParagraph = (p: HTMLElement): number => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
        let tn: Text | null;
        let maxW = 0;
        while ((tn = walker.nextNode() as Text | null)) {
          const text = tn.nodeValue;
          if (!text) continue;
          for (let i = 0; i < text.length; i++) {
            if (text[i] === ' ') {
              const range = document.createRange();
              range.setStart(tn, i);
              range.setEnd(tn, i + 1);
              const rects = range.getClientRects();
              if (rects.length > 0 && rects[0].width > maxW) {
                maxW = rects[0].width;
              }
            }
          }
        }
        return maxW;
      };

      const candidates = ['-0.015em', '-0.02em', '-0.025em', '-0.03em', '-0.035em', '-0.01em', '0em'];

      paragraphs.forEach((p) => {
        const text = p.textContent ? p.textContent.trim() : '';
        if (text.length < 15) return;

        p.style.removeProperty('letter-spacing');

        const initialMax = getMaxSpaceInParagraph(p);
        if (initialMax > 8.5) {
          let bestLs = '0em';
          let lowestMax = initialMax;

          for (const cand of candidates) {
            p.style.setProperty('letter-spacing', cand, 'important');
            const curMax = getMaxSpaceInParagraph(p);
            if (curMax < lowestMax) {
              lowestMax = curMax;
              bestLs = cand;
              if (curMax <= 6.5) break;
            }
          }

          if (bestLs !== '0em') {
            p.style.setProperty('letter-spacing', bestLs, 'important');
          } else {
            p.style.removeProperty('letter-spacing');
          }
        }
      });
    };

    const t1 = setTimeout(optimizeCatalogTypography, 40);
    const t2 = setTimeout(optimizeCatalogTypography, 250);

    window.addEventListener('resize', optimizeCatalogTypography);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', optimizeCatalogTypography);
    };
  }, [books, currentFilter]);

  return (
    <div
      ref={catalogContainerRef}
      className="flex-1 w-full h-full overflow-y-auto scrollbar-hide px-4 md:px-8 pt-24 pb-16 relative"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="max-w-4xl mx-auto">
        
        {/* Header: Centered lowercase lscnsk styled according to current appStyle */}
        <div
          className={`mb-6 pb-2 border-b relative flex items-center justify-center min-h-[36px] ${
            isMarcel
              ? 'border-[#C4B5E6]/70'
              : isBimbo
              ? 'border-[#FBCFE8]'
              : isSurf
              ? 'border-[#BAE6FD]'
              : isDragon
              ? 'border-[#7f1d1d]/60'
              : isFF
              ? 'border-[#406da3]/50'
              : 'border-[#45413e]/30'
          }`}
        >
          <span
            className={`lowercase select-none text-center ${
              isMarcel
                ? 'font-marcel text-2xl md:text-3xl text-[#544372] tracking-wider'
                : isBimbo
                ? 'font-bimbo text-2xl md:text-3xl text-[#BE123C] tracking-wide'
                : isSurf
                ? 'font-surf text-2xl md:text-3xl text-[#0284C7] tracking-wider'
                : isDragon
                ? 'font-dragon text-xl md:text-2xl text-[#fcd34d] tracking-widest'
                : isFF
                ? 'font-ff text-lg md:text-xl text-[#dfc894] tracking-[0.25em]'
                : 'font-literata text-sm md:text-base text-[#a8a29e]/80 tracking-widest'
            }`}
          >
            lscnsk
          </span>

          {onRefresh && (
            <button
              onClick={() => {
                onResetFilter();
                onRefresh();
              }}
              disabled={isLoading}
              title="Обновить каталог"
              className={`absolute right-1 p-1.5 rounded-full transition-all opacity-50 hover:opacity-100 disabled:opacity-30 ${
                isMarcel
                  ? 'text-[#544372] hover:bg-[#C4B5E6]/30'
                  : isBimbo
                  ? 'text-[#BE123C] hover:bg-[#FBCFE8]/30'
                  : isSurf
                  ? 'text-[#0284C7] hover:bg-[#BAE6FD]/30'
                  : isDragon
                  ? 'text-[#fcd34d] hover:bg-[#7f1d1d]/30'
                  : isFF
                  ? 'text-[#dfc894] hover:bg-[#406da3]/30'
                  : 'text-[#d6d3d1] hover:bg-stone-700/30'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Empty state if search returned no results */}
        {books.length === 0 && (
          <div
            className={`text-center py-20 space-y-3 font-literata ${
              isMarcel
                ? 'text-[#766594]'
                : isBimbo
                ? 'text-[#BE123C]'
                : isSurf
                ? 'text-[#0369A1]'
                : isDragon
                ? 'text-[#b45309]'
                : isFF
                ? 'text-[#8faada]'
                : 'text-[#a8a29e]'
            }`}
          >
            {isLoading ? (
              <div className="py-8 flex justify-center items-center">
                <div
                  className={`w-6 h-6 border-2 border-t-transparent rounded-full animate-spin ${
                    isMarcel
                      ? 'border-[#544372]'
                      : isBimbo
                      ? 'border-[#BE123C]'
                      : isSurf
                      ? 'border-[#0284C7]'
                      : isDragon
                      ? 'border-[#fcd34d]'
                      : isFF
                      ? 'border-[#dfc894]'
                      : 'border-[#a8a29e]'
                  }`}
                />
              </div>
            ) : currentFilter.searchQuery || currentFilter.value ? (
              <div className="py-2">
                <p className="text-base font-medium">Nothing</p>
              </div>
            ) : (
              <>
                <p className="text-base">
                  Каталог пуст или обновляется
                </p>
                <div className="flex justify-center gap-3 items-center pt-1">
                  {(currentFilter.searchQuery || currentFilter.value) && (
                    <button
                      onClick={onResetFilter}
                      className={`text-xs underline ${
                        isMarcel
                          ? 'text-[#544372] hover:text-[#2F2440]'
                          : isBimbo
                          ? 'text-[#BE123C] hover:text-[#881337]'
                          : isSurf
                          ? 'text-[#0284C7] hover:text-[#0C4A6E]'
                          : isDragon
                          ? 'text-[#fcd34d] hover:text-[#ea580c]'
                          : isFF
                          ? 'text-[#dfc894] hover:text-[#f0deba]'
                          : 'text-[#fffff0] hover:opacity-80'
                      }`}
                    >
                      Сбросить фильтры
                    </button>
                  )}
                  {onRefresh && (
                    <button
                      onClick={() => {
                        onResetFilter();
                        onRefresh();
                      }}
                      className={`text-xs px-3 py-1 rounded-md border transition-all ${
                        isMarcel
                          ? 'border-[#C4B5E6] text-[#544372] hover:bg-[#E8E0F5]'
                          : isBimbo
                          ? 'border-[#FBCFE8] text-[#BE123C] hover:bg-pink-50'
                          : isSurf
                          ? 'border-[#BAE6FD] text-[#0284C7] hover:bg-sky-50'
                          : isDragon
                          ? 'border-[#7f1d1d] text-[#fcd34d] hover:bg-stone-800'
                          : isFF
                          ? 'border-[#406da3] text-[#dfc894] hover:bg-[#17335e]'
                          : 'border-stone-700 text-[#d6d3d1] hover:bg-stone-800'
                      }`}
                    >
                      Проверить репозиторий
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Books List: 2-column layout (Column 1: Cover + Button, Column 2: Metadata & Annotation) */}
        <div className="space-y-8 md:space-y-10">
          {books.map((book) => {
            const onShelf = isBookInLibrary(book);
            const libraryBook = libraryBooks.find((libBook) => {
              const cleanLibTitle = libBook.title.toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
              const cleanCatTitle = book.title.toLowerCase().trim();
              return cleanLibTitle === cleanCatTitle || cleanLibTitle.includes(cleanCatTitle);
            });
            const displayCoverUrl = book.coverUrl || libraryBook?.coverUrl;
            const isDownloading = downloadingIds.has(book.id);
            const approxPages = getApproximatePageCount(book);
            const paragraphs = book.description
              ? book.description
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter((p) => p.length > 0)
              : [];

            return (
              <article
                key={book.id}
                className={`rounded-xl p-5 md:p-6 transition-all grid grid-cols-1 sm:grid-cols-[200px_1fr] md:grid-cols-[230px_1fr] gap-6 md:gap-8 items-start ${
                  isMarcel
                    ? 'bg-white/85 border border-[#C4B5E6] shadow-sm hover:border-[#AC97D7]'
                    : isBimbo
                    ? 'bg-white/85 border border-[#FBCFE8] shadow-sm hover:border-[#F472B6]'
                    : isSurf
                    ? 'bg-white/85 border border-[#BAE6FD] shadow-sm hover:border-[#38BDF8]'
                    : isDragon
                    ? 'bg-[#1a0f0d]/90 border border-[#7f1d1d]/80 shadow-md hover:border-[#991b1b]'
                    : isFF
                    ? 'bg-[#061124]/90 border border-[#406da3]/70 shadow-md hover:border-[#dfc894]/60'
                    : 'bg-[#2a2724]/70 border border-[#45413e]/60 shadow-md hover:border-[#5c5752]'
                }`}
              >
                {/* COLUMN 1: COVER & DOWNLOAD BUTTON */}
                <div className="w-full flex flex-col items-center sm:items-start">
                  
                  {/* Book Cover */}
                  <div
                    className={`w-40 sm:w-full aspect-[1/1.45] max-w-[210px] rounded-lg shadow-lg ${
                      displayCoverUrl ? 'bg-[#181014]' : `bg-gradient-to-br ${book.coverBg || 'from-[#2a2421] to-[#171412]'}`
                    } p-3.5 flex flex-col justify-between relative border border-white/10 overflow-hidden select-none group`}
                  >
                    {displayCoverUrl && (
                      <img
                        src={displayCoverUrl}
                        alt={book.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {/* Spine highlight overlay */}
                    <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-white/20 via-white/5 to-transparent pointer-events-none z-10" />
                    
                    {!displayCoverUrl && (
                      <>
                        {/* Cover Center (Title & Author) */}
                        <div className="text-center my-auto space-y-1 px-1">
                          <h3
                            className="font-literata font-bold text-xs sm:text-sm md:text-base leading-snug line-clamp-3"
                            style={{ color: book.coverTextColor || '#fffff0' }}
                          >
                            {book.title}
                          </h3>
                          <p className="font-literata italic text-[11px] sm:text-xs opacity-75 text-[#fffff0]">
                            {book.author}
                          </p>
                        </div>

                        {/* Cover Footer */}
                        <div className="text-center border-t border-white/10 pt-1.5 flex items-center justify-center font-mono text-[9px] opacity-60 text-[#fffff0]">
                          <span className="font-bold tracking-widest uppercase">lscnsk</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action button below cover */}
                  <div className="w-40 sm:w-full max-w-[210px] mt-3.5 flex flex-col items-center gap-1.5">
                    {onShelf ? (
                      <div
                        className={`w-full py-2 px-3 rounded-lg text-xs font-mono font-medium tracking-wide flex items-center justify-center gap-1.5 select-none ${
                          isMarcel
                            ? 'bg-[#E8E0F5] border border-[#C4B5E6] text-[#544372]'
                            : isBimbo
                            ? 'bg-pink-100/90 border border-pink-300 text-[#881337]'
                            : isSurf
                            ? 'bg-sky-100/90 border border-sky-300 text-[#0C4A6E]'
                            : isDragon
                            ? 'bg-[#450a0a] border border-[#991b1b] text-[#fcd34d]'
                            : isFF
                            ? 'bg-[#0b1d3a] border border-[#dfc894] text-[#dfc894]'
                            : 'bg-[#363330] border border-[#45413e] text-[#a8a29e]'
                        }`}
                      >
                        <span>✓</span>
                        <span>Downloaded</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => onDownloadBook(book)}
                        disabled={isDownloading}
                        className={`w-full py-2 px-3 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow active:scale-95 ${
                          isDownloading
                            ? isMarcel
                              ? 'bg-[#E8E0F5] text-[#766594] border border-[#C4B5E6] cursor-wait'
                              : isBimbo
                              ? 'bg-[#FFF0F5] text-[#BE123C] border border-[#FBCFE8] cursor-wait'
                              : isSurf
                              ? 'bg-[#F0F9FF] text-[#0369A1] border border-[#BAE6FD] cursor-wait'
                              : isDragon
                              ? 'bg-[#4a2511] text-[#b45309] border border-[#7f1d1d] cursor-wait'
                              : isFF
                              ? 'bg-[#17335e] text-[#8faada] border border-[#406da3] cursor-wait'
                              : 'bg-[#45413e] text-[#a8a29e] cursor-wait'
                            : isMarcel
                            ? 'bg-[#766594] text-white hover:bg-[#544372]'
                            : isBimbo
                            ? 'bg-[#BE123C] text-white hover:bg-[#9f1239]'
                            : isSurf
                            ? 'bg-[#0284C7] text-white hover:bg-[#0369A1]'
                            : isDragon
                            ? 'bg-[#991b1b] text-[#fcd34d] hover:bg-[#7f1d1d]'
                            : isFF
                            ? 'bg-[#1e3a8a] text-[#f0deba] border border-[#dfc894]/70 hover:bg-[#172554]'
                            : 'bg-[#fffff0] text-[#1c1917] hover:bg-[#e7e5e4]'
                        }`}
                      >
                        {isDownloading ? (
                          <>
                            <div className="w-3 h-3 border-2 border-stone-400 border-t-stone-800 rounded-full animate-spin" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs leading-none">📥</span>
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    )}

                    <div
                      className={`text-[10px] sm:text-[10.5px] font-mono whitespace-nowrap text-center w-full px-0.5 tracking-tight ${
                        isMarcel
                          ? 'text-[#9B8EAE]'
                          : isBimbo
                          ? 'text-[#BE123C]/60'
                          : isSurf
                          ? 'text-[#0EA5E9]/70'
                          : isDragon
                          ? 'text-[#b45309]/80'
                          : isFF
                          ? 'text-[#8faada]/70'
                          : 'text-[#a8a29e] opacity-60'
                      }`}
                    >
                      {(book.format || 'FB2').toUpperCase()} • {book.fileSize}
                      {approxPages > 0 ? ` • ~ ${approxPages} стр.` : ''}
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: METADATA & ANNOTATION */}
                <div className="flex-1 flex flex-col justify-start min-w-0">
                  {/* Title */}
                  <h2
                    className={`text-xl md:text-2xl font-literata font-bold leading-snug tracking-wide mb-1 ${
                      isMarcel
                        ? 'text-[#2F2440]'
                        : isBimbo
                        ? 'text-[#881337]'
                        : isSurf
                        ? 'text-[#0C4A6E]'
                        : isDragon
                        ? 'text-[#fcd34d]'
                        : isFF
                        ? 'text-[#f0deba]'
                        : 'text-[#fffff0]'
                    }`}
                  >
                    {book.title}
                  </h2>

                  {/* Author with year in parentheses */}
                  {(book.author || book.year) && (
                    <p
                      className={`text-sm md:text-base font-literata italic mb-3 ${
                        isMarcel
                          ? 'text-[#766594]'
                          : isBimbo
                          ? 'text-[#BE123C]'
                          : isSurf
                          ? 'text-[#0369A1]'
                          : isDragon
                          ? 'text-[#ea580c]'
                          : isFF
                          ? 'text-[#8faada]'
                          : 'text-[#d6d3d1]'
                      }`}
                    >
                      {book.author}
                      {book.year ? ` (${book.year})` : ''}
                    </p>
                  )}

                  {/* Subtle Divider (only if there is an annotation) */}
                  {paragraphs.length > 0 && (
                    <div
                      className={`w-full h-px mb-3 ${
                        isMarcel
                          ? 'bg-[#C4B5E6]/60'
                          : isBimbo
                          ? 'bg-[#FBCFE8]'
                          : isSurf
                          ? 'bg-[#BAE6FD]'
                          : isDragon
                          ? 'bg-[#7f1d1d]/40'
                          : isFF
                          ? 'bg-[#406da3]/40'
                          : 'bg-[#45413e]/40'
                      }`}
                    />
                  )}

                  {/* Annotation: Small font size, no word 'Аннотация', text-indent 0, justified, with paragraph spacing */}
                  {paragraphs.length > 0 && (
                    <div className="space-y-3">
                      {paragraphs.map((paragraph, pIdx) => (
                        <p
                          key={pIdx}
                          className={`catalog-annotation-p font-literata text-xs sm:text-[13px] md:text-[13.5px] leading-[1.65] text-justify select-text ${
                            isMarcel
                              ? 'text-[#2F2440]/90'
                              : isBimbo
                              ? 'text-[#881337]/90'
                              : isSurf
                              ? 'text-[#0C4A6E]/90'
                              : isDragon
                              ? 'text-[#e8dcc8]/90'
                              : isFF
                              ? 'text-[#d0deef]/90'
                              : 'text-[#d6d3d1]'
                          }`}
                          style={{
                            textIndent: 0,
                            textAlign: 'justify',
                            textJustify: 'inter-word',
                            letterSpacing: '-0.015em',
                            wordSpacing: 'normal',
                            hyphens: 'auto',
                            WebkitHyphens: 'auto'
                          }}
                        >
                          {formatTypography(paragraph)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
