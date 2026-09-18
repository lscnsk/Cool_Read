import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chapter, Bookmark } from '../types';
import { ChevronDown, ChevronRight, Minus } from 'lucide-react';

interface ChapterSidebarProps {
  chapters: Chapter[];
  currentChapterIndex: number;
  onSelectChapter: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
  onSearchResultClick?: (chapterIndex: number, text: string, matchIndex: number) => void;
  onClearHighlight?: () => void;
  showSearch?: boolean; 
  bookTitle?: string;
  bookId?: string;
  appStyle?: string;
  isAudio?: boolean;
}

interface FlatSearchResult {
    chapterIndex: number;
    snippet: string;
    textToFind: string;
    matchIndex: number;
}

// Tree Node helper structure
interface ChapterNode {
    originalIndex: number;
    chapter: Chapter;
    children: ChapterNode[];
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
};

const ChapterSidebar: React.FC<ChapterSidebarProps> = ({
  chapters,
  currentChapterIndex,
  onSelectChapter,
  isOpen,
  onClose,
  onSearchResultClick,
  onClearHighlight,
  showSearch = false,
  bookTitle = "Book",
  bookId,
  appStyle = "Cool",
  isAudio = false
}) => {
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isBookmarksMode, setIsBookmarksMode] = useState(false);
  const [isBookmarkSearchMode, setIsBookmarkSearchMode] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkQuery, setBookmarkQuery] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FlatSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  
  // Tree State
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  const activeItemRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (isOpen && !isBookmarksMode && !isSearchMode) {
        setTimeout(() => {
            activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
  }, [isOpen, currentChapterIndex, isBookmarksMode, isSearchMode]);

  // Reset states when sidebar closes or when in audio mode
  useEffect(() => {
    if (!isOpen || isAudio) {
        setIsSearchMode(false);
        setIsBookmarksMode(false);
        setIsBookmarkSearchMode(false);
        setQuery('');
        setBookmarkQuery('');
        setSearchResults([]);
    }
  }, [isOpen, isAudio]);

  // Load bookmarks when sidebar opens
  useEffect(() => {
    if (isOpen && !isAudio) {
      const storageKey = `cool_read_bookmarks_${bookId || bookTitle}`;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setBookmarks(JSON.parse(saved));
        } else {
          setBookmarks([]);
        }
      } catch (e) {
        setBookmarks([]);
      }
    }
  }, [isOpen, isAudio, bookId, bookTitle]);

  const handleAddBookmark = () => {
    let snippet = '';
    let textToFind = '';

    // 1. Try DOM query for first visible paragraph on user's active screen
    const readerContainer = document.querySelector('.reader-content') || document.querySelector('[data-reader-container]') || document.body;
    const selectors = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';
    const elements = Array.from(readerContainer.querySelectorAll(selectors));

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Phase 1: Look for element that STARTS on current visible page (rect.left >= 5 for paged mode)
    for (const el of elements) {
      const rawText = el.textContent || '';
      const text = rawText
        .replace(/[\u00AD\u200C\u200D\u200E\u200F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < 3) continue;

      const parentTag = el.parentElement?.tagName.toLowerCase();
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'].includes(parentTag || '')) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      const startsOnCurrentPage = rect.left >= 5 && rect.left < viewportWidth - 30;
      const isVerticallyVisible = rect.bottom > 80 && rect.top < viewportHeight - 80;

      if (startsOnCurrentPage && isVerticallyVisible) {
        snippet = text.length > 120 ? text.substring(0, 120) + '...' : text;
        textToFind = text.length > 40 ? text.substring(0, 40) : text;
        break;
      }
    }

    // Phase 2: If no element starts on current page (e.g. multi-page paragraph), extract text actually visible on current page
    if (!snippet) {
      for (const el of elements) {
        const rawText = el.textContent || '';
        const text = rawText
          .replace(/[\u00AD\u200C\u200D\u200E\u200F]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (text.length < 3) continue;

        const parentTag = el.parentElement?.tagName.toLowerCase();
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'].includes(parentTag || '')) continue;

        const rect = el.getBoundingClientRect();
        const isHorizontallyOnScreen = rect.right > 50 && rect.left < viewportWidth - 20;
        const isVerticallyOnScreen = rect.bottom > 80 && rect.top < viewportHeight - 80;

        if (isHorizontallyOnScreen && isVerticallyOnScreen) {
          let visibleStartChar = 0;
          if (rect.left < 0 && rect.width > 0) {
            const offsetRatio = Math.min(0.9, Math.abs(rect.left) / rect.width);
            visibleStartChar = Math.floor(text.length * offsetRatio);
          }

          const visibleText = text.substring(visibleStartChar).trim();
          if (visibleText.length >= 3) {
            snippet = visibleText.length > 120 ? visibleText.substring(0, 120) + '...' : visibleText;
            textToFind = visibleText.length > 40 ? visibleText.substring(0, 40) : visibleText;
            break;
          }
        }
      }
    }

    // Fallback to current chapter content
    if (!snippet && chapters[currentChapterIndex]?.content) {
      const raw = chapters[currentChapterIndex].content!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (raw) {
        snippet = raw.length > 120 ? raw.substring(0, 120) + '...' : raw;
        textToFind = raw.length > 40 ? raw.substring(0, 40) : raw;
      }
    }

    // Ultimate fallback
    const chName = chapters[currentChapterIndex]?.name || `Chapter ${currentChapterIndex + 1}`;
    if (!snippet) {
      snippet = chName;
      textToFind = chName;
    }

    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      chapterIndex: currentChapterIndex,
      chapterName: chName,
      snippet,
      textToFind,
      createdAt: Date.now()
    };

    const updated = [newBookmark, ...bookmarks];
    setBookmarks(updated);

    const storageKey = `cool_read_bookmarks_${bookId || bookTitle}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save bookmarks', e);
    }
  };

  const handleDeleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = bookmarks.filter(b => b.id !== id);
    setBookmarks(updated);
    const storageKey = `cool_read_bookmarks_${bookId || bookTitle}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save bookmarks after delete', err);
    }
  };

  const formatBookmarkDate = (timestamp: number): string => {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}, ${hours}:${minutes}`;
  };

  const filteredBookmarks = useMemo(() => {
    if (!bookmarkQuery.trim()) return bookmarks;
    const q = bookmarkQuery.toLowerCase().trim();
    return bookmarks.filter(bm => 
      (bm.chapterName && bm.chapterName.toLowerCase().includes(q)) ||
      (bm.snippet && bm.snippet.toLowerCase().includes(q)) ||
      (bm.textToFind && bm.textToFind.toLowerCase().includes(q))
    );
  }, [bookmarks, bookmarkQuery]);

  // Automatic search debounce when typing
  useEffect(() => {
    if (!isSearchMode || !query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      const results: FlatSearchResult[] = [];
      const tagRegex = /<[^>]*>/g;
      const invisibleCharsRegex = /[\u00AD\u200C\u200D\u200E\u200F]/g;
      const htmlEntityRegex = /&shy;|&#173;|&#xAD;/gi;
      const lowerQuery = query.toLowerCase();

      for (let idx = 0; idx < chapters.length; idx++) {
          const ch = chapters[idx];
          if (!ch.content) continue;

          let text = ch.content.replace(tagRegex, ' ');
          text = text.replace(htmlEntityRegex, '').replace(invisibleCharsRegex, '');
          text = text.replace(/\s+/g, ' ');
          
          const lowerText = text.toLowerCase();
          let pos = 0;
          let localMatchCount = 0;

          while (pos < lowerText.length) {
              const found = lowerText.indexOf(lowerQuery, pos);
              if (found === -1) break;

              const start = Math.max(0, found - 30);
              const end = Math.min(text.length, found + query.length + 30);
              const snippet = "..." + text.substring(start, end) + "...";

              const lastResult = results[results.length - 1];
              const isDuplicate = lastResult && 
                                  lastResult.chapterIndex === idx && 
                                  Math.abs(lastResult.matchIndex - localMatchCount) <= 1 &&
                                  lastResult.snippet === snippet;

              if (!isDuplicate) {
                  results.push({ 
                      chapterIndex: idx,
                      snippet,
                      textToFind: query,
                      matchIndex: localMatchCount 
                  });
              }

              localMatchCount++;
              pos = found + query.length;
              if (results.length > 500) break; 
          }
          if (results.length > 500) break;
      }
      setSearchResults(results);
      setIsSearching(false);
      setVisibleCount(5);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isSearchMode, chapters]);

  // Automatically expand parents and active node if it has children when sidebar is open or index changes
  useEffect(() => {
    if (isOpen && currentChapterIndex >= 0 && chapters && chapters.length > 0) {
      const ancestors: number[] = [];
      let curr = currentChapterIndex;
      while (curr >= 0) {
        const currLevel = chapters[curr]?.level || 0;
        if (currLevel === 0) break;
        let parentIdx = -1;
        for (let p = curr - 1; p >= 0; p--) {
          if ((chapters[p]?.level || 0) < currLevel) {
            parentIdx = p;
            break;
          }
        }
        if (parentIdx !== -1) {
          ancestors.push(parentIdx);
          curr = parentIdx;
        } else {
          break;
        }
      }
      
      const hasChildren = currentChapterIndex < chapters.length - 1 && 
                          (chapters[currentChapterIndex + 1]?.level || 0) > (chapters[currentChapterIndex]?.level || 0);
      if (hasChildren) {
          ancestors.push(currentChapterIndex);
      }
      
      setExpandedIndices(prev => {
        const next = new Set(prev);
        ancestors.forEach(idx => next.add(idx));
        return next;
      });
    }
  }, [isOpen, currentChapterIndex, chapters]);

  // Build Tree Structure from Flat List
  // Assumes strictly sequential levels (e.g., L0 -> L1 -> L1 -> L0)
  const chapterTree = useMemo(() => {
      const roots: ChapterNode[] = [];
      const stack: { node: ChapterNode, level: number }[] = [];

      const isPdfWithHeaders = chapters.some(ch => ch.isHeader);

      chapters.forEach((chapter, index) => {
          if (isPdfWithHeaders && !chapter.isHeader) {
              return;
          }

          // Default level 0 if undefined
          const level = chapter.level || 0;
          const node: ChapterNode = { originalIndex: index, chapter, children: [] };

          if (stack.length === 0) {
              roots.push(node);
              stack.push({ node, level });
          } else {
              // Pop stack until we find the parent (level < current level)
              while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                  stack.pop();
              }

              if (stack.length === 0) {
                  roots.push(node);
                  stack.push({ node, level });
              } else {
                  // Add as child to the current top of stack
                  stack[stack.length - 1].node.children.push(node);
                  stack.push({ node, level });
              }
          }
      });
      return roots;
  }, [chapters]);

  const toggleExpand = (originalIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(expandedIndices);
      if (newSet.has(originalIndex)) {
          newSet.delete(originalIndex);
      } else {
          newSet.add(originalIndex);
      }
      setExpandedIndices(newSet);
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setVisibleCount(5);

    setTimeout(() => {
        const results: FlatSearchResult[] = [];
        const tagRegex = /<[^>]*>/g;
        const invisibleCharsRegex = /[\u00AD\u200C\u200D\u200E\u200F]/g;
        const htmlEntityRegex = /&shy;|&#173;|&#xAD;/gi;
        const lowerQuery = query.toLowerCase();

        for (let idx = 0; idx < chapters.length; idx++) {
            const ch = chapters[idx];
            if (!ch.content) continue;

            let text = ch.content.replace(tagRegex, ' ');
            text = text.replace(htmlEntityRegex, '').replace(invisibleCharsRegex, '');
            text = text.replace(/\s+/g, ' ');
            
            const lowerText = text.toLowerCase();
            let pos = 0;
            let localMatchCount = 0;

            while (pos < lowerText.length) {
                const found = lowerText.indexOf(lowerQuery, pos);
                if (found === -1) break;

                const start = Math.max(0, found - 30);
                const end = Math.min(text.length, found + query.length + 30);
                const snippet = "..." + text.substring(start, end) + "...";

                // Deduplication check:
                // If the last result was from the same chapter and has a very similar snippet, skip it.
                // This helps mask duplicate content from nested parsing issues.
                const lastResult = results[results.length - 1];
                const isDuplicate = lastResult && 
                                    lastResult.chapterIndex === idx && 
                                    Math.abs(lastResult.matchIndex - localMatchCount) <= 1 &&
                                    lastResult.snippet === snippet;

                if (!isDuplicate) {
                    results.push({ 
                        chapterIndex: idx,
                        snippet,
                        textToFind: query,
                        matchIndex: localMatchCount 
                    });
                }

                localMatchCount++;
                pos = found + query.length;
                if (results.length > 500) break; 
            }
             if (results.length > 500) break;
        }
        setSearchResults(results);
        setIsSearching(false);
    }, 100);
  };

  const showMore = () => setVisibleCount(p => p + 5);

  const toggleBookmarksMode = () => {
    if (isAudio) return;
    if (isBookmarksMode) {
      setIsBookmarksMode(false);
    } else {
      setIsBookmarksMode(true);
      setIsSearchMode(false);
      setQuery('');
      setSearchResults([]);
    }
  };

  const toggleSearchMode = () => {
      if (isSearchMode) {
          setIsSearchMode(false);
          setQuery('');
          setSearchResults([]);
          if (onClearHighlight) onClearHighlight();
      } else {
          setIsSearchMode(true);
          setIsBookmarksMode(false);
      }
  };

  // Recursive Renderer
  const renderTree = (nodes: ChapterNode[]) => {
      return (
          <ul className="space-y-1">
              {nodes.map((node) => {
                  const isActive = node.originalIndex === currentChapterIndex;
                  const hasChildren = node.children.length > 0;
                  const isExpanded = expandedIndices.has(node.originalIndex);
                  
                  // Logic to replace "Cover" with book title in TOC
                  const displayName = (node.originalIndex === 0 && node.chapter.name === "Cover")
                      ? bookTitle
                      : node.chapter.name;
                  
                  return (
                      <li key={node.originalIndex} className="select-none" ref={isActive ? activeItemRef : null}>
                          <div className="flex items-stretch gap-1">
                              <button
                                  onClick={() => {
                                      onSelectChapter(node.originalIndex);
                                      onClose();
                                  }}
                                  className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-all flex items-start gap-3 overflow-hidden ${
                                      isActive 
                                      ? (appStyle === 'Bimbo' ? 'bg-white text-[#BE123C] shadow-sm border border-[#FBCFE8]' : 'bg-[#45413e] text-[#fffff0] shadow-sm border border-[#57534e]') 
                                      : (appStyle === 'Bimbo' ? 'text-[#BE123C]/70 hover:bg-white/50 hover:text-[#BE123C] border border-transparent' : 'text-[#888] hover:bg-[#363330] hover:text-[#ddd] border border-transparent')
                                  }`}
                                  style={{ paddingLeft: `${(node.chapter.level || 0) * 8 + 12}px` }} 
                              >
                                  <span className={`text-xs mt-0.5 shrink-0 ${isActive ? 'text-[#fffff0]' : 'opacity-30'}`}>
                                      {isActive ? "🔖" : <Minus size={10} className="mt-1"/>}
                                  </span>
                                  <span className="flex-1 text-xs leading-snug line-clamp-2 break-words">
                                      {displayName}
                                  </span>
                              </button>

                              {hasChildren && (
                                  <button 
                                      onClick={(e) => toggleExpand(node.originalIndex, e)}
                                      className={`px-2 rounded-md flex items-center justify-center hover:bg-[#363330] transition-colors ${isExpanded ? 'text-[#fffff0]' : 'text-[#555]'}`}
                                  >
                                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </button>
                              )}
                          </div>
                          
                          {/* Nested Children */}
                          {hasChildren && isExpanded && (
                              <div className="border-l border-[#45413e] mt-1 ml-2">
                                  {renderTree(node.children)}
                              </div>
                          )}
                      </li>
                  );
              })}
          </ul>
      );
  };

  return (
    <div 
      className={`fixed inset-y-0 right-0 z-40 w-80 max-w-full bg-[#2c2a28] border-l border-[#45413e] transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } bimbo-sidebar`}
    >
      <div className={`border-b border-[#45413e] bg-[#23211f] shrink-0 h-20 flex justify-between items-center px-4 gap-1 relative`}>
        {isBookmarksMode && isBookmarkSearchMode ? (
            <div className="flex-1 flex items-center min-w-0 mr-1">
                <span className="text-2xl cursor-default select-none mr-2">🔍</span>
                <input 
                    autoFocus
                    className="flex-1 min-w-0 bg-[#2c2a28] border border-[#45413e] rounded px-3 py-2 text-sm text-[#fffff0] placeholder-[#888] focus:outline-none focus:border-[#57534e]"
                    placeholder="Search..."
                    value={bookmarkQuery}
                    onChange={(e) => setBookmarkQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLElement)?.blur();
                      }
                    }}
                />
            </div>
        ) : isSearchMode && showSearch ? (
            <div className="flex-1 flex items-center min-w-0 mr-1">
                <span className="text-2xl cursor-default select-none mr-2">🔍</span>
                <input 
                    autoFocus
                    className="flex-1 min-w-0 bg-[#2c2a28] border border-[#45413e] rounded px-3 py-2 text-sm text-[#fffff0] placeholder-[#888] focus:outline-none focus:border-[#57534e]"
                    placeholder="Search..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLElement)?.blur();
                      }
                    }}
                />
            </div>
        ) : (
             <h2 className="text-xl font-bold flex items-center gap-1.5 text-[#fffff0] truncate min-w-0 flex-1">
                <span className="text-3xl leading-none shrink-0 emoji">
                    {isBookmarksMode ? '🔖' : (appStyle === 'Marcel' ? '🪻' : appStyle === 'Dragon' ? '🏰' : (appStyle === 'Final' || appStyle === 'Final Fantasy' ? '📜' : (appStyle === 'Bimbo' ? '💎' : (appStyle === 'Surf' ? '🐚' : '📖'))))}
                </span>
                <span className={`leading-normal whitespace-nowrap ${appStyle === 'Marcel' ? 'font-marcel font-medium text-[26px] tracking-wide translate-y-[1px]' : appStyle === 'Bimbo' ? 'font-bimbo font-medium text-[26px] tracking-wide translate-y-[1px]' : (appStyle === 'Surf' ? 'font-surf font-medium text-[28px] tracking-wide translate-y-[1px]' : (appStyle === 'Final' || appStyle === 'Final Fantasy' ? 'font-ff font-semibold text-[21px] tracking-wider translate-y-[1px]' : (appStyle === 'Dragon' ? 'font-dragon font-medium text-[22px] tracking-wide text-[#fffff0] translate-y-[1px]' : 'font-literata font-bold text-[22px] tracking-wide')))}`}>
                    {isBookmarksMode ? 'Bookmarks' : 'Chapters'}
                </span>
             </h2>
        )}
        <div className="flex items-center gap-0 shrink-0">
          {isBookmarksMode && !isBookmarkSearchMode && (
            <button 
               onClick={() => {
                 if (isBookmarkSearchMode) {
                   setIsBookmarkSearchMode(false);
                   setBookmarkQuery('');
                 } else {
                   setIsBookmarkSearchMode(true);
                 }
               }} 
               className={`text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0 ${isBookmarkSearchMode ? 'text-[#fffff0] scale-110' : ''}`}
               title="Search bookmarks"
            >
               <span className="text-2xl leading-none emoji">🔍</span>
            </button>
          )}
          {!isAudio && !isBookmarksMode && !isSearchMode && (
            <button 
               onClick={toggleBookmarksMode} 
               className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
               title="Bookmarks"
            >
               <span className="text-2xl leading-none emoji">🔖</span>
            </button>
          )}
          {showSearch && !isSearchMode && !isBookmarksMode && (
              <button 
                 onClick={toggleSearchMode} 
                 className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
                 title="Search"
              >
                 <span className="text-2xl leading-none emoji">🔍</span>
              </button>
          )}
          <button 
             onClick={() => {
               if (isBookmarksMode && isBookmarkSearchMode) {
                 setIsBookmarkSearchMode(false);
                 setBookmarkQuery('');
               } else if (isSearchMode && showSearch) {
                 toggleSearchMode();
               } else if (isBookmarksMode) {
                 setIsBookmarkSearchMode(false);
                 setBookmarkQuery('');
                 toggleBookmarksMode();
               } else {
                 onClose();
               }
             }} 
             className="text-[#888] hover:text-[#fffff0] p-0.5 hover:scale-110 transition-transform shrink-0"
             title="Close"
          >
             <span className="text-2xl leading-none emoji">❌</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scroll">
        {isBookmarksMode ? (
            <div className="space-y-3 pb-10 pt-2 px-1">
                {!isBookmarkSearchMode && !bookmarkQuery && (
                  <button 
                    onClick={handleAddBookmark}
                    className={`w-full py-4 px-4 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-1.5 group ${
                      appStyle === 'Marcel' 
                        ? 'border-[#C4B5E6] bg-[#E8E0F5]/50 text-[#544372] hover:bg-[#DBD0EF] hover:text-[#111111] hover:border-[#AC97D7]' 
                        : appStyle === 'Bimbo' 
                        ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' 
                        : appStyle === 'Surf' 
                        ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' 
                        : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'
                    }`}
                  >
                    <span className="text-3xl group-hover:scale-110 transition-transform emoji">➕</span>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-bold uppercase tracking-widest">Add bookmark</span>
                    </div>
                  </button>
                )}

                {bookmarkQuery && filteredBookmarks.length === 0 && (
                    <div className="text-center text-[#777] py-8 text-sm font-normal">nothing</div>
                )}

                {filteredBookmarks.length > 0 && (
                    <div className="space-y-2 mt-3">
                        {filteredBookmarks.map((bm) => (
                            <div
                                key={bm.id}
                                onClick={() => {
                                    if (onSearchResultClick) {
                                        onSearchResultClick(bm.chapterIndex, bm.textToFind, 0);
                                    } else {
                                        onSelectChapter(bm.chapterIndex);
                                    }
                                    onClose();
                                }}
                                className={`p-3 rounded-lg cursor-pointer transition-all border relative group ${
                                    appStyle === 'Bimbo'
                                        ? 'bg-white/80 hover:bg-white text-[#BE123C] border-[#FBCFE8]'
                                        : appStyle === 'Surf'
                                        ? 'bg-white/80 hover:bg-white text-[#0C4A6E] border-[#BAE6FD]'
                                        : appStyle === 'Marcel'
                                        ? 'bg-[#F3EFFB] hover:bg-[#EAE4F7] text-[#2F2440] border-[#C4B5E6]'
                                        : 'bg-[#363330] hover:bg-[#45413e] text-[#d6d3d1] border-transparent'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-xs font-bold truncate opacity-90 flex items-center gap-1">
                                        <span>🔖</span>
                                        <span>{bm.chapterName}</span>
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-[10px] opacity-50">
                                            {formatBookmarkDate(bm.createdAt)}
                                        </span>
                                        <button
                                            onClick={(e) => handleDeleteBookmark(bm.id, e)}
                                            className="p-1 rounded text-[#666] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                                            title="Delete"
                                        >
                                            <span className="text-sm">🗑️</span>
                                        </button>
                                    </div>
                                </div>
                                {bm.snippet && (
                                    <p className="text-xs italic leading-snug opacity-80 line-clamp-2 font-serif">
                                        "{bm.snippet}"
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ) : isSearchMode && showSearch ? (
            <div className="space-y-3 pb-10 pt-2">
                {isSearching && <div className="text-center text-[#666] py-10">Searching...</div>}
                {!isSearching && searchResults.length === 0 && query && (
                   <div className="text-center text-[#777] py-8 text-sm font-normal">nothing</div>
                )}
                {searchResults.slice(0, visibleCount).map((res, i) => (
                    <div 
                        key={i} 
                        onClick={() => { if(onSearchResultClick) onSearchResultClick(res.chapterIndex, res.textToFind, res.matchIndex); }}
                        className="bg-[#363330] p-3 rounded cursor-pointer hover:bg-[#45413e] border border-transparent active:scale-[0.98] transition-all mb-2"
                    >
                        <div className="text-sm text-[#d6d3d1] leading-snug font-serif">
                            {res.snippet.split(new RegExp(`(${escapeRegExp(query)})`, 'gi')).map((part, idx) => 
                                part.toLowerCase() === query.toLowerCase() 
                                ? <span key={idx} className="text-[#fcd34d] font-bold bg-[#fcd34d]/10 rounded-sm px-0.5">{part}</span> 
                                : part
                            )}
                        </div>
                    </div>
                ))}
                {!isSearching && visibleCount < searchResults.length && (
                   <button onClick={showMore} className="w-full mt-4 py-3 bg-[#363330] text-[#888] hover:text-white rounded flex items-center justify-center gap-2">
                       <span>Load more</span><ChevronDown size={16} />
                   </button>
               )}
            </div>
        ) : (
            <div className="pb-10">
                {renderTree(chapterTree)}
            </div>
        )}
      </div>
    </div>
  );
};

export default ChapterSidebar;