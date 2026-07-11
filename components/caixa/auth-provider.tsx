"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type AuthContextValue = {
  token: string | null
  preview: boolean
  ready: boolean
  setToken: (token: string) => void
  clearToken: () => void
  enterPreview: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  companyId,
  children,
}: {
  companyId: string
  children: ReactNode
}) {
  const storageKey = `caixa_token:${companyId || "default"}`
  const [token, setTokenState] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    try {
      setTokenState(sessionStorage.getItem(storageKey))
    } catch {
      setTokenState(null)
    }
    setPreview(false)
    setReady(true)
  }, [storageKey])

  const setToken = useCallback(
    (value: string) => {
      setTokenState(value)
      try {
        sessionStorage.setItem(storageKey, value)
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  const clearToken = useCallback(() => {
    setTokenState(null)
    setPreview(false)
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const enterPreview = useCallback(() => setPreview(true), [])

  const value = useMemo(
    () => ({ token, preview, ready, setToken, clearToken, enterPreview }),
    [token, preview, ready, setToken, clearToken, enterPreview],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider")
  return ctx
}
