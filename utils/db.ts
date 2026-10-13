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

export const saveBookToDB = async (book: any) => {
  try {
    if (!book || !book.id) return;

    // Never persist a deleted book!
    try {
      if (typeof window !== 'undefined') {
        const deletedStr = localStorage.getItem('cool_read_deleted');
        if (deletedStr) {
          const deletedIds: string[] = JSON.parse(deletedStr);
          if (deletedIds.includes(book.id) || (book.title && deletedIds.includes(book.title))) {
            return;
          }
        }
      }
    } catch (e) {}

    const db = await initDB();
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    const store = tx.objectStore(BOOKS_STORE);
    
    // Strip heavy chapter content before saving to IndexedDB to avoid storage explosion
    const cleanBook = {
      ...book,
      chapters: (book.chapters || []).map((ch: any) => {
        const { content, ...rest } = ch;
        return rest;
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

export const deleteBookFromDB = async (id: string, title?: string): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readwrite');
      const store = tx.objectStore(BOOKS_STORE);
      
      // Delete primary record
      store.delete(id);

      // Also clean up any lingering duplicate/aliased records matching this ID, path or title
      const cleanTitle = title?.trim().toLowerCase();
      const normId = id.replace(/^\/+/, '');
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          const val = cursor.value;
          if (val) {
            const valNormId = typeof val.id === 'string' ? val.id.replace(/^\/+/, '') : '';
            const valCleanTitle = typeof val.title === 'string' ? val.title.trim().toLowerCase() : '';
            const isMatch = val.id === id || 
              (valNormId && valNormId === normId) ||
              (cleanTitle && valCleanTitle && valCleanTitle === cleanTitle);
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
    const lowerDeleted = deletedIds.map(d => typeof d === 'string' ? d.trim().toLowerCase() : '');
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
            const valCleanTitle = typeof val.title === 'string' ? val.title.trim().toLowerCase() : '';
            const isDel = deletedIds.includes(val.id) || 
              (valNormId && normDeleted.includes(valNormId)) ||
              (valCleanTitle && lowerDeleted.includes(valCleanTitle));
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