import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Tools from '@/pages/Tools'
import NotFound from '@/pages/NotFound'

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

          {/* App pages (with shell) */}
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tools" element={<Tools />} />
            {/* Phase 2+ routes */}
            {/* <Route path="/documents" element={<Documents />} /> */}
            {/* <Route path="/documents/:id" element={<DocumentViewer />} /> */}
            {/* <Route path="/projects" element={<Projects />} /> */}
            {/* <Route path="/scanner" element={<Scanner />} /> */}
            {/* <Route path="/trash" element={<Trash />} /> */}
            {/* <Route path="/profile" element={<Profile />} /> */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
