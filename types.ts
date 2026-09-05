export type BookType = 'audio' | 'ebook' | 'pdf' | 'comic';
export type AppMode = BookType;

export interface Chapter {
  name: string;
  file?: File;
  path?: string; // Added: Native path for JIT loading
  url: string;   // Can be empty initially, populated on book select
  duration?: number;
  length?: number; // Character count for text progress
  content?: string;
  level?: number; // Added: For TOC hierarchy indentation
  isHeader?: boolean; // Added: True if outline bookmark
  pageIndex?: number; // Added: Target page number (0-indexed)
  startTime?: number; // Added: For single-file audiobook chapters
  endTime?: number;   // Added: For single-file audiobook chapters
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  series?: string;
  coverUrl?: string;
  coverFile?: File;
  chapters: Chapter[];
  type: BookType;
  format?: 'epub' | 'fb2' | 'pdf' | 'comic';
  size?: number;
}

export interface PlayerState {
  currentBookId: string | null;
  currentChapterIndex: number;
  currentTime: number;
  playbackRate: number;
  isPlaying: boolean;
  volume: number;
}

export interface Bookmark {
  id: string;
  chapterIndex: number;
  chapterName: string;
  snippet: string;
  textToFind: string;
  createdAt: number;
}

export interface PersistedState {
  bookId: string;
  chapterIndex: number;
  time: number;
  rate: number;
  lastUpdated: number;
  totalProgress?: number;
  chapterDurations?: Record<number, number>;
  fontSize?: number;
}