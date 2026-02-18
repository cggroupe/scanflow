import { create } from 'zustand'
import type { User } from '@/types'

interface AppState {
  user: User | null
  locale: 'fr' | 'en'
  sidebarOpen: boolean
  setUser: (user: User | null) => void
  setLocale: (locale: 'fr' | 'en') => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  locale: 'fr',
  sidebarOpen: false,
  setUser: (user) => set({ user }),
  setLocale: (locale) => set({ locale }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))
