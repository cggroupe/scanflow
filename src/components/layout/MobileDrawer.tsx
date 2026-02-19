import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { useAuth } from '@/hooks/useAuth'

const drawerLinks = [
  { path: '/dashboard', icon: 'home', i18nKey: 'nav.dashboard' },
  { path: '/documents', icon: 'description', i18nKey: 'nav.documents' },
  { path: '/scanner', icon: 'photo_camera', i18nKey: 'nav.scanner' },
  { path: '/tools', icon: 'handyman', i18nKey: 'nav.tools' },
  { path: '/profile', icon: 'person', i18nKey: 'nav.profile' },
]

export default function MobileDrawer() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { drawerOpen, closeDrawer } = useAppStore()
  const { signOut } = useAuth()

  function toggleLocale() {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')
  }

  async function handleLogout() {
    closeDrawer()
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white shadow-xl transition-transform duration-200 dark:bg-[#1a2b2a] ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 dark:border-slate-800">
          <h2 className="text-xl font-bold text-primary">ScanFlow</h2>
          <button
            onClick={closeDrawer}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 px-3 py-4">
          {drawerLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              onClick={closeDrawer}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`material-symbols-outlined text-xl ${isActive ? 'icon-filled' : ''}`}>
                    {link.icon}
                  </span>
                  {t(link.i18nKey)}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button
            onClick={toggleLocale}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-xl">language</span>
            {i18n.language === 'fr' ? 'English' : 'Français'}
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            {t('auth.logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
