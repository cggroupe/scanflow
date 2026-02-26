import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { useDocumentStore } from '@/stores/documentStore'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) {
      setError('Supabase non configuré. Vérifiez .env.local')
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      // Set user in store immediately so AuthGuard sees it before navigation
      if (data.user) {
        useAppStore.getState().setUser({
          id: data.user.id,
          email: data.user.email ?? '',
          full_name:
            (data.user.user_metadata?.full_name as string) ??
            (data.user.user_metadata?.name as string) ??
            null,
          role: 'user',
          avatar_url:
            (data.user.user_metadata?.avatar_url as string) ??
            (data.user.user_metadata?.picture as string) ??
            null,
          locale: 'fr',
          created_at: data.user.created_at,
          updated_at: data.user.updated_at ?? data.user.created_at,
        })
        useDocumentStore.getState().setCurrentUser(data.user.id)
      }
      navigate('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 dark:bg-[#131f1e]">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-3xl text-white">document_scanner</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">ScanFlow</h1>
          <p className="mt-1 text-sm text-slate-500">{t('auth.login')}</p>
        </div>

        {/* Email/Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-700 dark:bg-[#1a2b2a] dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-700 dark:bg-[#1a2b2a] dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('auth.signIn')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </div>
  )
}
