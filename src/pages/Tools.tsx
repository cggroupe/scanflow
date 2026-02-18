import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toolCategories } from '@/data/mockData'
import * as Icons from 'lucide-react'

function getIcon(name: string) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
  return Icon ?? Icons.File
}

export default function Tools() {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-text-primary">{t('tools.title')}</h1>

      {toolCategories.map((category) => (
        <div key={category.i18nKey}>
          <h2 className="mb-3 text-lg font-semibold text-text-primary">{t(category.i18nKey)}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {category.tools.map((tool) => {
              const Icon = getIcon(tool.icon)
              return (
                <Link
                  key={tool.id}
                  to={tool.path}
                  className="flex flex-col items-center gap-2 rounded-xl bg-surface p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: tool.color }}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-center text-xs font-medium text-text-primary">{t(tool.i18nKey)}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
