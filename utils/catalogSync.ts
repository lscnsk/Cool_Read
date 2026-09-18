import { CatalogBook, CatalogSeries, CATALOG_BOOKS, CATALOG_SERIES, sortBooksChronologically } from '../data/catalogData';

const GITHUB_REPO_OWNER = 'lscnsk';
const GITHUB_REPO_NAME = 'lscnsk_library';
const CACHE_KEY = 'lscnsk_library_catalog_manifest_v2';
const CACHE_TIME_KEY = 'lscnsk_library_last_sync_time_v2';

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

function sanitizeBookCoverUrl(book: CatalogBook): CatalogBook {
  if (!book.coverUrl || book.coverUrl.startsWith('/covers/') || book.coverUrl.endsWith('.webp')) {
    const id = (book.id || book.filename.replace(/\.[^/.]+$/, '')).toLowerCase();
    return {
      ...book,
      coverUrl: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/covers/${id}.jpg`
    };
  }
  return book;
}

/**
 * Loads catalog books from fast local cache or defaults to CATALOG_BOOKS.
 * This is instantaneous and uses negligible memory (~15 KB).
 */
export function getStoredCatalogBooks(): CatalogBook[] {
  try {
    // Clear legacy v1 cache if present
    localStorage.removeItem('lscnsk_library_catalog_manifest_v1');

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sortBooksChronologically(parsed.map(sanitizeBookCoverUrl));
      }
    }
  } catch (e) {
    console.warn('Error reading catalog cache:', e);
  }
  return sortBooksChronologically(CATALOG_BOOKS.map(sanitizeBookCoverUrl));
}

export function buildCatalogSeriesFromBooks(books: CatalogBook[]): CatalogSeries[] {
  const seriesMap = new Map<string, { id: string; name: string; authorsSet: Set<string> }>();

  // Initialize with base CATALOG_SERIES
  CATALOG_SERIES.forEach(s => {
    seriesMap.set(s.name.toLowerCase(), {
      id: s.id,
      name: s.name,
      authorsSet: new Set(s.authors)
    });
  });

  // Extract series dynamically from all books
  (books || []).forEach(b => {
    if (b.series && b.series.trim()) {
      const sName = b.series.trim();
      const sKey = sName.toLowerCase();
      const existing = seriesMap.get(sKey);
      const author = b.author && b.author.trim() !== 'Неизвестный автор' ? b.author.trim() : '';

      if (existing) {
        if (author) existing.authorsSet.add(author);
      } else {
        const id = sKey.replace(/[^a-z0-9а-яё]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `series-${Math.random().toString(36).substring(2, 7)}`;
        const authorsSet = new Set<string>();
        if (author) authorsSet.add(author);
        seriesMap.set(sKey, { id, name: sName, authorsSet });
      }
    }
  });

  return Array.from(seriesMap.values()).map(s => ({
    id: s.id,
    name: s.name,
    authors: Array.from(s.authorsSet)
  }));
}

/**
 * Syncs the catalog metadata from GitHub without downloading full file contents.
 * Uses HTTP Range requests if probing new files to only fetch header metadata (< 4KB).
 * NEVER downloads or stores heavy Base64 content or full book bodies in the catalog cache.
 */
export async function syncCatalogFromGitHub(): Promise<{ books: CatalogBook[]; series: CatalogSeries[] }> {
  let controller: AbortController | null = null;
  let timeoutId: any = null;

  try {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), 8000); // 8s timeout

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      console.warn('GitHub API rate limited or unavailable, using current catalog');
      const cachedBooks = getStoredCatalogBooks();
      return { books: cachedBooks, series: buildCatalogSeriesFromBooks(cachedBooks) };
    }

    const items = await response.json();
    if (!Array.isArray(items)) {
      const cachedBooks = getStoredCatalogBooks();
      return { books: cachedBooks, series: buildCatalogSeriesFromBooks(cachedBooks) };
    }

    const fb2Files = items.filter((item: any) => 
      item.type === 'file' && item.name.toLowerCase().endsWith('.fb2')
    );

    // Discover covers from GitHub /covers directory
    const coversMap = new Map<string, string>(); // bookId -> downloadUrl
    try {
      const coversRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/covers`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (coversRes.ok) {
        const coverItems = await coversRes.json();
        if (Array.isArray(coverItems)) {
          coverItems.forEach((cItem: any) => {
            if (cItem.type === 'file') {
              const baseName = cItem.name.replace(/\.[^/.]+$/, '').toLowerCase();
              coversMap.set(baseName, cItem.download_url || `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/covers/${cItem.name}`);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not fetch covers directory from GitHub:', e);
    }

    const currentMap = new Map<string, CatalogBook>();
    CATALOG_BOOKS.forEach(b => currentMap.set(b.filename.toLowerCase(), b));
    getStoredCatalogBooks().forEach(b => currentMap.set(b.filename.toLowerCase(), b));

    const updatedBooks: CatalogBook[] = [];

    for (const item of fb2Files) {
      const lowerName = item.name.toLowerCase();
      const existing = currentMap.get(lowerName);
      const id = item.name.replace(/\.[^/.]+$/, '');
      const remoteCoverUrl = coversMap.get(id.toLowerCase());

      if (existing) {
        // Update file size & remote coverUrl if available
        updatedBooks.push({
          ...existing,
          fileSize: item.size ? formatBytes(item.size) : existing.fileSize,
          downloadUrl: item.download_url || existing.downloadUrl,
          coverUrl: remoteCoverUrl || existing.coverUrl
        });
      } else {
        // New book discovered! Probe first 4096 bytes ONLY to extract metadata safely
        let title = id;
        let author = '';
        let series = '';
        let year = '';
        let description = '';

        let probeTimeout: any = null;
        try {
          const probeController = new AbortController();
          probeTimeout = setTimeout(() => probeController.abort(), 4000);
          const probeRes = await fetch(item.download_url, {
            signal: probeController.signal,
            headers: { 'Range': 'bytes=0-4096' }
          });

          if (probeRes.ok) {
            const chunk = await probeRes.text();
            const titleMatch = chunk.match(/<book-title[^>]*>([\s\S]*?)<\/book-title>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            const authorMatch = chunk.match(/<author>([\s\S]*?)<\/author>/i)?.[1];
            if (authorMatch) {
              const fn = authorMatch.match(/<first-name[^>]*>([\s\S]*?)<\/first-name>/i)?.[1]?.trim() || '';
              const ln = authorMatch.match(/<last-name[^>]*>([\s\S]*?)<\/last-name>/i)?.[1]?.trim() || '';
              author = [fn, ln].filter(Boolean).join(' ');
            }

            const seqMatch = chunk.match(/<(?:sequence|series)[^>]*name=["']([^"']+)["']/i);
            if (seqMatch) series = seqMatch[1].trim();

            const dateMatch = chunk.match(/<date[^>]*>([\s\S]*?)<\/date>/i);
            if (dateMatch) year = dateMatch[1].replace(/<[^>]+>/g, '').trim();

            const annotMatch = chunk.match(/<annotation>([\s\S]*?)<\/annotation>/i);
            if (annotMatch) {
              description = annotMatch[1]
                .replace(/<p[^>]*>/gi, '')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]+>/g, '')
                .trim();
            }
          }
        } catch {
          // Range request fallback, simple title
        } finally {
          if (probeTimeout) clearTimeout(probeTimeout);
        }

        updatedBooks.push({
          id,
          filename: item.name,
          title: title || item.name,
          author: author || 'Неизвестный автор',
          series: series || undefined,
          year: year || undefined,
          description: description || undefined,
          coverBg: 'from-[#2a2421] to-[#171412]',
          coverTextColor: '#fffff0',
          coverUrl: remoteCoverUrl,
          downloadUrl: item.download_url,
          fallbackUrl: `https://cdn.jsdelivr.net/gh/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@main/${item.name}`,
          fileSize: item.size ? formatBytes(item.size) : 'FB2',
          format: 'fb2',
          pageCount: item.size
            ? (item.size > 1_200_000
                ? Math.max(1, Math.round((item.size - 1_100_000) / 3600))
                : Math.max(1, Math.round(item.size / 5000)))
            : undefined
        });
      }
    }

    const sorted = sortBooksChronologically(updatedBooks);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(sorted));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch (e) {
      console.warn('Could not save catalog cache to localStorage:', e);
    }

    return { books: sorted, series: buildCatalogSeriesFromBooks(sorted) };
  } catch (err) {
    console.error('Error syncing catalog:', err);
    const cachedBooks = getStoredCatalogBooks();
    return { books: cachedBooks, series: buildCatalogSeriesFromBooks(cachedBooks) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Downloads a single book file on explicit user demand.
 * Yields memory as soon as the File is instantiated for storage.
 */
export async function downloadCatalogBookFile(book: CatalogBook): Promise<File> {
  let response: Response | null = null;
  let error: any = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
    response = await fetch(book.downloadUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Primary download returned status ${response.status}`);
    }
  } catch (e) {
    error = e;
    if (book.fallbackUrl) {
      try {
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 12000);
        response = await fetch(book.fallbackUrl, { signal: fallbackController.signal });
        clearTimeout(fallbackTimeout);
        if (!response.ok) {
          throw new Error(`Fallback download returned status ${response.status}`);
        }
      } catch (fallbackError) {
        error = fallbackError;
      }
    }
  }

  if (!response || !response.ok) {
    throw new Error(`Не удалось скачать книгу "${book.title}": ${error?.message || 'ошибка сети или слабый интернет'}`);
  }

  const blob = await response.blob();
  const file = new File([blob], book.filename, {
    type: 'application/x-fictionbook+xml',
    lastModified: Date.now()
  });

  return file;
}
