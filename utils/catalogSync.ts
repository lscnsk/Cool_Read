import { CatalogBook, CatalogSeries, CATALOG_BOOKS } from '../data/catalogData';
import localforage from 'localforage';

const GITHUB_REPO_OWNER = 'lscnsk';
const GITHUB_REPO_NAME = 'lscnsk_library';
const GITHUB_BRANCH = 'main';

const API_CONTENTS_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents`;
const CACHE_KEY = 'lscnsk_library_catalog_v10';
const CACHE_TIME_KEY = 'lscnsk_library_last_sync_v10';
const KNOWN_FILES_KEY = 'lscnsk_known_repo_files_v1';
const DEFAULT_KNOWN_FILES = ['GE.fb2'];

/**
 * Returns user-specified or discovered files to probe if GitHub directory APIs are throttled or stale.
 */
export async function getKnownRepoFiles(): Promise<string[]> {
  try {
    const saved = await localforage.getItem<string[]>(KNOWN_FILES_KEY);
    if (Array.isArray(saved) && saved.length > 0) {
      const merged = Array.from(new Set([...DEFAULT_KNOWN_FILES, ...saved]));
      return merged;
    }
  } catch {}
  return [...DEFAULT_KNOWN_FILES];
}

/**
 * Adds a new book filename or relative path to the list of known files to probe.
 */
export async function addKnownRepoFile(filename: string): Promise<boolean> {
  const clean = filename.trim().replace(/^\/+/, '');
  if (!clean) return false;
  try {
    const current = await getKnownRepoFiles();
    if (!current.includes(clean)) {
      const updated = [...current, clean];
      await localforage.setItem(KNOWN_FILES_KEY, updated);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes a filename from the known files list.
 */
export async function removeKnownRepoFile(filename: string): Promise<void> {
  try {
    const current = await getKnownRepoFiles();
    const updated = current.filter(f => f.toLowerCase() !== filename.toLowerCase());
    await localforage.setItem(KNOWN_FILES_KEY, updated);
  } catch {}
}

// Clear out legacy caches from previous versions
try {
  localforage.removeItem('lscnsk_library_catalog_v4').catch(() => {});
  localforage.removeItem('lscnsk_library_catalog_v5').catch(() => {});
  localforage.removeItem('lscnsk_library_catalog_v6').catch(() => {});
  localforage.removeItem('lscnsk_library_catalog_v7').catch(() => {});
  localforage.removeItem('lscnsk_library_catalog_v8').catch(() => {});
  localforage.removeItem('lscnsk_library_catalog_v9').catch(() => {});
  localStorage.removeItem('lscnsk_library_catalog_v3');
  localStorage.removeItem('lscnsk_library_catalog_v4');
  localStorage.removeItem('lscnsk_library_catalog_v5');
  localStorage.removeItem('lscnsk_library_catalog_v6');
  localStorage.removeItem('lscnsk_library_catalog_v7');
  localStorage.removeItem('lscnsk_library_catalog_v8');
  localStorage.removeItem('lscnsk_library_catalog_v9');
} catch {}

const PALETTES = [
  { bg: 'from-[#3a2027] to-[#1e1014]', text: '#f7ceda' },
  { bg: 'from-[#1e293b] to-[#0f172a]', text: '#93c5fd' },
  { bg: 'from-[#2d1b4e] to-[#130b24]', text: '#e9d5ff' },
  { bg: 'from-[#1b3a2f] to-[#0b1f18]', text: '#a7f3d0' },
  { bg: 'from-[#3a2f1b] to-[#1f190b]', text: '#fde68a' },
  { bg: 'from-[#3b1d1d] to-[#1c0c0c]', text: '#fca5a5' },
  { bg: 'from-[#1e333a] to-[#0d1a1e]', text: '#bae6fd' },
];

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

function parseFilenameFallback(filename: string): { title: string; author?: string; extension: string } {
  const cleanName = filename.replace(/\.[^/.]+$/, '');
  const ext = filename.split('.').pop()?.toUpperCase() || 'FB2';

  if (cleanName.includes(' - ')) {
    const parts = cleanName.split(' - ');
    return {
      author: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
      extension: ext
    };
  }

  return {
    title: cleanName.trim(),
    extension: ext
  };
}

/**
 * Extracts pure, authentic metadata directly from FB2 XML content
 */
export function extractFB2Metadata(xmlString: string): {
  title?: string;
  author?: string;
  year?: string;
  series?: string;
  annotation?: string;
  coverBase64?: string;
  pageCount?: number;
} {
  const result: {
    title?: string;
    author?: string;
    year?: string;
    series?: string;
    annotation?: string;
    coverBase64?: string;
    pageCount?: number;
  } = {};

  try {
    // 1. Title
    const titleMatch = xmlString.match(/<title-info>[\s\S]*?<book-title[^>]*>([\s\S]*?)<\/book-title>/i) 
      || xmlString.match(/<book-title[^>]*>([\s\S]*?)<\/book-title>/i);
    if (titleMatch) {
      result.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // 2. Author
    const authorBlockMatch = xmlString.match(/<title-info>[\s\S]*?<author>([\s\S]*?)<\/author>/i)
      || xmlString.match(/<author>([\s\S]*?)<\/author>/i);
    if (authorBlockMatch) {
      const block = authorBlockMatch[1];
      const fn = block.match(/<first-name[^>]*>([\s\S]*?)<\/first-name>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      const mn = block.match(/<middle-name[^>]*>([\s\S]*?)<\/middle-name>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      const ln = block.match(/<last-name[^>]*>([\s\S]*?)<\/last-name>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      const nick = block.match(/<nickname[^>]*>([\s\S]*?)<\/nickname>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      
      const fullName = [fn, mn, ln].filter(Boolean).join(' ');
      if (fullName) {
        result.author = fullName;
      } else if (nick) {
        result.author = nick;
      }
    }

    // 3. Series / Sequence (support both <sequence> and <series> with name attr or inner text)
    // 3a. Attribute name in <sequence ...> or <series ...>
    const seqAttrMatch = xmlString.match(/<(?:sequence|series)[^>]*name=["']([^"']+)["'][^>]*>/i);
    if (seqAttrMatch) {
      const seqName = seqAttrMatch[1].trim();
      const numMatch = seqAttrMatch[0].match(/number=["']([^"']+)["']/i);
      result.series = numMatch ? `${seqName} #${numMatch[1]}` : seqName;
    } else {
      // 3b. Inner text in <series>...</series> or <sequence>...</sequence>
      const seqTagMatch = xmlString.match(/<(?:sequence|series)[^>]*>([\s\S]*?)<\/(?:sequence|series)>/i);
      if (seqTagMatch) {
        const text = seqTagMatch[1].replace(/<[^>]+>/g, '').trim();
        if (text) {
          result.series = text;
        }
      } else {
        // 3c. Check in publish-info
        const pubSeq = xmlString.match(/<publish-info>[\s\S]*?<(?:sequence|series)[^>]*name=["']([^"']+)["']/i);
        if (pubSeq) {
          result.series = pubSeq[1].trim();
        }
      }
    }

    // 4. Year / Date
    const dateMatch = xmlString.match(/<title-info>[\s\S]*?<date[^>]*>([\s\S]*?)<\/date>/i)
      || xmlString.match(/<date[^>]*value=["']([^"']+)["']/i);
    if (dateMatch) {
      result.year = dateMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // 5. Real Annotation (written by author or publisher in the file)
    const annotMatch = xmlString.match(/<title-info>[\s\S]*?<annotation[^>]*>([\s\S]*?)<\/annotation>/i)
      || xmlString.match(/<annotation[^>]*>([\s\S]*?)<\/annotation>/i);
    if (annotMatch) {
      result.annotation = annotMatch[1]
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .trim();
    }

    // 6. Coverpage image from embedded <binary>
    const coverMatch = xmlString.match(/<coverpage>[\s\S]*?<image[^>]*href=["']#?([^"']+)["']/i);
    if (coverMatch) {
      const coverId = coverMatch[1].replace(/^#/, '');
      const binRegex = new RegExp(`<binary[^>]*id=["']${coverId}["'][^>]*>([\\s\\S]*?)<\\/binary>`, 'i');
      const binMatch = xmlString.match(binRegex);
      if (binMatch && binMatch[1]) {
        const fullTag = binMatch[0];
        const mimeMatch = fullTag.match(/content-type=["']([^"']+)["']/i);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const cleanBase64 = binMatch[1].replace(/\s+/g, '');
        if (cleanBase64.length > 50) {
          result.coverBase64 = `data:${mime};base64,${cleanBase64}`;
        }
      }
    }

    // 7. Approximate printed book page count (standard physical page: ~1,800 chars with spaces)
    try {
      const bodyMatches = Array.from(xmlString.matchAll(/<body[^>]*>([\s\S]*?)<\/body>/gi));
      let bodyText = bodyMatches.length > 0 ? bodyMatches.map(m => m[1]).join(' ') : xmlString;
      bodyText = bodyText.replace(/<binary[^>]*>[\s\S]*?<\/binary>/gi, '');
      const textOnly = bodyText
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (textOnly.length > 0) {
        result.pageCount = Math.max(1, Math.round(textOnly.length / 1800));
      }
    } catch (pageErr) {
      console.warn('Error calculating pages:', pageErr);
    }
  } catch (err) {
    console.warn('Error parsing XML metadata:', err);
  }

  return result;
}

/**
 * Verifies that cached books still physically exist in the repository.
 * Drops any books that return confirmed HTTP 404 (deleted from GitHub).
 */
async function filterExistingBooks(books: CatalogBook[]): Promise<CatalogBook[]> {
  if (!books || books.length === 0) return [];
  const checks = await Promise.all(
    books.map(async (book) => {
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 3500);
        let res = await fetch(book.downloadUrl || '', { signal: ctrl.signal });
        clearTimeout(timeoutId);
        ctrl.abort();

        // If primary download URL gave 404, verify with fallback CDN before dropping
        if (res.status === 404 && book.fallbackUrl) {
          try {
            const ctrl2 = new AbortController();
            const timeoutId2 = setTimeout(() => ctrl2.abort(), 3500);
            const res2 = await fetch(book.fallbackUrl, { signal: ctrl2.signal });
            clearTimeout(timeoutId2);
            ctrl2.abort();
            if (res2.ok) return book;
          } catch {}
          return null; // Confirmed deleted from both sources
        }

        if (res.status === 404) {
          return null;
        }

        return book;
      } catch {
        return book; // Retain when offline or during transient errors
      }
    })
  );
  return checks.filter((b): b is CatalogBook => b !== null);
}

/**
 * Fetches repository file list using multiple independent sources:
 * 1. GitHub Contents API (direct)
 * 2. GitHub Git Trees API (direct recursive)
 * 3. Commit-pinned jsDelivr flat API (bypasses CDN cache & rate limits)
 * 4. jsDelivr flat API on branch
 *
 * Returns null if all network sources fail (so caller knows NOT to wipe cache).
 */
async function getRepositoryFiles(): Promise<any[] | null> {
  // Source 1: GitHub Contents API (simple GET)
  try {
    const freshUrl = `${API_CONTENTS_URL}?t=${Date.now()}`;
    const res = await fetch(freshUrl);
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items)) {
        return items;
      }
    } else {
      console.warn(`GitHub Contents API status ${res.status} (rate limit or forbidden), trying Git Trees API...`);
    }
  } catch (apiErr) {
    console.warn('GitHub API fetch failed, trying Git Trees API:', apiErr);
  }

  // Source 2: GitHub Git Trees API (recursive uncached listing)
  try {
    const treesUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/git/trees/${GITHUB_BRANCH}?recursive=1&t=${Date.now()}`;
    const treeRes = await fetch(treesUrl);
    if (treeRes.ok) {
      const treeData = await treeRes.json();
      if (Array.isArray(treeData.tree)) {
        return treeData.tree.map((node: any) => ({
          name: node.path,
          type: node.type === 'blob' ? 'file' : node.type,
          size: node.size || 0,
          download_url: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${encodeURIComponent(node.path)}`
        }));
      }
    }
  } catch (treeErr) {
    console.warn('GitHub Git Trees API failed, trying commit SHA + jsDelivr...', treeErr);
  }

  // Source 3: Commit SHA + jsDelivr (commit-pinned trees are always fresh and free of GitHub rate limits)
  try {
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/commits?per_page=1&t=${Date.now()}`);
    if (commitRes.ok) {
      const commits = await commitRes.json();
      const latestSha = commits[0]?.sha;
      if (latestSha) {
        const jsdUrl = `https://data.jsdelivr.com/v1/package/gh/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${latestSha}/flat?t=${Date.now()}`;
        const jsdRes = await fetch(jsdUrl);
        if (jsdRes.ok) {
          const jsdData = await jsdRes.json();
          if (Array.isArray(jsdData.files)) {
            return jsdData.files.map((f: any) => {
              const cleanName = f.name.replace(/^\//, '');
              return {
                name: cleanName,
                type: 'file',
                size: f.size,
                download_url: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${encodeURIComponent(cleanName)}`
              };
            });
          }
        }
      }
    }
  } catch (jsdErr) {
    console.warn('Commit-pinned jsDelivr flat API failed:', jsdErr);
  }

  // Source 4: jsDelivr flat branch API
  try {
    const jsdBranchUrl = `https://data.jsdelivr.com/v1/package/gh/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${GITHUB_BRANCH}/flat?t=${Date.now()}`;
    const jsdRes = await fetch(jsdBranchUrl);
    if (jsdRes.ok) {
      const jsdData = await jsdRes.json();
      if (Array.isArray(jsdData.files) && jsdData.files.length > 0) {
        return jsdData.files.map((f: any) => {
          const cleanName = f.name.replace(/^\//, '');
          return {
            name: cleanName,
            type: 'file',
            size: f.size,
            download_url: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${encodeURIComponent(cleanName)}`
          };
        });
      }
    }
  } catch (e) {
    console.warn('jsDelivr flat branch API failed:', e);
  }

  // Return null to indicate all network directory listings failed (e.g. rate-limit or network failure)
  return null;
}

/**
 * Returns cached catalog without triggering any network requests.
 */
export async function getCachedCatalog(): Promise<CatalogBook[]> {
  try {
    const cached = await localforage.getItem<CatalogBook[]>(CACHE_KEY);
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch (e) {
    console.warn('Failed to read catalog cache:', e);
  }
  return CATALOG_BOOKS;
}

/**
 * Dynamically fetches and parses the actual library from GitHub repository
 */
export async function fetchRepositoryCatalog(
  forceFresh: boolean = false
): Promise<CatalogBook[]> {
  let cachedBooks: CatalogBook[] = [];
  try {
    const cached = await localforage.getItem<CatalogBook[]>(CACHE_KEY);
    if (Array.isArray(cached) && cached.length > 0) {
      cachedBooks = await filterExistingBooks(cached);
      // If any deleted books were dropped, update cache immediately
      if (cachedBooks.length !== cached.length) {
        await localforage.setItem(CACHE_KEY, cachedBooks);
      }
    }
  } catch (e) {
    console.warn('Failed to read catalog cache:', e);
  }

  if (forceFresh || cachedBooks.length === 0) {
    try {
      const freshBooks = await fetchAndCacheRepo();
      if (Array.isArray(freshBooks) && freshBooks.length > 0) {
        return freshBooks;
      }
    } catch (err) {
      console.warn('Error fetching fresh catalog:', err);
    }
  }

  if (cachedBooks.length > 0) {
    return cachedBooks;
  }
  return CATALOG_BOOKS;
}

async function fetchAndCacheRepo(): Promise<CatalogBook[]> {
  try {
    const items = await getRepositoryFiles();

    // If all remote directory APIs failed (e.g. rate limit), PRESERVE existing cache or seed data!
    if (items === null) {
      console.warn('Repository file listing could not be fetched (rate limit or offline), keeping cached catalog');
      const cached = await localforage.getItem<CatalogBook[]>(CACHE_KEY);
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
      return CATALOG_BOOKS;
    }

    const bookExtensions = ['.fb2', '.epub', '.txt', '.pdf', '.mobi', '.cbr', '.cbz'];
    const bookFiles = items.filter((item: any) => {
      if (item.type !== 'file') return false;
      const lower = item.name.toLowerCase();
      return bookExtensions.some(ext => lower.endsWith(ext));
    });

    const parsedBooks: (CatalogBook | null)[] = await Promise.all(
      bookFiles.map(async (file: any, index: number) => {
        const filename = file.name;
        const palette = PALETTES[index % PALETTES.length];
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${encodeURIComponent(filename)}`;
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${GITHUB_BRANCH}/${encodeURIComponent(filename)}`;
        const downloadUrl = file.download_url || rawUrl;
        const fallback = parseFilenameFallback(filename);

        let title = fallback.title;
        let author = fallback.author || '';
        let series = '';
        let year = '';
        let description = '';
        let coverUrl: string | undefined = undefined;
        let pageCount: number | undefined = undefined;

        // If file is FB2, fetch and parse its authentic internal metadata
        if (filename.toLowerCase().endsWith('.fb2')) {
          try {
            let rawRes: Response | null = null;
            try {
              rawRes = await fetch(`${downloadUrl}?t=${Date.now()}`);
            } catch {
              rawRes = null;
            }

            // Fallback to high-speed CDN if raw GitHub content is blocked or failed
            if (!rawRes || (!rawRes.ok && rawRes.status !== 404)) {
              try {
                rawRes = await fetch(`${cdnUrl}?t=${Date.now()}`);
              } catch {}
            }

            if (rawRes && rawRes.status === 404) {
              return null; // File was confirmed deleted from GitHub
            }

            if (rawRes && rawRes.ok) {
              const xmlText = await rawRes.text();
              const meta = extractFB2Metadata(xmlText);
              if (meta.title) title = meta.title;
              if (meta.author) author = meta.author;
              if (meta.series) series = meta.series;
              if (meta.year) year = meta.year;
              if (meta.annotation) description = meta.annotation;
              if (meta.coverBase64) coverUrl = meta.coverBase64;
              if (meta.pageCount) pageCount = meta.pageCount;
            }
          } catch (e) {
            console.warn(`Could not read metadata for ${filename}:`, e);
          }
        }

        return {
          id: `repo-${file.sha || index}-${filename.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-')}`,
          title,
          author: author || 'Автор не указан',
          series: series || undefined,
          year: year || undefined,
          fileSize: formatBytes(file.size),
          format: fallback.extension,
          downloadUrl,
          fallbackUrl: cdnUrl,
          coverUrl,
          coverBg: palette.bg,
          coverTextColor: palette.text,
          description: description || undefined,
          pageCount
        };
      })
    );

    const validBooks = parsedBooks.filter((b): b is CatalogBook => b !== null);

    // Save fresh snapshot to cache
    await localforage.setItem(CACHE_KEY, validBooks);
    await localforage.setItem(CACHE_TIME_KEY, new Date().toISOString());
    return validBooks;
  } catch (err) {
    console.warn('Error syncing repository catalog:', err);
  }

  // Fallback to cache if network request fails, but drop any 404s
  try {
    const cached = await localforage.getItem<CatalogBook[]>(CACHE_KEY);
    if (Array.isArray(cached) && cached.length > 0) {
      return await filterExistingBooks(cached);
    }
  } catch {}

  return CATALOG_BOOKS;
}

/**
 * Returns grouped series with unique authors for navigation
 */
export function getCatalogSeriesFromBooks(books: CatalogBook[]): CatalogSeries[] {
  const seriesMap = new Map<string, Set<string>>();

  books.forEach(book => {
    const seriesName = book.series || 'Без серии';
    if (!seriesMap.has(seriesName)) {
      seriesMap.set(seriesName, new Set());
    }
    if (book.author && book.author !== 'Автор не указан') {
      seriesMap.get(seriesName)!.add(book.author);
    }
  });

  return Array.from(seriesMap.entries()).map(([name, authorsSet]) => ({
    id: name,
    name,
    authors: Array.from(authorsSet)
  }));
}
