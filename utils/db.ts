const DB_NAME = 'AudiobookShelfDB';
const STORE_NAME = 'handles';
const BOOKS_STORE = 'books';
const FONTS_STORE = 'fonts';

export const initDB = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3); // Bump version for fonts
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FONTS_STORE)) {
        db.createObjectStore(FONTS_STORE, { keyPath: 'name' });
      }
    };
  });
};

export const unmarkBookAsDeleted = (bookId: string, title?: string, paths?: string[]): string[] => {
  try {
    if (typeof window === 'undefined') return [];
    const deletedStr = localStorage.getItem('cool_read_deleted');
    if (!deletedStr) return [];
    const deletedIds: string[] = JSON.parse(deletedStr);
    const cleanTitle = title?.trim().toLowerCase();
    const cleanPaths = (paths || []).map(p => p.trim().toLowerCase().replace(/^\/+/, ''));
    const normId = bookId.trim().toLowerCase().replace(/^\/+/, '');

    const updated = deletedIds.filter(item => {
      if (!item) return false;
      const strItem = String(item).trim().toLowerCase();
      const normItem = strItem.replace(/^\/+/, '');
      if (strItem === bookId.toLowerCase() || normItem === normId) return false;
      if (cleanTitle && strItem === cleanTitle) return false;
      if (cleanPaths.some(p => normItem === p || strItem === p)) return false;
      return true;
    });
    localStorage.setItem('cool_read_deleted', JSON.stringify(updated));
    return updated;
  } catch (e) {
    return [];
  }
};

export const saveBookToDB = async (book: any) => {
  try {
    if (!book || !book.id) return;

    // Explicitly unmark book from deleted log because it is being saved to the library
    unmarkBookAsDeleted(book.id, book.title, book.chapters?.map((c: any) => c.path || c.name));

    const db = await initDB();
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    const store = tx.objectStore(BOOKS_STORE);
    
    // For comics with heavy page images, avoid storing gigantic serialized base64 strings in IndexedDB.
    // For standard text ebooks (FB2, EPUB, PDF text) and audiobooks, preserve full chapter content and structure
    // so restarting the app never loses the loaded/started book!
    const isComic = book.format === 'comic';
    const cleanBook = {
      ...book,
      file: book.file || book.chapters?.[0]?.file || undefined,
      chapters: (book.chapters || []).map((ch: any) => {
        if (isComic) {
          const { content, ...rest } = ch;
          return rest;
        }
        return { ...ch };
      })
    };
    
    store.put(cleanBook);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Error saving book:", e);
  }
};

export const deleteBookFromDB = async (id: string, _title?: string): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readwrite');
      const store = tx.objectStore(BOOKS_STORE);
      
      // Delete primary record by ID
      store.delete(id);

      // Also clean up any lingering records matching this exact ID or normalized path
      const normId = id.replace(/^\/+/, '');
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          const val = cursor.value;
          if (val) {
            const valNormId = typeof val.id === 'string' ? val.id.replace(/^\/+/, '') : '';
            // Only delete by exact ID or exact normalized path, NEVER by title alone to avoid wiping re-uploaded books
            const isMatch = val.id === id || (valNormId && valNormId === normId);
            if (isMatch) {
              cursor.delete();
            }
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Error deleting book from DB:", e);
  }
};

export const purgeDeletedBooksFromDB = async (deletedIds: string[]): Promise<void> => {
  if (!deletedIds || deletedIds.length === 0) return;
  try {
    const normDeleted = deletedIds.map(d => typeof d === 'string' ? d.replace(/^\/+/, '') : '');

    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readwrite');
      const store = tx.objectStore(BOOKS_STORE);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          const val = cursor.value;
          if (val) {
            const valNormId = typeof val.id === 'string' ? val.id.replace(/^\/+/, '') : '';
            // Only purge by unique ID or exact path, never by generic book title
            const isDel = deletedIds.includes(val.id) || (valNormId && normDeleted.includes(valNormId));
            if (isDel) {
              cursor.delete();
            }
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Error purging deleted books from DB:", e);
  }
};

export const getAllPersistentBooks = async () => {
  try {
    const dbPromise = initDB();
    const timeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3000));
    
    const db = await Promise.race([dbPromise, timeoutPromise]) as IDBDatabase | any[];
    if (Array.isArray(db)) return db; // Returned from timeout

    return new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readonly');
      const req = tx.objectStore(BOOKS_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
     return [];
  }
};

export const saveDirectoryHandle = async (handle: any) => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, 'rootDirectory');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Error saving handle:", e);
  }
};

export const getDirectoryHandle = async () => {
  try {
    const db = await initDB();
    return new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('rootDirectory');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error("Error getting handle:", e);
    return undefined;
  }
};