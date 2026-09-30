import { useState, useEffect, useRef } from 'react';

export interface RsvpWord {
    word: string;
    node: Node;
    isParagraphStart?: boolean;
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

     const words: RsvpWord[] = [];
     let n;
     let lastBlockParent: Element | null = null;

     while (n = walker.nextNode()) {
         const val = n.nodeValue;
         if (!val || val.trim() === '') continue;
         
         const parent = n.parentElement;
         const blockParent = parent ? (parent.closest('p, div, h1, h2, h3, h4, h5, h6, li') || parent) : null;
         
         const split = val.split(/\s+/);
         let isFirstWordInNode = true;
         for (const w of split) {
             const cleanWord = w.trim().replace(/\xad/g, '');
             if (cleanWord.length > 0) {
                 const isParaStart = words.length > 0 && isFirstWordInNode && blockParent !== lastBlockParent;
                 words.push({ 
                     word: cleanWord, 
                     node: n, 
                     isParagraphStart: isParaStart 
                 });
                 isFirstWordInNode = false;
                 if (blockParent) {
                     lastBlockParent = blockParent;
                 }
             }
         }
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
     const hasMidPunctuation = /[,\x2d\u2013\u2014:;]$/.test(word);
     if (hasMidPunctuation) {
         pauseMultiplier = 1.6;
     }
     // 3. Pause at the end of a sentence (period, question, exclamation, ellipsis)
     const hasSentenceEnd = /[.?!]$/.test(word) || word.includes('...');
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
