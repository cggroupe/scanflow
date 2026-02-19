import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useDocumentStore } from '@/stores/documentStore'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const { user, setUser } = useAppStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    async function syncProfile(authUser: {
      id: string
      email?: string
      user_metadata?: Record<string, unknown>
      created_at: string
      updated_at?: string
    }) {
      // Try to get role from profiles table
      let role: 'user' | 'admin' = 'user'
      try {
        const result = await supabase!
          .from('profiles')
          .select('role')
          .eq('id', authUser.id)
          .single()
        const profileRole = (result.data as { role?: string } | null)?.role
        if (profileRole === 'admin') role = 'admin'
      } catch {
        // profiles table may not exist yet or no row — default to 'user'
      }

      setUser({
        id: authUser.id,
        email: authUser.email ?? '',
        full_name:
          (authUser.user_metadata?.full_name as string) ??
          (authUser.user_metadata?.name as string) ??
          null,
        role,
        avatar_url:
          (authUser.user_metadata?.avatar_url as string) ??
          (authUser.user_metadata?.picture as string) ??
          null,
        locale: 'fr',
        created_at: authUser.created_at,
        updated_at: authUser.updated_at ?? authUser.created_at,
      })

      // Scope document store to this user
      useDocumentStore.getState().setCurrentUser(authUser.id)
    }

    async function init() {
      const {
        data: { session },
      } = await supabase!.auth.getSession()
      if (session?.user) {
        await syncProfile(session.user)
      }
      setLoading(false)
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await syncProfile(session.user)
      } else {
        setUser(null)
        useDocumentStore.getState().setCurrentUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [setUser])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    useDocumentStore.getState().setCurrentUser(null)
  }, [setUser])

  return {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    signOut,
  }
}
