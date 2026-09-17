"use client"

import { Loader2, Phone, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/components/caixa/auth-provider"
import {
  ACTION_LABELS,
  PREVIEW_RESERVATIONS,
  actionsForStatus,
  capacityLabel,
  filterPreviewItems,
  formatReservationListLine,
  formatSummaryLine,
  mapReservationList,
  postThenRefetch,
  shouldPollReservations,
  shouldShowReservationsBlock,
  startReservationsPoll,
  statusQuery,
  unmarkedBannerCopy,
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

export function ReservationsBlock() {
  const { token, preview, clearToken } = useAuth()
  const [filter, setFilter] = useState<ReservationFilter>("fila")
  const [payload, setPayload] = useState<CaixaReservationListResponse | null>(
    null,
  )
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

  const loadList = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!sessionActive) return

      if (preview && !token) {
        const items = filterPreviewItems(PREVIEW_RESERVATIONS.items, filter)
        setPayload({ ...PREVIEW_RESERVATIONS, items })
        return
      }
      if (!token) return

      if (!opts?.silent) setLoading(true)
      try {
        const query = statusQuery(filter)
        const response = await fetch(
          `/api/proxy/caixa/reservations${query ? `?${query}` : ""}`,
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
          const detail = await parseApiErrorDetail(response)
          toast.error(detail.message ?? "Não foi possível carregar as reservas.")
          return
        }

        const body = (await response.json()) as Record<string, unknown>
        setPayload(mapReservationList(body))
      } catch {
        toast.error("Falha de conexão ao carregar reservas.")
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [sessionActive, preview, token, filter, clearToken],
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    const onVis = () =>
      setDocumentVisible(document.visibilityState === "visible")
    onVis()
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  const moduleEnabled = payload?.module_enabled === true
  const poll = shouldPollReservations({
    moduleEnabled,
    documentVisible,
    sessionActive: Boolean(token) && !preview,
  })

  useEffect(() => {
    if (!poll) return
    return startReservationsPoll(() => {
      void loadList({ silent: true })
    })
  }, [poll, loadList])

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
            await loadList({ silent: true })
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
    [preview, token, clearToken, loadList],
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
  const summaryLine = payload ? formatSummaryLine(payload.summary) : ""
  const unmarkedCopy = payload
    ? unmarkedBannerCopy(payload.unmarked_count)
    : null

  const visible = useMemo(
    () => shouldShowReservationsBlock(payload?.module_enabled),
    [payload?.module_enabled],
  )

  if (!sessionActive) return null
  if (payload && !visible) return null

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="aspect-[2.4/1] bg-[#1B7A3A]">
        <img
          src="/reserva-mesa-banner.jpg"
          alt="Reserva de mesa"
          className="size-full object-cover"
        />
      </div>

      <div className="flex flex-col gap-4 p-4">
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
            onClick={() => void loadList()}
            disabled={loading || actionBusy != null}
            aria-label="Atualizar reservas"
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
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

        <ul className="space-y-3">
          {items.map((item) => {
            const badge = statusBadge(item.status)
            const vacancy = capacityLabel(item.status, item.capacity_available)
            const expanded = expandedId === item.id
            const line = formatReservationListLine(item)
            const actions = actionsForStatus(item.status)

            return (
              <li
                key={item.id}
                className="rounded-md border bg-background px-3 py-3"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setExpandedId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                >
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
                        <a
                          className="underline"
                          href={`tel:${item.phone_canonical}`}
                        >
                          {item.phone_canonical}
                        </a>
                      </p>
                    ) : null}
                    {item.objetivo ? <p>Objetivo: {item.objetivo}</p> : null}
                    {item.observacoes ? (
                      <p>Observações: {item.observacoes}</p>
                    ) : null}
                    <p className="text-muted-foreground">
                      Tolerância: {item.tolerancia_min} min
                    </p>
                    {item.decline_note ? (
                      <p>Nota da recusa: {item.decline_note}</p>
                    ) : null}
                    {item.cancel_reason ? (
                      <p>Cancelamento: {item.cancel_reason}</p>
                    ) : null}
                  </div>
                ) : null}

                {actions.length > 0 ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                          onClick={() => handleAction(item, action)}
                        >
                          {busy ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden="true"
                            />
                          ) : null}
                          {ACTION_LABELS[action]}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}
              </li>
            )
          })}
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
