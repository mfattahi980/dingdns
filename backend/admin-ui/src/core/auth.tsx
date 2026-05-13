import React, { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface Admin {
  id: number
  username: string
  email: string
  role: string
}

interface AuthContextType {
  admin: Admin | null
  token: string | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  login: (token: string, admin: Admin) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  admin: null,
  token: null,
  isAuthenticated: false,
  isSuperAdmin: false,
  login: () => {},
  logout: () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const stored = localStorage.getItem('admin_user')
    return stored ? JSON.parse(stored) : null
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'))

  const loginFn = (token: string, admin: Admin) => {
    localStorage.setItem('admin_token', token)
    localStorage.setItem('admin_user', JSON.stringify(admin))
    setToken(token)
    setAdmin(admin)
  }

  const logoutFn = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    setToken(null)
    setAdmin(null)
  }

  return (
    <AuthContext.Provider
      value={{
        admin,
        token,
        isAuthenticated: !!token && !!admin,
        isSuperAdmin: admin?.role === 'super_admin',
        login: loginFn,
        logout: logoutFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
