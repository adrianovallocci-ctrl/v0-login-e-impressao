import { Store } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Store className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Loja não encontrada</CardTitle>
            <CardDescription>
              Esse endereço não corresponde a uma loja.
            </CardDescription>
          </div>
          <Button asChild className="mt-2 w-full">
            <Link href="/">Voltar ao início</Link>
          </Button>
        </CardHeader>
      </Card>
    </div>
  )
}
