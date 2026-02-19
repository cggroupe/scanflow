import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toolCategories } from '@/data/mockData'
import { useAppStore } from '@/stores/appStore'
import * as Icons from 'lucide-react'

function getIcon(name: string) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[name]
  return Icon ?? Icons.File
}

export default function Tools() {
  const { t } = useTranslation()
  const openDrawer = useAppStore((s) => s.openDrawer)

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={openDrawer} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">menu</span>
            </button>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.title')}</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {toolCategories.map((category) => (
          <div key={category.i18nKey} className="mt-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">{t(category.i18nKey)}</p>
            <div className="grid grid-cols-3 gap-3">
              {category.tools.map((tool) => {
                const Icon = getIcon(tool.icon)
                return (
                  <Link
                    key={tool.id}
                    to={tool.path}
                    className="group flex flex-col items-center gap-2"
                  >
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-xl transition-transform group-active:scale-95"
                      style={{ backgroundColor: `${tool.color}15` }}
                    >
                      <Icon className="h-6 w-6" style={{ color: tool.color }} />
                    </div>
                    <span className="text-center text-xs font-semibold text-slate-900 dark:text-slate-100">{t(tool.i18nKey)}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
