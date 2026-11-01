const DB_NAME = "websnap";
const DB_VERSION = 1;
export type StoreName = "designs" | "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("designs")) db.createObjectStore("designs");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function putRecord(store: StoreName, key: string, value: unknown): Promise<IDBValidKey> {
  return run(store, "readwrite", (s) => s.put(value, key));
}

export function getRecord<T>(store: StoreName, key: string): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(key));
}
