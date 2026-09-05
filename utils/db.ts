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
    const db = await initDB();
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    const store = tx.objectStore(BOOKS_STORE);
    
    // We need to make sure we don't save heavy chapter content if it's already parsed
    // But we DO need to save the original file data for manually added books
    // Since we can't save File objects, we might need to convert them to Blobs/ArrayBuffers
    
    await store.put(book);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Error saving book:", e);
  }
};

export const deleteBookFromDB = async (id: string) => {
  try {
    const db = await initDB();
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    await tx.objectStore(BOOKS_STORE).delete(id);
  } catch (e) {}
};

export const clearBooksFromDB = async () => {
  try {
    const db = await initDB();
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    await tx.objectStore(BOOKS_STORE).clear();
  } catch (e) {}
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