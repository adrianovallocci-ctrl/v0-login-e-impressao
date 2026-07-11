"use client"

import { Store } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/caixa/auth-provider"
import type { EstablishmentView } from "@/components/caixa/types"

export function LoginScreen({
  companyId,
  establishment,
}: {
  companyId: string
  establishment: EstablishmentView | null
}) {
  const { setToken, enterPreview } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!companyId) {
      setError("Loja não identificada na URL.")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/proxy/collaborator/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: companyId, username, password }),
      })

      if (!response.ok) {
        if (response.status === 401) setError("Usuário ou senha incorretos.")
        else if (response.status === 429)
          setError("Muitas tentativas. Aguarde cerca de 15 minutos.")
        else if (response.status === 500)
          setError("Configuração pendente no servidor.")
        else setError(`Não foi possível entrar (erro ${response.status}).`)
        return
      }

      const data = await response.json()
      const token =
        data.access_token || data.token || data.accessToken || null
      if (!token) {
        setError("Resposta de login inesperada do servidor.")
        return
      }

      setToken(token)
    } catch {
      setError("Falha de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          {establishment?.logo_url ? (
            <img
              src={establishment.logo_url}
              alt={`Logo de ${establishment.name}`}
              className="mx-auto size-16 rounded-xl object-contain"
            />
          ) : establishment?.name ? (
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
              {establishment.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store className="size-6" aria-hidden="true" />
            </div>
          )}
          <div className="space-y-1">
            <CardTitle className="text-xl">
              {establishment?.name ?? "Caixa · Fidelidade"}
            </CardTitle>
            <CardDescription>
              Entre para imprimir o QR de check-in.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}
            <Button type="submit" className="mt-2 h-11 text-base" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <button
              type="button"
              onClick={enterPreview}
              disabled={loading}
              className="mt-1 text-center text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Ver interface (modo teste, sem login)
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
