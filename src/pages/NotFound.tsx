import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <FileQuestion className="h-16 w-16 text-text-secondary/30" />
      <h1 className="mt-4 text-2xl font-bold text-text-primary">404</h1>
      <p className="mt-2 text-text-secondary">Page introuvable</p>
      <Link to="/dashboard" className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
        Retour au tableau de bord
      </Link>
    </div>
  )
}
