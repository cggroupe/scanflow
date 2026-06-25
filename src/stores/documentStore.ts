import { create } from 'zustand'
import { putBlob, getBlob, deleteBlob } from '@/lib/blobStore'

// ================================================================
// Types
// ================================================================

export interface StoredDocument {
  id: string
  title: string
  type: 'pdf' | 'jpg' | 'scan'
  size: number            // bytes
  createdAt: string       // ISO date
  folderId?: string       // optional folder assignment
  /** runtime object URL — rehydrated from IndexedDB on load (see lib/blobStore) */
  blobUrl?: string
}

export interface Folder {
  id: string
  title: string
  createdAt: string
}

interface DocumentState {
  /** Current user ID — scopes all localStorage reads/writes */
  currentUserId: string | null
  documents: StoredDocument[]
  folders: Folder[]
  /** Pending file to pass between pages (e.g., Scanner → Sign) */
  pendingFile: File | null

  /** Call when user logs in/out to load the right data */
  setCurrentUser: (userId: string | null) => void

  /** Add a document. Pass its binary as `blob` to persist it (survives reload). */
  addDocument: (doc: StoredDocument, blob?: Blob) => void
  removeDocument: (id: string) => void
  moveToFolder: (docId: string, folderId: string | undefined) => void
  setPendingFile: (file: File | null) => void

  addFolder: (folder: Folder) => void
  renameFolder: (id: string, title: string) => void
  removeFolder: (id: string) => void

  clearAllData: () => void
}

// ================================================================
// localStorage helpers (user-scoped)
// ================================================================

function docsKey(userId: string | null): string {
  return userId ? `scanflow_documents_${userId}` : 'scanflow_documents'
}

function foldersKey(userId: string | null): string {
  return userId ? `scanflow_folders_${userId}` : 'scanflow_folders'
}

function loadDocuments(userId: string | null): StoredDocument[] {
  try {
    const raw = localStorage.getItem(docsKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as StoredDocument[]
  } catch {
    return []
  }
}

function saveDocuments(docs: StoredDocument[], userId: string | null) {
  const serializable = docs.map(({ blobUrl: _, ...rest }) => rest)
  try {
    localStorage.setItem(docsKey(userId), JSON.stringify(serializable))
  } catch { /* localStorage full */ }
}

function loadFolders(userId: string | null): Folder[] {
  try {
    const raw = localStorage.getItem(foldersKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as Folder[]
  } catch {
    return []
  }
}

function saveFolders(folders: Folder[], userId: string | null) {
  try {
    localStorage.setItem(foldersKey(userId), JSON.stringify(folders))
  } catch { /* localStorage full */ }
}

// ================================================================
// Store
// ================================================================

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentUserId: null,
  documents: [],
  folders: [],
  pendingFile: null,

  setCurrentUser: (userId) => {
    // Revoke URLs from the previous session to avoid leaks
    get().documents.forEach((d) => { if (d.blobUrl) URL.revokeObjectURL(d.blobUrl) })

    const documents = loadDocuments(userId)
    set({
      currentUserId: userId,
      documents,
      folders: loadFolders(userId),
      pendingFile: null,
    })

    // Rehydrate file binaries from IndexedDB so documents survive a page reload.
    // Runs async: blobUrls fill in as each blob is read; UI updates progressively.
    void (async () => {
      for (const doc of documents) {
        if (get().currentUserId !== userId) return // user switched mid-hydration
        const current = get().documents.find((d) => d.id === doc.id)
        if (!current || current.blobUrl) continue
        const blob = await getBlob(doc.id)
        if (!blob) continue
        if (get().currentUserId !== userId) return
        const url = URL.createObjectURL(blob)
        set((state) => ({
          documents: state.documents.map((d) =>
            d.id === doc.id && !d.blobUrl ? { ...d, blobUrl: url } : d,
          ),
        }))
      }
    })()
  },

  addDocument: (doc, blob) => {
    const { currentUserId } = get()
    let stored = doc
    if (blob) {
      void putBlob(doc.id, blob)
      if (!stored.blobUrl) stored = { ...stored, blobUrl: URL.createObjectURL(blob) }
    }
    const next = [stored, ...get().documents]
    saveDocuments(next, currentUserId)
    set({ documents: next })
  },

  removeDocument: (id) => {
    const { currentUserId } = get()
    const target = get().documents.find((d) => d.id === id)
    if (target?.blobUrl) URL.revokeObjectURL(target.blobUrl)
    void deleteBlob(id)
    const next = get().documents.filter((d) => d.id !== id)
    saveDocuments(next, currentUserId)
    set({ documents: next })
  },

  moveToFolder: (docId, folderId) => {
    const { currentUserId } = get()
    const next = get().documents.map((d) =>
      d.id === docId ? { ...d, folderId } : d,
    )
    saveDocuments(next, currentUserId)
    set({ documents: next })
  },

  setPendingFile: (file) => set({ pendingFile: file }),

  addFolder: (folder) => {
    const { currentUserId } = get()
    const next = [...get().folders, folder]
    saveFolders(next, currentUserId)
    set({ folders: next })
  },

  renameFolder: (id, title) => {
    const { currentUserId } = get()
    const next = get().folders.map((f) => (f.id === id ? { ...f, title } : f))
    saveFolders(next, currentUserId)
    set({ folders: next })
  },

  removeFolder: (id) => {
    const { currentUserId } = get()
    const docs = get().documents.map((d) =>
      d.folderId === id ? { ...d, folderId: undefined } : d,
    )
    saveDocuments(docs, currentUserId)
    const nextFolders = get().folders.filter((f) => f.id !== id)
    saveFolders(nextFolders, currentUserId)
    set({ documents: docs, folders: nextFolders })
  },

  clearAllData: () => {
    const { currentUserId, documents } = get()
    documents.forEach((d) => {
      if (d.blobUrl) URL.revokeObjectURL(d.blobUrl)
      void deleteBlob(d.id)
    })
    localStorage.removeItem(docsKey(currentUserId))
    localStorage.removeItem(foldersKey(currentUserId))
    set({ documents: [], folders: [], pendingFile: null })
  },
}))

// ================================================================
// Helpers
// ================================================================

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return `Il y a ${diffDays} jours`

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
