import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { CatalogBook, formatTypography, getApproximatePageCount } from '../data/catalogData';
import { Book } from '../types';
import { SmartCoverImage } from './SmartCoverImage';

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
  onOpenFilterSidebar?: () => void;
}

// Render text with punctuation cluster styling for !.. and ?..
function renderFormattedAnnotation(text: string): React.ReactNode {
  const formatted = formatTypography(text);
  const regex = /([!?]+)(\.{2,})/g;
  if (!regex.test(formatted)) {
    return formatted;
  }
  regex.lastIndex = 0;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(formatted)) !== null) {
    const matchStart = match.index;
    const markChar = match[1];
    const dotsChar = match[2];
    if (matchStart > lastIndex) {
      elements.push(formatted.substring(lastIndex, matchStart));
    }
    const lastMark = markChar.charAt(markChar.length - 1);
    elements.push(
      <span key={`punct-${matchStart}`} className="punct-cluster">
        {markChar}
        <span className={lastMark === '?' ? 'punct-dots-after-quest' : 'punct-dots-after-excl'}>
          {dotsChar}
        </span>
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < formatted.length) {
    elements.push(formatted.substring(lastIndex));
  }
  return elements;
}

export const CatalogView: React.FC<CatalogViewProps> = React.memo(({
  books,
  libraryBooks,
  currentFilter,
  onResetFilter,
  onDownloadBook,
  onReadBook,
  downloadingIds,
  appStyle = 'Cool',
  isLoading = false,
  onRefresh,
  onOpenFilterSidebar
}) => {
  const catalogContainerRef = useRef<HTMLDivElement>(null);

  // Check which catalog books are already in user's library
  const getMatchingLibraryBook = (catalogBook: CatalogBook): Book | undefined => {
    return libraryBooks.find(libBook => {
      if ((libBook as any).catalogId && (libBook as any).catalogId === catalogBook.id) return true;
      const cleanLibTitle = (libBook.title || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
      const cleanCatTitle = (catalogBook.title || '').toLowerCase().trim();
      if (!cleanLibTitle || !cleanCatTitle) return false;
      return cleanLibTitle === cleanCatTitle || cleanLibTitle.includes(cleanCatTitle) || cleanCatTitle.includes(cleanLibTitle);
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

    let animFrameId: number;
    const sharedRange = document.createRange();

    const optimizeCatalogTypography = () => {
      const paragraphs = Array.from(container.querySelectorAll<HTMLElement>('.catalog-annotation-p'));
      if (!paragraphs.length) return;

      const winHeight = window.innerHeight || 800;
      const vBuffer = 800; // Vertical buffer zone in pixels

      const visibleParagraphs = paragraphs.filter((p) => {
        const text = p.textContent ? p.textContent.trim() : '';
        if (text.length < 15) return false;
        if (p.dataset.microtypedCatalog === 'true') return false;

        const rect = p.getBoundingClientRect();
        return rect.bottom >= -vBuffer && rect.top <= winHeight + vBuffer;
      });

      if (!visibleParagraphs.length) return;

      const getMaxSpaceInParagraph = (p: HTMLElement): number => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
        let tn: Text | null;
        let maxW = 0;
        while ((tn = walker.nextNode() as Text | null)) {
          const text = tn.nodeValue;
          if (!text || !text.includes(' ')) continue;
          for (let i = 0; i < text.length; i++) {
            if (text[i] === ' ') {
              try {
                sharedRange.setStart(tn, i);
                sharedRange.setEnd(tn, i + 1);
                const rects = sharedRange.getClientRects();
                if (rects.length > 0 && rects[0].width > maxW) {
                  maxW = rects[0].width;
                }
              } catch {
                // Ignore detached or out-of-sync ranges
              }
            }
          }
        }
        return maxW;
      };

      const candidates = ['-0.012em', '-0.020em', '-0.028em', '-0.035em', '-0.006em', '-0.042em', '-0.016em', '-0.048em'];

      visibleParagraphs.forEach((p) => {
        p.style.removeProperty('letter-spacing');
        const initialMax = getMaxSpaceInParagraph(p);
        const computedFs = parseFloat(window.getComputedStyle(p).fontSize) || 16;
        const wordSpaceThreshold = Math.max(3.2, computedFs * 0.18);
        const targetWordSpace = Math.max(2.6, computedFs * 0.15);

        if (initialMax > wordSpaceThreshold) {
          let bestLs = '0em';
          let lowestMax = initialMax;

          for (const cand of candidates) {
            p.style.setProperty('letter-spacing', cand, 'important');
            const curMax = getMaxSpaceInParagraph(p);
            if (curMax < lowestMax) {
              lowestMax = curMax;
              bestLs = cand;
              if (curMax <= targetWordSpace) break;
            }
          }

          if (bestLs !== '0em') {
            p.style.setProperty('letter-spacing', bestLs, 'important');
          } else {
            p.style.removeProperty('letter-spacing');
          }
        }

        p.dataset.microtypedCatalog = 'true';
      });
    };

    const scheduleOpt = () => {
      cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(optimizeCatalogTypography);
    };

    scheduleOpt();

    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      // Reset microtype tags on resize
      container.querySelectorAll<HTMLElement>('.catalog-annotation-p').forEach((p) => {
        delete p.dataset.microtypedCatalog;
      });
      resizeTimer = setTimeout(scheduleOpt, 150);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', scheduleOpt, { passive: true });
    container.addEventListener('scroll', scheduleOpt, { passive: true });

    return () => {
      cancelAnimationFrame(animFrameId);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', scheduleOpt);
      container.removeEventListener('scroll', scheduleOpt);
    };
  }, [books, currentFilter]);

  return (
    <div
      ref={catalogContainerRef}
      className="flex-1 w-full h-full overflow-y-auto scrollbar-hide px-4 md:px-8 pt-24 pb-20 relative"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header: Centered lowercase lscnsk styled according to current appStyle */}
        <div
          className={`mb-6 pb-2 border-b relative flex items-center justify-between min-h-[38px] ${
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
          {/* Left placeholder to balance flex header */}
          <div className="flex items-center gap-2 z-10" />

          {/* Center Brand - Absolutely Centered */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`lowercase select-none text-center pointer-events-auto font-literata font-bold text-sm md:text-base tracking-widest ${
                isMarcel
                  ? 'text-[#544372]'
                  : isBimbo
                  ? 'text-[#BE123C]'
                  : isSurf
                  ? 'text-[#0284C7]'
                  : isDragon
                  ? 'text-[#fcd34d]'
                  : isFF
                  ? 'text-[#dfc894]'
                  : 'text-[#a8a29e]/80'
              }`}
            >
              lscnsk
            </span>
          </div>

          {/* Right placeholder to keep layout balanced */}
          <div className="flex items-center gap-1 z-10" />
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
                <p className="text-base font-medium">Ничего не найдено</p>
                <button
                  onClick={onResetFilter}
                  className="text-xs underline mt-2 inline-block opacity-80 hover:opacity-100"
                >
                  Сбросить фильтр
                </button>
              </div>
            ) : (
              <>
                <p className="text-base">Каталог пуст или обновляется</p>
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="text-xs px-3 py-1.5 rounded border mt-2 inline-block opacity-80 hover:opacity-100"
                  >
                    Проверить репозиторий
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Books List: 2-column layout */}
        <div className="space-y-8 md:space-y-10">
          {books.map((book) => {
            const matchingLibBook = getMatchingLibraryBook(book);
            const onShelf = Boolean(matchingLibBook);
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
                {/* COLUMN 1: COVER & DOWNLOAD/READ BUTTON */}
                <div className="w-full flex flex-col items-center sm:items-start">
                  {/* Book Cover */}
                  {book.coverUrl ? (
                    <div className="w-40 sm:w-full max-w-[210px] h-auto select-none block">
                      <SmartCoverImage
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-full h-auto rounded-lg shadow-lg border border-white/10 select-none block"
                        fallbackComponent={
                          <div
                            className={`w-full aspect-[2/3] rounded-lg shadow-lg bg-gradient-to-br ${
                              book.coverBg || 'from-[#2a2421] to-[#171412]'
                            } p-3.5 flex flex-col justify-between relative border border-white/10 overflow-hidden select-none group`}
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-white/20 via-white/5 to-transparent pointer-events-none z-10" />
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
                            <div className="text-center border-t border-white/10 pt-1.5 flex items-center justify-center font-mono text-[9px] opacity-60 text-[#fffff0]">
                              <span className="font-bold tracking-widest uppercase">lscnsk</span>
                            </div>
                          </div>
                        }
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-40 sm:w-full aspect-[2/3] max-w-[210px] rounded-lg shadow-lg bg-gradient-to-br ${
                        book.coverBg || 'from-[#2a2421] to-[#171412]'
                      } p-3.5 flex flex-col justify-between relative border border-white/10 overflow-hidden select-none group`}
                    >
                      {/* Spine highlight overlay */}
                      <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-white/20 via-white/5 to-transparent pointer-events-none z-10" />

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
                    </div>
                  )}

                  {/* Action button below cover */}
                  <div className="w-40 sm:w-full max-w-[210px] mt-3.5 flex flex-col items-center gap-1.5">
                    {onShelf ? (
                      <button
                        onClick={() => onReadBook(book)}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-mono font-medium tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                          isMarcel
                            ? 'bg-[#E8E0F5] border border-[#C4B5E6] text-[#544372] hover:bg-[#DBD0EF]'
                            : isBimbo
                            ? 'bg-pink-100/90 border border-pink-300 text-[#881337] hover:bg-pink-200'
                            : isSurf
                            ? 'bg-sky-100/90 border border-sky-300 text-[#0C4A6E] hover:bg-sky-200'
                            : isDragon
                            ? 'bg-[#450a0a] border border-[#991b1b] text-[#fcd34d] hover:bg-[#5a0d0d]'
                            : isFF
                            ? 'bg-[#0b1d3a] border border-[#dfc894] text-[#dfc894] hover:bg-[#132a4e]'
                            : 'bg-[#363330] border border-[#45413e] text-[#fffff0] hover:bg-[#45413e]'
                        }`}
                        title="Открыть книгу в читалке"
                      >
                        <span>📖</span>
                        <span>Read</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onDownloadBook(book)}
                        disabled={isDownloading}
                        className={`w-full py-2 px-3 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                          isDownloading
                            ? 'bg-white/80 text-stone-500 border border-stone-300 cursor-wait'
                            : isMarcel
                            ? 'bg-[#544372] text-white hover:bg-[#413459]'
                            : isBimbo
                            ? 'bg-[#BE123C] text-white hover:bg-[#9F1239]'
                            : isSurf
                            ? 'bg-[#0284C7] text-white hover:bg-[#0369A1]'
                            : isDragon
                            ? 'bg-[#7f1d1d] text-[#fcd34d] border border-[#991b1b] hover:bg-[#991b1b]'
                            : isFF
                            ? 'bg-[#17335e] text-[#dfc894] border border-[#406da3] hover:bg-[#20447c]'
                            : 'bg-[#45413e] text-[#fffff0] border border-[#57534e] hover:bg-[#57534e]'
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
                      className={`text-[9.5px] sm:text-[10px] md:text-[10.5px] font-literata whitespace-nowrap flex items-center justify-center text-center w-full px-0 gap-1.5 sm:gap-2 ${
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
                          : 'text-[#a8a29e] opacity-70'
                      }`}
                      style={{ letterSpacing: '0.01em' }}
                    >
                      <span>{(book.format || 'FB2').toUpperCase()}</span>
                      <span className="opacity-40">•</span>
                      <span>{book.fileSize}</span>
                      {approxPages > 0 && (
                        <>
                          <span className="opacity-40">•</span>
                          <span>~{approxPages} стр.</span>
                        </>
                      )}
                      <span className="opacity-40">•</span>
                      <span>16+</span>
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

                  {/* Subtle Divider */}
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

                  {/* Annotation */}
                  {paragraphs.length > 0 && (
                    <div className="space-y-0.5">
                      {paragraphs.map((paragraph, pIdx) => (
                        <p
                          key={pIdx}
                          className={`catalog-annotation-p font-literata text-xs sm:text-[13px] md:text-[13.5px] leading-[1.5] text-justify select-text ${
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
                            textIndent: pIdx === 0 ? 0 : '1.25em',
                            textAlign: 'justify',
                            textJustify: 'inter-word',
                            letterSpacing: '-0.015em',
                            wordSpacing: 'normal',
                            hyphens: 'auto',
                            WebkitHyphens: 'auto',
                            marginTop: pIdx === 0 ? 0 : '0.15rem'
                          }}
                        >
                          {renderFormattedAnnotation(paragraph)}
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
});
