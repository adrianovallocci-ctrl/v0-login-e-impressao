"use client"

import { Store } from "lucide-react"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function TenantNotFoundScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Store className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Loja não encontrada</CardTitle>
            <CardDescription>
              O endereço acessado não corresponde a um estabelecimento válido.
              Confira a URL fornecida pelo gestor.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
