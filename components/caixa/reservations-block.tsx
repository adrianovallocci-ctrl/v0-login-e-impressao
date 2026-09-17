"use client"

import { ChevronLeft, ChevronRight, Loader2, Phone, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/components/caixa/auth-provider"
import {
  ACTION_LABELS,
  PREVIEW_INBOX,
  PREVIEW_RESERVATIONS,
  actionsForStatus,
  capacityLabel,
  dayReservationsQuery,
  filterPreviewItems,
  formatCivilDateShort,
  formatReservationListLine,
  formatReservationWhen,
  formatSummaryLine,
  mapReservationInbox,
  mapReservationList,
  pendingFutureBannerCopy,
  postThenRefetch,
  shiftCivilDate,
  shouldPollReservations,
  shouldShowReservationsBlock,
  startReservationsPoll,
  unmarkedBannerCopy,
  type CaixaReservationInboxResponse,
  type CaixaReservationItem,
  type CaixaReservationListResponse,
  type ReservationAction,
  type ReservationFilter,
} from "@/components/caixa/reservations"
import { parseApiErrorDetail } from "@/components/caixa/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const FILTERS: { id: ReservationFilter; label: string }[] = [
  { id: "fila", label: "Fila" },
  { id: "pending", label: "Pendentes" },
  { id: "confirmed", label: "Confirmadas" },
]

function statusBadge(status: string): { label: string; className: string } {
  if (status === "pending") {
    return { label: "Pendente", className: "bg-amber-100 text-amber-800" }
  }
  if (status === "confirmed") {
    return { label: "Confirmada", className: "bg-emerald-100 text-emerald-800" }
  }
  return { label: status, className: "bg-muted text-muted-foreground" }
}

function ReservationItemCard({
  item,
  todayIso,
  expanded,
  actionBusy,
  onToggle,
  onAction,
}: {
  item: CaixaReservationItem
  todayIso: string | null
  expanded: boolean
  actionBusy: string | null
  onToggle: () => void
  onAction: (item: CaixaReservationItem, action: ReservationAction) => void
}) {
  const badge = statusBadge(item.status)
  const vacancy = capacityLabel(item.status, item.capacity_available)
  const when = formatReservationWhen(item, todayIso)
  const line = formatReservationListLine(item, when)
  const actions = actionsForStatus(item.status)

  return (
    <li className="rounded-md border bg-background px-3 py-3">
      <button type="button" className="w-full text-left" onClick={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {item.unmarked ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              Sem marcação
            </span>
          ) : null}
          {vacancy ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                item.capacity_available
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {vacancy}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm font-medium">
          {item.guest_name?.trim() || "Cliente"}
        </p>
        <p className="text-sm text-muted-foreground">{line}</p>
      </button>

      {item.phone_canonical ? (
        <a
          href={`tel:${item.phone_canonical}`}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium hover:bg-muted"
        >
          <Phone className="size-4" aria-hidden="true" />
          Ligar
        </a>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-2 border-t pt-3 text-sm">
          {item.phone_canonical ? (
            <p>
              Telefone:{" "}
              <a className="underline" href={`tel:${item.phone_canonical}`}>
                {item.phone_canonical}
              </a>
            </p>
          ) : null}
          {item.objetivo ? <p>Objetivo: {item.objetivo}</p> : null}
          {item.observacoes ? <p>Observações: {item.observacoes}</p> : null}
          <p className="text-muted-foreground">
            Tolerância: {item.tolerancia_min} min
          </p>
          {item.decline_note ? <p>Nota da recusa: {item.decline_note}</p> : null}
          {item.cancel_reason ? (
            <p>Cancelamento: {item.cancel_reason}</p>
          ) : null}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {actions.map((action) => {
            const busy = actionBusy === `${item.id}:${action}`
            const destructive =
              action === "decline" ||
              action === "no_show" ||
              action === "cancel"
            return (
              <Button
                key={action}
                type="button"
                variant={destructive ? "outline" : "default"}
                className="h-11"
                disabled={actionBusy != null}
                onClick={() => onAction(item, action)}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {ACTION_LABELS[action]}
              </Button>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

export function ReservationsBlock({
  onVisibilityChange,
}: {
  onVisibilityChange?: (visible: boolean) => void
}) {
  const { token, preview, clearToken } = useAuth()
  const [filter, setFilter] = useState<ReservationFilter>("fila")
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [storeToday, setStoreToday] = useState<string | null>(null)
  const [payload, setPayload] = useState<CaixaReservationListResponse | null>(
    null,
  )
  const [inbox, setInbox] = useState<CaixaReservationInboxResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [confirmWithoutVacancy, setConfirmWithoutVacancy] =
    useState<CaixaReservationItem | null>(null)
  const [declineTarget, setDeclineTarget] =
    useState<CaixaReservationItem | null>(null)
  const [declineNote, setDeclineNote] = useState("")
  const [documentVisible, setDocumentVisible] = useState(true)

  const sessionActive = Boolean(token) || Boolean(preview)

  const loadDay = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!sessionActive) return

      if (preview && !token) {
        const today = PREVIEW_RESERVATIONS.date
        setStoreToday(today)
        const items = filterPreviewItems(PREVIEW_RESERVATIONS.items, filter)
        const viewing = selectedDate ?? today
        setPayload({
          ...PREVIEW_RESERVATIONS,
          date: viewing,
          items: viewing === today ? items : [],
        })
        return
      }
      if (!token) return

      if (!opts?.silent) setLoading(true)
      try {
        const query = dayReservationsQuery({
          date: selectedDate,
          today: storeToday,
          filter,
        })
        const response = await fetch(`/api/proxy/caixa/reservations${query}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        })

        if (!response.ok) {
          if (response.status === 401) {
            toast.error("Sessão expirada. Faça login novamente.")
            clearToken()
            return
          }
          const detail = await parseApiErrorDetail(response)
          toast.error(detail.message ?? "Não foi possível carregar as reservas.")
          return
        }

        const body = (await response.json()) as Record<string, unknown>
        const mapped = mapReservationList(body)
        setPayload(mapped)
        if (!selectedDate && mapped.date) setStoreToday(mapped.date)
      } catch {
        toast.error("Falha de conexão ao carregar reservas.")
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [sessionActive, preview, token, filter, selectedDate, storeToday, clearToken],
  )

  const loadInbox = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!sessionActive) return

      if (preview && !token) {
        setInbox(PREVIEW_INBOX)
        return
      }
      if (!token) return

      try {
        const response = await fetch(
          "/api/proxy/caixa/reservations?inbox=future_pending",
          {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        )
        if (!response.ok) {
          if (response.status === 401) {
            toast.error("Sessão expirada. Faça login novamente.")
            clearToken()
            return
          }
          if (!opts?.silent) {
            const detail = await parseApiErrorDetail(response)
            toast.error(
              detail.message ?? "Não foi possível carregar pedidos futuros.",
            )
          }
          return
        }
        const body = (await response.json()) as Record<string, unknown>
        setInbox(mapReservationInbox(body))
      } catch {
        if (!opts?.silent) {
          toast.error("Falha de conexão ao carregar pedidos futuros.")
        }
      }
    },
    [sessionActive, preview, token, clearToken],
  )

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      await Promise.all([loadDay(opts), loadInbox(opts)])
    },
    [loadDay, loadInbox],
  )

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const onVis = () =>
      setDocumentVisible(document.visibilityState === "visible")
    onVis()
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  const moduleEnabled =
    payload?.module_enabled === true || inbox?.module_enabled === true
  const poll = shouldPollReservations({
    moduleEnabled,
    documentVisible,
    sessionActive: Boolean(token) && !preview,
  })

  useEffect(() => {
    if (!poll) return
    return startReservationsPoll(() => {
      void loadAll({ silent: true })
    })
  }, [poll, loadAll])

  const postAction = useCallback(
    async (
      item: CaixaReservationItem,
      action: ReservationAction,
      body?: Record<string, unknown>,
    ) => {
      const key = `${item.id}:${action}`
      if (preview && !token) {
        toast.info("Modo teste — faça login para despachar a reserva.")
        return
      }
      if (!token) return

      setActionBusy(key)
      try {
        await postThenRefetch({
          post: async () => {
            const response = await fetch(
              `/api/proxy/caixa/reservations/${item.id}/${action === "no_show" ? "no-show" : action}`,
              {
                method: "POST",
                headers: {
                  authorization: `Bearer ${token}`,
                  ...(body ? { "content-type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
              },
            )

            if (!response.ok) {
              if (response.status === 401) {
                toast.error("Sessão expirada. Faça login novamente.")
                clearToken()
                throw new Error("auth")
              }
              const detail = await parseApiErrorDetail(response)
              toast.error(
                detail.message ??
                  `Não foi possível ${ACTION_LABELS[action].toLowerCase()}.`,
              )
              throw new Error(detail.code ?? "action")
            }

            toast.success(ACTION_LABELS[action])
          },
          refetch: async () => {
            await loadAll({ silent: true })
            return null
          },
        })
        setConfirmWithoutVacancy(null)
        setDeclineTarget(null)
        setDeclineNote("")
      } catch {
        /* toast already shown */
      } finally {
        setActionBusy(null)
      }
    },
    [preview, token, clearToken, loadAll],
  )

  const handleAction = useCallback(
    (item: CaixaReservationItem, action: ReservationAction) => {
      if (action === "confirm" && item.capacity_available === false) {
        setConfirmWithoutVacancy(item)
        return
      }
      if (action === "decline") {
        setDeclineNote("")
        setDeclineTarget(item)
        return
      }
      void postAction(item, action)
    },
    [postAction],
  )

  const items = payload?.items ?? []
  const inboxItems = inbox?.items ?? []
  const viewingToday =
    !selectedDate || (storeToday != null && selectedDate === storeToday)
  const summaryHeading = viewingToday
    ? "Hoje"
    : payload?.date
      ? formatCivilDateShort(payload.date)
      : "Dia"
  const summaryLine = payload
    ? formatSummaryLine(payload.summary, summaryHeading)
    : ""
  const unmarkedCopy = payload
    ? viewingToday
      ? unmarkedBannerCopy(payload.unmarked_count)
      : payload.unmarked_count > 0
        ? payload.unmarked_count === 1
          ? "1 reserva sem marcação"
          : `${payload.unmarked_count} reservas sem marcação`
        : null
    : null
  const inboxCopy = pendingFutureBannerCopy(inbox?.pending_future_count ?? 0)
  const dateValue = selectedDate ?? storeToday ?? ""

  const visible = useMemo(
    () => shouldShowReservationsBlock(payload?.module_enabled),
    [payload?.module_enabled],
  )
  const shown = sessionActive && !(payload != null && !visible)

  useEffect(() => {
    onVisibilityChange?.(shown)
    return () => onVisibilityChange?.(false)
  }, [shown, onVisibilityChange])

  if (!sessionActive) return null
  if (payload && !visible) return null

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="aspect-[2.4/1] bg-[#1B7A3A]">
        <img
          src="/reserva-mesa-banner.jpg"
          alt="Reserva de mesa"
          className="size-full object-cover"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h2 className="font-semibold">Reservas</h2>
            {summaryLine ? (
              <p className="text-sm text-muted-foreground">{summaryLine}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Fila do turno</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadAll()}
            disabled={loading || actionBusy != null}
            aria-label="Atualizar reservas"
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>

        {inboxCopy ? (
          <p className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-950">
            {inboxCopy}
          </p>
        ) : null}

        {inboxItems.length > 0 ? (
          <ul className="space-y-3">
            {inboxItems.map((item) => (
              <ReservationItemCard
                key={`inbox-${item.id}`}
                item={item}
                todayIso={storeToday}
                expanded={expandedId === item.id}
                actionBusy={actionBusy}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === item.id ? null : item.id,
                  )
                }
                onAction={handleAction}
              />
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={viewingToday ? "default" : "outline"}
            onClick={() => setSelectedDate(null)}
          >
            Hoje
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Dia anterior"
            disabled={!dateValue}
            onClick={() =>
              setSelectedDate(shiftCivilDate(dateValue, -1))
            }
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Input
            type="date"
            className="h-8 w-[10.5rem]"
            value={dateValue}
            onChange={(event) => {
              const next = event.target.value
              if (!next) {
                setSelectedDate(null)
                return
              }
              setSelectedDate(
                storeToday && next === storeToday ? null : next,
              )
            }}
            aria-label="Data da fila"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Próximo dia"
            disabled={!dateValue}
            onClick={() =>
              setSelectedDate(shiftCivilDate(dateValue, 1))
            }
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {unmarkedCopy ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            {unmarkedCopy}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((chip) => (
            <Button
              key={chip.id}
              type="button"
              size="sm"
              variant={filter === chip.id ? "default" : "outline"}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </Button>
          ))}
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Carregando…
          </div>
        ) : null}

        {!loading && items.length === 0 && payload?.module_enabled ? (
          <p className="rounded-md bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
            Nenhuma reserva neste dia.
          </p>
        ) : null}

        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {items.map((item) => (
            <ReservationItemCard
              key={item.id}
              item={item}
              todayIso={storeToday}
              expanded={expandedId === item.id}
              actionBusy={actionBusy}
              onToggle={() =>
                setExpandedId((current) =>
                  current === item.id ? null : item.id,
                )
              }
              onAction={handleAction}
            />
          ))}
        </ul>
      </div>

      {confirmWithoutVacancy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background p-4 shadow-lg">
            <p className="font-medium">Este horário está sem vaga agora.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Horário sem vaga. Confirmar mesmo assim?
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmWithoutVacancy(null)}
              >
                Voltar
              </Button>
              <Button
                className="flex-1"
                disabled={actionBusy != null}
                onClick={() =>
                  void postAction(confirmWithoutVacancy, "confirm")
                }
              >
                Confirmar mesa
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {declineTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background p-4 shadow-lg">
            <p className="font-medium">Recusar pedido</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Nota opcional para o cliente (até 140 caracteres).
            </p>
            <Input
              className="mt-3"
              maxLength={140}
              value={declineNote}
              onChange={(event) => setDeclineNote(event.target.value)}
              placeholder="Motivo (opcional)"
            />
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setDeclineTarget(null)
                  setDeclineNote("")
                }}
              >
                Voltar
              </Button>
              <Button
                className="flex-1"
                disabled={actionBusy != null}
                onClick={() =>
                  void postAction(
                    declineTarget,
                    "decline",
                    declineNote.trim()
                      ? { decline_note: declineNote.trim() }
                      : undefined,
                  )
                }
              >
                Recusar pedido
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
