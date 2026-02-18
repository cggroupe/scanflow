import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const { user, setUser } = useAppStore()

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          full_name: session.user.user_metadata?.full_name ?? null,
          role: 'user',
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
          locale: 'fr',
          created_at: session.user.created_at,
          updated_at: session.user.updated_at ?? session.user.created_at,
        })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          full_name: session.user.user_metadata?.full_name ?? null,
          role: 'user',
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
          locale: 'fr',
          created_at: session.user.created_at,
          updated_at: session.user.updated_at ?? session.user.created_at,
        })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser])

  return { user, isAuthenticated: !!user }
}
