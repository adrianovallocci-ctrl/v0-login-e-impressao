"use client"

import { Loader2, LogOut, Printer, RefreshCw, Timer } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/components/caixa/auth-provider"
import {
  formatElapsed,
  formatRewardWhen,
  parseApiError,
  type CheckinPrintResult,
  type EstablishmentView,
  type LoyaltyRewardItem,
} from "@/components/caixa/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const PREVIEW_REWARDS: LoyaltyRewardItem[] = [
  {
    id: "preview-reward-1",
    variation_label: "Pizza broto",
    table_number: "12",
    customer_name: "Maria Silva",
    customer_phone_display: "(11) 9****-4321",
    garcom_name: "João",
    checkins_debited: 5,
    status: "pending_print",
    created_at: new Date().toISOString(),
  },
]

function mapReward(raw: Record<string, unknown>): LoyaltyRewardItem {
  return {
    id: String(raw.id ?? ""),
    variation_label: (raw.variation_label ?? raw.variationLabel ?? null) as
      | string
      | null,
    table_number: String(raw.table_number ?? raw.tableNumber ?? "—"),
    customer_name: (raw.customer_name ?? raw.customerName ?? null) as
      | string
      | null,
    customer_phone_display: String(
      raw.customer_phone_display ?? raw.customerPhoneDisplay ?? "",
    ),
    garcom_name: (raw.garcom_name ?? raw.garcomName ?? null) as string | null,
    checkins_debited: Number(raw.checkins_debited ?? raw.checkinsDebited ?? 0),
    status: String(raw.status ?? ""),
    created_at: String(raw.created_at ?? raw.createdAt ?? ""),
  }
}

export function DashboardScreen({
  establishment,
}: {
  establishment: EstablishmentView | null
}) {
  const { token, preview, clearToken } = useAuth()
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [checkinResult, setCheckinResult] = useState<CheckinPrintResult | null>(
    null,
  )
  const [quantity, setQuantity] = useState(1)
  const [vitrineLoading, setVitrineLoading] = useState(false)
  const [rewards, setRewards] = useState<LoyaltyRewardItem[]>([])
  const [rewardsLoading, setRewardsLoading] = useState(false)
  const [reprintingId, setReprintingId] = useState<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [expiresInMs, setExpiresInMs] = useState(0)

  const loyaltyEnabled = establishment?.loyaltyCheckinEnabled ?? false
  const vitrineEnabled = establishment?.vitrineCouponEnabled ?? false
  const busy = checkinLoading || vitrineLoading || reprintingId != null

  const loadRewards = useCallback(async () => {
    if (!loyaltyEnabled) return

    if (preview && !token) {
      setRewards(PREVIEW_REWARDS)
      return
    }
    if (!token) return

    setRewardsLoading(true)
    try {
      const response = await fetch(
        "/api/proxy/collaborator/loyalty-rewards?status=pending_print",
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
        const detail = await parseApiError(response)
        toast.error(detail ?? "Não foi possível carregar resgates pendentes.")
        return
      }

      const body = await response.json()
      const rows = Array.isArray(body) ? body : []
      setRewards(
        rows
          .map((row) => mapReward(row as Record<string, unknown>))
          .filter((row) => row.id),
      )
    } catch {
      toast.error("Falha de conexão ao carregar resgates.")
    } finally {
      setRewardsLoading(false)
    }
  }, [loyaltyEnabled, preview, token, clearToken])

  useEffect(() => {
    void loadRewards()
  }, [loadRewards])

  useEffect(() => {
    if (!loyaltyEnabled || !token) return
    const id = setInterval(() => {
      void loadRewards()
    }, 20_000)
    return () => clearInterval(id)
  }, [loyaltyEnabled, token, loadRewards])

  useEffect(() => {
    if (!timerActive) return
    const id = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current)
      }
    }, 100)
    return () => clearInterval(id)
  }, [timerActive])

  useEffect(() => {
    if (!checkinResult?.expires_at) return
    const expiresAt = new Date(checkinResult.expires_at).getTime()
    if (Number.isNaN(expiresAt)) return

    const tick = () => setExpiresInMs(expiresAt - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [checkinResult])

  const printCheckin = useCallback(async () => {
    setCheckinResult(null)
    setCheckinLoading(true)
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    setTimerActive(true)

    if (preview && !token) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      setCheckinResult({
        job_id: "preview-" + Math.random().toString(36).slice(2, 10),
        token_id: "preview",
        checkin_token: "PREVIEW_TOKEN_" + Math.random().toString(36).slice(2, 10).toUpperCase(),
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      })
      setCheckinLoading(false)
      return
    }

    try {
      const response = await fetch("/api/proxy/collaborator/print-checkin", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        setTimerActive(false)
        if (response.status === 401) {
          toast.error("Sessão expirada. Faça login novamente.")
          clearToken()
          return
        }
        const detail = await parseApiError(response)
        if (response.status === 403) {
          toast.error("Check-in indisponível", {
            description:
              detail ??
              "Este estabelecimento não tem Consumo Local com Fidelidade ativa.",
          })
        } else if (response.status === 404) {
          toast.error("Fidelidade não está ativa para esta loja.", {
            description: detail ?? undefined,
          })
        } else {
          toast.error(detail ?? `Não foi possível imprimir (erro ${response.status}).`)
        }
        return
      }

      const data = await response.json()
      setCheckinResult({
        job_id: String(data.job_id ?? data.jobId ?? data.print_job_id ?? data.id ?? ""),
        token_id: String(data.token_id ?? data.tokenId ?? ""),
        checkin_token: String(
          data.checkin_token ?? data.checkinToken ?? data.token ?? "",
        ),
        expires_at: String(data.expires_at ?? data.expiresAt ?? ""),
      })
    } catch {
      setTimerActive(false)
      toast.error("Falha de conexão. Tente novamente.")
    } finally {
      setCheckinLoading(false)
    }
  }, [token, preview, clearToken])

  const printVitrine = useCallback(async () => {
    if (preview && !token) {
      toast.info("Modo teste — faça login para imprimir o cupom vitrine.")
      return
    }

    setVitrineLoading(true)
    try {
      const response = await fetch("/api/proxy/collaborator/print-vitrine", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          toast.error("Sessão expirada. Faça login novamente.")
          clearToken()
          return
        }
        const detail = await parseApiError(response)
        if (response.status === 403) {
          toast.error("Cupom Vitrine indisponível", {
            description: detail ?? "Peça ao gestor para configurar o Cupom Vitrine.",
          })
        } else if (response.status === 404) {
          toast.error("Cupom Vitrine não está disponível.", {
            description:
              detail ?? "Peça ao gestor para ativar Campanhas fixas → Cupom Vitrine.",
          })
        } else {
          toast.error(detail ?? `Não foi possível imprimir (erro ${response.status}).`)
        }
        return
      }

      toast.success(
        quantity > 1
          ? `${quantity} cupons enviados para impressora`
          : "Cupom enviado para impressora",
      )
    } catch {
      toast.error("Falha de conexão. Tente novamente.")
    } finally {
      setVitrineLoading(false)
    }
  }, [token, preview, quantity, clearToken])

  const reprintReward = useCallback(
    async (rewardId: string) => {
      if (preview && !token) {
        toast.info("Modo teste — faça login para reimprimir.")
        return
      }

      setReprintingId(rewardId)
      try {
        const response = await fetch(
          `/api/proxy/collaborator/loyalty-rewards/${rewardId}/reprint`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
          },
        )

        if (!response.ok) {
          if (response.status === 401) {
            toast.error("Sessão expirada. Faça login novamente.")
            clearToken()
            return
          }
          const detail = await parseApiError(response)
          toast.error(detail ?? "Não foi possível reimprimir o resgate.")
          return
        }

        const data = await response.json()
        const jobId = String(data.job_id ?? data.jobId ?? "")
        toast.success("Reimpressão enfileirada.", {
          description: jobId ? `Job ${jobId.slice(0, 8)}…` : undefined,
        })
        await loadRewards()
      } catch {
        toast.error("Falha de conexão. Tente novamente.")
      } finally {
        setReprintingId(null)
      }
    },
    [preview, token, clearToken, loadRewards],
  )

  const qrUrl = checkinResult?.checkin_token
    ? `https://app.cuponfood.com.br/loyalty/checkin?t=${checkinResult.checkin_token}`
    : ""

  const expiresLabel =
    checkinResult?.expires_at &&
    !Number.isNaN(new Date(checkinResult.expires_at).getTime())
      ? new Date(checkinResult.expires_at).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : ""

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          {establishment?.logo_url ? (
            <img
              src={establishment.logo_url}
              alt={`Logo de ${establishment.name}`}
              className="size-9 rounded-md object-contain"
            />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
              {(establishment?.name ?? "C").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col leading-tight">
            <span className="font-medium">
              {establishment?.name ?? "Caixa · Check-in"}
            </span>
            <span className="text-xs text-muted-foreground">Caixa · Check-in</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={clearToken}>
          <LogOut className="size-4" aria-hidden="true" />
          {preview && !token ? "Voltar ao login" : "Sair"}
        </Button>
      </header>

      {preview && !token ? (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-700">
          Modo teste — interface apenas para visualização.
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
        {loyaltyEnabled ? (
          <Card>
            <CardContent className="pt-6">
              <Button
                onClick={printCheckin}
                disabled={busy}
                className="h-20 w-full text-lg"
              >
                {checkinLoading ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Printer className="size-6" aria-hidden="true" />
                    Imprimir QR de check-in
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Programa de Fidelidade | Consumo no Local
              </p>
              {timerActive || checkinResult ? (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                  <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-muted-foreground">Desde o clique:</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatElapsed(elapsedMs)}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {checkinResult ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-center text-sm font-medium text-green-600">
                QR enviado para impressora
              </p>
              {qrUrl ? (
                <div className="flex justify-center">
                  <QRCodeSVG value={qrUrl} size={160} />
                </div>
              ) : null}
              {expiresLabel ? (
                <p className="text-center text-sm text-muted-foreground">
                  Válido até {expiresLabel}
                  {expiresInMs <= 0 ? " (expirado)" : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {loyaltyEnabled ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="font-semibold">Reimprimir benefício</h2>
                  <p className="text-sm text-muted-foreground">
                    Se a via do resgate não saiu na térmica, reenvie pela fila.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadRewards()}
                  disabled={rewardsLoading || busy}
                  aria-label="Atualizar lista de resgates"
                >
                  <RefreshCw
                    className={`size-4 ${rewardsLoading ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                </Button>
              </div>

              {rewardsLoading && rewards.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Carregando…
                </div>
              ) : null}

              {!rewardsLoading && rewards.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhum resgate aguardando impressão.
                </p>
              ) : null}

              <ul className="space-y-3">
                {rewards.map((reward) => {
                  const cliente =
                    reward.customer_name?.trim() ||
                    reward.customer_phone_display ||
                    "Cliente"
                  const beneficio = reward.variation_label?.trim() || "Benefício"
                  const when = formatRewardWhen(reward.created_at)
                  const isReprint = reprintingId === reward.id

                  return (
                    <li
                      key={reward.id}
                      className="rounded-md border bg-background px-3 py-3"
                    >
                      <div className="space-y-1 text-sm">
                        <p className="font-medium">{beneficio}</p>
                        <p className="text-muted-foreground">
                          Mesa {reward.table_number}
                          {when ? ` · ${when}` : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {cliente}
                          {reward.garcom_name
                            ? ` · Garçom ${reward.garcom_name}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="mt-3 h-11 w-full"
                        disabled={busy}
                        onClick={() => void reprintReward(reward.id)}
                      >
                        {isReprint ? (
                          <>
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden="true"
                            />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Printer className="size-4" aria-hidden="true" />
                            Reimprimir
                          </>
                        )}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {vitrineEnabled ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1">
                <h2 className="font-semibold">Cupom Vitrine</h2>
                <p className="text-sm text-muted-foreground">
                  Cupom para embalagem de pedido de plataforma (iFood, Rappi…).
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || busy}
                >
                  −
                </Button>
                <span className="min-w-8 text-center font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  disabled={quantity >= 10 || busy}
                >
                  +
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={printVitrine}
                disabled={busy}
                className="h-14 w-full text-base"
              >
                {vitrineLoading ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                    Enviando...
                  </>
                ) : (
                  "Imprimir Cupom Hospedeiro (Vitrine)"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Cada impressão envia cupons para a fila da impressora.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  )
}
