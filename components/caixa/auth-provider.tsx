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

type AuthSession = {
  id: number
  token: string
}

type AuthContextValue = {
  token: string | null
  sessionId: number | null
  preview: boolean
  ready: boolean
  setToken: (token: string) => void
  clearToken: () => void
  enterPreview: () => void
}

let nextSessionId = 0

function openSession(token: string): AuthSession {
  nextSessionId += 1
  return { id: nextSessionId, token }
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
  const [session, setSession] = useState<AuthSession | null>(null)
  const [preview, setPreview] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    try {
      const stored = sessionStorage.getItem(storageKey)
      setSession(stored ? openSession(stored) : null)
    } catch {
      setSession(null)
    }
    setPreview(false)
    setReady(true)
  }, [storageKey])

  const setToken = useCallback(
    (value: string) => {
      setSession(openSession(value))
      try {
        sessionStorage.setItem(storageKey, value)
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  const clearToken = useCallback(() => {
    setSession(null)
    setPreview(false)
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const enterPreview = useCallback(() => setPreview(true), [])

  const value = useMemo(
    () => ({
      token: session?.token ?? null,
      sessionId: session?.id ?? null,
      preview,
      ready,
      setToken,
      clearToken,
      enterPreview,
    }),
    [session, preview, ready, setToken, clearToken, enterPreview],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider")
  return ctx
}
