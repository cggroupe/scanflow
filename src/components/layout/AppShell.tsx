import { Outlet, Link } from 'react-router-dom'
import BottomNav from './BottomNav'
import MobileDrawer from './MobileDrawer'

export default function AppShell() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background font-display">
      <MobileDrawer />

      <main className="flex-1">
        <Outlet />
      </main>

      {/* FAB — Scan */}
      <Link
        to="/scanner?mode=camera"
        className="fixed bottom-20 left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/40 ring-4 ring-white transition-transform active:scale-90 dark:ring-[#131f1e]"
      >
        <span className="material-symbols-outlined text-4xl">photo_camera</span>
      </Link>

      <BottomNav />
    </div>
  )
}
