import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import AuthGuard from '@/components/auth/AuthGuard'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Documents from '@/pages/Documents'
import Tools from '@/pages/Tools'
import ToolPage from '@/pages/ToolPage'
import Scanner from '@/pages/Scanner'
import Profile from '@/pages/Profile'
import NotFound from '@/pages/NotFound'
import Settings from '@/pages/Settings'
import About from '@/pages/About'
import SignPage from '@/pages/SignPage'
import CropPage from '@/pages/CropPage'
import EditPdfPage from '@/pages/EditPdfPage'
import OrganizePage from '@/pages/OrganizePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Auth pages (no shell) */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected app pages (auth required + shell) */}
          <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/tools" element={<Tools />} />
            {/* Dedicated tool pages (before generic :toolId) */}
            <Route path="/tools/sign" element={<SignPage />} />
            <Route path="/tools/crop" element={<CropPage />} />
            <Route path="/tools/edit" element={<EditPdfPage />} />
            <Route path="/tools/organize" element={<OrganizePage />} />
            {/* Generic tool page */}
            <Route path="/tools/:toolId" element={<ToolPage />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
