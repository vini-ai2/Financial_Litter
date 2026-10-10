// apps/web/src/context/AuthContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react'
import { apiLogin, apiLogout, apiSignup } from '../lib/api'

type AuthContextType = {
  isLoggedIn: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupData) => Promise<void>
  logout: () => Promise<void>
}

type SignupData = {
  email: string
  password: string
  firstName: string
  lastName: string
  phone: string
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const login = async (email: string, password: string) => {
    await apiLogin({ email, password })
    setIsLoggedIn(true)
  }

  const signup = async (data: SignupData) => {
    await apiSignup(data)
    // Auto-login after signup
    await apiLogin({ email: data.email, password: data.password })
    setIsLoggedIn(true)
  }

  const logout = async () => {
    await apiLogout()
    setIsLoggedIn(false)
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}