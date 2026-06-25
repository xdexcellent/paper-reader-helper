import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { checkAuthStatus, loginApi, UNAUTHORIZED_EVENT } from '../lib/api'

interface AuthState {
  isAuthenticated: boolean
  requiresPassword: boolean
  isLoading: boolean
  error: string
}

const TOKEN_KEY = 'auth_token'

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

function setToken(token: string, remember: boolean): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
}

function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

interface AuthContextType extends AuthState {
  login: (account: string, password: string, remember?: boolean) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    requiresPassword: false,
    isLoading: true,
    error: '',
  })

  const handleUnauthorized = useCallback((message: string) => {
    removeToken()
    setState(prev => ({
      ...prev,
      isAuthenticated: false,
      requiresPassword: true,
      isLoading: false,
      error: message,
    }))
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const status = await checkAuthStatus()
        if (!status.requires_password) {
          setState({ isAuthenticated: true, requiresPassword: false, isLoading: false, error: '' })
        } else {
          const token = getToken()
          if (!token) {
            setState({
              isAuthenticated: false,
              requiresPassword: true,
              isLoading: false,
              error: '',
            })
          } else if (status.authenticated) {
            setState({
              isAuthenticated: true,
              requiresPassword: true,
              isLoading: false,
              error: '',
            })
          } else {
            handleUnauthorized('登录已过期，请重新登录')
          }
        }
      } catch {
        removeToken()
        setState({
          isAuthenticated: false,
          requiresPassword: true,
          isLoading: false,
          error: '无法确认登录状态，请重新登录',
        })
      }
    }
    void init()
  }, [handleUnauthorized])

  useEffect(() => {
    function onUnauthorized(event: Event) {
      const message = event instanceof CustomEvent && typeof event.detail?.message === 'string'
        ? event.detail.message
        : '登录已过期，请重新登录'
      handleUnauthorized(message)
    }

    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    }
  }, [handleUnauthorized])

  const login = useCallback(async (account: string, password: string, remember: boolean = false) => {
    try {
      const { token } = await loginApi(account, password)
      setToken(token, remember)
      setState(prev => ({ ...prev, isAuthenticated: true, error: '' }))
      return true
    } catch (e) {
      setState(prev => ({ ...prev, error: e instanceof Error ? e.message : '登录失败' }))
      return false
    }
  }, [])

  const logout = useCallback(() => {
    removeToken()
    setState(prev => ({ ...prev, isAuthenticated: false, error: '' }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
