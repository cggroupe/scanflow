import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { navigationItems } from '@/data/mockData'
import { X } from 'lucide-react'
import * as Icons from 'lucide-react'

interface SidebarProps {
  readonly open: boolean
  readonly onClose: () => void
}

function getIcon(name: string) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
  return Icon ?? Icons.File
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-surface shadow-lg transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none lg:border-r lg:border-gray-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4 lg:hidden">
          <span className="text-lg font-bold text-primary">ScanFlow</span>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
            <X className="h-5 w-5 text-text-primary" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {navigationItems.map((item) => {
            const Icon = getIcon(item.icon)
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {t(item.i18nKey)}
              </NavLink>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
