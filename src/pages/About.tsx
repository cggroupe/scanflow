import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function About() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 pb-4 pt-6 dark:border-slate-800 dark:bg-[#1a2b2a]">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t('about.title')}
          </h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* App logo + name */}
        <div className="flex flex-col items-center px-6 py-10">
          <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-5xl text-white">document_scanner</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ScanFlow</h2>
          <p className="mt-1 text-sm text-slate-500">v1.0.0</p>
        </div>

        {/* Description */}
        <div className="px-6">
          <div className="rounded-xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t('about.description')}
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-6 px-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {t('about.features')}
          </p>
          <div className="space-y-3">
            {[
              { icon: 'document_scanner', key: 'about.featureScan' },
              { icon: 'build', key: 'about.featureTools' },
              { icon: 'draw', key: 'about.featureSign' },
              { icon: 'folder', key: 'about.featureOrganize' },
              { icon: 'share', key: 'about.featureShare' },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="material-symbols-outlined text-primary">{item.icon}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t(item.key)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact / Legal */}
        <div className="mt-6 px-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {t('about.contact')}
          </p>
          <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            <a
              href="mailto:support@scanflow.app"
              className="flex items-center gap-4 border-b border-slate-50 px-5 py-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined text-slate-400">mail</span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                support@scanflow.app
              </span>
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-4 border-b border-slate-50 px-5 py-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined text-slate-400">gavel</span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('about.termsOfService')}
              </span>
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined text-slate-400">policy</span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('about.privacyPolicy')}
              </span>
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="py-8 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-600">
            &copy; {new Date().getFullYear()} ScanFlow. {t('about.allRightsReserved')}
          </p>
        </div>
      </main>
    </div>
  )
}
