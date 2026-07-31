export type EstablishmentView = {
  name: string
  logo_url: string | null
  loyaltyCheckinEnabled: boolean
  vitrineCouponEnabled: boolean
}

export type CheckinPrintResult = {
  job_id: string
  token_id: string
  checkin_token: string
  expires_at: string
}

export type LoyaltyRewardItem = {
  id: string
  variation_label: string | null
  table_number: string
  customer_name: string | null
  customer_phone_display: string
  garcom_name: string | null
  checkins_debited: number
  status: string
  created_at: string
}

export function formatRewardWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function readCapability(
  caps: Record<string, unknown>,
  root: Record<string, unknown>,
  keys: string[],
): boolean {
  for (const key of keys) {
    if (key in caps && caps[key] != null) return Boolean(caps[key])
    if (key in root && root[key] != null) return Boolean(root[key])
  }
  return false
}

export async function parseApiError(response: Response): Promise<string | null> {
  try {
    const body = await response.clone().json()
    const detail = body.detail ?? body
    if (typeof detail === "string") return detail
    if (detail && typeof detail === "object") {
      const message = (detail as { message?: string }).message
      if (typeof message === "string" && message.trim()) return message
    }
  } catch {
    /* ignore */
  }
  return null
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${(totalSeconds % 60).toString().padStart(2, "0")}`
}
