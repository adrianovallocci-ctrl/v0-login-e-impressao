export type CaixaReservationSummary = {
  reservations_count: number
  people_count: number
  peak_local_time: string | null
  cadeiroes_count: number
  carrinhos_count: number
}

export type CaixaReservationItem = {
  id: string
  company_id: string
  environment_id: string
  environment_nome: string | null
  status: string
  origin: string
  starts_at: string
  ends_at: string
  local_date: string
  local_time: string
  party_size: number
  objetivo: string | null
  observacoes: string | null
  requer_acessibilidade: boolean
  cadeiroes_qtd: number
  espaco_carrinho: boolean
  phone_canonical: string | null
  guest_name: string | null
  tolerancia_min: number | null
  capacity_available: boolean | null
  unmarked: boolean
  reason: string | null
  decline_note: string | null
  cancel_reason: string | null
  cancelled_by: string | null
}

export type CaixaReservationListResponse = {
  date: string
  timezone: string
  module_enabled: boolean
  summary: CaixaReservationSummary
  unmarked_count: number
  items: CaixaReservationItem[]
}

export type CaixaReservationInboxResponse = {
  timezone: string
  module_enabled: boolean
  pending_future_count: number
  items: CaixaReservationItem[]
}

export type ReservationFilter = "fila" | "pending" | "confirmed"

export type ReservationAction = "confirm" | "decline" | "cancel" | "seat" | "no_show"

export const ACTION_LABELS: Record<ReservationAction, string> = {
  confirm: "Confirmar mesa",
  decline: "Recusar pedido",
  cancel: "Cancelar (loja)",
  seat: "Cliente chegou",
  no_show: "Não compareceu",
}

export const RESERVATIONS_POLL_MS = 30_000

export function shouldShowReservationsBlock(
  moduleEnabled: boolean | null | undefined,
): boolean {
  return moduleEnabled === true
}

export function caixaHomeLayoutClass(opts: {
  loyalty: boolean
  vitrine: boolean
  reservations: boolean
}): string {
  const count = [opts.loyalty, opts.vitrine, opts.reservations].filter(Boolean)
    .length
  if (count >= 3) {
    return "grid grid-cols-1 items-start gap-6 lg:grid-cols-3"
  }
  if (count === 2) {
    return "grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
  }
  return "mx-auto flex w-full max-w-md flex-col gap-6"
}

export const CAIXA_RESERVATIONS_COLUMN_CLASS =
  "flex max-h-[calc(100dvh-6rem)] min-h-0 w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm"

export function shouldPollReservations(opts: {
  moduleEnabled: boolean
  documentVisible: boolean
  sessionActive: boolean
}): boolean {
  return opts.moduleEnabled && opts.documentVisible && opts.sessionActive
}

export function startReservationsPoll(
  onTick: () => void,
  intervalMs = RESERVATIONS_POLL_MS,
): () => void {
  const id = setInterval(onTick, intervalMs)
  return () => clearInterval(id)
}

export async function postThenRefetch<T>(opts: {
  post: () => Promise<unknown>
  refetch: () => Promise<T>
}): Promise<T> {
  await opts.post()
  return opts.refetch()
}

export const PRESENCE_BLOCKED_TOAST = "Disponível no dia da reserva."

export function actionsForStatus(
  status: string,
  opts?: { canMarkPresence?: boolean },
): ReservationAction[] {
  if (status === "pending") return ["confirm", "decline", "cancel"]
  if (status === "confirmed") {
    if (opts?.canMarkPresence !== true) return ["cancel"]
    return ["seat", "no_show", "cancel"]
  }
  return []
}

export function civilTodayInTimeZone(
  timeZone: string | null | undefined,
  now = new Date(),
): string | null {
  if (!timeZone) return null
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
    const year = parts.find((part) => part.type === "year")?.value
    const month = parts.find((part) => part.type === "month")?.value
    const day = parts.find((part) => part.type === "day")?.value
    if (!year || !month || !day) return null
    return `${year}-${month}-${day}`
  } catch {
    return null
  }
}

export function canMarkPresence(
  localDate: string | null | undefined,
  timeZone: string | null | undefined,
  now = new Date(),
): boolean {
  const today = civilTodayInTimeZone(timeZone, now)
  if (!today || !localDate) return false
  return localDate === today
}

export type CaixaActionIntent =
  | "block"
  | "confirm_without_vacancy"
  | "decline"
  | "cancel"
  | "no_show"
  | "post"

export function resolveCaixaActionIntent(
  item: Pick<CaixaReservationItem, "local_date" | "capacity_available">,
  action: ReservationAction,
  timeZone: string | null | undefined,
  now = new Date(),
): CaixaActionIntent {
  if (
    (action === "seat" || action === "no_show") &&
    !canMarkPresence(item.local_date, timeZone, now)
  ) {
    return "block"
  }
  if (action === "confirm" && item.capacity_available === false) {
    return "confirm_without_vacancy"
  }
  if (action === "decline") return "decline"
  if (action === "cancel") return "cancel"
  if (action === "no_show") return "no_show"
  return "post"
}

export const DESTRUCTIVE_DIALOG_COPY = {
  confirm_without_vacancy: {
    title: "Este horário está sem vaga agora.",
    body: "Horário sem vaga. Confirmar mesmo assim?",
    confirmLabel: "Confirmar mesa",
    action: "confirm" as const,
  },
  cancel: {
    title: "Cancelar esta reserva?",
    body: "O cliente vê o cancelamento no app. Não tem como desfazer.",
    confirmLabel: "Cancelar reserva",
    action: "cancel" as const,
  },
  no_show: {
    title: "Marcar como não compareceu?",
    body: "Conta para o histórico do cliente nesta loja. Não tem como desfazer.",
    confirmLabel: "Não compareceu",
    action: "no_show" as const,
  },
} as const

export type ConfirmDialogKind = keyof typeof DESTRUCTIVE_DIALOG_COPY

export function partySizeLabel(count: number): string {
  return count === 1 ? "1 pessoa" : `${count} pessoas`
}

export function formatDestructiveReservationSummary(
  item: Pick<
    CaixaReservationItem,
    "guest_name" | "local_date" | "local_time" | "party_size" | "environment_nome"
  >,
): string {
  const name = item.guest_name?.trim() || "Cliente"
  const when = [formatCivilDateShort(item.local_date), item.local_time?.trim()]
    .filter(Boolean)
    .join(" ")
  const env = item.environment_nome?.trim() || "Ambiente"
  return [name, when, partySizeLabel(item.party_size), env].join(" · ")
}

export function filaChipLabel(isToday: boolean): string {
  return isToday ? "Fila" : "Todas do dia"
}

export function canPrintReservationsDay(opts: {
  count: number
  loading: boolean
  preview: boolean
  hasToken: boolean
}): boolean {
  if (opts.loading) return false
  if (opts.count <= 0) return false
  if (opts.preview && !opts.hasToken) return false
  if (!opts.hasToken) return false
  return true
}

export function sortReservationsByStartsAt(
  items: CaixaReservationItem[],
): CaixaReservationItem[] {
  return [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

export function formatPeakLocalTime(peak: string | null | undefined): string | null {
  if (!peak) return null
  const match = peak.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${match[1].padStart(2, "0")}h${match[2]}`
}

export function formatSummaryLine(
  summary: CaixaReservationSummary,
  heading = "Hoje",
): string {
  const n = summary.reservations_count
  const p = summary.people_count
  const peak = formatPeakLocalTime(summary.peak_local_time)
  const parts = [
    `${heading}: ${n} ${n === 1 ? "reserva" : "reservas"}`,
    `${p} ${p === 1 ? "pessoa" : "pessoas"}`,
  ]
  if (peak) parts.push(`maior entrada ${peak}`)
  const c = summary.cadeiroes_count
  const k = summary.carrinhos_count
  parts.push(`${c} ${c === 1 ? "cadeirão" : "cadeirões"}`)
  parts.push(`${k} ${k === 1 ? "carrinho" : "carrinhos"}`)
  return parts.join(" · ")
}

export function pendingFutureBannerCopy(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? "1 pedido futuro sem resposta"
    : `${count} pedidos futuros sem resposta`
}

export function civilDateFromParts(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
}

export function shiftCivilDate(iso: string, days: number): string {
  const date = civilDateFromParts(iso)
  if (!date) return iso
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetweenCivil(fromIso: string, toIso: string): number | null {
  const from = civilDateFromParts(fromIso)
  const to = civilDateFromParts(toIso)
  if (!from || !to) return null
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function rememberStoreToday(
  current: string | null | undefined,
  mappedDate: string | null | undefined,
): string | null {
  if (current) return current
  if (mappedDate) return mappedDate
  return null
}

export function liveStoreToday(
  hojeLoja: string | null | undefined,
  storeToday: string | null | undefined,
): string | null {
  return hojeLoja || storeToday || null
}

export function dateSelectorValue(
  selectedDate: string | null,
  liveToday: string | null,
): string {
  return selectedDate ?? liveToday ?? ""
}

export function selectedDateFromPicker(
  next: string,
  liveToday: string | null,
): string | null {
  if (!next) return null
  return liveToday && next === liveToday ? null : next
}

export function selectedDateFromShift(
  currentValue: string,
  days: number,
  liveToday: string | null,
): string | null {
  if (!currentValue) return liveToday
  const shifted = shiftCivilDate(currentValue, days)
  return liveToday && shifted === liveToday ? null : shifted
}

export function parseOptionalInt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw)
    if (Number.isInteger(parsed)) return parsed
  }
  return null
}

export function shiftIsoDateTimeByDays(iso: string, days: number): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export function shiftPreviewReservationsToDate(
  payload: CaixaReservationListResponse,
  today: string,
): CaixaReservationListResponse {
  const days = daysBetweenCivil(payload.date, today)
  if (days == null || days === 0) return payload
  return {
    ...payload,
    date: today,
    items: payload.items.map((item) => ({
      ...item,
      local_date: shiftCivilDate(item.local_date, days),
      starts_at: shiftIsoDateTimeByDays(item.starts_at, days),
      ends_at: shiftIsoDateTimeByDays(item.ends_at, days),
    })),
  }
}

export function shiftPreviewInboxToDate(
  inbox: CaixaReservationInboxResponse,
  days: number,
): CaixaReservationInboxResponse {
  if (!days) return inbox
  return {
    ...inbox,
    items: inbox.items.map((item) => ({
      ...item,
      local_date: shiftCivilDate(item.local_date, days),
      starts_at: shiftIsoDateTimeByDays(item.starts_at, days),
      ends_at: shiftIsoDateTimeByDays(item.ends_at, days),
    })),
  }
}

export function formatCivilDateShort(iso: string): string {
  const date = civilDateFromParts(iso)
  if (!date) return iso
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

export function formatReservationWhen(
  item: Pick<CaixaReservationItem, "local_date" | "local_time">,
  todayIso: string | null,
): string {
  const time = item.local_time || ""
  if (!item.local_date || !todayIso) return time
  const diff = daysBetweenCivil(todayIso, item.local_date)
  if (diff === null) return time ? `${item.local_date} · ${time}` : item.local_date
  if (diff === 0) return time ? `Hoje ${time}` : "Hoje"
  if (diff === 1) return time ? `Amanhã ${time}` : "Amanhã"
  if (diff === 2) return time ? `Em 2 dias ${time}` : "Em 2 dias"
  const abs = formatCivilDateShort(item.local_date)
  return time ? `${abs} · ${time}` : abs
}

export function dayReservationsQuery(opts: {
  date: string | null
  today: string | null
  filter: ReservationFilter
}): string {
  const params = new URLSearchParams()
  if (opts.date && opts.today && opts.date !== opts.today) {
    params.set("date", opts.date)
  }
  if (opts.filter === "pending") params.set("status", "pending")
  if (opts.filter === "confirmed") params.set("status", "confirmed")
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function unmarkedBannerCopy(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? "1 reserva de hoje sem marcação"
    : `${count} reservas de hoje sem marcação`
}

export function capacityLabel(
  status: string,
  available: boolean | null,
): string | null {
  if (status !== "pending" || available == null) return null
  return available ? "Horário com vaga" : "Horário sem vaga"
}

export function listPhoneMask(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 4) return "····"
  return `····${digits.slice(-4)}`
}

export function listPhoneLine(phone: string | null | undefined): string | null {
  const mask = listPhoneMask(phone)
  return mask ? `Celular ${mask}` : null
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

export function formatReservationListExtras(
  item: CaixaReservationItem,
): string {
  const parts = [item.environment_nome?.trim() || "Ambiente"]
  if (item.requer_acessibilidade) parts.push("acessível")
  if (item.cadeiroes_qtd > 0) {
    parts.push(
      item.cadeiroes_qtd === 1
        ? "1 cadeirão"
        : `${item.cadeiroes_qtd} cadeirões`,
    )
  }
  if (item.espaco_carrinho) parts.push("carrinho")
  return parts.join(" · ")
}

export function listLineExposesFullPhone(
  item: CaixaReservationItem,
  line: string,
): boolean {
  const phone = item.phone_canonical
  if (!phone) return false
  const digits = digitsOnly(phone)
  if (digits.length >= 8 && line.includes(digits)) return true
  if (phone.length >= 8 && line.includes(phone)) return true
  return false
}

export function whatsappE164Digits(
  phone: string | null | undefined,
): string | null {
  const digits = digitsOnly(phone)
  if (digits.startsWith("55") && digits.length === 13) return digits
  if (digits.length === 11 && digits[2] === "9") return `55${digits}`
  return null
}

export function formatWhatsAppReservationWhen(iso: string): string | null {
  const date = civilDateFromParts(iso)
  if (!date) return null
  const weekday = date
    .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })
    .replace(/,$/, "")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${weekday}, ${dd}/${mm}`
}

/**
 * `{loja}` and `{ambiente}` are gestor-typed strings. No article or
 * preposition can agree with them ("o Pizzaria Bella", "no Área kids").
 * Store name sits between dashes; environment follows a comma.
 *
 * The text is only about that reservation. No promo, coupon, or
 * "aproveite e conheça". `phone_canonical` is onboarding identity
 * (D13/D14), not marketing consent.
 */
export function reservationWhatsAppMessage(opts: {
  guestName?: string | null
  storeName?: string | null
  localDate: string
  localTime: string
  partySize: number
  environmentNome?: string | null
}): string {
  const name = opts.guestName?.trim()
  const store = opts.storeName?.trim()
  const when = formatWhatsAppReservationWhen(opts.localDate)
  const time = opts.localTime?.trim()
  const people =
    opts.partySize === 1 ? "1 pessoa" : `${opts.partySize} pessoas`
  const env = opts.environmentNome?.trim()
  const hello = name ? `Oi, ${name}!` : "Oi!"
  const storeBit = store ? ` aqui — ${store} —` : " aqui"
  const whenBit =
    when && time
      ? ` de ${when} às ${time}`
      : when
        ? ` de ${when}`
        : time
          ? ` às ${time}`
          : ""
  const rest = [people, env].filter(Boolean).join(", ")
  return `${hello} É sobre sua reserva${storeBit}${whenBit}, ${rest}.`
}

export function reservationWhatsAppHref(
  phone: string | null | undefined,
  message: string,
): string | null {
  const e164 = whatsappE164Digits(phone)
  if (!e164) return null
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`
}

export function listWhatsAppHref(
  item: Pick<CaixaReservationItem, "phone_canonical">,
  message: string,
): string | null {
  return reservationWhatsAppHref(item.phone_canonical, message)
}

export function statusQuery(filter: ReservationFilter): string {
  if (filter === "pending") return "status=pending"
  if (filter === "confirmed") return "status=confirmed"
  return ""
}

export function mapReservationItem(
  raw: Record<string, unknown>,
): CaixaReservationItem | null {
  const id = String(raw.id ?? "")
  if (!id) return null
  return {
    id,
    company_id: String(raw.company_id ?? raw.companyId ?? ""),
    environment_id: String(raw.environment_id ?? raw.environmentId ?? ""),
    environment_nome: (raw.environment_nome ??
      raw.environmentNome ??
      null) as string | null,
    status: String(raw.status ?? ""),
    origin: String(raw.origin ?? ""),
    starts_at: String(raw.starts_at ?? raw.startsAt ?? ""),
    ends_at: String(raw.ends_at ?? raw.endsAt ?? ""),
    local_date: String(raw.local_date ?? raw.localDate ?? ""),
    local_time: String(raw.local_time ?? raw.localTime ?? ""),
    party_size: Number(raw.party_size ?? raw.partySize ?? 0),
    objetivo: (raw.objetivo ?? null) as string | null,
    observacoes: (raw.observacoes ?? null) as string | null,
    requer_acessibilidade: Boolean(
      raw.requer_acessibilidade ?? raw.requerAcessibilidade ?? false,
    ),
    cadeiroes_qtd: Number(raw.cadeiroes_qtd ?? raw.cadeiroesQtd ?? 0),
    espaco_carrinho: Boolean(raw.espaco_carrinho ?? raw.espacoCarrinho ?? false),
    phone_canonical: (raw.phone_canonical ??
      raw.phoneCanonical ??
      null) as string | null,
    guest_name: (raw.guest_name ?? raw.guestName ?? null) as string | null,
    tolerancia_min: parseOptionalInt(
      raw.tolerancia_min ?? raw.toleranciaMin,
    ),
    capacity_available:
      raw.capacity_available === undefined &&
      raw.capacityAvailable === undefined
        ? null
        : raw.capacity_available != null
          ? Boolean(raw.capacity_available)
          : raw.capacityAvailable != null
            ? Boolean(raw.capacityAvailable)
            : null,
    unmarked: Boolean(raw.unmarked ?? false),
    reason: (raw.reason ?? null) as string | null,
    decline_note: (raw.decline_note ?? raw.declineNote ?? null) as string | null,
    cancel_reason: (raw.cancel_reason ??
      raw.cancelReason ??
      null) as string | null,
    cancelled_by: (raw.cancelled_by ??
      raw.cancelledBy ??
      null) as string | null,
  }
}

export function mapReservationList(
  raw: Record<string, unknown>,
): CaixaReservationListResponse {
  const summaryRaw = (raw.summary ?? {}) as Record<string, unknown>
  const rows = Array.isArray(raw.items) ? raw.items : []
  return {
    date: String(raw.date ?? ""),
    timezone: String(raw.timezone ?? ""),
    module_enabled: Boolean(
      raw.module_enabled ?? raw.moduleEnabled ?? false,
    ),
    summary: {
      reservations_count: Number(
        summaryRaw.reservations_count ?? summaryRaw.reservationsCount ?? 0,
      ),
      people_count: Number(
        summaryRaw.people_count ?? summaryRaw.peopleCount ?? 0,
      ),
      peak_local_time: (summaryRaw.peak_local_time ??
        summaryRaw.peakLocalTime ??
        null) as string | null,
      cadeiroes_count: Number(
        summaryRaw.cadeiroes_count ?? summaryRaw.cadeiroesCount ?? 0,
      ),
      carrinhos_count: Number(
        summaryRaw.carrinhos_count ?? summaryRaw.carrinhosCount ?? 0,
      ),
    },
    unmarked_count: Number(raw.unmarked_count ?? raw.unmarkedCount ?? 0),
    items: sortReservationsByStartsAt(
      rows
        .map((row) => mapReservationItem(row as Record<string, unknown>))
        .filter((row): row is CaixaReservationItem => row != null),
    ),
  }
}

export function mapReservationInbox(
  raw: Record<string, unknown>,
): CaixaReservationInboxResponse {
  const rows = Array.isArray(raw.items) ? raw.items : []
  const items = sortReservationsByStartsAt(
    rows
      .map((row) => mapReservationItem(row as Record<string, unknown>))
      .filter((row): row is CaixaReservationItem => row != null),
  )
  const count = Number(
    raw.pending_future_count ?? raw.pendingFutureCount ?? items.length,
  )
  return {
    timezone: String(raw.timezone ?? ""),
    module_enabled: Boolean(raw.module_enabled ?? raw.moduleEnabled ?? false),
    pending_future_count: count,
    items,
  }
}

export function filterPreviewItems(
  items: CaixaReservationItem[],
  filter: ReservationFilter,
): CaixaReservationItem[] {
  if (filter === "pending") return items.filter((item) => item.status === "pending")
  if (filter === "confirmed") {
    return items.filter((item) => item.status === "confirmed")
  }
  return items.filter(
    (item) => item.status === "pending" || item.status === "confirmed",
  )
}

export const PREVIEW_RESERVATIONS: CaixaReservationListResponse = {
  date: "2026-09-17",
  timezone: "America/Sao_Paulo",
  module_enabled: true,
  unmarked_count: 1,
  summary: {
    reservations_count: 3,
    people_count: 8,
    peak_local_time: "20:30",
    cadeiroes_count: 1,
    carrinhos_count: 1,
  },
  items: [
    {
      id: "preview-pending-vaga",
      company_id: "preview",
      environment_id: "salao",
      environment_nome: "Salão",
      status: "pending",
      origin: "app",
      starts_at: "2026-09-17T23:00:00.000Z",
      ends_at: "2026-09-18T00:30:00.000Z",
      local_date: "2026-09-17",
      local_time: "20:00",
      party_size: 2,
      objetivo: "jantar",
      observacoes: null,
      requer_acessibilidade: false,
      cadeiroes_qtd: 0,
      espaco_carrinho: false,
      phone_canonical: "11987654321",
      guest_name: "Maria Silva",
      tolerancia_min: 15,
      capacity_available: true,
      unmarked: false,
      reason: null,
      decline_note: null,
      cancel_reason: null,
      cancelled_by: null,
    },
    {
      id: "preview-pending-lotado",
      company_id: "preview",
      environment_id: "salao",
      environment_nome: "Salão",
      status: "pending",
      origin: "app",
      starts_at: "2026-09-17T23:30:00.000Z",
      ends_at: "2026-09-18T01:00:00.000Z",
      local_date: "2026-09-17",
      local_time: "20:30",
      party_size: 4,
      objetivo: "aniversário",
      observacoes: "Mesa perto da janela, se possível.",
      requer_acessibilidade: true,
      cadeiroes_qtd: 1,
      espaco_carrinho: false,
      phone_canonical: "11991234567",
      guest_name: "Carlos Souza",
      tolerancia_min: 15,
      capacity_available: false,
      unmarked: false,
      reason: null,
      decline_note: null,
      cancel_reason: null,
      cancelled_by: null,
    },
    {
      id: "preview-confirmed-unmarked",
      company_id: "preview",
      environment_id: "varanda",
      environment_nome: "Varanda",
      status: "confirmed",
      origin: "app",
      starts_at: "2026-09-17T22:00:00.000Z",
      ends_at: "2026-09-17T23:30:00.000Z",
      local_date: "2026-09-17",
      local_time: "19:00",
      party_size: 2,
      objetivo: null,
      observacoes: null,
      requer_acessibilidade: false,
      cadeiroes_qtd: 0,
      espaco_carrinho: true,
      phone_canonical: "21999887766",
      guest_name: "Ana Lima",
      tolerancia_min: 15,
      capacity_available: null,
      unmarked: true,
      reason: null,
      decline_note: null,
      cancel_reason: null,
      cancelled_by: null,
    },
  ],
}

export const PREVIEW_INBOX: CaixaReservationInboxResponse = {
  timezone: "America/Sao_Paulo",
  module_enabled: true,
  pending_future_count: 1,
  items: [
    {
      id: "preview-pending-tomorrow",
      company_id: "preview",
      environment_id: "salao",
      environment_nome: "Salão",
      status: "pending",
      origin: "app",
      starts_at: "2026-09-18T23:00:00.000Z",
      ends_at: "2026-09-19T00:30:00.000Z",
      local_date: "2026-09-18",
      local_time: "20:00",
      party_size: 4,
      objetivo: "jantar",
      observacoes: null,
      requer_acessibilidade: false,
      cadeiroes_qtd: 0,
      espaco_carrinho: false,
      phone_canonical: "11980001111",
      guest_name: "Pedro Alves",
      tolerancia_min: 15,
      capacity_available: true,
      unmarked: false,
      reason: null,
      decline_note: null,
      cancel_reason: null,
      cancelled_by: null,
    },
  ],
}
