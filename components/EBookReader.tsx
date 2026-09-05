import { useRsvp } from '../hooks/useRsvp';
import React, { useEffect, useRef, useState } from 'react';
import { Book } from '../types';
import { ChevronLeft, ChevronRight, Play, Pause, ZoomIn, ZoomOut, Plus, Minus, SkipForward } from 'lucide-react';
import { getFontFamilyCSS } from '../utils/fonts';
// @ts-ignore
import Hypher from 'hypher';
// @ts-ignore
import ruPattern from 'hyphenation.ru';
// @ts-ignore
import enPattern from 'hyphenation.en-us';

function shouldSkipBionic(node: Node): boolean {
  let parent = node.parentNode;
  while (parent && parent.nodeName !== 'BODY') {
    const name = parent.nodeName.toLowerCase();
    if (
      name === 'pre' || 
      name === 'code' || 
      name === 'script' || 
      name === 'style' || 
      name === 'svg' || 
      name === 'b' || 
      name === 'strong' ||
      name === 'h1' ||
      name === 'h2' ||
      name === 'h3' ||
      name === 'h4' ||
      name === 'h5' ||
      name === 'h6'
    ) {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

function createBionicFragment(text: string, document: Document): DocumentFragment {
  const fragment = document.createDocumentFragment();
  // Include soft hyphen (\xad) character in the word regex so hyphenated word syllables are matched as part of a single word
  const wordRegex = /[\p{L}\p{N}\xad]+/gu;
  let lastIndex = 0;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    const word = match[0];

    if (matchIndex > lastIndex) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
    }

    // Count physical characters (ignoring soft hyphens) to determine split point
    let realLen = 0;
    for (let i = 0; i < word.length; i++) {
      if (word.charCodeAt(i) !== 173) {
        realLen++;
      }
    }

    let boldPart = "";
    let regularPart = "";

    if (realLen === 0) {
      regularPart = word;
    } else {
      const boldLen = realLen <= 3 ? Math.max(1, realLen - 1) : Math.ceil(realLen * 0.5);
      let boldCharCount = 0;
      let splitIndex = 0;
      for (let i = 0; i < word.length; i++) {
        if (word.charCodeAt(i) !== 173) {
          boldCharCount++;
        }
        if (boldCharCount === boldLen) {
          splitIndex = i + 1;
          break;
        }
      }
      boldPart = word.substring(0, splitIndex);
      regularPart = word.substring(splitIndex);
    }

    if (boldPart) {
      const b = document.createElement('b');
      b.className = 'font-bold';
      b.textContent = boldPart;
      fragment.appendChild(b);
    }

    if (regularPart) {
      fragment.appendChild(document.createTextNode(regularPart));
    }

    lastIndex = wordRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  return fragment;
}

interface EBookReaderProps {
  book: Book;
  currentChapterIndex: number;
  initialProgressRatio: number;
  fontSize: number;
  theme: 'dark' | 'light';
  uiVisible: boolean;
  onToggleUI: () => void;
  onProgressUpdate: (ratio: number) => void;
  onChapterChange: (index: number, align: 'start' | 'end') => void;
  highlightText?: string;
  highlightMatchIndex?: number;
  onHighlightClear?: () => void;
  isStyledMode: boolean;
  onImageClick: (src: string) => void;
  onExternalLinkClick?: (href: string) => void;
  appStyle?: string;
  isBionic?: boolean;
  isRsvpMode?: boolean;
  rsvpWpm?: number;
  onRsvpWpmChange?: (wpm: number) => void;
  isPagedMode?: boolean;
  onTogglePagedMode?: () => void;
  readerFont?: string;
}

const EBookReader: React.FC<EBookReaderProps> = ({
  book,
  currentChapterIndex: propChapterIndex,
  initialProgressRatio,
  fontSize,
  theme,
  uiVisible,
  onToggleUI,
  onProgressUpdate,
  onChapterChange,
  highlightText,
  highlightMatchIndex = -1,
  onHighlightClear,
  isStyledMode,
  onImageClick,
  onExternalLinkClick,
  appStyle,
  isBionic = false,
  isRsvpMode = false,
  rsvpWpm = 300,
  onRsvpWpmChange,
  isPagedMode = false,
  onTogglePagedMode,
  readerFont = 'Literata'
}) => {
  const readerFontCSS = getFontFamilyCSS(readerFont);
  const containerRef = useRef<HTMLDivElement>(null);
  const chapter = book.chapters[propChapterIndex];
  
  const [processedContent, setProcessedContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const contentRestoredRef = useRef(false);
  const isCoverPage = propChapterIndex === 0 && chapter.name === "Cover";

  // Paged Reading Mode State
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pagedContainerRef = useRef<HTMLDivElement>(null);
  const pagedContentRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isDraggingRef = useRef(false);

  const currentChapterTitle = React.useMemo(() => {
    const raw = book?.chapters?.[propChapterIndex]?.name || '';
    return raw.replace(/<[^>]*>/g, '').trim();
  }, [book, propChapterIndex]);

  const { globalCurrentPage, globalTotalPages } = React.useMemo(() => {
    if (!book || !book.chapters || book.chapters.length === 0) {
      return { globalCurrentPage: pageIndex + 1, globalTotalPages: Math.max(1, totalPages) };
    }

    const getTextLen = (htmlStr?: string) => {
      if (!htmlStr) return 0;
      return htmlStr.replace(/<[^>]*>/g, '').trim().length;
    };

    // Normalize fontSize to rem scale (e.g. 0.8, 1.0, 1.2, 1.4, 1.8, 2.0). If passed in px, convert to rem.
    const fontSizeRem = typeof fontSize === 'number' && fontSize > 0 
      ? (fontSize > 5 ? fontSize / 16 : fontSize) 
      : 1.2;

    const effectiveWidthFactor = Math.max(0.5, Math.min(1.5, (containerWidth || 600) / 600));

    // Calculate deterministic characters per page strictly based on fontSize and container width.
    // At 1.0rem (~16px) on 600px width, standard page holds ~1350 characters since layout height was expanded.
    // As fontSize grows, capacity shrinks: 1350 / (fontSizeRem ^ 1.6)
    const charsPerPage = Math.max(
      100,
      Math.round((1350 * effectiveWidthFactor) / Math.pow(fontSizeRem, 1.6))
    );

    let accumulatedPagesBefore = 0;
    let totalBookPages = 0;
    let currentChapterBudget = 1;

    book.chapters.forEach((ch, idx) => {
      let chPages = 1;
      const chName = (ch.name || '').toLowerCase();
      const isCover = idx === 0 && (
        chName === 'cover' || 
        chName.includes('обложка') || 
        (idx === propChapterIndex && processedContent && processedContent.includes('book-cover-page'))
      );

      if (isCover) {
        chPages = 1;
      } else {
        const len = Math.max(1, getTextLen(ch.content || (ch.length ? 'a'.repeat(ch.length) : undefined)));
        chPages = Math.max(1, Math.round(len / charsPerPage));
      }

      if (idx < propChapterIndex) {
        accumulatedPagesBefore += chPages;
      } else if (idx === propChapterIndex) {
        currentChapterBudget = chPages;
      }
      totalBookPages += chPages;
    });

    // Map local pageIndex (from DOM pagination 0..totalPages-1) into currentChapterBudget (1..chPages)
    let pageInChap = pageIndex + 1;
    if (currentChapterBudget > 1 && totalPages > 1) {
      const progressFraction = pageIndex / (totalPages - 1); // 0.0 to 1.0
      pageInChap = 1 + Math.round(progressFraction * (currentChapterBudget - 1));
    } else {
      pageInChap = Math.min(currentChapterBudget, pageIndex + 1);
    }

    const calculatedCurrentPage = Math.min(totalBookPages, accumulatedPagesBefore + pageInChap);

    return {
      globalCurrentPage: calculatedCurrentPage,
      globalTotalPages: Math.max(calculatedCurrentPage, totalBookPages)
    };
  }, [book, propChapterIndex, pageIndex, totalPages, fontSize, containerWidth, processedContent]);

  // Recalculate Page Count for Paged Mode
  const PAGE_GAP = 40;
  const lastProgressRef = useRef(initialProgressRatio);

  useEffect(() => {
    lastProgressRef.current = initialProgressRatio;
  }, [initialProgressRatio]);

  const updatePageCount = React.useCallback(() => {
    if (!isPagedMode || !pagedContainerRef.current || !pagedContentRef.current) return;
    const container = pagedContainerRef.current;
    const content = pagedContentRef.current;
    const width = container.clientWidth;
    if (width <= 0) return;
    const pageWidth = Math.max(100, width - PAGE_GAP);
    setContainerWidth(width);

    const scrollWidth = content.scrollWidth;
    const calculatedPages = Math.max(1, Math.floor((scrollWidth + PAGE_GAP + 5) / width));
    setTotalPages(calculatedPages);

    if (highlightText) return;

    const currentProgress = lastProgressRef.current;
    if (currentProgress >= 0.99) {
      setPageIndex(calculatedPages - 1);
    } else if (currentProgress <= 0.01) {
      setPageIndex(0);
    } else {
      const targetPage = Math.min(calculatedPages - 1, Math.max(0, Math.round(currentProgress * (calculatedPages - 1))));
      setPageIndex(targetPage);
    }
  }, [isPagedMode, processedContent, fontSize, highlightText]);

  useEffect(() => {
    if (isPagedMode) {
      const timer = setTimeout(() => {
        updatePageCount();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isPagedMode, processedContent, fontSize, updatePageCount]);

  useEffect(() => {
    if (!isPagedMode || !pagedContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      updatePageCount();
    });
    observer.observe(pagedContainerRef.current);
    return () => observer.disconnect();
  }, [isPagedMode, updatePageCount]);

  const handlePageTurn = React.useCallback((direction: 'next' | 'prev') => {
    if (direction === 'next') {
      if (pageIndex < totalPages - 1) {
        const nextIdx = pageIndex + 1;
        setPageIndex(nextIdx);
        const ratio = totalPages > 1 ? nextIdx / (totalPages - 1) : 0;
        lastProgressRef.current = ratio;
        onProgressUpdate(ratio);
      } else if (propChapterIndex < book.chapters.length - 1) {
        onChapterChange(propChapterIndex + 1, 'start');
      }
    } else {
      if (pageIndex > 0) {
        const prevIdx = pageIndex - 1;
        setPageIndex(prevIdx);
        const ratio = totalPages > 1 ? prevIdx / (totalPages - 1) : 0;
        lastProgressRef.current = ratio;
        onProgressUpdate(ratio);
      } else if (propChapterIndex > 0) {
        onChapterChange(propChapterIndex - 1, 'end');
      }
    }
  }, [pageIndex, totalPages, propChapterIndex, book.chapters.length, onProgressUpdate, onChapterChange]);

  useEffect(() => {
    if (!isPagedMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handlePageTurn('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePageTurn('prev');
      } else if (e.key === ' ') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePageTurn('prev');
        } else {
          handlePageTurn('next');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPagedMode, handlePageTurn]);

  const handlePagedTouchStart = (e: React.TouchEvent) => {
    if (!isPagedMode || isRsvpMode) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handlePagedTouchMove = (e: React.TouchEvent) => {
    if (!isPagedMode || !isDraggingRef.current || isRsvpMode) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      if ((pageIndex === 0 && deltaX > 0 && propChapterIndex === 0) ||
          (pageIndex === totalPages - 1 && deltaX < 0 && propChapterIndex === book.chapters.length - 1)) {
        setDragOffset(deltaX * 0.25);
      } else {
        setDragOffset(deltaX);
      }
    }
  };

  const handlePagedTouchEnd = () => {
    if (!isPagedMode || !isDraggingRef.current || isRsvpMode) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const dt = Date.now() - touchStartTime.current;
    const velocity = Math.abs(dragOffset) / Math.max(1, dt);

    if (dragOffset < -40 || (dragOffset < -15 && velocity > 0.3)) {
      handlePageTurn('next');
    } else if (dragOffset > 40 || (dragOffset > 15 && velocity > 0.3)) {
      handlePageTurn('prev');
    }
    setDragOffset(0);
  };

  // Initialize Hypher (Russian & English)
  const hyphenatorRuRef = useRef<any>(null);
  const hyphenatorEnRef = useRef<any>(null);
  if (!hyphenatorRuRef.current) {
      hyphenatorRuRef.current = new Hypher(ruPattern);
  }
  if (!hyphenatorEnRef.current) {
      hyphenatorEnRef.current = new Hypher(enPattern);
  }

  // Reset Flag on Prop Change
  useEffect(() => {
    contentRestoredRef.current = false;
  }, [propChapterIndex, book.id, book.format]); 

  // Process Content
  useEffect(() => {
    if (!chapter?.content) {
        setProcessedContent("");
        setIsLoading(false);
        return;
    }

    // Show loading spinner only if processing takes more than 150ms
    const loadingTimer = setTimeout(() => {
        setIsLoading(true);
    }, 150);
    
    // Process content after a tiny tick to prevent thread-blocking
    const processingTimer = setTimeout(() => {
        if (isCoverPage) {
            setProcessedContent(chapter.content);
            clearTimeout(loadingTimer);
            setIsLoading(false);
            return;
        }

        const parser = new DOMParser();
        let rawContent = chapter.content;

        // Convert raw FB2/XML structural tags to HTML elements/classes before DOM parsing
        // so DOMParser('text/html') does not move <title> to <head> or drop custom tags.
        rawContent = rawContent
            .replace(/<(?:[a-zA-Z0-9]+:)?title([^>]*)>/gi, '<div class="title">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?title>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?subtitle([^>]*)>/gi, '<div class="subtitle">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?subtitle>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?epigraph([^>]*)>/gi, '<div class="epigraph">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?epigraph>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?cite([^>]*)>/gi, '<blockquote class="cite">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?cite>/gi, '</blockquote>')
            .replace(/<(?:[a-zA-Z0-9]+:)?annotation([^>]*)>/gi, '<div class="annotation">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?annotation>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?poem([^>]*)>/gi, '<div class="poem">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?poem>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?stanza([^>]*)>/gi, '<div class="stanza">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?stanza>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?v([^>]*)>/gi, '<p class="verse">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?v>/gi, '</p>')
            .replace(/<(?:[a-zA-Z0-9]+:)?text-author([^>]*)>/gi, '<div class="text-author">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?text-author>/gi, '</div>')
            .replace(/<(?:[a-zA-Z0-9]+:)?date([^>]*)>/gi, '<div class="date">')
            .replace(/<\/(?:[a-zA-Z0-9]+:)?date>/gi, '</div>');

        const doc = parser.parseFromString(rawContent, 'text/html');

        // 1. Convert FB2 <emphasis> to <em>
        const emphasisNodes = doc.querySelectorAll('emphasis');
        emphasisNodes.forEach(node => {
            const em = doc.createElement('em');
            em.innerHTML = node.innerHTML;
            node.parentNode?.replaceChild(em, node);
        });

        // 2. Process text: replace 'ё'/'Ё' with 'е'/'Е' in styled mode, and hyphenate (Russian & English/Latin)
        try {
            const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
            let node;
            while (node = walker.nextNode()) {
                try {
                    if (node.nodeValue) {
                         let text = node.nodeValue;
                         if (isStyledMode && /[ёЁ]/.test(text)) {
                             text = text.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
                         }
                         if (text.length > 3) {
                             if (hyphenatorRuRef.current) {
                                 text = hyphenatorRuRef.current.hyphenateText(text);
                             }
                             if (hyphenatorEnRef.current) {
                                 text = hyphenatorEnRef.current.hyphenateText(text);
                             }
                         }
                         node.nodeValue = text;
                    }
                } catch (e) {
                    console.error("Ошибка обработки узла текста:", e);
                }
            }
        } catch (e) {
            console.error("Критическая ошибка обработки текста:", e);
        }
        
        // 3. Clear some specific styles that might leak (like after tables)
        const tables = doc.querySelectorAll('table');
        tables.forEach(table => {
            table.style.fontStyle = 'normal';
            
            // Fix leaked italics from standard HTML5 Adoption Agency Algorithm
            let next = table.nextElementSibling;
            while (next) {
                // Strip leaked em/i wrapping the entire paragraph
                if (
                    next.tagName.toLowerCase() === 'p' || 
                    next.tagName.toLowerCase() === 'div' || 
                    next.tagName.toLowerCase() === 'h1' || 
                    next.tagName.toLowerCase() === 'h2' || 
                    next.tagName.toLowerCase() === 'h3' || 
                    next.tagName.toLowerCase() === 'h4' || 
                    next.tagName.toLowerCase() === 'h5' || 
                    next.tagName.toLowerCase() === 'h6'
                ) {
                    const firstChild = next.firstElementChild;
                    if (firstChild && (firstChild.tagName.toLowerCase() === 'em' || firstChild.tagName.toLowerCase() === 'i')) {
                        if (next.children.length === 1 && next.textContent === firstChild.textContent) {
                            // Replace the em/i element with its own unwrapped innerHTML/content in a span
                            const textNode = doc.createElement('span');
                            textNode.innerHTML = firstChild.innerHTML;
                            next.replaceChild(textNode, firstChild);
                        }
                    }
                }
                next = next.nextElementSibling;
            }
        });

        // 3.5. Ensure standard non-stretching gap after dash before a capital letter
        try {
            const dashTestRegex = /([\u2010-\u2015\u2013\u2014-]|\-\-)[ \t\u00A0\u202F]+(?=[«"'“„\(\[]*[А-ЯЁA-Z])/;
            const dashExecRegex = /([\u2010-\u2015\u2013\u2014-]|\-\-)[ \t\u00A0\u202F]+(?=[«"'“„\(\[]*[А-ЯЁA-Z])/g;
            
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
            const textNodes: Text[] = [];
            let n: Node | null;
            while (n = walker.nextNode()) {
                if (n.nodeValue && dashTestRegex.test(n.nodeValue)) {
                    textNodes.push(n as Text);
                }
            }

            for (const node of textNodes) {
                const parent = node.parentNode;
                if (!parent) continue;
                if (parent.nodeName === 'SPAN' && (parent as Element).classList.contains('dash-fixed')) {
                    continue;
                }

                const text = node.nodeValue || '';
                dashExecRegex.lastIndex = 0;
                
                const fragment = doc.createDocumentFragment();
                let lastIdx = 0;
                let match: RegExpExecArray | null;

                while ((match = dashExecRegex.exec(text)) !== null) {
                    const matchStart = match.index;
                    const dashChar = match[1];

                    let leadingText = text.substring(lastIdx, matchStart);
                    // If this is the very start of the text node and leadingText is purely whitespace (e.g. source code indentation before dialogue dash), trim it
                    if (lastIdx === 0 && /^\s+$/.test(leadingText)) {
                        leadingText = '';
                    }

                    if (leadingText) {
                        fragment.appendChild(doc.createTextNode(leadingText));
                    }

                    const wrapperSpan = doc.createElement('span');
                    wrapperSpan.className = 'dash-fixed';
                    wrapperSpan.appendChild(doc.createTextNode(dashChar));

                    const spaceSpan = doc.createElement('span');
                    spaceSpan.className = 'dash-space';
                    wrapperSpan.appendChild(spaceSpan);

                    fragment.appendChild(wrapperSpan);

                    lastIdx = dashExecRegex.lastIndex;
                }

                if (lastIdx < text.length) {
                    fragment.appendChild(doc.createTextNode(text.substring(lastIdx)));
                }

                parent.replaceChild(fragment, node);
            }
        } catch (e) {
            console.error("Error formatting dialogue dashes:", e);
        }

        // 4. Apply Bionic Reading
        if (isBionic && !isRsvpMode) {
            try {
                const textNodes: Text[] = [];
                const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
                let n;
                while (n = walker.nextNode()) {
                    if (n.nodeValue && n.nodeValue.trim() !== "") {
                        if (!shouldSkipBionic(n)) {
                            textNodes.push(n as Text);
                        }
                    }
                }
                textNodes.forEach(tn => {
                    const val = tn.nodeValue || "";
                    const frag = createBionicFragment(val, doc);
                    tn.parentNode?.replaceChild(frag, tn);
                });
            } catch (e) {
                console.error("Error applying bionic reading:", e);
            }
        }
        
        // 5. Process Drop Cap and Indents for chapter start and headings
        try {
            const getLeadingCleanText = (el: Element): string => {
                const raw = el.textContent || '';
                return raw.replace(/^[\s\u00A0\u2000-\u200B\u202F\uFEFF]+/, '');
            };

            const QUOTE_START_REGEX = /^["'«»“”„‟‘’‚‛‹›″′]/;
            const DASH_START_REGEX = /^([\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2E3A\u2E3B]|\-\-)/;

            const isItalicElementOrAncestor = (node: Node, root: HTMLElement): boolean => {
                let curr: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
                while (curr && curr !== root.parentElement) {
                    if (curr instanceof HTMLElement) {
                        const tag = curr.tagName.toLowerCase();
                        if (tag === 'em' || tag === 'i' || tag === 'cite' || tag === 'dfn' || tag === 'var' || tag === 'emphasis') {
                            return true;
                        }
                        const style = curr.getAttribute('style') || '';
                        if (/font-style\s*:\s*(italic|oblique)/i.test(style) || curr.style.fontStyle === 'italic' || curr.style.fontStyle === 'oblique') {
                            return true;
                        }
                        const className = typeof curr.className === 'string' ? curr.className : '';
                        if (/\b(italic|emphasis|font-italic|fst-italic)\b/i.test(className)) {
                            return true;
                        }
                    }
                    if (curr === root) break;
                    curr = curr.parentElement;
                }
                return false;
            };

            const getFirstSubstantiveTextNode = (el: Node): Node | null => {
                for (let i = 0; i < el.childNodes.length; i++) {
                    const child = el.childNodes[i];
                    if (child.nodeType === Node.TEXT_NODE) {
                        const txt = child.textContent || '';
                        if (/[^\s\u00A0\u2000-\u200B\u202F\uFEFF]/.test(txt)) {
                            return child;
                        }
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        const tag = (child as HTMLElement).tagName?.toLowerCase();
                        if (tag !== 'script' && tag !== 'style') {
                            const found = getFirstSubstantiveTextNode(child);
                            if (found) return found;
                        }
                    }
                }
                return null;
            };

            const startsWithItalic = (p: HTMLElement): boolean => {
                if (isItalicElementOrAncestor(p, p)) return true;
                const textNode = getFirstSubstantiveTextNode(p);
                if (!textNode) return false;
                return isItalicElementOrAncestor(textNode, p);
            };

            // Find the first substantive text paragraph of the chapter
            let firstP: HTMLElement | null = Array.from(doc.body.children).find(
                el => el.tagName.toLowerCase() === 'p'
            ) as HTMLElement | null;

            if (!firstP) {
                // If chapter body is wrapped (e.g. <section> or <div class="chapter">), find the first non-header, non-epigraph paragraph
                const candidatePs = Array.from(doc.body.querySelectorAll('p')).filter(p => {
                    return !p.closest('.title, .subtitle, .epigraph, .poem, .stanza, .annotation, .cite, blockquote, .notes-list, .book-cover-page');
                });
                if (candidatePs.length > 0) {
                    firstP = candidatePs[0] as HTMLElement;
                }
            }

            if (firstP) {
                const cleanText = getLeadingCleanText(firstP);
                if (startsWithItalic(firstP)) {
                    // Rule 3: Если текст начинается с курсива - буквицу не ставим (но красную строку убираем)
                    firstP.classList.add('chapter-italic-start', 'starts-with-italic', 'no-dropcap');
                } else if (QUOTE_START_REGEX.test(cleanText)) {
                    // Rule 1: Если глава начинается с кавычки - буквицу не ставим (но красную строку убираем)
                    firstP.classList.add('chapter-quote-start', 'no-dropcap');
                } else if (DASH_START_REGEX.test(cleanText)) {
                    // Chapter starts with dash: no drop cap, keep paragraph indent (unless under h3)
                    firstP.classList.add('chapter-dash-start', 'no-dropcap');
                } else {
                    // Regular chapter opening: drop cap is placed, indent removed
                    firstP.classList.add('has-dropcap');
                }
            }

            // Rule 2: Если текст под заголовком третьего уровня начинается с тире - убираем красную строку
            const h3Elements = Array.from(doc.body.querySelectorAll('h3, .h3, div.title.h3, [class*="h3"]')).filter(el => {
                return !el.parentElement?.closest('h3, .h3');
            });

            h3Elements.forEach(h3 => {
                let next = h3.nextElementSibling;
                let targetP: HTMLElement | null = null;
                while (next) {
                    const tag = next.tagName.toLowerCase();
                    if (next.classList.contains('empty-line') || tag === 'br' || tag === 'hr' || (tag === 'a' && !next.textContent?.trim())) {
                        next = next.nextElementSibling;
                        continue;
                    }
                    if (tag === 'p' || next.classList.contains('paragraph') || next.classList.contains('verse')) {
                        targetP = next as HTMLElement;
                        break;
                    }
                    const innerP = next.querySelector('p, .paragraph, .verse');
                    if (innerP) {
                        targetP = innerP as HTMLElement;
                        break;
                    }
                    if (/^h[1-6]$/.test(tag) || next.classList.contains('title') || next.classList.contains('subtitle')) {
                        break;
                    }
                    next = next.nextElementSibling;
                }

                if (!targetP && h3.parentElement && h3.parentElement !== doc.body) {
                    let parentSibling = h3.parentElement.nextElementSibling;
                    while (parentSibling) {
                        const tag = parentSibling.tagName.toLowerCase();
                        if (parentSibling.classList.contains('empty-line') || tag === 'br' || tag === 'hr') {
                            parentSibling = parentSibling.nextElementSibling;
                            continue;
                        }
                        if (tag === 'p' || parentSibling.classList.contains('paragraph')) {
                            targetP = parentSibling as HTMLElement;
                            break;
                        }
                        const innerP = parentSibling.querySelector('p, .paragraph');
                        if (innerP) {
                            targetP = innerP as HTMLElement;
                            break;
                        }
                        break;
                    }
                }

                if (targetP) {
                    const cleanText = getLeadingCleanText(targetP);
                    const startsWithDash = DASH_START_REGEX.test(cleanText) ||
                        /^["'«»“”„‟‘’‚‛\s]*[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2E3A\u2E3B]/.test(cleanText);
                    if (startsWithDash) {
                        targetP.classList.add('under-h3-dash', 'no-dropcap');
                    }
                }
            });

            // Headings of other levels (h1, h2, h4, etc.): if paragraph starts with dash, keep indent
            const otherHeadings = Array.from(doc.body.querySelectorAll('h1, h2, h4, h5, h6, .title:not(.h3)')).filter(el => {
                return !el.parentElement?.closest('h1, h2, h4, h5, h6, .title');
            });
            otherHeadings.forEach(h => {
                let next = h.nextElementSibling;
                let targetP: HTMLElement | null = null;
                while (next) {
                    const tag = next.tagName.toLowerCase();
                    if (next.classList.contains('empty-line') || tag === 'br' || tag === 'hr') {
                        next = next.nextElementSibling;
                        continue;
                    }
                    if (tag === 'p' || next.classList.contains('paragraph')) {
                        targetP = next as HTMLElement;
                        break;
                    }
                    break;
                }
                if (targetP && !targetP.classList.contains('under-h3-dash')) {
                    const cleanText = getLeadingCleanText(targetP);
                    if (DASH_START_REGEX.test(cleanText)) {
                        targetP.classList.add('starts-with-dash', 'no-dropcap');
                    } else if (startsWithItalic(targetP)) {
                        targetP.classList.add('starts-with-italic');
                    }
                }
            });
        } catch (e) {
            console.error("Error setting typography classes:", e);
        }

        setProcessedContent(doc.body.innerHTML);
        clearTimeout(loadingTimer);
        setIsLoading(false);
    }, 10);

    return () => {
        clearTimeout(loadingTimer);
        clearTimeout(processingTimer);
    };
  }, [chapter, isCoverPage, isBionic, isRsvpMode, isStyledMode]);


  // --- HIGHLIGHTING ---
  useEffect(() => {
      const root = isPagedMode ? pagedContentRef.current : containerRef.current;
      if (!root || !processedContent) return;

      const oldMarks = root.querySelectorAll('mark.search-highlight');
      oldMarks.forEach(m => {
          const parent = m.parentNode;
          if (parent) {
              while (m.firstChild) parent.insertBefore(m.firstChild, m);
              parent.removeChild(m);
          }
      });
      root.normalize(); 
      
      if (!highlightText || highlightMatchIndex === -1) return;

      const getBlockParent = (node: Node): Node | null => {
          let curr: Node | null = node.parentNode;
          while (curr && curr !== root) {
              if (curr.nodeType === Node.ELEMENT_NODE) {
                  const tag = (curr as Element).tagName.toLowerCase();
                  if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'blockquote', 'section', 'article', 'tr', 'br'].includes(tag)) {
                      return curr;
                  }
              }
              curr = curr.parentNode;
          }
          return curr;
      };

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      const textNodes: Text[] = [];
      let n;
      while (n = walker.nextNode()) textNodes.push(n as Text);

      let virtualText = "";
      const map: ({ node: Text; offset: number } | null)[] = [];

      for (let idx = 0; idx < textNodes.length; idx++) {
          const node = textNodes[idx];
          const val = node.nodeValue || "";
          for (let i = 0; i < val.length; i++) {
              const char = val[i];
              const code = char.charCodeAt(0);
              // Skip soft hyphens and invisible formatting characters
              if (code === 173 || code === 8203 || code === 8204 || code === 8205 || code === 65279) {
                  continue; 
              }
              virtualText += char;
              map.push({ node, offset: i });
          }

          const nextNode = textNodes[idx + 1];
          if (nextNode) {
              const isDifferentBlock = getBlockParent(node) !== getBlockParent(nextNode);
              if (isDifferentBlock) {
                  if (virtualText.length > 0 && !/\s$/.test(virtualText)) {
                      virtualText += " ";
                      map.push(null);
                  }
              }
          }
      }

      const q = highlightText.trim().toLowerCase();
      if (!q) return;

      const vLower = virtualText.toLowerCase();
      let startIndex = 0;
      let foundCount = 0;
      let foundRange: Range | null = null;
      let firstAvailableRange: Range | null = null;

      while (true) {
          const idx = vLower.indexOf(q, startIndex);
          if (idx === -1) break;

          const startMap = map[idx];
          const endIdx = idx + q.length - 1;
          const endMap = map[endIdx];

          if (startMap && endMap) {
              try {
                  const range = document.createRange();
                  range.setStart(startMap.node, startMap.offset);
                  range.setEnd(endMap.node, endMap.offset + 1);
                  if (!firstAvailableRange) {
                      firstAvailableRange = range;
                  }
                  if (foundCount === highlightMatchIndex) {
                      foundRange = range;
                      break;
                  }
              } catch (e) {
                  // Ignore invalid range
              }
          }
          foundCount++;
          startIndex = idx + q.length;
      }

      if (!foundRange && firstAvailableRange) {
          foundRange = firstAvailableRange;
      }

      if (foundRange) {
          const mark = document.createElement('mark');
          mark.className = "search-highlight bg-amber-300 text-black px-1 rounded animate-pulse shadow-md font-bold z-10 relative";
          mark.id = "current-highlight";
          mark.style.backgroundColor = "#fcd34d";
          mark.style.color = "#000000";

          try {
              const contents = foundRange.extractContents();
              mark.appendChild(contents);
              foundRange.insertNode(mark);
          } catch (e) {
              try {
                  foundRange.surroundContents(mark);
              } catch (err) {
                  try {
                      foundRange.insertNode(mark);
                  } catch (err2) {}
              }
          }

          contentRestoredRef.current = true;

          const performScrollOrPage = () => {
              if (isPagedMode) {
                  const contentEl = pagedContentRef.current;
                  if (!contentEl) return;
                  const markEl = contentEl.querySelector('#current-highlight') || mark;
                  if (markEl && markEl.getBoundingClientRect) {
                      const rect = markEl.getBoundingClientRect();
                      const contentRect = contentEl.getBoundingClientRect();
                      const offsetLeft = rect.left - contentRect.left;
                      const width = containerWidth > 0 ? containerWidth : (pagedContainerRef.current?.clientWidth || 800);
                      if (width > 0) {
                          const effectiveTotalPages = totalPages > 0 ? totalPages : 1;
                          const calculatedPage = Math.max(0, Math.min(effectiveTotalPages - 1, Math.floor((offsetLeft + 10) / width)));
                          setPageIndex(calculatedPage);
                          const ratio = effectiveTotalPages > 1 ? calculatedPage / (effectiveTotalPages - 1) : 0;
                          lastProgressRef.current = ratio;
                          onProgressUpdate(ratio);

                          if (pagedContainerRef.current) {
                              pagedContainerRef.current.scrollLeft = 0;
                              pagedContainerRef.current.scrollTop = 0;
                          }
                      }
                  }
                  return;
              }

              const container = containerRef.current;
              if (!container) return;

              const markEl = container.querySelector('#current-highlight') || mark;
              let targetTop = -1;

              if (markEl && markEl.getBoundingClientRect) {
                  const markRect = markEl.getBoundingClientRect();
                  const containerRect = container.getBoundingClientRect();
                  if (markRect.height > 0 || markRect.top > 0) {
                      targetTop = container.scrollTop + (markRect.top - containerRect.top) - (container.clientHeight / 2);
                  }
              }

              if (targetTop < 0 && foundRange) {
                  try {
                      const rangeRect = foundRange.getBoundingClientRect();
                      const containerRect = container.getBoundingClientRect();
                      if (rangeRect.height > 0) {
                          targetTop = container.scrollTop + (rangeRect.top - containerRect.top) - (container.clientHeight / 2);
                      }
                  } catch (e) {}
              }

              if (targetTop >= 0) {
                  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
              } else if (markEl && markEl.scrollIntoView) {
                  markEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }
          };

          requestAnimationFrame(() => {
              performScrollOrPage();
              setTimeout(performScrollOrPage, 50);
              setTimeout(performScrollOrPage, 150);
              setTimeout(performScrollOrPage, 350);
              setTimeout(performScrollOrPage, 700);
          });
      }
  }, [processedContent, highlightText, highlightMatchIndex, isPagedMode, totalPages, containerWidth]);

  const initialRatioRef = useRef(initialProgressRatio);
  useEffect(() => { initialRatioRef.current = initialProgressRatio; }, [initialProgressRatio]);

  const prevFontSizeRef = useRef(fontSize);
  useEffect(() => {
      if (prevFontSizeRef.current !== fontSize) {
          prevFontSizeRef.current = fontSize;
          if (!containerRef.current || !processedContent) return;
          // Wait a tick for layout to recalculate with the new font size
          requestAnimationFrame(() => {
              if (!containerRef.current) return;
              const { scrollHeight, clientHeight } = containerRef.current;
              if (scrollHeight <= clientHeight) return;
              const target = (scrollHeight - clientHeight) * initialRatioRef.current;
              containerRef.current.scrollTop = target;
          });
      }
  }, [fontSize, processedContent]);

  // --- AUTOMATIC MICRO-TYPOGRAPHY OPTIMIZATION ---
  // Automatically detects loose lines with wide gaps and fine-tunes character intervals
  // seamlessly and transparently without requiring any manual user setting.
  useEffect(() => {
    if (!processedContent) return;

    const optimizeContent = (rootEl: HTMLElement | null) => {
      if (!rootEl) return;
      const content = rootEl.classList.contains('reader-content') 
        ? rootEl 
        : (rootEl.querySelector('.reader-content') as HTMLElement | null);
      if (!content) return;

      const paragraphs = Array.from(content.querySelectorAll('p, div.paragraph, blockquote p, p.calibre1, p.calibre2')) as HTMLElement[];
      if (paragraphs.length === 0) return;

      const getMaxSpaceInParagraph = (p: HTMLElement): number => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
        let tn: Node | null;
        let maxW = 0;
        while ((tn = walker.nextNode())) {
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

      // Fine-grained subtle condensation candidates (never expand lowercase text, as positive tracking breaks word shapes)
      const candidates = ['-0.015em', '-0.02em', '-0.025em', '-0.03em', '-0.035em', '-0.01em', '0em'];

      paragraphs.forEach((p) => {
        const text = p.textContent ? p.textContent.trim() : '';
        if (text.length < 15) return;
        if (p.classList.contains('verse') || p.tagName.toLowerCase() === 'v') return;

        p.style.removeProperty('letter-spacing');

        const initialMax = getMaxSpaceInParagraph(p);
        if (initialMax > 9.5) {
          let bestLs = '0em';
          let lowestMax = initialMax;

          for (const cand of candidates) {
            p.style.setProperty('letter-spacing', cand, 'important');
            const curMax = getMaxSpaceInParagraph(p);
            if (curMax < lowestMax) {
              lowestMax = curMax;
              bestLs = cand;
              if (curMax <= 7.5) break;
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

    const runOpt = () => {
      if (isPagedMode) {
        optimizeContent(pagedContentRef.current);
      } else {
        optimizeContent(containerRef.current);
      }
    };
    const timer1 = setTimeout(runOpt, 40);
    const timer2 = setTimeout(runOpt, 250);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [processedContent, isPagedMode, fontSize, readerFont, containerWidth]);

  // Anchor pinning when isBionic or isRsvpMode toggles to prevent layout shift
  const prevIsBionicRef = useRef(isBionic);
  const prevIsRsvpRef = useRef(isRsvpMode);
  const bionicAnchorRef = useRef<{ index: number; offset: number } | null>(null);
  const rsvpStartBlockIndexRef = useRef<number | null>(null);

  useEffect(() => {
      const isBionicChanged = isBionic !== prevIsBionicRef.current;
      const isRsvpChanged = isRsvpMode !== prevIsRsvpRef.current;
      
      if (isBionicChanged || isRsvpChanged) {
          prevIsBionicRef.current = isBionic;
          const wasRsvp = prevIsRsvpRef.current;
          prevIsRsvpRef.current = isRsvpMode;
          
          const container = isPagedMode ? pagedContentRef.current : containerRef.current;
          if (container) {
              const containerRect = container.getBoundingClientRect();
              const blocks = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'));
              
              let bestBlockIndex = -1;
              let bestBlockOffset = 0;
              
              for (let i = 0; i < blocks.length; i++) {
                  const block = blocks[i];
                  const rect = block.getBoundingClientRect();
                  if (isPagedMode) {
                      if (rect.right > containerRect.left + 10 && rect.left < containerRect.right - 10) {
                          bestBlockIndex = i;
                          bestBlockOffset = rect.top - containerRect.top;
                          break;
                      }
                  } else {
                      if (rect.bottom > containerRect.top + 5) {
                          bestBlockIndex = i;
                          bestBlockOffset = rect.top - containerRect.top;
                          break;
                      }
                  }
              }
              
              if (bestBlockIndex !== -1) {
                  bionicAnchorRef.current = { index: bestBlockIndex, offset: bestBlockOffset };
                  
                  if (isRsvpMode && !wasRsvp) {
                      let rsvpBlockIdx = -1;
                      for (let i = 0; i < blocks.length; i++) {
                          const rect = blocks[i].getBoundingClientRect();
                          if (isPagedMode) {
                              if (rect.right > containerRect.left + 10 && rect.left < containerRect.right - 10) {
                                  rsvpBlockIdx = i;
                                  break;
                              }
                          } else {
                              if (rect.top >= containerRect.top - 1.5) {
                                  rsvpBlockIdx = i;
                                  break;
                              }
                          }
                      }
                      if (rsvpBlockIdx === -1) {
                          rsvpBlockIdx = bestBlockIndex;
                      }
                      rsvpStartBlockIndexRef.current = rsvpBlockIdx;
                  }
              }
          }
      }

      // If RSVP mode is closed, clear the start block ref
      if (!isRsvpMode) {
          rsvpStartBlockIndexRef.current = null;
      }
  }, [isBionic, isRsvpMode]);

  // Restore scroll anchor when content is re-rendered with new format
  useEffect(() => {
      if (bionicAnchorRef.current && containerRef.current) {
          const container = containerRef.current;
          const anchor = bionicAnchorRef.current;
          
          requestAnimationFrame(() => {
              const containerRect = container.getBoundingClientRect();
              const blocks = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'));
              const targetBlock = blocks[anchor.index];
              if (targetBlock) {
                  const rect = targetBlock.getBoundingClientRect();
                  const currentOffset = rect.top - containerRect.top;
                  const diff = currentOffset - anchor.offset;
                  container.scrollTop += diff;
              }
          });
          bionicAnchorRef.current = null;
      }
  }, [processedContent]);

  // Restore scroll position when switching to scroll mode
  useEffect(() => {
      if (!isPagedMode && containerRef.current) {
          const targetRatio = lastProgressRef.current;
          const restoreScroll = () => {
              if (!containerRef.current) return;
              const { scrollHeight, clientHeight } = containerRef.current;
              if (scrollHeight > clientHeight) {
                  containerRef.current.scrollTop = Math.max(0, (scrollHeight - clientHeight) * targetRatio);
              }
          };
          requestAnimationFrame(() => {
              restoreScroll();
              setTimeout(restoreScroll, 50);
              setTimeout(restoreScroll, 150);
          });
      }
  }, [isPagedMode]);

  // Scroll Restoration on initial load
  useEffect(() => {
     if (!containerRef.current || !processedContent || contentRestoredRef.current) return;
     if (highlightText) return; 
     
     const el = containerRef.current;
     requestAnimationFrame(() => {
         const { scrollHeight, clientHeight } = el;
         if (initialProgressRatio <= 0.001) {
             el.scrollTop = 0;
         } else {
             if (scrollHeight <= clientHeight && initialProgressRatio > 0) return; 
             const target = (scrollHeight - clientHeight) * initialProgressRatio;
             el.scrollTop = target;
         }
         contentRestoredRef.current = true;
     });
  }, [processedContent, propChapterIndex, initialProgressRatio, highlightText, book.id]);

  // Handle cross-chapter or internal hash/footnote targets
  useEffect(() => {
      if (!processedContent) return;
      const targetId = (window as any).__pendingScrollTarget;
      if (!targetId) return;

      const runScroll = () => {
          const targetEl = document.getElementById(targetId) || 
                           document.getElementsByName(targetId)[0] ||
                           pagedContentRef.current?.querySelector(`[id="${targetId}"]`) || 
                           pagedContentRef.current?.querySelector(`[name="${targetId}"]`) ||
                           containerRef.current?.querySelector(`[id="${targetId}"]`) || 
                           containerRef.current?.querySelector(`[name="${targetId}"]`);

          if (targetEl) {
              if (isPagedMode) {
                  if (pagedContentRef.current && containerWidth > 0) {
                      const rect = targetEl.getBoundingClientRect();
                      const contentRect = pagedContentRef.current.getBoundingClientRect();
                      const offsetLeft = rect.left - contentRect.left;
                      const calculatedPage = Math.max(0, Math.min(totalPages - 1, Math.floor((offsetLeft + 20) / containerWidth)));
                      setPageIndex(calculatedPage);
                      const ratio = totalPages > 1 ? calculatedPage / (totalPages - 1) : 0;
                      lastProgressRef.current = ratio;
                      onProgressUpdate(ratio);

                      // Prevent browser-native scroll from breaking the horizontal page layout
                      if (pagedContainerRef.current) {
                          pagedContainerRef.current.scrollLeft = 0;
                          pagedContainerRef.current.scrollTop = 0;
                      }
                      if (pagedContentRef.current) {
                          pagedContentRef.current.scrollLeft = 0;
                          pagedContentRef.current.scrollTop = 0;
                          if (pagedContentRef.current.parentElement) {
                              pagedContentRef.current.parentElement.scrollLeft = 0;
                              pagedContentRef.current.parentElement.scrollTop = 0;
                          }
                      }
                  }
              } else {
                  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              (window as any).__pendingScrollTarget = null;
          }
      };

      const t1 = setTimeout(runScroll, 80);
      const t2 = setTimeout(runScroll, 250);
      const t3 = setTimeout(runScroll, 500);

      return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
      };
  }, [processedContent, isPagedMode, totalPages, containerWidth]);

  // Prevent browser-native scroll from breaking the CSS column layout in paged mode
  useEffect(() => {
    if (!isPagedMode) return;
    const container = pagedContainerRef.current;
    if (!container) return;

    const handleScrollReset = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target) {
        if (target.scrollLeft !== 0) {
          target.scrollLeft = 0;
        }
        if (target.scrollTop !== 0) {
          target.scrollTop = 0;
        }
      }
    };

    container.addEventListener('scroll', handleScrollReset, { capture: true });
    return () => {
      container.removeEventListener('scroll', handleScrollReset, { capture: true });
    };
  }, [isPagedMode]);

  // Keep scroll position at 0 in paged mode to prevent layout breaks from native focus or auto-scrolls
  useEffect(() => {
    if (!isPagedMode) return;
    
    const resetScroll = () => {
      if (pagedContainerRef.current) {
        pagedContainerRef.current.scrollLeft = 0;
        pagedContainerRef.current.scrollTop = 0;
      }
      if (pagedContentRef.current) {
        pagedContentRef.current.scrollLeft = 0;
        pagedContentRef.current.scrollTop = 0;
        if (pagedContentRef.current.parentElement) {
          pagedContentRef.current.parentElement.scrollLeft = 0;
          pagedContentRef.current.parentElement.scrollTop = 0;
        }
      }
    };

    resetScroll();
    
    const r1 = requestAnimationFrame(resetScroll);
    const r2 = setTimeout(resetScroll, 50);
    const r3 = setTimeout(resetScroll, 150);
    const r4 = setTimeout(resetScroll, 300);

    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(r2);
      clearTimeout(r3);
      clearTimeout(r4);
    };
  }, [isPagedMode, pageIndex]);


  const handleScroll = () => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      const { scrollTop, scrollHeight, clientHeight } = el;
      
      // Progress Update
      const maxScroll = scrollHeight - clientHeight;
      const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
      lastProgressRef.current = ratio;
      onProgressUpdate(ratio);
  };
  
  const handleContentInteract = (e: React.MouseEvent<HTMLDivElement>) => {
      // 1. Check for Image Click
      const imgTarget = (e.target as HTMLElement).closest('img');
      if (imgTarget && imgTarget.src) {
          e.stopPropagation();
          onImageClick(imgTarget.src);
          return;
      }

      // 2. Check for Link Click
      const linkTarget = (e.target as HTMLElement).closest('a');
      if (linkTarget) {
          const href = linkTarget.getAttribute('href');
          
          if (href) {
              e.preventDefault();
              e.stopPropagation();
              
              if (href.startsWith('#')) {
                  const targetId = href.substring(1);
                  (window as any).__pendingScrollTarget = targetId;
                  
                  if (isPagedMode) {
                      const targetEl = pagedContentRef.current?.querySelector(`[id="${targetId}"]`) || 
                                       pagedContentRef.current?.querySelector(`[name="${targetId}"]`);
                      if (targetEl && pagedContentRef.current) {
                          const rect = targetEl.getBoundingClientRect();
                          const contentRect = pagedContentRef.current.getBoundingClientRect();
                          const offsetLeft = rect.left - contentRect.left;
                          const calculatedPage = Math.max(0, Math.min(totalPages - 1, Math.floor((offsetLeft + 20) / containerWidth)));
                          setPageIndex(calculatedPage);
                          const ratio = totalPages > 1 ? calculatedPage / (totalPages - 1) : 0;
                          lastProgressRef.current = ratio;
                          onProgressUpdate(ratio);

                          // Prevent browser-native scroll from breaking horizontal page alignment
                          if (pagedContainerRef.current) {
                              pagedContainerRef.current.scrollLeft = 0;
                              pagedContainerRef.current.scrollTop = 0;
                          }
                          if (pagedContentRef.current) {
                              pagedContentRef.current.scrollLeft = 0;
                              pagedContentRef.current.scrollTop = 0;
                              if (pagedContentRef.current.parentElement) {
                                  pagedContentRef.current.parentElement.scrollLeft = 0;
                                  pagedContentRef.current.parentElement.scrollTop = 0;
                              }
                          }
                      } else {
                          if (onExternalLinkClick) onExternalLinkClick(href);
                      }
                  } else {
                      const targetEl = containerRef.current?.querySelector(`[id="${targetId}"]`) || 
                                       containerRef.current?.querySelector(`[name="${targetId}"]`) ||
                                       document.getElementById(targetId);
                      if (targetEl) {
                          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      } else {
                          if (onExternalLinkClick) onExternalLinkClick(href);
                      }
                  }
              } else {
                  if (onExternalLinkClick) onExternalLinkClick(href);
              }
              return;
          }
      }
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
      // If we clicked a button, link, or image, do NOT navigate
      if ((e.target as HTMLElement).closest('button, a, img')) return;
      
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      const width = window.innerWidth;
      const x = e.clientX;

      if (highlightText && onHighlightClear) {
          onHighlightClear();
          return;
      }

      if (isRsvpMode) {
          onToggleUI();
          return;
      }

      if (isPagedMode) {
          if (x < width * 0.25) {
              handlePageTurn('prev');
          } else if (x > width * 0.75) {
              handlePageTurn('next');
          } else {
              onToggleUI();
          }
          return;
      }

      if (x < width * 0.25) {
          navigate('prev');
      } else if (x > width * 0.75) {
          navigate('next');
      } else {
          onToggleUI();
      }
  };

  const navigate = (direction: 'prev' | 'next') => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      const scrollAmount = el.clientHeight * 0.9;
      const maxScroll = el.scrollHeight - el.clientHeight;
      
      if (direction === 'next') {
          // If we are at the very bottom (with a small buffer)
          if (el.scrollTop >= maxScroll - 5) {
              if (propChapterIndex < book.chapters.length - 1) {
                  onChapterChange(propChapterIndex + 1, 'start');
              }
          } else {
              el.scrollTo({ top: el.scrollTop + scrollAmount, behavior: 'smooth' });
          }
      } else {
          // If we are at the very top
          if (el.scrollTop <= 5) {
              if (propChapterIndex > 0) {
                  onChapterChange(propChapterIndex - 1, 'end');
              }
          } else {
              el.scrollTo({ top: el.scrollTop - scrollAmount, behavior: 'smooth' });
          }
      }
  };


  const activeContentRef = isPagedMode ? pagedContentRef : containerRef;

  const {
      rsvpWords,
      rsvpIndex,
      setRsvpIndex,
      isRsvpPlaying,
      setIsRsvpPlaying,
      rsvpTranslateX,
      rsvpWrapperRef
  } = useRsvp({
      isRsvpMode,
      processedContent,
      containerRef: activeContentRef,
      rsvpStartBlockIndexRef,
      rsvpWpm,
      isPagedMode,
      pagedContainerRef
  });

  // Sync scroll / page with RSVP word
  useEffect(() => {
      const activeRef = isPagedMode ? pagedContainerRef : containerRef;
      if (!isRsvpMode || rsvpWords.length === 0 || !activeRef.current) return;
      const currentWord = rsvpWords[rsvpIndex];
      if (!currentWord || !currentWord.node.parentElement) return;

      if (!isPagedMode) {
          const parent = currentWord.node.parentElement;
          const rect = parent.getBoundingClientRect();
          const containerRect = activeRef.current.getBoundingClientRect();
          
          // Auto-scroll if word goes too far down or up
          const relativeTop = rect.top - containerRect.top;
          if (relativeTop > containerRect.height * 0.55 || relativeTop < containerRect.height * 0.45) {
               const targetY = rect.top - containerRect.top + activeRef.current.scrollTop - (containerRect.height / 2);
               activeRef.current.scrollTo({ top: targetY, behavior: 'smooth' });
          }
      } else if (pagedContainerRef.current) {
          const parent = currentWord.node.parentElement;
          const rect = parent.getBoundingClientRect();
          const containerRect = pagedContainerRef.current.getBoundingClientRect();
          if (rect.left >= containerRect.right - 10) {
              setPageIndex(prev => Math.min(totalPages - 1, prev + 1));
          } else if (rect.right <= containerRect.left + 10) {
              setPageIndex(prev => Math.max(0, prev - 1));
          }
      }
  }, [rsvpIndex, isRsvpMode, rsvpWords, isPagedMode, totalPages]);


  // Styles based on theme
  const containerClasses = theme === 'light' 
     ? (appStyle === 'Bimbo' ? 'bg-[#faf0f4] text-[#4a1525]' : appStyle === 'Surf' ? 'bg-[#f4f7f9] text-[#1e3a4c]' : (appStyle === 'Final' || appStyle === 'Final Fantasy') ? 'bg-[#f5f1e7] text-[#2b251e]' : appStyle === 'Dragon' ? 'bg-[#fdf9f1] text-[#3d2a22]' : appStyle === 'Marcel' ? 'bg-[#F3EFFB] text-[#2F2440]' : 'bg-[#fbfaf0] text-[#282625]')
     : (appStyle === 'Bimbo' ? 'bg-[#1c0f13] text-[#e8cbd5]' : appStyle === 'Surf' ? 'bg-[#111e25] text-[#b5cbd6]' : (appStyle === 'Final' || appStyle === 'Final Fantasy') ? 'bg-[#141517] text-[#c8c5bc]' : appStyle === 'Dragon' ? 'bg-[#1c1412] text-[#d6c5b4]' : appStyle === 'Marcel' ? 'bg-[#1a1918] text-[#c7c5c1]' : 'bg-[#1a1918] text-[#c7c5c1]');

  const nextBtnClasses = theme === 'light'
     ? (appStyle === 'Bimbo' 
        ? 'border-[#f2d5e0] bg-[#faf0f4] text-[#881337] hover:bg-[#f2e1e8] hover:border-[#f2d5e0]' 
        : appStyle === 'Surf'
        ? 'border-[#bae6fd] bg-[#f4f7f9] text-[#0369a1] hover:bg-[#e0f2fe] hover:border-[#7dd3fc]'
        : (appStyle === 'Final' || appStyle === 'Final Fantasy') 
        ? 'border-[#e0d6c1] bg-[#f5f1e7] text-[#594d3f] hover:bg-[#eae3d1] hover:border-[#cca972]'
        : appStyle === 'Dragon'
        ? 'border-[#e8dcc8] bg-[#fdf9f1] text-[#7a4c3a] hover:bg-[#f2eadd] hover:border-[#c28469]'
        : appStyle === 'Marcel'
        ? 'border-[#C4B5E6] bg-[#F3EFFB] text-[#544372] hover:bg-[#E8E0F5] hover:border-[#AC97D7]'
        : 'border-[#e0ded5] bg-[#fbfaf0] text-[#555] hover:text-[#000] hover:border-[#ccc] hover:bg-[#f0eee4]')
     : (appStyle === 'Bimbo'
        ? 'border-[#4a1525] bg-[#1c0f13] text-[#e8cbd5] hover:bg-[#2b161c] hover:border-[#6e2137]'
        : appStyle === 'Surf'
        ? 'border-[#1e3a4c] bg-[#111e25] text-[#b5cbd6] hover:bg-[#182933] hover:border-[#2a526b]'
        : (appStyle === 'Final' || appStyle === 'Final Fantasy') 
        ? 'border-[#2d3036] bg-[#141517] text-[#9ca3af] hover:bg-[#1f2125] hover:border-[#4b5563]'
        : appStyle === 'Dragon'
        ? 'border-[#3d2a22] bg-[#1c1412] text-[#d6c5b4] hover:bg-[#2e1d18] hover:border-[#5c3c2e]'
        : appStyle === 'Marcel'
        ? 'border-[#363330] bg-[#1a1918] text-[#8C937A] hover:text-[#c7c5c1] hover:bg-[#2a2927]'
        : 'border-[#363330] bg-[#1a1918] text-[#9a9893] hover:text-[#c7c5c1] hover:bg-[#2a2927]');
  
  const hrClasses = theme === 'light'
     ? (appStyle === 'Bimbo' 
        ? 'border-[#eac7d4]' 
        : (appStyle === 'Surf' ? 'border-[#cce1ed]' : (appStyle === 'Final' || appStyle === 'Final Fantasy' ? 'border-[#e0d6c1]' : (appStyle === 'Dragon' ? 'border-[#e8dcc8]' : appStyle === 'Marcel' ? 'border-[#C4B5E6]' : 'border-[#e0ded5]'))))
     : (appStyle === 'Bimbo' 
        ? 'border-[#4a1525]' 
        : (appStyle === 'Surf' ? 'border-[#1e3a4c]' : (appStyle === 'Final' || appStyle === 'Final Fantasy' ? 'border-[#2d3036]' : (appStyle === 'Dragon' ? 'border-[#3d2a22]' : appStyle === 'Marcel' ? 'border-[#363330]' : 'border-[#363330]'))));

  return (
    <div className={`flex-1 relative w-full h-full overflow-hidden transition-colors duration-300 bimbo-reader-canvas ${containerClasses}`}>
        {isLoading && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-20 transition-opacity">
                <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
                    appStyle === 'Bimbo' ? 'border-pink-200 border-t-pink-600' : 
                    appStyle === 'Surf' ? 'border-sky-200 border-t-sky-600' : 
                    appStyle === 'Dragon' ? 'border-orange-200 border-t-orange-600' :
                    'border-[#fffff0]/20 border-t-[#fffff0]'
                }`}></div>
            </div>
        )}

        {isRsvpMode && rsvpWords.length > 0 && (() => {
            const rsvpFontClass = 'font-literata';

            const rsvpBorderClass = 
                appStyle === 'Bimbo' ? 'border-[#eac7d4] dark:border-[#4a1525]' :
                appStyle === 'Surf' ? 'border-[#cce1ed] dark:border-[#1e3a4c]' :
                (appStyle === 'Final' || appStyle === 'Final Fantasy') ? 'border-[#e0d6c1] dark:border-[#2d3036]' :
                appStyle === 'Dragon' ? 'border-[#e8dcc8] dark:border-[#3d2a22]' :
                appStyle === 'Marcel' ? 'border-[#C4B5E6] dark:border-[#363330]' :
                'border-black/30 dark:border-white/30';

            const isBimbo = appStyle === 'Bimbo';
            const isSurf = appStyle === 'Surf';
            const isMarcel = appStyle === 'Marcel';
            const isDragon = appStyle === 'Dragon';
            const isFinal = appStyle === 'Final' || appStyle === 'Final Fantasy';
            
            const accentColor = isMarcel ? '#544372' : isBimbo ? '#BE123C' : isSurf ? '#0ea5e9' : isDragon ? '#ea580c' : isFinal ? '#cca972' : (theme === 'light' ? '#2c2a28' : '#ffffff');
            const iconColor = isMarcel ? '#F3EFFB' : isBimbo ? '#FFFFFF' : isSurf ? '#FFFFFF' : (theme === 'light' ? '#ffffff' : '#1c1c1c');
            const controlColor = isMarcel ? '#544372' : isBimbo ? '#BE123C' : isSurf ? '#0284c7' : isDragon ? '#ea580c' : isFinal ? '#cca972' : (theme === 'light' ? '#1c1c1c' : '#ffffff');

            const windowStart = rsvpIndex;
            const windowEnd = Math.min(rsvpWords.length, rsvpIndex + 31);

            return (
                <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none backdrop-blur-md`}>
                    <div className={`pointer-events-auto w-full max-w-md mx-auto p-6 rounded-2xl shadow-2xl flex flex-col gap-6 -mt-32 ${theme === 'light' ? 'bg-white/90' : 'bg-[#23211f]/90'}`}>
                        {/* Separator lines and RSVP line */}
                        <div 
                            ref={rsvpWrapperRef}
                            className="relative w-full py-1.5 my-0.5 flex flex-col items-center justify-center overflow-hidden"
                        >
                            {/* Gradient masks to hide "flying" words */}
                            <div className="absolute inset-0 pointer-events-none z-10">
                                <div className={`absolute inset-y-0 left-0 w-24 bg-gradient-to-r ${theme === 'light' ? 'from-white via-white/80 to-transparent' : 'from-[#23211f] via-[#23211f]/80 to-transparent'}`} />
                                <div className={`absolute inset-y-0 right-0 w-24 bg-gradient-to-l ${theme === 'light' ? 'from-white via-white/80 to-transparent' : 'from-[#23211f] via-[#23211f]/80 to-transparent'}`} />
                            </div>

                            {/* Top divider line */}
                            <div className={`absolute top-0 left-0 right-0 h-[1.5px] ${theme === 'light' ? 'bg-neutral-900' : 'bg-white/30'}`} />
                            
                            {/* Top tick pointing down */}
                            <div 
                                className={`absolute top-0 w-[6px] h-[8px] -translate-x-1/2 ${theme === 'light' ? 'bg-black' : 'bg-white/50'}`}
                                style={{ 
                                    left: '35%',
                                    clipPath: 'polygon(0 0, 100% 0, 50% 100%)'
                                }}
                            />

                            {/* Bottom divider line */}
                            <div className={`absolute bottom-0 left-0 right-0 h-[1.5px] ${theme === 'light' ? 'bg-neutral-900' : 'bg-white/30'}`} />

                            {/* Bottom tick pointing up */}
                            <div 
                                className={`absolute bottom-0 w-[6px] h-[8px] -translate-x-1/2 ${theme === 'light' ? 'bg-black' : 'bg-white/50'}`}
                                style={{ 
                                    left: '35%',
                                    clipPath: 'polygon(50% 0, 0 100%, 100% 100%)'
                                }}
                            />

                            {/* RSVP Highlight Shadow */}
                            <div 
                                className="absolute top-0 bottom-0 pointer-events-none z-0"
                                style={{ 
                                    left: '35%', 
                                    width: '1.2ch', 
                                    backgroundColor: 'transparent',
                                    transform: 'translateX(-50%)',
                                    boxShadow: 'none'
                                }} 
                            />
                            
                            {/* The text row with reduced font size (text-base sm:text-lg) */}
                            <div className="w-full flex items-center h-8 text-base sm:text-lg font-normal tracking-tight relative overflow-hidden select-none">
                                <div 
                                    className="absolute left-0 top-0 bottom-0 h-full flex items-center whitespace-nowrap transition-transform duration-75 ease-in-out"
                                    style={{ 
                                        transform: `translateX(${rsvpTranslateX}px)`,
                                        willChange: 'transform'
                                    }}
                                >
                                    {rsvpWords.slice(windowStart, windowEnd).map((item, index) => {
                                        const originalIndex = windowStart + index;
                                        const isActive = originalIndex === rsvpIndex;
                                        
                                        const word = item.word;
                                        const match = word.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*)([^\p{L}\p{N}]*)$/u);
                                        let leading = "";
                                        let left = word;
                                        let mid = "";
                                        let right = "";
                                        let trailing = "";
                                        
                                        if (match) {
                                            leading = match[1];
                                            const coreWord = match[2];
                                            trailing = match[3];
                                            const L = coreWord.length;
                                            let orpIndex = 0;
                                            if (L <= 1) orpIndex = 0;
                                            else if (L <= 5) orpIndex = 1;
                                            else if (L <= 9) orpIndex = 2;
                                            else if (L <= 13) orpIndex = 3;
                                            else orpIndex = 4;
                                            
                                            left = coreWord.substring(0, orpIndex);
                                            mid = coreWord.charAt(orpIndex);
                                            right = coreWord.substring(orpIndex + 1);
                                        }
                                        
                                        let orpColorClass = 'font-normal';
                                        if (isActive) {
                                            orpColorClass = theme === 'light' ? 'text-[#480607] font-bold' : 'text-red-500 font-bold';
                                        }

                                        const textStyleClass = isActive 
                                            ? (theme === 'light' ? 'text-neutral-950 opacity-100 font-normal scale-100' : 'text-white opacity-100 font-normal scale-100')
                                            : (theme === 'light' ? 'text-neutral-400 opacity-25 font-normal' : 'text-neutral-500 opacity-25 font-normal');

                                        return (
                                            <React.Fragment key={originalIndex}>
                                                {item.isParagraphStart && originalIndex > rsvpIndex && (
                                                    <div className="w-64 sm:w-80 md:w-96 flex-shrink-0 opacity-100 transition-none" />
                                                )}
                                                <span 
                                                    data-rsvp-word-index={originalIndex}
                                                    className={`inline-block mx-1.5 whitespace-nowrap transition-none ${textStyleClass} ${rsvpFontClass}`}
                                                >
                                                    {leading && <span className="opacity-40">{leading}</span>}<span>{left}</span><span className={`rsvp-orp ${orpColorClass}`}>{mid}</span><span>{right}</span>{trailing && <span className="opacity-40">{trailing}</span>}
                                                </span>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>

                        </div>

                        <div className="flex items-center justify-center gap-6 md:gap-8">
                            <button 
                                onClick={() => {
                                    let i = rsvpIndex - 1;
                                    while (i > 0 && !rsvpWords[i].isParagraphStart) i--;
                                    setRsvpIndex(Math.max(0, i));
                                }}
                                className="transition-colors active:scale-95 transform p-2" 
                                style={{ color: controlColor }} 
                                
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>

                            <button 
                                onClick={() => {
                                    const isAtEnd = rsvpIndex >= rsvpWords.length - 1;
                                    if (isAtEnd && propChapterIndex < book.chapters.length - 1) {
                                        onChapterChange(propChapterIndex + 1, 'start');
                                    } else if (!isAtEnd) {
                                        setIsRsvpPlaying(!isRsvpPlaying);
                                    }
                                }}
                                className="w-16 h-16 md:w-20 md:h-20 rounded-full hover:scale-105 active:scale-95 flex items-center justify-center shadow-lg transition-all duration-300"
                                style={{ backgroundColor: accentColor, color: iconColor }}
                            >
                                {isRsvpPlaying ? (
                                    <Pause className="w-6 h-6 md:w-8 md:h-8 fill-current" />
                                ) : (
                                    (rsvpIndex >= rsvpWords.length - 1 && propChapterIndex < book.chapters.length - 1) ? (
                                        <SkipForward className="w-8 h-8 md:w-10 md:h-10 fill-current" />
                                    ) : (
                                        <Play className="w-6 h-6 md:w-8 md:h-8 fill-current ml-1" />
                                    )
                                )}
                            </button>

                            <button 
                                onClick={() => {
                                    let i = rsvpIndex + 1;
                                    while (i < rsvpWords.length && !rsvpWords[i].isParagraphStart) i++;
                                    setRsvpIndex(Math.min(rsvpWords.length - 1, i));
                                }}
                                className="transition-colors active:scale-95 transform p-2" 
                                style={{ color: controlColor }} 
                                
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center gap-4 items-center px-1">
                                <button 
                                    onClick={() => onRsvpWpmChange?.(Math.max(100, (rsvpWpm || 300) - 25))} 
                                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded active:scale-95 transition-transform"
                                >
                                    <Minus size={16}/>
                                </button>
                                <span className="text-sm font-mono font-bold">{rsvpWpm} WPM</span>
                                <button 
                                    onClick={() => onRsvpWpmChange?.(Math.min(1000, (rsvpWpm || 300) + 25))} 
                                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded active:scale-95 transition-transform"
                                >
                                    <Plus size={16}/>
                                </button>
                            </div>
                        </div>

                        <div className="w-full flex items-center relative h-6">
                            {/* Paragraph markers */}
                            <div className="absolute inset-0 flex items-center pointer-events-none px-2">
                                <div className="relative w-full h-1">
                                    {rsvpWords.map((word, i) => {
                                        if (word.isParagraphStart && i > 0) {
                                            const left = (i / (rsvpWords.length - 1)) * 100;
                                            return (
                                                <div 
                                                    key={i}
                                                    className={`absolute top-1/2 -translate-y-1/2 w-[1px] h-3 ${theme === 'light' ? 'bg-black/20' : 'bg-white/20'}`}
                                                    style={{ left: `${left}%` }}
                                                />
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>

                            <input
                                type="range"
                                min="0"
                                max={Math.max(0, rsvpWords.length - 1)}
                                value={rsvpIndex}
                                onChange={(e) => {
                                    setIsRsvpPlaying(false);
                                    setRsvpIndex(Number(e.target.value));
                                }}
                                className="w-full accent-current opacity-70 hover:opacity-100 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current transition-all z-10"
                                style={{
                                    background: `linear-gradient(to right, currentColor ${rsvpWords.length > 1 ? (rsvpIndex / (rsvpWords.length - 1)) * 100 : 0}%, rgba(128,128,128,0.2) ${rsvpWords.length > 1 ? (rsvpIndex / (rsvpWords.length - 1)) * 100 : 0}%)`,
                                    height: '4px',
                                    borderRadius: '2px'
                                }}
                            />
                        </div>
                    </div>
                </div>
            );
        })()}

        {/* Global Reader Styles Injection */}
        <style>{`
          @keyframes pulse-highlight {
            0%, 100% { box-shadow: 0 0 2px rgba(255,255,255,0.5); }
            50% { box-shadow: 0 0 8px rgba(255,255,255,0.8); background-color: rgba(255,255,255,0.35); }
          }
          .animate-pulse {
            animation: pulse-highlight 2s infinite;
          }
          
          /* Typography & Layout Fixes */
          .reader-content,
          .reader-content p,
          .reader-content div,
          .reader-content span,
          .reader-content h1,
          .reader-content h2,
          .reader-content h3,
          .reader-content h4,
          .reader-content h5,
          .reader-content h6,
          .reader-content a,
          .reader-content li,
          .reader-content td,
          .reader-content blockquote { 
             font-family: ${readerFontCSS} !important;
          }
          .reader-content {
             text-align: justify !important;
             text-justify: auto !important;
             text-rendering: optimizeLegibility !important;
             font-kerning: normal !important;
             font-feature-settings: "kern" 1, "liga" 1 !important;
             overflow-wrap: break-word !important;
             word-break: normal !important;
             hyphens: auto !important;
             -webkit-hyphens: auto !important;
             -ms-hyphens: auto !important;
          }

          .reader-content p,
          .reader-content div.paragraph,
          .reader-content p.calibre1,
          .reader-content p.calibre2,
          .reader-content p.calibre3,
          .reader-content blockquote p {
             text-align: justify !important;
             text-justify: inter-word !important;
             letter-spacing: -0.015em;
             word-spacing: normal;
          }

          .reader-content h1, 
          .reader-content h2, 
          .reader-content h3, 
          .reader-content h4, 
          .reader-content h5, 
          .reader-content h6,
          .reader-content .title,
          .reader-content strong.title,
          .reader-content .injected-title,
          .reader-content .subtitle {
             letter-spacing: normal !important;
             word-spacing: normal !important;
          }

          .reader-content v,
          .reader-content .verse,
          .reader-content p.verse {
             letter-spacing: normal !important;
             word-spacing: normal !important;
             text-align: left !important;
          }

          .reader-content em, .reader-content i { 
             font-style: italic !important; 
             ${appStyle === 'Bimbo' ? `color: ${theme === 'light' ? '#db2777' : '#fb7185'} !important;` : ''}
             ${appStyle === 'Final' || appStyle === 'Final Fantasy' ? `color: ${theme === 'light' ? '#b45309' : '#93c5fd'} !important;` : ''}
             ${appStyle === 'Dragon' ? `color: ${theme === 'light' ? '#c2410c' : '#ea580c'} !important;` : ''}
          }
          .reader-content strong, .reader-content b { 
             font-weight: bold !important; 
             ${appStyle === 'Bimbo' ? `color: ${theme === 'light' ? '#BE123C' : '#f472b6'} !important;` : ''}
             ${appStyle === 'Final' || appStyle === 'Final Fantasy' ? `color: ${theme === 'light' ? '#1e3a8a' : '#fcd34d'} !important;` : ''}
             ${appStyle === 'Dragon' ? `color: ${theme === 'light' ? '#991b1b' : '#f59e0b'} !important;` : ''}
          }

          /* Reset for standard blocks to prevent styling leaks from previous tags */
          .reader-content p, .reader-content div, .reader-content td, .reader-content table {
             font-style: normal;
          }

          /* Empty Line Support - ROBUST */
          .reader-content .empty-line {
              display: block !important;
              min-height: 0.8em !important;
              width: 100% !important;
              margin: 0.25em 0 !important;
              content: " ";
              clear: both;
          }

          /* PARAGRAPH INDENTATION - ALWAYS ON (Default Behavior) */
          .reader-content p {
             text-indent: 1.5em !important;
          }

          /* STYLED MODE: Indent removal logic */
          ${isStyledMode ? `
            /* Remove indent for first paragraph of chapter (unless starts with dash / no-dropcap) */
            .reader-content > p:first-of-type:not(.no-dropcap),
            .reader-content p.has-dropcap:not(.no-dropcap),
            /* Rule 1: If chapter starts with quote - remove indent (красную строку убираем) */
            .reader-content p.chapter-quote-start,
            /* Rule 2: If text under 3rd level heading starts with dash - remove indent (убираем красную строку) */
            .reader-content p.under-h3-dash,
            .reader-content h3 + p,
            .reader-content .h3 + p,
            .reader-content div.title.h3 + p,
            /* Rule 3: If text starts with italic - remove indent (красную строку убираем) */
            .reader-content p.chapter-italic-start,
            .reader-content p.starts-with-italic,
            /* Remove indent for paragraph following ANY header (unless it starts with a dash under h1/h2) */
            .reader-content h1 + p:not(.starts-with-dash):not(.chapter-dash-start):not(.no-dropcap),
            .reader-content h2 + p:not(.starts-with-dash):not(.chapter-dash-start):not(.no-dropcap),
            .reader-content h4 + p:not(.starts-with-dash):not(.no-dropcap),
            .reader-content h5 + p:not(.starts-with-dash):not(.no-dropcap),
            .reader-content h6 + p:not(.starts-with-dash):not(.no-dropcap),
            .reader-content .title:not(.h3) + p:not(.starts-with-dash):not(.chapter-dash-start):not(.no-dropcap),
            .reader-content .subtitle + p:not(.starts-with-dash):not(.no-dropcap) {
                text-indent: 0 !important;
            }

            /* Paragraphs starting with dash/hyphen (under h1, h2, or chapter start without h3) keep indent */
            .reader-content p.chapter-dash-start:not(.under-h3-dash),
            .reader-content p.starts-with-dash:not(.under-h3-dash),
            .reader-content p.no-dropcap:not(.chapter-quote-start):not(.chapter-italic-start):not(.starts-with-italic):not(.under-h3-dash) {
                text-indent: 1.5em !important;
            }

            /* Explicit overrides */
            /* 1. Rule 1: Chapter starting with quote ALWAYS has 0 indent and NO drop cap */
            .reader-content p.chapter-quote-start,
            .reader-content p.no-dropcap.chapter-quote-start {
                text-indent: 0 !important;
            }

            /* 2. Rule 2: Text under 3rd level heading starting with dash ALWAYS has 0 indent */
            .reader-content p.under-h3-dash,
            .reader-content h3 + p,
            .reader-content .h3 + p,
            .reader-content div.title.h3 + p,
            .reader-content h3 + p.under-h3-dash,
            .reader-content .h3 + p.under-h3-dash,
            .reader-content h3 + p.starts-with-dash,
            .reader-content .h3 + p.starts-with-dash,
            .reader-content p.no-dropcap.under-h3-dash {
                text-indent: 0 !important;
            }

            /* 3. Rule 3: Text starting with italic ALWAYS has 0 indent and NO drop cap */
            .reader-content p.chapter-italic-start,
            .reader-content p.starts-with-italic,
            .reader-content p.no-dropcap.chapter-italic-start,
            .reader-content p.no-dropcap.starts-with-italic {
                text-indent: 0 !important;
            }

            /* Drop Cap - ONLY for the very first paragraph of the chapter */
            .reader-content > p:first-of-type:not(.no-dropcap)::first-letter,
            .reader-content p.has-dropcap:not(.no-dropcap)::first-letter {
                float: left;
                font-size: 3.25em;
                line-height: 0.8;
                margin-right: 0.1em;
                margin-top: 0.05em;
                margin-bottom: -0.1em;
                font-weight: bold;
                font-family: ${readerFontCSS} !important;
                color: inherit;
                ${appStyle === 'Bimbo' ? `color: ${theme === 'light' ? '#BE123C' : '#fb7185'} !important;` : ''}
                ${appStyle === 'Final' || appStyle === 'Final Fantasy' ? `color: ${theme === 'light' ? '#2563eb' : '#60a5fa'} !important; text-shadow: ${theme === 'light' ? 'none' : '0 0 8px rgba(96,165,250,0.4)'} !important;` : ''}
                ${appStyle === 'Dragon' ? `color: ${theme === 'light' ? '#991b1b' : '#ef4444'} !important; text-shadow: ${theme === 'light' ? 'none' : '0 0 6px rgba(239, 68, 68, 0.5)'} !important;` : ''}
            }
          ` : ''}

          /* Headers - Ensure no indent and proper spacing */
          .reader-content h1, .reader-content h2, .reader-content h3, 
          .reader-content h4, .reader-content h5, .reader-content h6,
          .reader-content .injected-title,
          .reader-content .title,
          .reader-content .subtitle {
             text-indent: 0 !important;
             padding-left: 0 !important;
             margin-left: 0 !important;
             text-align: center !important;
             font-weight: bold;
             line-height: 1.3;
             margin-top: 1.5em;
             margin-bottom: 0.8em;
          }

          /* Main Chapter Titles (H1, H2) - Add Separator */
          .reader-content h1, .reader-content h2, .reader-content .title {
             font-size: 1.8em !important;
             border-bottom: 1px solid rgba(128,128,128, 0.3);
             padding-bottom: 0.6em;
             margin-bottom: 1.2em;
             ${appStyle === 'Bimbo' ? `color: ${theme === 'light' ? '#BE123C' : '#FFF0F5'} !important; border-bottom-color: ${theme === 'light' ? '#FBCFE8' : '#be123c'} !important;` : ''}
             ${appStyle === 'Final' || appStyle === 'Final Fantasy' ? `color: ${theme === 'light' ? '#92400e' : '#f0deba'} !important; border-bottom-color: ${theme === 'light' ? '#d97706' : '#dfc894'} !important;` : ''}
             ${appStyle === 'Dragon' ? `color: ${theme === 'light' ? '#991b1b' : '#fcd34d'} !important; border-bottom-color: ${theme === 'light' ? '#450a0a' : '#7f1d1d'} !important;` : ''}
          }
          
          /* Subtitles (H3+) - No Separator */
          .reader-content h3, .reader-content h4, .reader-content h5, 
          .reader-content h6, .reader-content .subtitle { 
             font-size: 1.4em !important; 
             border-bottom: none !important;
             padding-bottom: 0 !important;
             ${appStyle === 'Bimbo' ? `color: ${theme === 'light' ? '#BE123C' : '#fb7185'} !important;` : ''}
             ${appStyle === 'Final' || appStyle === 'Final Fantasy' ? `color: ${theme === 'light' ? '#1e40af' : '#a6c0ea'} !important;` : ''}
             ${appStyle === 'Dragon' ? `color: ${theme === 'light' ? '#7f1d1d' : '#b45309'} !important;` : ''}
          }

          /* Ensure elements inside headers also don't indent and allow multi-line titles */
          .reader-content h1 p, .reader-content h2 p, .reader-content h3 p, .reader-content h4 p,
          .reader-content .title p, .reader-content .subtitle p, .reader-content .injected-title p,
          .reader-content title p {
             text-indent: 0 !important;
             display: block !important;
             text-align: center !important;
             margin-top: 0.2em !important;
             margin-bottom: 0.2em !important;
             font-weight: bold !important;
          }

          .reader-content .title p:first-child,
          .reader-content h1 p:first-child,
          .reader-content h2 p:first-child {
             margin-top: 0 !important;
          }

          .reader-content .title p:last-child,
          .reader-content h1 p:last-child,
          .reader-content h2 p:last-child {
             margin-bottom: 0 !important;
          }

          /* Poem, Stanza, Verse (<poem>, <stanza>, <v>) Support */
          .reader-content poem,
          .reader-content .poem {
             display: block !important;
             margin: 1.2em 0 1.2em 2em !important;
             padding-left: 1em !important;
             border-left: 2px solid rgba(128, 128, 128, 0.2) !important;
          }

          .reader-content stanza,
          .reader-content .stanza {
             display: block !important;
             margin-top: 0.8em !important;
             margin-bottom: 0.8em !important;
          }

          .reader-content v,
          .reader-content .verse,
          .reader-content p.verse {
             display: block !important;
             text-indent: 0 !important;
             margin-top: 0.15em !important;
             margin-bottom: 0.15em !important;
             line-height: 1.4 !important;
             text-align: left !important;
          }

          /* COMPREHENSIVE MANDATORY ITALIC FOR ALL QUOTES, EPIGRAPHS, CITATIONS, ANNOTATIONS & AUTHORS */
          .reader-content poem,
          .reader-content .poem,
          .reader-content stanza,
          .reader-content .stanza,
          .reader-content v,
          .reader-content .verse,
          .reader-content epigraph,
          .reader-content .epigraph,
          .reader-content [class*="epigraph"],
          .reader-content [class*="Epigraph"],
          .reader-content cite,
          .reader-content .cite,
          .reader-content [class*="cite"],
          .reader-content [class*="Cite"],
          .reader-content blockquote,
          .reader-content [class*="quote"],
          .reader-content [class*="Quote"],
          .reader-content [class*="blockquote"],
          .reader-content [class*="Blockquote"],
          .reader-content annotation,
          .reader-content .annotation,
          .reader-content [class*="annotation"],
          .reader-content [class*="Annotation"],
          .reader-content text-author,
          .reader-content .text-author,
          .reader-content [class*="text-author"],
          .reader-content [class*="author"],
          .reader-content [class*="Author"],
          .reader-content poem *,
          .reader-content .poem *,
          .reader-content stanza *,
          .reader-content .stanza *,
          .reader-content v *,
          .reader-content .verse *,
          .reader-content epigraph *,
          .reader-content .epigraph *,
          .reader-content [class*="epigraph"] *,
          .reader-content [class*="Epigraph"] *,
          .reader-content cite *,
          .reader-content .cite *,
          .reader-content [class*="cite"] *,
          .reader-content [class*="Cite"] *,
          .reader-content blockquote *,
          .reader-content [class*="quote"] *,
          .reader-content [class*="Quote"] *,
          .reader-content [class*="blockquote"] *,
          .reader-content [class*="Blockquote"] *,
          .reader-content annotation *,
          .reader-content .annotation *,
          .reader-content [class*="annotation"] *,
          .reader-content [class*="Annotation"] *,
          .reader-content text-author *,
          .reader-content .text-author *,
          .reader-content [class*="text-author"] *,
          .reader-content [class*="author"] *,
          .reader-content [class*="Author"] * {
             font-style: italic !important;
          }

          .reader-content epigraph,
          .reader-content .epigraph,
          .reader-content [class*="epigraph"] {
             display: block !important;
             margin: 1.2em 0 1.2em auto !important;
             max-width: 80% !important;
             padding-left: 2em !important;
          }

          .reader-content epigraph p,
          .reader-content .epigraph p,
          .reader-content [class*="epigraph"] p {
             text-indent: 0 !important;
             margin: 0.3em 0 !important;
          }

          .reader-content cite,
          .reader-content .cite,
          .reader-content [class*="cite"],
          .reader-content blockquote,
          .reader-content [class*="quote"],
          .reader-content [class*="blockquote"] {
             display: block !important;
             margin: 1.5em 0 1.5em 2em !important;
             padding-left: 1.5em !important;
             border-left: 3px solid rgba(128, 128, 128, 0.4) !important;
             ${appStyle === 'Bimbo' ? `border-left-color: ${theme === 'light' ? '#FBCFE8' : '#be123c'} !important;` : ''}
             ${appStyle === 'Final' || appStyle === 'Final Fantasy' ? `border-left-color: ${theme === 'light' ? '#d97706' : '#dfc894'} !important;` : ''}
             ${appStyle === 'Dragon' ? `border-left-color: ${theme === 'light' ? '#991b1b' : '#f59e0b'} !important;` : ''}
          }

          .reader-content cite p,
          .reader-content .cite p,
          .reader-content [class*="cite"] p,
          .reader-content blockquote p,
          .reader-content [class*="quote"] p,
          .reader-content [class*="blockquote"] p {
             text-indent: 0 !important;
             margin: 0.4em 0 !important;
          }

          .reader-content text-author,
          .reader-content .text-author,
          .reader-content [class*="text-author"],
          .reader-content [class*="author"] {
             display: block !important;
             text-align: right !important;
             text-indent: 0 !important;
             margin-top: 0.5em !important;
             margin-bottom: 0.5em !important;
             opacity: 0.85 !important;
          }
          
          /* Cover Page Specifics */
          .reader-content .book-cover-page h1, 
          .reader-content .book-cover-page h2,
          .reader-content .book-cover-page .title {
             border-bottom: 0 !important;
             border: none !important;
             padding-bottom: 0 !important;
             margin-bottom: 0.5em !important;
          }
          
          /* Images */
          .reader-content img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1em auto;
            cursor: zoom-in; /* Indicate clickability */
          }
          
          /* Links (Footnotes & Refs) */
          .reader-content a {
            color: inherit !important;
            text-decoration-line: underline;
            text-decoration-style: solid;
            text-decoration-thickness: 1px;
            text-underline-offset: 4px;
            cursor: pointer;
            opacity: 0.75;
          }
          .reader-content a:hover {
            opacity: 1;
            text-decoration-thickness: 2px;
          }
          
          /* Footnotes Section Styling (for the dedicated chapter) */
          .reader-content .notes-list {
             margin-top: 2rem;
          }
          .reader-content .note-entry {
             margin-bottom: 1.5rem;
          }
          .reader-content .note-content {
             display: inline;
          }
          .reader-content .note-header {
             display: inline-block;
             margin-right: 0.5em;
          }
          .reader-content .note-back-link {
             text-decoration: none !important;
             font-weight: bold;
             background: rgba(128,128,128,0.2);
             padding: 0px 6px;
             border-radius: 4px;
          }
          .reader-content .note-divider {
             width: 20%;
             margin-top: 0.5rem;
             margin-bottom: 0.5rem;
             border-top: 1px solid rgba(128,128,128, 0.3);
          }

          /* Paged Mode Styles */
          .paged-content {
             column-fill: auto !important;
             height: 100% !important;
             box-sizing: border-box !important;
             overflow: visible !important;
             overflow-wrap: break-word !important;
             word-break: break-word !important;
          }

          .paged-content > *:first-child {
             margin-top: 0 !important;
          }

          .paged-content > *:last-child {
             margin-bottom: 0 !important;
          }

          .paged-content blockquote, 
          .paged-content table, 
          .paged-content figure {
             break-inside: avoid !important;
             -webkit-column-break-inside: avoid !important;
             page-break-inside: avoid !important;
          }

          .paged-content p {
             orphans: 2;
             widows: 2;
          }

          .paged-content h1, 
          .paged-content h2, 
          .paged-content h3, 
          .paged-content h4, 
          .paged-content h5, 
          .paged-content h6 {
             break-after: avoid !important;
             -webkit-column-break-after: avoid !important;
             page-break-after: avoid !important;
             break-inside: avoid !important;
             -webkit-column-break-inside: avoid !important;
             margin-top: 0.75em !important;
             margin-bottom: 0.5em !important;
          }

          .paged-content h3, 
          .paged-content h4, 
          .paged-content h5, 
          .paged-content h6 {
             break-before: column !important;
             -webkit-column-break-before: always !important;
             page-break-before: always !important;
          }

          .paged-content img {
             max-width: 100% !important;
             max-height: calc(100% - 20px) !important;
             object-fit: contain !important;
             break-inside: avoid !important;
             -webkit-column-break-inside: avoid !important;
             page-break-inside: avoid !important;
             display: block;
             margin: 0 auto;
          }
        `}</style>
        
        {isPagedMode ? (() => {
            const pageWidth = Math.max(100, containerWidth - 40); // 40px = 1.25rem left + 1.25rem right
            const isCoverPage = (propChapterIndex === 0 && (book?.chapters?.[0]?.name === 'Cover' || currentChapterTitle.toLowerCase() === 'cover' || processedContent.includes('book-cover-page'))) || currentChapterTitle.toLowerCase() === 'cover';
            const hasTopHeader = pageIndex > 0 && Boolean(currentChapterTitle) && !isCoverPage;

            return (
            <div 
                ref={pagedContainerRef}
                key={propChapterIndex}
                className="relative w-full h-full overflow-hidden select-none outline-none flex flex-col justify-between"
                onTouchStart={handlePagedTouchStart}
                onTouchMove={handlePagedTouchMove}
                onTouchEnd={handlePagedTouchEnd}
                onClick={handleTap}
                style={{ 
                    paddingTop: 'calc(96px + env(safe-area-inset-top))', 
                    paddingBottom: 'calc(128px + env(safe-area-inset-bottom))', 
                    paddingLeft: '1.25rem',
                    paddingRight: '1.25rem',
                    maxWidth: '56rem',
                    margin: '0 auto',
                    height: '100%'
                }}
            >
                <div 
                    className="h-full"
                    style={{
                        transform: `translateX(${-pageIndex * containerWidth + dragOffset}px)`,
                        transition: isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        willChange: 'transform'
                    }}
                >
                    <div 
                        ref={pagedContentRef}
                        lang="ru"
                        onClick={handleContentInteract}
                        className={`reader-content paged-content prose ${theme === 'light' ? 'prose-stone' : 'prose-invert'} prose-lg max-w-none`}
                        style={{
                            fontSize: `${fontSize}rem`,
                            lineHeight: '1.6',
                            width: `${pageWidth}px`,
                            columnWidth: `${pageWidth}px`,
                            columnGap: `${PAGE_GAP}px`,
                            columnFill: 'auto',
                            height: '100%',
                            boxSizing: 'border-box'
                        }}
                        dangerouslySetInnerHTML={{ __html: processedContent }} 
                    />
                </div>

                {/* Subtle side paper edge shadows */}
                <div className="absolute inset-y-0 right-0 w-6 pointer-events-none opacity-20 bg-gradient-to-l from-black/40 to-transparent z-10" />
                <div className="absolute inset-y-0 left-0 w-6 pointer-events-none opacity-20 bg-gradient-to-r from-black/40 to-transparent z-10" />

                {/* Top Stylized Divider Line along edge of top panel - hidden on page 1 of chapter & cover */}
                <div 
                    className={`absolute left-5 right-5 top-[calc(80px+env(safe-area-inset-top))] h-[1px] pointer-events-none z-10 transition-opacity duration-300 ${
                        hasTopHeader ? 'opacity-100' : 'opacity-0'
                    } ${
                        theme === 'light' 
                          ? (appStyle === 'Bimbo' ? 'bg-[#BE123C]/25' : appStyle === 'Surf' ? 'bg-[#0369a1]/25' : appStyle === 'Marcel' ? 'bg-[#544372]/25' : 'bg-stone-300/80')
                          : (appStyle === 'Bimbo' ? 'bg-[#e8cbd5]/25' : appStyle === 'Surf' ? 'bg-[#b5cbd6]/25' : appStyle === 'Marcel' ? 'bg-[#c4b5e6]/25' : 'bg-stone-700/80')
                    }`}
                />



                {/* Top Running Header: Chapter Title (centered vertically in top space, wrapping allowed) */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[calc(80px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex justify-center items-center pointer-events-none z-10 px-8"
                >
                    <span 
                        style={{ fontFamily: readerFontCSS }}
                        className={`text-lg sm:text-xl md:text-2xl tracking-wide line-clamp-2 leading-tight break-words max-w-[85%] text-center font-medium select-none transition-opacity duration-300 ${
                            hasTopHeader ? 'opacity-75' : 'opacity-0'
                        } ${
                            theme === 'light' 
                              ? (appStyle === 'Bimbo' ? 'text-[#881337]' : appStyle === 'Surf' ? 'text-[#0369a1]' : appStyle === 'Marcel' ? 'text-[#544372]' : 'text-stone-700')
                              : (appStyle === 'Bimbo' ? 'text-[#e8cbd5]' : appStyle === 'Surf' ? 'text-[#b5cbd6]' : appStyle === 'Marcel' ? 'text-[#c4b5e6]' : 'text-stone-300')
                        }`}
                    >
                        {currentChapterTitle}
                    </span>
                </div>

                {/* Bottom Running Footer: Page Numbers (centered vertically in bottom space) - hidden on cover */}
                <div 
                    className="absolute bottom-0 left-0 right-0 h-[calc(112px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] flex justify-center items-center pointer-events-none z-10 px-8"
                >
                    <span 
                        style={{ fontFamily: readerFontCSS }}
                        className={`text-base sm:text-lg md:text-xl tracking-wider font-medium text-center select-none transition-opacity duration-300 ${
                            isCoverPage ? 'opacity-0' : 'opacity-75'
                        } ${
                            theme === 'light' 
                              ? (appStyle === 'Bimbo' ? 'text-[#881337]' : appStyle === 'Surf' ? 'text-[#0369a1]' : appStyle === 'Marcel' ? 'text-[#544372]' : 'text-stone-700')
                              : (appStyle === 'Bimbo' ? 'text-[#e8cbd5]' : appStyle === 'Surf' ? 'text-[#b5cbd6]' : appStyle === 'Marcel' ? 'text-[#c4b5e6]' : 'text-stone-300')
                        }`}
                    >
                        {globalCurrentPage} / {globalTotalPages}
                    </span>
                </div>

                {/* Hover Arrows for Desktop */}
                {(pageIndex > 0 || propChapterIndex > 0) && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePageTurn('prev'); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white opacity-0 hover:opacity-100 transition-all z-20 hidden md:flex items-center justify-center shadow-md active:scale-90"
                        
                    >
                        <ChevronLeft size={22} />
                    </button>
                )}

                {(pageIndex < totalPages - 1 || propChapterIndex < book.chapters.length - 1) && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePageTurn('next'); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white opacity-0 hover:opacity-100 transition-all z-20 hidden md:flex items-center justify-center shadow-md active:scale-90"
                        
                    >
                        <ChevronRight size={22} />
                    </button>
                )}
            </div>
            );
        })() : (
            <div 
                ref={containerRef}
                key={propChapterIndex} 
                className={`reader-container reader-scroll w-full h-full transition-opacity duration-200 outline-none`}
                style={{ 
                    fontSize: `${fontSize}rem`, 
                    lineHeight: '1.6',
                    paddingTop: 'calc(80px + env(safe-area-inset-top))', 
                    paddingBottom: 'calc(112px + env(safe-area-inset-bottom) + 12px)', 
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                    maxWidth: '56rem',
                    margin: '0 auto',
                    height: '100%',
                    overflowY: 'auto'
                }}
                onClick={handleTap}
                onScroll={handleScroll}
            >
            
            <div 
                lang="ru"
                onClick={handleContentInteract}
                className={`reader-content prose ${theme === 'light' ? 'prose-stone' : 'prose-invert'} prose-lg max-w-none [&>img]:mx-auto [&>img]:max-w-full [&>img]:h-auto [&>img]:block`}
                dangerouslySetInnerHTML={{ __html: processedContent }} 
            />
            
            {/* End of Chapter Line (Replaces Text) */}
            {propChapterIndex < book.chapters.length - 1 ? (
                 <div className="w-full pb-4 pt-4 flex flex-col items-center justify-center">
                     <hr className={`w-20 border-t-2 opacity-30 mb-6 mt-4 ${hrClasses}`} />
                     
                     <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onChapterChange(propChapterIndex + 1, 'start');
                        }}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full border transition-all group shadow-md opacity-80 hover:opacity-100 ${nextBtnClasses}`}
                     >
                        <span className={appStyle === 'Final' || appStyle === 'Final Fantasy' ? 'text-xs font-ff tracking-[0.2em] font-medium' : (appStyle === 'Bimbo' ? 'text-base font-bimbo tracking-widest' : (appStyle === 'Surf' ? 'text-xl font-surf tracking-wider leading-none' : (appStyle === 'Dragon' ? 'text-sm font-dragon tracking-widest' : 'text-[10px] font-literata uppercase tracking-widest font-medium')))}>
                            {appStyle === 'Final' || appStyle === 'Final Fantasy' ? 'Journey Onward ☄️' : (appStyle === 'Bimbo' ? 'Thank you, next... 💅' : (appStyle === 'Surf' ? 'Catch the next wave 🏄' : (appStyle === 'Dragon' ? 'Roll for Initiative 🎲' : appStyle === 'Marcel' ? 'Turn page 🍵' : 'Continue')))}
                        </span>
                        <ChevronRight size={14} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                 </div>
            ) : (
                <div className="pt-8 pb-8 flex flex-col items-center justify-center">
                     <hr className={`w-64 border-t-2 opacity-50 ${hrClasses}`} />
                </div>
            )}

            </div>
        )}
    </div>
  );
};

export default EBookReader;