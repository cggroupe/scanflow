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
      // Try to get role from profiles table (with 3s timeout so we don't hang)
      let role: 'user' | 'admin' = 'user'
      try {
        const profilePromise = supabase!
          .from('profiles')
          .select('role')
          .eq('id', authUser.id)
          .single()
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 3000),
        )
        const result = await Promise.race([profilePromise, timeoutPromise])
        if (result && 'data' in result) {
          const profileRole = (result.data as { role?: string } | null)?.role
          if (profileRole === 'admin') role = 'admin'
        }
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

    // onAuthStateChange fires INITIAL_SESSION immediately when registered.
    // This is our primary way to detect the user — no separate init() needed.
    let resolved = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await syncProfile(session.user)
      } else if (!useAppStore.getState().user) {
        // Only clear if no user was set (e.g. by Login.tsx directly)
        setUser(null)
        useDocumentStore.getState().setCurrentUser(null)
      }
      resolved = true
      setLoading(false)
    })

    // Safety fallback: if onAuthStateChange never resolves (shouldn't happen),
    // stop loading after 10s. If user was already set by Login/Register, keep it.
    const fallbackTimeout = setTimeout(() => {
      if (!resolved) {
        setLoading(false)
      }
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallbackTimeout)
    }
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
