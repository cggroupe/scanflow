// Tiny IndexedDB-backed binary store for document files.
//
// localStorage holds only document metadata (it caps at ~5 MB and cannot store
// Blobs). The actual PDF/JPG bytes live here, keyed by the document id, so a
// document survives a page reload instead of becoming an unopenable "ghost".
//
// Dependency-free and fail-soft: if IndexedDB is unavailable (private mode,
// blocked, quota), every call degrades to a no-op / undefined rather than throwing.

const DB_NAME = 'scanflow'
const STORE = 'blobs'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        console.warn('[blobStore] open failed', req.error)
        resolve(null)
      }
    } catch (err) {
      console.warn('[blobStore] open threw', err)
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
  fallback: T,
  label: string,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve) => {
        if (!db) {
          resolve(fallback)
          return
        }
        try {
          const req = op(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve((req.result as T) ?? fallback)
          req.onerror = () => {
            console.warn(`[blobStore] ${label} failed`, req.error)
            resolve(fallback)
          }
        } catch (err) {
          console.warn(`[blobStore] ${label} threw`, err)
          resolve(fallback)
        }
      }),
  )
}

/** Store (or overwrite) the binary for a document id. */
export function putBlob(id: string, blob: Blob): Promise<void> {
  return run('readwrite', (s) => s.put(blob, id), undefined, 'put').then(() => undefined)
}

/** Retrieve a document's binary, or undefined if absent / unavailable. */
export function getBlob(id: string): Promise<Blob | undefined> {
  return run<Blob | undefined>('readonly', (s) => s.get(id), undefined, 'get')
}

/** Remove a document's binary. No-op if absent. */
export function deleteBlob(id: string): Promise<void> {
  return run('readwrite', (s) => s.delete(id), undefined, 'delete').then(() => undefined)
}
