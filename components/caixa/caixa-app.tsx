"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AuthProvider, useAuth } from "@/components/caixa/auth-provider"
import {
  capabilitiesForSession,
  cashierEntryUrl,
  PRINT_CAPABILITIES_URL,
  readCashierEntry,
  readPrintCapabilities,
  type CashierEntry,
  type LoadedPrintCapabilities,
} from "@/components/caixa/cashier-entry"
import { DashboardScreen } from "@/components/caixa/dashboard-screen"
import { LoginScreen } from "@/components/caixa/login-screen"
import { TenantNotFoundScreen } from "@/components/caixa/tenant-not-found-screen"
import type { EstablishmentView } from "@/components/caixa/types"

export function CaixaShell({ companyId }: { companyId: string }) {
  const { token, preview, ready, clearToken } = useAuth()
  const [entry, setEntry] = useState<CashierEntry | null>(null)
  const [loadedCapabilities, setLoadedCapabilities] =
    useState<LoadedPrintCapabilities | null>(null)
  const [tenantMissing, setTenantMissing] = useState(false)

  useEffect(() => {
    if (!companyId) {
      setEntry(null)
      setTenantMissing(true)
      return
    }

    let active = true
    const controller = new AbortController()
    setEntry(null)
    setTenantMissing(false)

    ;(async () => {
      try {
        const response = await fetch(cashierEntryUrl(companyId), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        })
        if (!active) return

        if (response.status === 404 || response.status === 422) {
          setTenantMissing(true)
          return
        }
        if (!response.ok) return

        const payload: unknown = await response.json()
        if (!active) return
        const next = readCashierEntry(payload)
        if (!next) return
        setEntry(next)
      } catch {
        /* network errors keep the login shell */
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [companyId])

  useEffect(() => {
    if (!token) return

    let active = true
    const sessionToken = token
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch(PRINT_CAPABILITIES_URL, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${sessionToken}`,
          },
          cache: "no-store",
          signal: controller.signal,
        })
        if (!active) return

        if (response.status === 401) {
          toast.error("Sessão expirada. Faça login novamente.")
          clearToken()
          return
        }
        if (!response.ok) return

        const payload: unknown = await response.json()
        if (!active) return
        setLoadedCapabilities({
          token: sessionToken,
          flags: readPrintCapabilities(payload),
        })
      } catch {
        /* failure keeps both columns hidden */
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [token, clearToken])

  if (!ready) {
    return <div className="min-h-dvh bg-muted/40" aria-hidden="true" />
  }

  if (tenantMissing) {
    return <TenantNotFoundScreen />
  }

  const capabilities = capabilitiesForSession(loadedCapabilities, token)
  const establishment: EstablishmentView = {
    name: entry?.name ?? null,
    logo_url: entry?.logo_url ?? null,
    loyaltyCheckinEnabled: capabilities.loyaltyCheckinEnabled,
    vitrineCouponEnabled: capabilities.vitrineCouponEnabled,
  }

  const screen =
    token || preview ? (
      <DashboardScreen establishment={establishment} />
    ) : (
      <LoginScreen companyId={companyId} establishment={establishment} />
    )

  return (
    <div
      style={{ display: "contents" }}
      data-loyalty-checkin={capabilities.loyaltyCheckinEnabled ? "true" : "false"}
      data-vitrine-coupon={capabilities.vitrineCouponEnabled ? "true" : "false"}
    >
      {screen}
    </div>
  )
}

export function CaixaApp({ companyId }: { companyId: string }) {
  return (
    <AuthProvider companyId={companyId}>
      <CaixaShell companyId={companyId} />
    </AuthProvider>
  )
}
