import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { useDocumentStore, formatFileSize, formatRelativeDate } from '@/stores/documentStore'

const quickActions = [
  { i18nKey: 'dashboard.smartScan', icon: 'center_focus_weak', path: '/scanner', bgClass: 'bg-primary/10', iconClass: 'text-primary icon-filled' },
  { i18nKey: 'dashboard.pdfToWord', icon: 'picture_as_pdf', path: '/tools/pdf-to-word', bgClass: 'bg-orange-50 dark:bg-orange-900/20', iconClass: 'text-orange-500' },
  { i18nKey: 'dashboard.importImages', icon: 'image', path: '/tools/jpg-to-pdf', bgClass: 'bg-blue-50 dark:bg-blue-900/20', iconClass: 'text-blue-500' },
]

function badgeColor(type: string) {
  if (type === 'pdf' || type === 'scan') return 'bg-primary'
  if (type === 'jpg') return 'bg-blue-500'
  return 'bg-slate-400'
}

export default function Dashboard() {
  const { t } = useTranslation()
  const openDrawer = useAppStore((s) => s.openDrawer)
  const documents = useDocumentStore((s) => s.documents)
  const recentDocs = documents.slice(0, 5)

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white px-4 pb-2 pt-4 dark:bg-[#1a2b2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={openDrawer} className="rounded-full p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">menu</span>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">ScanFlow</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">cloud_done</span>
            <Link to="/profile" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 transition-transform active:scale-90">
              <span className="material-symbols-outlined text-sm text-primary">person</span>
            </Link>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mt-3">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            type="text"
            placeholder={t('dashboard.searchPlaceholder')}
            className="h-10 w-full rounded-lg border-none bg-slate-100 pl-10 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 dark:bg-slate-800 dark:text-slate-100"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 hover:bg-slate-200 dark:hover:bg-slate-700">
            <span className="material-symbols-outlined text-slate-400">filter_list</span>
          </button>
        </div>
      </header>

      {/* Quick Actions */}
      <div className="border-b border-slate-100 bg-white px-4 py-5 dark:border-slate-800 dark:bg-[#1a2b2a]">
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={action.path}
              className="group flex flex-col items-center gap-2"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${action.bgClass} transition-transform group-active:scale-95`}>
                <span className={`material-symbols-outlined text-3xl ${action.iconClass}`}>{action.icon}</span>
              </div>
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{t(action.i18nKey)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Documents */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('dashboard.recentDocuments')}</h2>
          <Link to="/documents" className="text-sm font-medium text-primary">{t('dashboard.viewAll')}</Link>
        </div>

        {recentDocs.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">description</span>
            <p className="text-sm text-slate-400 dark:text-slate-500">Aucun document pour le moment</p>
            <Link to="/scanner" className="mt-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md">
              {t('dashboard.smartScan')}
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {recentDocs.map((doc) => (
              <Link
                key={doc.id}
                to={doc.blobUrl ? doc.blobUrl : '#'}
                onClick={(e) => {
                  e.preventDefault()
                  if (doc.blobUrl) {
                    const a = document.createElement('a')
                    a.href = doc.blobUrl
                    a.download = doc.title
                    a.click()
                  }
                }}
                className="flex items-center gap-4 rounded-xl border border-slate-50 bg-white p-3 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:bg-[#1a2b2a] dark:hover:bg-[#1e3332]"
              >
                {/* Thumbnail */}
                <div className="relative h-[72px] w-14 shrink-0 rounded bg-slate-200 dark:bg-slate-700">
                  <span className="material-symbols-outlined absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-slate-400">
                    description
                  </span>
                  <span className={`absolute bottom-0 right-0 rounded-tl px-1 py-0.5 text-[8px] font-bold uppercase text-white ${badgeColor(doc.type)}`}>
                    {doc.type === 'scan' ? 'PDF' : doc.type}
                  </span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{doc.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{formatRelativeDate(doc.createdAt)}</span>
                    <span className="text-slate-300">&#8226;</span>
                    <span>{formatFileSize(doc.size)}</span>
                  </div>
                </div>

                {/* Download icon */}
                <span className="material-symbols-outlined text-slate-400">download</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
