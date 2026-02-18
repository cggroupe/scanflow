import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { LogIn } from 'lucide-react'

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
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <LogIn className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-text-primary">ScanFlow</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('auth.login')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('auth.signIn')}
          </button>
        </form>

        <p className="text-center text-sm text-text-secondary">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">{t('auth.signUp')}</Link>
        </p>
      </div>
    </div>
  )
}
