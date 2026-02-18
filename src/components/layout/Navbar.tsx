import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { Menu, Globe } from 'lucide-react'

interface NavbarProps {
  readonly onMenuToggle: () => void
}

export default function Navbar({ onMenuToggle }: NavbarProps) {
  const { i18n } = useTranslation()
  const { user } = useAppStore()

  function toggleLocale() {
    const next = i18n.language === 'fr' ? 'en' : 'fr'
    i18n.changeLanguage(next)
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-surface px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5 text-text-primary" />
        </button>
        <h1 className="text-lg font-bold text-primary">ScanFlow</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleLocale}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-secondary hover:bg-gray-100"
        >
          <Globe className="h-4 w-4" />
          {i18n.language.toUpperCase()}
        </button>
        {user && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-white">
            {user.full_name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
          </div>
        )}
      </div>
    </header>
  )
}
