import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useDocumentStore } from '@/stores/documentStore'
import { useAuth } from '@/hooks/useAuth'

export default function Profile() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const documents = useDocumentStore((s) => s.documents)
  const folders = useDocumentStore((s) => s.folders)
  const scanCount = documents.filter((d) => d.type === 'scan').length

  const displayName = user?.full_name || user?.email?.split('@')[0] || t('profile.me')
  const displayEmail = user?.email || ''
  const avatarUrl = user?.avatar_url

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header / Profile */}
      <header className="border-b border-slate-100 bg-white px-6 pb-6 pt-12 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('profile.me')}
          </h1>
          <Link
            to="/settings"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined">settings</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-20 w-20 rounded-full border-2 border-white object-cover shadow-sm dark:border-slate-800"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-primary/10 shadow-sm dark:border-slate-800">
                <span className="text-2xl font-bold text-primary">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Profile info */}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
              {displayName}
            </h2>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {displayEmail}
            </p>
          </div>

          <Link
            to="/settings"
            className="shrink-0 rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            {t('profile.account')}
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Stats summary */}
        <div className="px-4 py-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="material-symbols-outlined mb-1 text-primary">description</span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{documents.length}</p>
              <p className="text-[11px] text-slate-500">{t('profile.documents')}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="material-symbols-outlined mb-1 text-primary">document_scanner</span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{scanCount}</p>
              <p className="text-[11px] text-slate-500">{t('profile.scans')}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="material-symbols-outlined mb-1 text-primary">folder</span>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{folders.length}</p>
              <p className="text-[11px] text-slate-500">{t('profile.foldersCount')}</p>
            </div>
          </div>
        </div>

        {/* Primary menu */}
        <div className="border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Link
            to="/settings"
            className="flex items-center gap-4 border-b border-slate-50 px-6 py-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">settings</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('profile.settings')}
            </span>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </Link>

          <Link
            to="/documents"
            className="flex items-center gap-4 border-b border-slate-50 px-6 py-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">folder</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('profile.myDocuments')}
            </span>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </Link>

          <a
            href="mailto:support@scanflow.app"
            className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">feedback</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('profile.feedback')}
            </span>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </a>
        </div>

        {/* Secondary menu */}
        <div className="mt-6 border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'ScanFlow',
                  text: 'Découvrez ScanFlow, l\'application de scan et gestion de PDF',
                  url: window.location.origin,
                }).catch(() => {})
              } else {
                navigator.clipboard.writeText(window.location.origin).catch(() => {})
              }
            }}
            className="flex w-full items-center gap-4 border-b border-slate-50 px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">share</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('profile.inviteFriends')}
            </span>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </button>

          <Link
            to="/about"
            className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">info</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('profile.about')}
            </span>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </Link>
        </div>

        {/* Logout */}
        <div className="mt-6 border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-red-50 dark:hover:bg-red-900/10"
          >
            <span className="material-symbols-outlined text-red-400">logout</span>
            <span className="flex-1 font-medium text-red-500">{t('auth.logout')}</span>
          </button>
        </div>

        {/* Version */}
        <div className="py-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">
            ScanFlow v1.0.0
          </p>
        </div>
      </main>
    </div>
  )
}
