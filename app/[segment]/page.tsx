import { notFound } from "next/navigation"

import { CaixaApp } from "@/components/caixa/caixa-app"
import { resolveCashierCompanyId } from "@/lib/resolve-cashier-segment"

type PageProps = {
  params: Promise<{ segment: string }>
}

/**
 * Fase 5c-caixa: /{segment}
 * - UUID → company_id direto (C-A9)
 * - slug → GET /public/cashier-tenant/{slug} (C-A10)
 * - inválido → 404 limpo (C-A11)
 */
export default async function CashierSegmentPage({ params }: PageProps) {
  const { segment } = await params
  const companyId = await resolveCashierCompanyId(segment)

  if (!companyId) {
    notFound()
  }

  return <CaixaApp companyId={companyId} />
}
