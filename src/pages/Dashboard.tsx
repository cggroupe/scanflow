import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Camera, FileText, FolderOpen, Wrench } from 'lucide-react'

const quickActions = [
  { i18nKey: 'nav.scanner', icon: Camera, path: '/scanner', color: 'bg-primary' },
  { i18nKey: 'nav.documents', icon: FileText, path: '/documents', color: 'bg-info' },
  { i18nKey: 'nav.tools', icon: Wrench, path: '/tools', color: 'bg-warning' },
  { i18nKey: 'nav.projects', icon: FolderOpen, path: '/projects', color: 'bg-success' },
]

export default function Dashboard() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">{t('dashboard.title')}</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-surface p-4 shadow-sm">
          <p className="text-sm text-text-secondary">{t('dashboard.totalDocuments')}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">0</p>
        </div>
        <div className="rounded-xl bg-surface p-4 shadow-sm">
          <p className="text-sm text-text-secondary">{t('dashboard.totalScans')}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">0</p>
        </div>
        <div className="rounded-xl bg-surface p-4 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-sm text-text-secondary">{t('dashboard.storageUsed')}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">0 MB</p>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={action.path}
              className="flex flex-col items-center gap-2 rounded-xl bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${action.color}`}>
                <action.icon className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium text-text-primary">{t(action.i18nKey)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent documents */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">{t('dashboard.recentDocuments')}</h2>
        <div className="rounded-xl bg-surface p-8 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-text-secondary/30" />
          <p className="mt-3 text-sm text-text-secondary">Aucun document pour le moment</p>
          <Link to="/scanner" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            {t('nav.scanner')}
          </Link>
        </div>
      </div>
    </div>
  )
}
