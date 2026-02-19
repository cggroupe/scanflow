import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { useDocumentStore, formatFileSize, formatRelativeDate, type StoredDocument } from '@/stores/documentStore'

const filters = ['all', 'scanned', 'imported', 'pdfs'] as const

function badgeColor(type: string) {
  if (type === 'pdf' || type === 'scan') return 'bg-red-500'
  if (type === 'jpg') return 'bg-primary'
  return 'bg-slate-400'
}

function filterDocuments(docs: StoredDocument[], filter: string): StoredDocument[] {
  if (filter === 'all') return docs
  if (filter === 'scanned') return docs.filter((d) => d.type === 'scan')
  if (filter === 'imported') return docs.filter((d) => d.type === 'pdf' || d.type === 'jpg')
  if (filter === 'pdfs') return docs.filter((d) => d.type === 'pdf' || d.type === 'scan')
  return docs
}

export default function Documents() {
  const { t } = useTranslation()
  const openDrawer = useAppStore((s) => s.openDrawer)
  const documents = useDocumentStore((s) => s.documents)
  const folders = useDocumentStore((s) => s.folders)
  const removeDocument = useDocumentStore((s) => s.removeDocument)
  const addFolder = useDocumentStore((s) => s.addFolder)
  const renameFolder = useDocumentStore((s) => s.renameFolder)
  const removeFolder = useDocumentStore((s) => s.removeFolder)
  const moveToFolder = useDocumentStore((s) => s.moveToFolder)

  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [menuDocId, setMenuDocId] = useState<string | null>(null)
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Filter documents by folder view
  const visibleDocs = openFolderId
    ? documents.filter((d) => d.folderId === openFolderId)
    : documents.filter((d) => !d.folderId)

  const filtered = filterDocuments(visibleDocs, activeFilter).filter((d) =>
    search ? d.title.toLowerCase().includes(search.toLowerCase()) : true,
  )

  const currentFolder = folders.find((f) => f.id === openFolderId)

  function handleDownload(doc: StoredDocument) {
    if (doc.blobUrl) {
      const a = document.createElement('a')
      a.href = doc.blobUrl
      a.download = doc.title
      a.click()
    }
  }

  function handleShare(doc: StoredDocument) {
    if (navigator.share && doc.blobUrl) {
      fetch(doc.blobUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const file = new File([blob], doc.title, { type: 'application/pdf' })
          navigator.share({ files: [file], title: doc.title }).catch(() => {})
        })
    }
  }

  function handleDelete(id: string) {
    removeDocument(id)
    setMenuDocId(null)
  }

  function handleCreateFolder() {
    if (!newFolderName.trim()) return
    addFolder({
      id: `folder_${Date.now()}`,
      title: newFolderName.trim(),
      createdAt: new Date().toISOString(),
    })
    setNewFolderName('')
    setShowNewFolder(false)
  }

  function handleRenameFolder() {
    if (!renamingFolderId || !renameValue.trim()) return
    renameFolder(renamingFolderId, renameValue.trim())
    setRenamingFolderId(null)
    setRenameValue('')
  }

  function handleDeleteFolder(id: string) {
    removeFolder(id)
    setFolderMenuId(null)
    if (openFolderId === id) setOpenFolderId(null)
  }

  function handleMoveToFolder(docId: string, folderId: string) {
    moveToFolder(docId, folderId)
    setMenuDocId(null)
  }

  function handleRemoveFromFolder(docId: string) {
    moveToFolder(docId, undefined)
    setMenuDocId(null)
  }

  function docCountInFolder(folderId: string): number {
    return documents.filter((d) => d.folderId === folderId).length
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white px-4 pb-2 pt-6 dark:bg-[#131f1e]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {openFolderId ? (
              <button onClick={() => setOpenFolderId(null)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
              </button>
            ) : (
              <button onClick={openDrawer} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">menu</span>
              </button>
            )}
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {currentFolder ? currentFolder.title : t('documents.title')}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">sort</span>
            </button>
            <Link to="/profile" className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/20 transition-transform active:scale-90">
              <span className="material-symbols-outlined text-sm text-primary">person</span>
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 flex h-12 w-full items-center rounded-xl bg-gray-100 px-4 focus-within:ring-2 focus-within:ring-primary/50 dark:bg-gray-800">
          <span className="material-symbols-outlined text-gray-400">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('documents.searchPlaceholder')}
            className="ml-3 flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`shrink-0 rounded-full px-5 py-2 text-xs font-semibold transition-colors ${
                activeFilter === filter
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {t(`documents.filter.${filter}`)}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {/* Folders (only show at root level) */}
        {!openFolderId && (
          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{t('documents.folders')}</p>
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
              >
                <span className="material-symbols-outlined text-sm">create_new_folder</span>
                Nouveau
              </button>
            </div>

            {/* New folder input */}
            {showNewFolder && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <span className="material-symbols-outlined text-xl text-primary">create_new_folder</span>
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
                  placeholder="Nom du dossier..."
                  className="flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                />
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                  Créer
                </button>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} className="text-gray-400 hover:text-gray-600">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            )}

            {folders.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {folders.map((folder) => (
                  <div key={folder.id} className="relative">
                    {/* Rename input */}
                    {renamingFolderId === folder.id ? (
                      <div className="flex flex-col rounded-xl border border-primary bg-white p-3 dark:bg-gray-800">
                        <input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setRenamingFolderId(null) }}
                          className="mb-2 border-none bg-transparent text-sm font-semibold text-gray-900 outline-none dark:text-white"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleRenameFolder} className="flex-1 rounded bg-primary px-2 py-1 text-xs font-bold text-white">{t('common.save')}</button>
                          <button onClick={() => setRenamingFolderId(null)} className="flex-1 rounded border px-2 py-1 text-xs text-gray-600">{t('common.cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setOpenFolderId(folder.id)}
                        className="flex w-full flex-col rounded-xl border border-gray-100 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100 active:scale-[0.98] dark:border-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        <div className="flex items-start justify-between">
                          <span className="material-symbols-outlined icon-filled text-3xl text-amber-400">folder</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === folder.id ? null : folder.id) }}
                            className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            <span className="material-symbols-outlined text-sm">more_vert</span>
                          </button>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-white">{folder.title}</p>
                        <p className="text-[10px] text-gray-500">{docCountInFolder(folder.id)} {t('documents.items')}</p>
                      </button>
                    )}

                    {/* Folder context menu */}
                    {folderMenuId === folder.id && (
                      <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <button
                          onClick={() => { setRenamingFolderId(folder.id); setRenameValue(folder.title); setFolderMenuId(null) }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                          {t('common.rename')}
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                          {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files */}
        <div className="mt-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {t('documents.files')} ({filtered.length})
          </p>

          {filtered.length === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">description</span>
              <p className="text-sm text-slate-400">
                {openFolderId ? 'Ce dossier est vide' : 'Aucun document'}
              </p>
              <Link to="/scanner" className="mt-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md">
                Scanner un document
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex items-center gap-4 rounded-xl border-b border-gray-50 p-3 transition-colors hover:bg-gray-50 dark:border-gray-800/30 dark:hover:bg-gray-800"
                >
                  {/* Thumbnail */}
                  <button
                    onClick={() => handleDownload(doc)}
                    className="relative h-14 w-14 shrink-0 rounded-lg border border-gray-200 bg-gray-100 transition-transform active:scale-95 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <span className="material-symbols-outlined absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl text-gray-400">
                      description
                    </span>
                    <span className={`absolute bottom-1 right-1 rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase text-white ${badgeColor(doc.type)}`}>
                      {doc.type === 'scan' ? 'PDF' : doc.type}
                    </span>
                  </button>

                  {/* Info */}
                  <button onClick={() => handleDownload(doc)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{doc.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{formatRelativeDate(doc.createdAt)} &bull; {formatFileSize(doc.size)}</p>
                  </button>

                  {/* Action menu */}
                  <button
                    onClick={() => setMenuDocId(menuDocId === doc.id ? null : doc.id)}
                    className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  >
                    <span className="material-symbols-outlined text-lg">more_vert</span>
                  </button>

                  {/* Dropdown menu */}
                  {menuDocId === doc.id && (
                    <div className="absolute right-3 top-12 z-20 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      <button
                        onClick={() => { handleDownload(doc); setMenuDocId(null) }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <span className="material-symbols-outlined text-base">download</span>
                        {t('resultScreen.download')}
                      </button>
                      <button
                        onClick={() => { handleShare(doc); setMenuDocId(null) }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <span className="material-symbols-outlined text-base">share</span>
                        {t('resultScreen.share')}
                      </button>

                      {/* Move to folder */}
                      {folders.length > 0 && (
                        <>
                          <hr className="my-1 border-gray-100 dark:border-gray-700" />
                          {openFolderId && (
                            <button
                              onClick={() => handleRemoveFromFolder(doc.id)}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <span className="material-symbols-outlined text-base">drive_file_move_outline</span>
                              Retirer du dossier
                            </button>
                          )}
                          {folders.filter((f) => f.id !== openFolderId).map((folder) => (
                            <button
                              key={folder.id}
                              onClick={() => handleMoveToFolder(doc.id, folder.id)}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <span className="material-symbols-outlined text-base text-amber-400">folder</span>
                              {folder.title}
                            </button>
                          ))}
                        </>
                      )}

                      <hr className="my-1 border-gray-100 dark:border-gray-700" />
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                        {t('common.delete')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
