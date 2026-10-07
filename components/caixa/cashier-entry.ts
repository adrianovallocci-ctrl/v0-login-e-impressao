export type CashierEntry = {
  company_id: string
  name: string
  logo_url: string | null
}

export type PrintCapabilityFlags = {
  loyaltyCheckinEnabled: boolean
  vitrineCouponEnabled: boolean
}

export const HIDDEN_PRINT_CAPABILITIES: PrintCapabilityFlags = {
  loyaltyCheckinEnabled: false,
  vitrineCouponEnabled: false,
}

export type LoadedPrintCapabilities = {
  token: string
  flags: PrintCapabilityFlags
}

export function capabilitiesForSession(
  loaded: LoadedPrintCapabilities | null,
  token: string | null,
): PrintCapabilityFlags {
  if (!token || !loaded || loaded.token !== token) return HIDDEN_PRINT_CAPABILITIES
  return loaded.flags
}

export function cashierEntryUrl(companyId: string): string {
  return `/api/proxy/public/cashier-entry/${companyId}`
}

export const PRINT_CAPABILITIES_URL = "/api/proxy/collaborator/print-capabilities"

export function readCashierEntry(payload: unknown): CashierEntry | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  if (typeof record.company_id !== "string" || record.company_id.length === 0) {
    return null
  }
  if (typeof record.name !== "string") return null
  const logo = record.logo_url
  if (logo != null && typeof logo !== "string") return null
  return {
    company_id: record.company_id,
    name: record.name,
    logo_url: typeof logo === "string" ? logo : null,
  }
}

export function readPrintCapabilities(payload: unknown): PrintCapabilityFlags {
  if (!payload || typeof payload !== "object") return HIDDEN_PRINT_CAPABILITIES
  const record = payload as Record<string, unknown>
  return {
    loyaltyCheckinEnabled: record.loyalty_checkin_enabled === true,
    vitrineCouponEnabled: record.vitrine_coupon_enabled === true,
  }
}
