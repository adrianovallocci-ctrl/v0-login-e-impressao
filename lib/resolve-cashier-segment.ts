import { getBackendBaseUrl } from "@/lib/backend-url"
import { isValidCompanyUuid } from "@/lib/is-valid-company-uuid"

export type CashierTenantResolveResponse = {
  company_id: string
}

/**
 * Fase 5c: resolve segmento de rota do caixa para company_id.
 * - UUID válido → retorna como está (C-A9)
 * - slug → GET /public/cashier-tenant/{slug} (C-A10)
 * - slug inválido/inexistente → null (caller usa notFound — C-A11)
 */
export async function resolveCashierCompanyId(
  segment: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const trimmed = segment.trim()
  if (!trimmed) return null

  if (isValidCompanyUuid(trimmed)) {
    return trimmed.toLowerCase()
  }

  const slug = trimmed.toLowerCase()
  const url = `${getBackendBaseUrl()}/public/cashier-tenant/${encodeURIComponent(slug)}`

  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  })

  if (response.status === 404) return null
  if (!response.ok) return null

  let payload: CashierTenantResolveResponse
  try {
    payload = (await response.json()) as CashierTenantResolveResponse
  } catch {
    return null
  }

  const companyId = payload.company_id?.trim()
  if (!companyId || !isValidCompanyUuid(companyId)) return null

  return companyId.toLowerCase()
}
