import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Globe, Server, Key, Users, BarChart3, Shield, ShieldBan, LogOut, Menu, X, Lock, Settings } from 'lucide-react'
import { useState } from 'react'

interface LayoutProps {
  children: React.ReactNode
  user: { username: string; role: string } | null
  onLogout: () => void
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isAdmin = user?.role === 'admin'

  const handleLogout = () => {
    onLogout()
    navigate('/login')
  }

  const navItems = [
    { path: '/zones', label: 'Zones', icon: Globe },
    { path: '/ddns', label: 'Dynamic DNS', icon: Key },
    { path: '/security', label: 'Security', icon: Lock },
    ...(isAdmin
      ? [
          { path: '/admin/users', label: 'Users', icon: Users },
          { path: '/admin/ip-bans', label: 'IP Security', icon: ShieldBan },
          { path: '/admin/stats', label: 'Statistics', icon: BarChart3 },
          { path: '/admin/logs', label: 'Audit Logs', icon: Shield },
          { path: '/admin/settings', label: 'Settings', icon: Settings },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Server className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold">DingDns</h1>
              <p className="text-xs text-gray-400">DNS Management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = location.pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{user?.username}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-h-screen">
        {/* Top bar (mobile) */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b">
          <button onClick={() => setSidebarOpen(true)} className="p-2">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="font-bold text-lg">DingDns</h1>
          <div className="w-10" />
        </div>

        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
