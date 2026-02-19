import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useDocumentStore } from '@/stores/documentStore'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const clearAllData = useDocumentStore((s) => s.clearAllData)

  const [showDeleteDataConfirm, setShowDeleteDataConfirm] = useState(false)
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false)
  const [appLockEnabled, setAppLockEnabled] = useState(
    () => localStorage.getItem('scanflow_app_lock') === 'true',
  )
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const currentLang = i18n.language.startsWith('fr') ? 'fr' : 'en'

  function toggleLanguage() {
    const next = currentLang === 'fr' ? 'en' : 'fr'
    i18n.changeLanguage(next)
  }

  function toggleAppLock() {
    const next = !appLockEnabled
    setAppLockEnabled(next)
    localStorage.setItem('scanflow_app_lock', String(next))
  }

  async function handleChangePassword() {
    setPasswordMessage(null)

    if (!newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: t('settings.fillAllFields') })
      return
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: t('settings.passwordTooShort') })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: t('settings.passwordMismatch') })
      return
    }

    if (!supabase) {
      setPasswordMessage({ type: 'error', text: 'Supabase non configuré' })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordMessage({ type: 'error', text: error.message })
    } else {
      setPasswordMessage({ type: 'success', text: t('settings.passwordChanged') })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setShowChangePassword(false), 1500)
    }
  }

  function handleDeleteData() {
    clearAllData()
    setShowDeleteDataConfirm(false)
  }

  async function handleDeleteAccount() {
    clearAllData()
    await signOut()
    setShowDeleteAccountConfirm(false)
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 pb-4 pt-6 dark:border-slate-800 dark:bg-[#1a2b2a]">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t('settings.title')}
          </h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Account section */}
        <div className="px-4 pt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {t('settings.accountSection')}
          </p>
        </div>

        <div className="border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {/* Change password */}
          <button
            onClick={() => setShowChangePassword(!showChangePassword)}
            className="flex w-full items-center gap-4 border-b border-slate-50 px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">lock</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('settings.changePassword')}
            </span>
            <span className="material-symbols-outlined text-slate-300">
              {showChangePassword ? 'expand_less' : 'chevron_right'}
            </span>
          </button>

          {showChangePassword && (
            <div className="space-y-3 border-b border-slate-50 px-6 py-4 dark:border-slate-800">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('settings.currentPassword')}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('settings.newPassword')}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('settings.confirmNewPassword')}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200"
              />
              {passwordMessage && (
                <p className={`text-sm ${passwordMessage.type === 'error' ? 'text-danger' : 'text-success'}`}>
                  {passwordMessage.text}
                </p>
              )}
              <button
                onClick={handleChangePassword}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
              >
                {t('settings.savePassword')}
              </button>
            </div>
          )}

          {/* App lock */}
          <div className="flex items-center gap-4 px-6 py-4">
            <span className="material-symbols-outlined text-slate-400">phonelink_lock</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('settings.appLock')}
            </span>
            <button
              onClick={toggleAppLock}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                appLockEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  appLockEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Preferences section */}
        <div className="px-4 pt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {t('settings.preferencesSection')}
          </p>
        </div>

        <div className="border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {/* Language */}
          <button
            onClick={toggleLanguage}
            className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-slate-400">language</span>
            <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
              {t('settings.language')}
            </span>
            <span className="text-sm text-slate-500">
              {currentLang === 'fr' ? 'Français' : 'English'}
            </span>
          </button>
        </div>

        {/* Danger zone */}
        <div className="px-4 pt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-red-400">
            {t('settings.dangerZone')}
          </p>
        </div>

        <div className="border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {/* Delete all data */}
          <button
            onClick={() => setShowDeleteDataConfirm(true)}
            className="flex w-full items-center gap-4 border-b border-slate-50 px-6 py-4 text-left transition-colors hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-900/10"
          >
            <span className="material-symbols-outlined text-red-400">delete_sweep</span>
            <div className="flex-1">
              <span className="font-medium text-red-600 dark:text-red-400">
                {t('settings.deleteAllData')}
              </span>
              <p className="text-xs text-slate-500">{t('settings.deleteAllDataDesc')}</p>
            </div>
          </button>

          {/* Delete account */}
          <button
            onClick={() => setShowDeleteAccountConfirm(true)}
            className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-red-50 dark:hover:bg-red-900/10"
          >
            <span className="material-symbols-outlined text-red-400">person_remove</span>
            <div className="flex-1">
              <span className="font-medium text-red-600 dark:text-red-400">
                {t('settings.deleteAccount')}
              </span>
              <p className="text-xs text-slate-500">{t('settings.deleteAccountDesc')}</p>
            </div>
          </button>
        </div>
      </main>

      {/* Delete data confirmation modal */}
      {showDeleteDataConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-slate-900">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <span className="material-symbols-outlined text-3xl text-red-500">warning</span>
              </div>
            </div>
            <h3 className="mb-2 text-center text-lg font-bold text-slate-900 dark:text-slate-100">
              {t('settings.deleteAllData')}
            </h3>
            <p className="mb-6 text-center text-sm text-slate-500">
              {t('settings.deleteDataConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDataConfirm(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteData}
                className="flex-1 rounded-lg bg-red-500 py-2.5 font-medium text-white"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirmation modal */}
      {showDeleteAccountConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-slate-900">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <span className="material-symbols-outlined text-3xl text-red-500">warning</span>
              </div>
            </div>
            <h3 className="mb-2 text-center text-lg font-bold text-slate-900 dark:text-slate-100">
              {t('settings.deleteAccount')}
            </h3>
            <p className="mb-6 text-center text-sm text-slate-500">
              {t('settings.deleteAccountConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteAccountConfirm(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                className="flex-1 rounded-lg bg-red-500 py-2.5 font-medium text-white"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
