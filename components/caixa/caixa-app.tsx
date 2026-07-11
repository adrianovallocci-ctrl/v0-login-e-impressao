"use client"

import { useEffect, useState } from "react"

import { AuthProvider, useAuth } from "@/components/caixa/auth-provider"
import { DashboardScreen } from "@/components/caixa/dashboard-screen"
import { LoginScreen } from "@/components/caixa/login-screen"
import { TenantNotFoundScreen } from "@/components/caixa/tenant-not-found-screen"
import { readCapability, type EstablishmentView } from "@/components/caixa/types"

function CaixaShell({ companyId }: { companyId: string }) {
  const { token, preview, ready } = useAuth()
  const [establishment, setEstablishment] = useState<EstablishmentView | null>(
    null,
  )
  const [tenantMissing, setTenantMissing] = useState(false)

  useEffect(() => {
    if (!companyId) {
      setTenantMissing(true)
      return
    }

    let active = true
    ;(async () => {
      try {
        const response = await fetch(
          `/api/proxy/app/establishment/${companyId}`,
          { headers: { accept: "application/json" } },
        )

        if (!response.ok) {
          if (response.status === 404 || response.status === 422) {
            if (active) setTenantMissing(true)
          }
          return
        }

        const payload = await response.json()
        const data = payload.data ?? payload
        const caps = (data.print_capabilities ?? data.printCapabilities ?? {}) as Record<
          string,
          unknown
        >

        if (!active) return

        setEstablishment({
          name: String(
            data.name ?? data.fantasy_name ?? data.company_name ?? "Estabelecimento",
          ),
          logo_url: (data.logo_url ?? data.logoUrl ?? data.logo ?? null) as
            | string
            | null,
          loyaltyCheckinEnabled: readCapability(caps, data as Record<string, unknown>, [
            "loyalty_checkin_enabled",
            "loyaltyCheckinEnabled",
          ]),
          vitrineCouponEnabled: readCapability(caps, data as Record<string, unknown>, [
            "vitrine_coupon_enabled",
            "vitrineCouponEnabled",
          ]),
        })
      } catch {
        /* network errors keep login shell */
      }
    })()

    return () => {
      active = false
    }
  }, [companyId])

  if (!ready) {
    return <div className="min-h-dvh bg-muted/40" aria-hidden="true" />
  }

  if (tenantMissing) {
    return <TenantNotFoundScreen />
  }

  if (token || preview) {
    return <DashboardScreen establishment={establishment} />
  }

  return <LoginScreen companyId={companyId} establishment={establishment} />
}

export function CaixaApp({ companyId }: { companyId: string }) {
  return (
    <AuthProvider companyId={companyId}>
      <CaixaShell companyId={companyId} />
    </AuthProvider>
  )
}
