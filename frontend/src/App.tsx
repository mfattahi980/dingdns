import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Zones from './pages/user/Zones'
import ZoneDetail from './pages/user/ZoneDetail'
import DDNS from './pages/user/DDNS'
import Security from './pages/user/Security'
import Users from './pages/admin/Users'
import Stats from './pages/admin/Stats'
import AuditLogs from './pages/admin/AuditLogs'
import IPBans from './pages/admin/IPBans'
import Settings from './pages/admin/Settings'

export default function App() {
  const { user, isLoading, isAdmin, loginUser, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={loginUser} />} />
        <Route path="/register" element={<Register onLogin={loginUser} />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        {/* User routes */}
        <Route path="/zones" element={<Zones />} />
        <Route path="/zones/:id" element={<ZoneDetail />} />
        <Route path="/ddns" element={<DDNS />} />
        <Route path="/security" element={<Security />} />

        {/* Admin routes */}
        {isAdmin && (
          <>
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/ip-bans" element={<IPBans />} />
            <Route path="/admin/stats" element={<Stats />} />
            <Route path="/admin/logs" element={<AuditLogs />} />
            <Route path="/admin/settings" element={<Settings />} />
          </>
        )}

        {/* Redirects */}
        <Route path="/login" element={<Navigate to="/zones" />} />
        <Route path="/register" element={<Navigate to="/zones" />} />
        <Route path="/" element={<Navigate to="/zones" />} />
        <Route path="*" element={<Navigate to="/zones" />} />
      </Routes>
    </Layout>
  )
}
