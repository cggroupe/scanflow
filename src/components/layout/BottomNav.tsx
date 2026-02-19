import { NavLink } from 'react-router-dom'

const tabs = [
  { path: '/dashboard', icon: 'home', label: 'Accueil' },
  { path: '/documents', icon: 'description', label: 'Docs' },
  { path: '/__fab__', icon: '', label: '' }, // spacer for FAB
  { path: '/tools', icon: 'handyman', label: 'Outils' },
  { path: '/profile', icon: 'person', label: 'Moi' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-100 bg-white/95 px-4 pb-6 pt-2 backdrop-blur-md dark:border-slate-800 dark:bg-[#131f1e]/95">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {tabs.map((tab) => {
          if (tab.path === '/__fab__') {
            return <div key="fab-spacer" className="w-10" />
          }

          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1 transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-slate-400 hover:text-primary dark:text-slate-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`material-symbols-outlined text-[26px] ${
                      isActive ? 'icon-filled' : ''
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-tighter ${
                      isActive ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
