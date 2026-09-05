// @ts-ignore
import Hypher from 'hypher';
// @ts-ignore
import ruPattern from 'hyphenation.ru';
// @ts-ignore
import enPattern from 'hyphenation.en-us';

export interface CatalogBook {
  id: string;
  title: string;
  author: string;
  series?: string;
  year?: number | string;
  description?: string;
  coverBg?: string;
  coverTextColor?: string;
  coverUrl?: string;
  downloadUrl?: string;
  fallbackUrl?: string;
  fileSize: string;
  format?: string;
  pageCount?: number;
}

export interface CatalogSeries {
  id: string;
  name: string;
  authors: string[];
}

const ruHypher = new Hypher(ruPattern);
const enHypher = new Hypher(enPattern);

/**
 * Formats Russian text according to traditional typography rules:
 * - Proper Russian guillemets « »
 * - Em-dash — instead of hyphens
 * - Non-breaking spaces after short prepositions and conjunctions
 * - Soft hyphens for proper word wrapping
 */
export function formatTypography(text: string): string {
  if (!text) return '';

  let res = text
    // Replace quotes
    .replace(/(^|[\s(\[{<])"([a-zA-Zа-яА-ЯёЁ0-9])/g, '$1«$2')
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9.,!?:;])"/g, '$1»')
    .replace(/"/g, '»')
    // Replace hyphens to em-dashes
    .replace(/\s+-\s+/g, ' — ')
    .replace(/\s+--\s+/g, ' — ')
    .replace(/(\d+)-(\d+)/g, '$1–$2');

  // Bind short prepositions and conjunctions with non-breaking space
  res = res.replace(/(^|[\s(«])([вВнНиИкКуУсСоОаАяЯ]|об|Обиз|Из|за|За|от|От|до|До|по|По|не|Не|ни|Ни|же|ли|бы)\s+/g, '$1$2\u00A0');

  // Apply hyphenation with Hypher (both RU and EN patterns, including words adjacent to punctuation)
  try {
    res = enHypher.hyphenateText(ruHypher.hyphenateText(res));
  } catch (e) {
    console.error('Error hyphenating text:', e);
  }

  return res;
}

// Initial empty state, completely populated from GitHub repository
export const CATALOG_BOOKS: CatalogBook[] = [];

/**
 * Returns grouped series with unique authors for navigation
 */
export function getCatalogSeries(books: CatalogBook[] = []): CatalogSeries[] {
  const seriesMap = new Map<string, Set<string>>();

  books.forEach(book => {
    const seriesName = book.series || 'Без серии';
    if (!seriesMap.has(seriesName)) {
      seriesMap.set(seriesName, new Set());
    }
    if (book.author) {
      seriesMap.get(seriesName)!.add(book.author);
    }
  });

  return Array.from(seriesMap.entries()).map(([name, authorsSet]) => ({
    id: name,
    name,
    authors: Array.from(authorsSet)
  }));
}

/**
 * Returns approximate number of pages in printed book format
 * (Standard physical book page: 1,800 characters with spaces)
 */
export function getApproximatePageCount(book: CatalogBook): number {
  if (book.pageCount && book.pageCount > 0) {
    return book.pageCount;
  }
  if (book.fileSize) {
    const match = book.fileSize.match(/([\d.]+)\s*([КкMmМмGgГг]?[БbB])/);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      let bytes = val;
      if (unit.startsWith('К') || unit.startsWith('K')) bytes = val * 1024;
      else if (unit.startsWith('М') || unit.startsWith('M')) bytes = val * 1024 * 1024;

      const estimatedTextBytes = bytes > 1024 * 1024 ? Math.min(bytes * 0.12 + 200 * 1024, 600 * 1024) : bytes * 0.75;
      return Math.max(1, Math.round(estimatedTextBytes / 1800));
    }
  }
  return 100;
}

