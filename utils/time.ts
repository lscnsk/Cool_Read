import { Chapter } from "../types";

export const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return "00:00";
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mStr = m < 10 ? `0${m}` : m;
  const sStr = s < 10 ? `0${s}` : s;

  if (h > 0) {
    const hStr = h < 10 ? `0${h}` : h;
    return `${hStr}:${mStr}:${sStr}`;
  }
  
  return `${mStr}:${sStr}`;
};

export const calculateTotalProgress = (
  currentChapterIndex: number, 
  chapters: Chapter[], 
  currentVal: number, // Time for audio, Ratio (0-1) for ebook
  currentMax: number // Duration for audio, 1 for ebook
): number => {
  if (!chapters || chapters.length === 0) return 0;
  
  const hasAudioSignature = chapters.some(c => (c.duration || 0) > 0) || (currentMax > 1.5);
  
  if (hasAudioSignature) {
    // AUDIO LOGIC
    let knownDuration = 0;
    let knownCount = 0;
    
    for (const ch of chapters) {
        if (ch.duration && ch.duration > 0) {
            knownDuration += ch.duration;
            knownCount++;
        }
    }

    // Estimate total duration
    // If we have some known durations, use average for unknown
    // If all are unknown, we'll use a virtual duration of 1.0 per chapter
    const avgDuration = knownCount > 0 ? knownDuration / knownCount : (currentMax > 0 ? currentMax : 1800);
    
    let totalDuration = 0;
    let accumulatedTime = 0;

    for (let i = 0; i < chapters.length; i++) {
        let dur = chapters[i].duration || 0;
        
        if (i === currentChapterIndex) {
            // Use the live currentMax for the active chapter
            dur = Math.max(dur, currentMax);
            totalDuration += dur;
            
            // Ceiling to 100% if we are at the very end of the last chapter
            const isLastChapter = i === chapters.length - 1;
            let effectiveVal = currentVal;
            if (isLastChapter && currentMax > 0 && currentVal > currentMax * 0.98) {
                effectiveVal = dur; // Snap to end
            }
            accumulatedTime += Math.min(dur, effectiveVal);
        } else {
            const chDur = dur > 0 ? dur : avgDuration;
            totalDuration += chDur;
            if (i < currentChapterIndex) {
                accumulatedTime += chDur;
            }
        }
    }
    
    if (totalDuration === 0) return 0;
    const result = (accumulatedTime / totalDuration) * 100;
    return Math.min(100, Math.max(0, result));

  } else {
    // EBOOK LOGIC (Strict character count based)
    let totalLength = 0;
    let accumulatedLength = 0;

    // Identify main content by ignoring notes/footnotes
    const isNotesChapter = (name: string) => {
        const lower = name.toLowerCase();
        return lower === 'сноски' || lower === 'notes' || lower === 'footnotes' || lower === 'примечания';
    };

    // If we are on the very last page/chapter of a PDF or Comic, it is 100% complete
    if (currentChapterIndex === chapters.length - 1 && currentVal > 0.98) {
        const isPdfOrComic = chapters.length > 0 && (!chapters[0].content || chapters[0].content.includes('<img'));
        if (isPdfOrComic) {
            return 100;
        }
    }

    // First pass: Calculate Total Length of Main Text
    for (const ch of chapters) {
        if (!isNotesChapter(ch.name || '')) {
            totalLength += (ch.length || 0); 
        }
    }

    if (totalLength === 0) {
        // Fallback if there are no lengths or only notes
        const totalChapters = chapters.length;
        if (totalChapters === 0) return 0;
        return Math.min(100, ((currentChapterIndex + currentVal) / totalChapters) * 100);
    }

    // Second pass: Calculate Accumulated
    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const isNotes = isNotesChapter(ch.name || '');
        const len = isNotes ? 0 : (ch.length || 0);
        
        if (i < currentChapterIndex) {
            accumulatedLength += len;
        } else if (i === currentChapterIndex) {
            // currentVal is ratio (0 to 1) representing scroll progress in current chapter
            accumulatedLength += (currentVal * len);
        }
    }
    
    const progress = (accumulatedLength / totalLength) * 100;
    // Cap at 100% so reading footnotes just shows 100%
    return Math.min(100, progress);
  }
};