import { useState, useEffect, useRef } from 'react';

export interface RsvpWord {
    word: string;
    node: Node;
    isParagraphStart?: boolean;
    footnote?: string;
}

interface UseRsvpProps {
    isRsvpMode: boolean;
    processedContent: string;
    containerRef: React.RefObject<HTMLDivElement>;
    rsvpStartBlockIndexRef: React.MutableRefObject<number | null>;
    rsvpWpm: number;
    isPagedMode?: boolean;
    pagedContainerRef?: React.RefObject<HTMLDivElement>;
}

export function useRsvp({
    isRsvpMode,
    processedContent,
    containerRef,
    rsvpStartBlockIndexRef,
    rsvpWpm,
    isPagedMode,
    pagedContainerRef
}: UseRsvpProps) {
  const [rsvpWords, setRsvpWords] = useState<RsvpWord[]>([]);
  const [rsvpIndex, setRsvpIndex] = useState(0);
  const [isRsvpPlaying, setIsRsvpPlaying] = useState(false);
  const [rsvpTranslateX, setRsvpTranslateX] = useState(0);
  const rsvpWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     if (!isRsvpMode || !processedContent || !containerRef.current) {
         setIsRsvpPlaying(false);
         return;
     }

     const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT, {
         acceptNode: (node) => {
             if (node.parentElement?.closest('button')) {
                 return NodeFilter.FILTER_REJECT;
             }
             return NodeFilter.FILTER_ACCEPT;
         }
     });

     const isAlphaNumeric = (str: string) => /[\p{L}\p{N}]/u.test(str);
     const isOpeningPunct = (str: string) => /^[«“"‘'(\[{]/u.test(str);
     const isSentenceEndPunct = (str: string) => /[.?!…][.?!…»”"')\]]*$/u.test(str);

     const isFootnoteNode = (node: Node): boolean => {
         const el = node.parentElement;
         if (!el) return false;
         if (el.closest('sup, sub')) return true;
         const a = el.closest('a');
         if (a) {
             const href = a.getAttribute('href') || '';
             const id = a.getAttribute('id') || '';
             const epubType = a.getAttribute('epub:type') || '';
             const role = a.getAttribute('role') || '';
             if (epubType === 'noteref' || role === 'doc-noteref' || a.classList.contains('note-link') || a.classList.contains('noteref') || a.classList.contains('footnote')) {
                 return true;
             }
             if (/#(note|ref|fn|footnote|cite)/i.test(href) || /^(ref|note|fn)/i.test(id)) {
                 return true;
             }
         }
         return false;
     };

     const isFootnoteToken = (str: string, node: Node): boolean => {
         if (isFootnoteNode(node)) return true;
         return /^\[\d+\]$/u.test(str) || 
                /^\(\d+\)$/u.test(str) || 
                /^\*+$/u.test(str) || 
                /^[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u.test(str) || 
                /^\[[a-zа-яё]\]$/iu.test(str);
     };

     const words: RsvpWord[] = [];
     let n;
     let lastBlockParent: Element | null = null;
     let pendingLeading = "";
     let pendingLeadingNode: Node | null = null;
     let pendingParaStart = false;
     let pendingFootnote = "";

     while (n = walker.nextNode()) {
         const val = n.nodeValue;
         if (!val || val.trim() === '') continue;
         
         const parent = n.parentElement;
         const blockParent = parent ? (parent.closest('p, div, h1, h2, h3, h4, h5, h6, li') || parent) : null;
         const isNewBlock = blockParent !== lastBlockParent;

         if (isNewBlock) {
             if (pendingLeading && words.length > 0) {
                 words[words.length - 1].word += (words[words.length - 1].word.endsWith(' ') ? '' : ' ') + pendingLeading;
                 pendingLeading = "";
                 pendingLeadingNode = null;
             }
             if (pendingFootnote && words.length > 0) {
                 words[words.length - 1].footnote = (words[words.length - 1].footnote ? words[words.length - 1].footnote + ' ' : '') + pendingFootnote;
                 pendingFootnote = "";
             }
             pendingParaStart = true;
             if (blockParent) {
                 lastBlockParent = blockParent;
             }
         }

         const split = val.split(/\s+/);
         for (const w of split) {
             const cleanWord = w.trim().replace(/\xad/g, '');
             if (cleanWord.length === 0) continue;

             // Check if this token is a footnote reference marker
             if (isFootnoteToken(cleanWord, n)) {
                 if (words.length > 0) {
                     words[words.length - 1].footnote = (words[words.length - 1].footnote ? words[words.length - 1].footnote + ' ' : '') + cleanWord;
                 } else {
                     pendingFootnote = (pendingFootnote ? pendingFootnote + ' ' : '') + cleanWord;
                 }
                 continue;
             }

             // Check for inline footnote marker attached at end of word (e.g. "слово[1]" or "слово*")
             const inlineFnMatch = cleanWord.match(/^(.*?)(\[\d+\]|\(\d+\)|\*+|[¹²³⁴⁵⁶⁷⁸⁹⁰]+)$/u);
             let wordPart = cleanWord;
             let inlineFn = "";
             if (inlineFnMatch && inlineFnMatch[1].length > 0) {
                 wordPart = inlineFnMatch[1];
                 inlineFn = inlineFnMatch[2];
             }

             if (!isAlphaNumeric(wordPart)) {
                 // Pure punctuation token (e.g. "—", "!", "..", "...", "»", "(", etc.)
                 if (isNewBlock || words.length === 0 || isOpeningPunct(wordPart)) {
                     pendingLeading += (pendingLeading ? ' ' : '') + wordPart;
                     if (!pendingLeadingNode) pendingLeadingNode = n;
                 } else {
                     const lastWord = words[words.length - 1]?.word || '';
                     if (isSentenceEndPunct(lastWord) && /^[\x2d\u2013\u2014]+$/u.test(wordPart)) {
                         pendingLeading += (pendingLeading ? ' ' : '') + wordPart;
                         if (!pendingLeadingNode) pendingLeadingNode = n;
                     } else {
                         const needsSpace = /^[\x2d\u2013\u2014]+$/u.test(wordPart) && !words[words.length - 1].word.endsWith(' ');
                         words[words.length - 1].word += (needsSpace ? ' ' : '') + wordPart;
                     }
                 }
                 if (inlineFn) {
                     if (words.length > 0) {
                         words[words.length - 1].footnote = (words[words.length - 1].footnote ? words[words.length - 1].footnote + ' ' : '') + inlineFn;
                     } else {
                         pendingFootnote = (pendingFootnote ? pendingFootnote + ' ' : '') + inlineFn;
                     }
                 }
             } else {
                 // Token contains letters or digits - REAL WORD
                 let finalWord = wordPart;
                 const wordNode = pendingLeadingNode || n;
                 if (pendingLeading) {
                     const sep = /^[\x2d\u2013\u2014]+$/u.test(pendingLeading.trim()) ? ' ' : '';
                     finalWord = pendingLeading + sep + wordPart;
                     pendingLeading = "";
                     pendingLeadingNode = null;
                 }

                 const combinedFootnote = (pendingFootnote ? pendingFootnote + (inlineFn ? ' ' + inlineFn : '') : inlineFn) || undefined;
                 pendingFootnote = "";

                 const isParaStart = words.length > 0 && pendingParaStart;
                 words.push({
                     word: finalWord,
                     node: wordNode,
                     isParagraphStart: isParaStart,
                     footnote: combinedFootnote
                 });
                 pendingParaStart = false;
             }
         }
     }

     if (pendingLeading && words.length > 0) {
         words[words.length - 1].word += (words[words.length - 1].word.endsWith(' ') ? '' : ' ') + pendingLeading;
         pendingLeading = "";
     }
     if (pendingFootnote && words.length > 0) {
         words[words.length - 1].footnote = (words[words.length - 1].footnote ? words[words.length - 1].footnote + ' ' : '') + pendingFootnote;
         pendingFootnote = "";
     }

     setRsvpWords(words);
     
     let startIndex = 0;
     let foundStart = false;

     if (isPagedMode && pagedContainerRef?.current) {
         const containerRect = pagedContainerRef.current.getBoundingClientRect();
         for (let i = 0; i < words.length; i++) {
             const parent = words[i].node.parentElement;
             if (parent) {
                 const rect = parent.getBoundingClientRect();
                 const isVisible = rect.right > containerRect.left + 5 && 
                                   rect.left < containerRect.right - 5 && 
                                   rect.bottom > containerRect.top + 5 && 
                                   rect.top < containerRect.bottom - 5;
                 if (isVisible) {
                     startIndex = i;
                     foundStart = true;
                     break;
                 }
             }
         }
     }

     if (!foundStart && rsvpStartBlockIndexRef.current !== null && containerRef.current) {
         const blocks = Array.from(containerRef.current.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'));
         for (let bIdx = rsvpStartBlockIndexRef.current; bIdx < blocks.length; bIdx++) {
             const targetBlock = blocks[bIdx];
             for (let i = 0; i < words.length; i++) {
                 if (targetBlock.contains(words[i].node)) {
                     startIndex = i;
                     foundStart = true;
                     break;
                 }
             }
             if (foundStart) break;
         }
     }

     if (!foundStart && containerRef.current) {
         const containerRect = containerRef.current.getBoundingClientRect();
         for (let i = 0; i < words.length; i++) {
             const parent = words[i].node.parentElement;
             if (parent) {
                 const rect = parent.getBoundingClientRect();
                 const isVisible = rect.right > containerRect.left + 5 && 
                                   rect.left < containerRect.right - 5 && 
                                   rect.bottom > containerRect.top + 5 && 
                                   rect.top < containerRect.bottom - 5;
                 if (isVisible) {
                     startIndex = i;
                     if (!isPagedMode) {
                         // backtrack to first word of this block only in scroll mode
                         const blockParent = parent.closest('p, div, h1, h2, h3, h4, h5, h6, li') || parent;
                         while (startIndex > 0) {
                             const prevParent = words[startIndex - 1].node.parentElement;
                             if (prevParent && blockParent.contains(prevParent)) {
                                 startIndex--;
                             } else {
                                 break;
                             }
                         }
                     }
                     break;
                 }
             }
         }
     }

     setRsvpIndex(startIndex);
  }, [isRsvpMode, processedContent]);

  // Scientific play effect with dynamic duration calibrated by word length, punctuation, and paragraphs
  useEffect(() => {
     if (!isRsvpMode || !isRsvpPlaying || rsvpWords.length === 0) return;
     if (rsvpIndex >= rsvpWords.length - 1) {
         setIsRsvpPlaying(false);
         return;
     }

     const currentItem = rsvpWords[rsvpIndex];
     const word = currentItem?.word || "";
     const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, '');
     const L = cleanWord.length || 1;
     
     // Base interval in ms
     const baseInterval = 60000 / (rsvpWpm || 300);
     
     // 1. Proportional to word length (L = 5 is baseline 1.0)
     const lengthFactor = 0.7 + (L * 0.06);
     
     let pauseMultiplier = 1.0;
     // 2. Pause after punctuation (comma, semicolon, colon, dash)
     const hasMidPunctuation = /[,\x2d\u2013\u2014:;][»”"')\]\s]*$/u.test(word);
     if (hasMidPunctuation) {
         pauseMultiplier = 1.6;
     }
     // 3. Pause at the end of a sentence (period, question, exclamation, ellipsis)
     const hasSentenceEnd = /[.?!…][.?!…»”"')\]\s]*$/u.test(word) || word.includes('..') || word.includes('…');
     if (hasSentenceEnd) {
         pauseMultiplier = 2.4;
     }
     // 4. Pause between paragraphs (if next word starts a paragraph)
     const nextItem = rsvpWords[rsvpIndex + 1];
     if (nextItem && nextItem.isParagraphStart) {
         pauseMultiplier = 3.2;
     }
     
     // 5. Micro-pause for capitalized words (proper nouns, start of sentences)
     const isCapitalized = /^\p{Lu}/u.test(cleanWord);
     if (isCapitalized && !hasSentenceEnd) {
         pauseMultiplier *= 1.15; // 15% increase for capitalized words
     }
     
     const duration = baseInterval * lengthFactor * pauseMultiplier;
     
     const timerId = setTimeout(() => {
         setRsvpIndex(prev => prev + 1);
     }, duration);

     return () => clearTimeout(timerId);
  }, [isRsvpMode, isRsvpPlaying, rsvpIndex, rsvpWords, rsvpWpm]);

  // Calculate horizontal slide translation
  useEffect(() => {
       if (!isRsvpMode || rsvpWords.length === 0) return;
       
       const wrapper = rsvpWrapperRef.current;
       if (!wrapper) return;
       
       const activeWordEl = wrapper.querySelector(`[data-rsvp-word-index="${rsvpIndex}"]`) as HTMLElement;
        if (activeWordEl) {
            const wrapperWidth = wrapper.offsetWidth;
            const wordOffsetLeft = activeWordEl.offsetLeft;
            const wordWidth = activeWordEl.offsetWidth;
            // Find the ORP (colored focus character) element if it exists to align it perfectly
            const orpEl = activeWordEl.querySelector('.rsvp-orp') as HTMLElement;
            const orpOffsetLeft = orpEl ? orpEl.offsetLeft : (wordWidth * 0.35);
            const orpWidth = orpEl ? orpEl.offsetWidth : 0;
            
            // The absolute offset of the center of the ORP character within the sliding row
            const centerOffset = wordOffsetLeft + orpOffsetLeft + (orpWidth / 2);
            
            // Align the center of the ORP character to exactly 35% of the wrapper's width (where the ticks are)
            const targetX = (wrapperWidth * 0.35) - centerOffset;
            setRsvpTranslateX(targetX);
        }
  }, [rsvpIndex, rsvpWords, isRsvpMode]);

  return {
      rsvpWords,
      rsvpIndex,
      setRsvpIndex,
      isRsvpPlaying,
      setIsRsvpPlaying,
      rsvpTranslateX,
      rsvpWrapperRef
  };
}
