// @vitest-environment happy-dom

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Profiler, useEffect, type ProfilerOnRenderCallback } from "react"
import { flushSync } from "react-dom"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider, useAuth } from "@/components/caixa/auth-provider"
import { CaixaShell } from "@/components/caixa/caixa-app"
import {
  HIDDEN_PRINT_CAPABILITIES,
  readCashierEntry,
  readPrintCapabilities,
} from "@/components/caixa/cashier-entry"
import * as types from "@/components/caixa/types"

const COMPANY_ID = "11111111-1111-4111-8111-111111111111"
const LOGO = "https://cdn.example/sol.png"
const STORE = "Padaria Sol"
const QR = "Imprimir QR de check-in"
const VITRINE = "Imprimir Cupom Hospedeiro (Vitrine)"
const ENTRY = `/api/proxy/public/cashier-entry/${COMPANY_ID}`
const CAPS = "/api/proxy/collaborator/print-capabilities"
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

type FetchCall = { url: string; init?: RequestInit }
type EntryImpl = (call: FetchCall) => Promise<Response> | Response
type CapsImpl = (call: FetchCall) => Promise<Response> | Response

type AuthHandle = {
  ready: boolean
  setToken: (token: string) => void
  clearToken: () => void
  enterPreview: () => void
}

function AuthBridge({ handleRef }: { handleRef: { current: AuthHandle | null } }) {
  const auth = useAuth()
  useEffect(() => {
    handleRef.current = {
      ready: auth.ready,
      setToken: auth.setToken,
      clearToken: auth.clearToken,
      enterPreview: auth.enterPreview,
    }
  })
  return null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function entryBody(overrides: Record<string, unknown> = {}) {
  return {
    company_id: COMPANY_ID,
    name: STORE,
    logo_url: LOGO,
    ...overrides,
  }
}

function flags(loyalty: boolean, vitrine: boolean) {
  return {
    loyalty_checkin_enabled: loyalty,
    vitrine_coupon_enabled: vitrine,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function authorization(init?: RequestInit): string | null {
  const headers = init?.headers
  if (!headers) return null
  if (headers instanceof Headers) return headers.get("authorization")
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === "authorization")
    return found ? String(found[1]) : null
  }
  const record = headers as Record<string, string>
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === "authorization") return record[key] ?? null
  }
  return null
}

function productionSources(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue
      files.push(full)
    }
  }
  for (const dir of ["app", "components", "lib"]) walk(path.join(ROOT, dir))
  return files
}

type Paint = {
  loyalty: boolean
  vitrine: boolean
  testMode: boolean
  qr: boolean
  vitrineButton: boolean
}

function readPaint(): Paint | null {
  const node = document.querySelector("[data-loyalty-checkin]")
  if (!node) return null
  const text = document.body.textContent ?? ""
  return {
    loyalty: node.getAttribute("data-loyalty-checkin") === "true",
    vitrine: node.getAttribute("data-vitrine-coupon") === "true",
    testMode: text.includes("Modo teste"),
    qr: text.includes(QR),
    vitrineButton: text.includes(VITRINE),
  }
}

const paints: Paint[] = []

const rememberPaint: ProfilerOnRenderCallback = () => {
  const paint = readPaint()
  if (paint) paints.push(paint)
}

function expectColumns(loyalty: boolean, vitrine: boolean) {
  const qr = screen.queryByRole("button", { name: QR })
  const vitrineButton = screen.queryByRole("button", { name: VITRINE })
  if (loyalty) expect(qr).not.toBeNull()
  else expect(qr).toBeNull()
  if (vitrine) expect(vitrineButton).not.toBeNull()
  else expect(vitrineButton).toBeNull()
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

describe("entrada própria do caixa", () => {
  const handle: { current: AuthHandle | null } = { current: null }
  let calls: FetchCall[]
  let capsQueue: CapsImpl[]
  let entryImpl: EntryImpl

  function renderShell() {
    return render(
      <AuthProvider companyId={COMPANY_ID}>
        <Profiler id="caixa" onRender={rememberPaint}>
          <CaixaShell companyId={COMPANY_ID} />
          <AuthBridge handleRef={handle} />
        </Profiler>
      </AuthProvider>,
    )
  }

  function entryCalls() {
    return calls.filter((call) => call.url.includes("/public/cashier-entry/"))
  }

  function capsCalls() {
    return calls.filter((call) => call.url.includes("/collaborator/print-capabilities"))
  }

  function reservationCalls() {
    return calls.filter((call) => call.url.includes("/caixa/reservations"))
  }

  beforeEach(() => {
    calls = []
    capsQueue = []
    paints.length = 0
    entryImpl = () => json(entryBody())
    sessionStorage.clear()
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      const call = { url, init }
      calls.push(call)
      if (url.includes("/public/cashier-entry/")) return entryImpl(call)
      if (url.includes("/collaborator/print-capabilities")) {
        const next = capsQueue.shift()
        if (!next) return json(flags(false, false))
        return next(call)
      }
      if (url.includes("/caixa/reservations")) {
        return json({
          date: "2026-10-07",
          timezone: "America/Sao_Paulo",
          module_enabled: true,
          summary: {},
          items: [],
          pending_future_count: 0,
        })
      }
      if (url.includes("/collaborator/loyalty-rewards")) return json([])
      return json({ detail: "unexpected" }, 500)
    })
  })

  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    handle.current = null
    vi.unstubAllGlobals()
  })

  it("1. o splash antigo não é mais chamado pelo CaixaShell", async () => {
    renderShell()
    expect(await screen.findByText(STORE)).toBeTruthy()

    expect(entryCalls().some((call) => call.url === ENTRY)).toBe(true)
    expect(calls.some((call) => call.url.includes("/app/establishment/"))).toBe(false)
  })

  it("2. a entrada pública é a única origem, antes do login, de company_id, nome e logo", async () => {
    const payload = entryBody({
      fantasy_name: "Nome Fantasia",
      company_name: "Razão Social",
      logoUrl: "https://cdn.example/wrong.png",
      logo: "https://cdn.example/also-wrong.png",
      print_capabilities: flags(true, true),
    })
    entryImpl = () => json(payload)
    renderShell()

    expect(await screen.findByText(STORE)).toBeTruthy()
    expect(screen.queryByText("Nome Fantasia")).toBeNull()
    expect(screen.queryByText("Razão Social")).toBeNull()
    expect(
      screen.getByRole("img", { name: `Logo de ${STORE}` }).getAttribute("src"),
    ).toBe(LOGO)
    expect(entryCalls()).toHaveLength(1)
    expect(entryCalls()[0]?.url).toBe(ENTRY)
    expect(capsCalls()).toHaveLength(0)
    expect(calls.some((call) => call.url.includes("/app/establishment/"))).toBe(false)
    expect(readCashierEntry(payload)).toEqual({
      company_id: COMPANY_ID,
      name: STORE,
      logo_url: LOGO,
    })
  })

  it("3. cashier-entry é chamada sem token", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    capsQueue.push(() => json(flags(false, false)))
    renderShell()

    await screen.findByRole("button", { name: "Sair" })
    await waitFor(() => expect(capsCalls()).toHaveLength(1))

    expect(entryCalls()).toHaveLength(1)
    expect(authorization(entryCalls()[0]?.init)).toBeNull()
    expect(authorization(capsCalls()[0]?.init)).toBe("Bearer sess-a")
  })

  it("4. capabilities não são buscadas antes da autenticação", async () => {
    renderShell()
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    await waitFor(() => expect(entryCalls()).toHaveLength(1))
    expect(capsCalls()).toHaveLength(0)

    capsQueue.push(() => json(flags(true, false)))
    act(() => handle.current!.setToken("sess-a"))

    await waitFor(() => expect(capsCalls()).toHaveLength(1))
    expect(authorization(capsCalls()[0]?.init)).toBe("Bearer sess-a")
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
  })

  it("5. o Authorization das capabilities usa o token da sessão atual", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    const first = deferred<Response>()
    const second = deferred<Response>()
    capsQueue.push(() => first.promise, () => second.promise)
    renderShell()

    await waitFor(() => expect(capsCalls()).toHaveLength(1))
    expect(capsCalls()[0]?.url).toBe(CAPS)
    expect(authorization(capsCalls()[0]?.init)).toBe("Bearer sess-a")

    await act(async () => {
      handle.current!.clearToken()
    })
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    act(() => handle.current!.setToken("sess-b"))
    await waitFor(() => expect(capsCalls()).toHaveLength(2))

    expect(authorization(capsCalls()[1]?.init)).toBe("Bearer sess-b")
    expect(authorization(capsCalls()[1]?.init)).not.toBe("Bearer sess-a")
    expect(capsCalls()[1]?.url).toBe(CAPS)
  })

  it("6. estado começa false/false", async () => {
    expect(HIDDEN_PRINT_CAPABILITIES).toEqual({
      loyaltyCheckinEnabled: false,
      vitrineCouponEnabled: false,
    })
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    const pending = deferred<Response>()
    capsQueue.push(() => pending.promise)
    renderShell()

    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    expectColumns(false, false)

    pending.resolve(json(flags(true, true)))
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(await screen.findByRole("button", { name: VITRINE })).toBeTruthy()
  })

  it("7. enquanto carrega continua false/false", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    const pending = deferred<Response>()
    capsQueue.push(() => pending.promise)
    renderShell()

    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    await waitFor(() => expect(capsCalls()).toHaveLength(1))
    expectColumns(false, false)

    pending.resolve(json(flags(false, true)))
    expect(await screen.findByRole("button", { name: VITRINE })).toBeTruthy()
    expect(screen.queryByRole("button", { name: QR })).toBeNull()
  })

  it("8. falha não revela nem reativa colunas", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    capsQueue.push(
      () => json(flags(true, true)),
      () => json({ detail: "falha" }, 500),
    )
    renderShell()

    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(await screen.findByRole("button", { name: VITRINE })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Sair" }))
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    act(() => handle.current!.setToken("sess-b"))

    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    await waitFor(() => expect(capsCalls()).toHaveLength(2))
    await settle()
    expectColumns(false, false)
    expect(screen.getByText(STORE)).toBeTruthy()
  })

  it("9. logout volta a false/false", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    const pending = deferred<Response>()
    capsQueue.push(() => json(flags(true, true)), () => pending.promise)
    renderShell()

    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.getByRole("button", { name: VITRINE })).toBeTruthy()
    expect(paints.at(-1)).toMatchObject({ loyalty: true, vitrine: true })

    const logoutAt = paints.length
    act(() => {
      flushSync(() => {
        handle.current!.clearToken()
      })
    })
    expect(paints[logoutAt]).toMatchObject({
      loyalty: false,
      vitrine: false,
      qr: false,
      vitrineButton: false,
      testMode: false,
    })
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy()
    expectColumns(false, false)

    const nextAt = paints.length
    act(() => {
      flushSync(() => {
        handle.current!.setToken("sess-b")
      })
    })
    expect(paints[nextAt]).toMatchObject({
      loyalty: false,
      vitrine: false,
      qr: false,
      vitrineButton: false,
    })
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy()
    expectColumns(false, false)
    await waitFor(() => expect(capsCalls()).toHaveLength(2))
    expectColumns(false, false)

    pending.resolve(json(flags(true, false)))
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.queryByRole("button", { name: VITRINE })).toBeNull()
  })

  it("10. sessão nova não herda flag da anterior, nem resposta atrasada", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    const previous = deferred<Response>()
    const current = deferred<Response>()
    capsQueue.push(
      () => json(flags(true, true)),
      () => previous.promise,
      () => current.promise,
    )
    renderShell()

    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.getByRole("button", { name: VITRINE })).toBeTruthy()
    expect(authorization(capsCalls()[0]?.init)).toBe("Bearer sess-a")
    expect(paints.at(-1)).toMatchObject({ loyalty: true, vitrine: true, qr: true })

    const switchAt = paints.length
    act(() => {
      flushSync(() => {
        handle.current!.setToken("sess-b")
      })
    })
    expect(paints[switchAt]).toMatchObject({
      loyalty: false,
      vitrine: false,
      qr: false,
      vitrineButton: false,
      testMode: false,
    })
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull()
    expectColumns(false, false)
    await waitFor(() => expect(capsCalls()).toHaveLength(2))
    expect(authorization(capsCalls()[1]?.init)).toBe("Bearer sess-b")

    const directAt = paints.length
    act(() => {
      flushSync(() => {
        handle.current!.setToken("sess-c")
      })
    })
    expect(paints[directAt]).toMatchObject({
      loyalty: false,
      vitrine: false,
      qr: false,
      vitrineButton: false,
    })
    expectColumns(false, false)
    await waitFor(() => expect(capsCalls()).toHaveLength(3))
    expect(authorization(capsCalls()[2]?.init)).toBe("Bearer sess-c")

    const lateAt = paints.length
    previous.resolve(json(flags(true, true)))
    await settle()
    expect(paints.slice(lateAt).every((paint) => !paint.loyalty && !paint.vitrine)).toBe(
      true,
    )
    expectColumns(false, false)

    current.resolve(json(flags(false, true)))
    expect(await screen.findByRole("button", { name: VITRINE })).toBeTruthy()
    expect(screen.queryByRole("button", { name: QR })).toBeNull()
  })

  it("11. preview sem login fica false/false e não chama print-capabilities", async () => {
    renderShell()
    expect(
      await screen.findByRole("button", {
        name: "Ver interface (modo teste, sem login)",
      }),
    ).toBeTruthy()

    const previewAt = paints.length
    act(() => {
      flushSync(() => {
        handle.current!.enterPreview()
      })
    })
    expect(paints[previewAt]).toMatchObject({
      loyalty: false,
      vitrine: false,
      testMode: true,
      qr: false,
      vitrineButton: false,
    })
    expect(screen.getByText(STORE)).toBeTruthy()
    expect(
      screen.getByRole("img", { name: `Logo de ${STORE}` }).getAttribute("src"),
    ).toBe(LOGO)
    expectColumns(false, false)
    expect(capsCalls()).toHaveLength(0)

    act(() => {
      handle.current!.clearToken()
    })
    capsQueue.push(() => json(flags(true, true)))
    act(() => handle.current!.setToken("sess-a"))
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.getByRole("button", { name: VITRINE })).toBeTruthy()
    expect(capsCalls()).toHaveLength(1)

    const fromSessionAt = paints.length
    act(() => {
      flushSync(() => {
        handle.current!.clearToken()
        handle.current!.enterPreview()
      })
    })
    const previewPaints = paints.slice(fromSessionAt)
    expect(previewPaints[0]).toMatchObject({ loyalty: false, vitrine: false })
    expect(previewPaints.some((paint) => paint.testMode)).toBe(true)
    expect(
      previewPaints.every((paint) => !paint.loyalty && !paint.vitrine && !paint.qr),
    ).toBe(true)
    expect(screen.getByText(/Modo teste/)).toBeTruthy()
    expectColumns(false, false)
    expect(capsCalls()).toHaveLength(1)

    capsQueue.push(() => json(flags(true, false)))
    act(() => handle.current!.setToken("sess-a"))
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.queryByRole("button", { name: VITRINE })).toBeNull()
    expect(capsCalls()).toHaveLength(2)
    expect(authorization(capsCalls()[1]?.init)).toBe("Bearer sess-a")
  })

  it("12. nome e logo continuam no login e no dashboard", async () => {
    renderShell()
    expect(await screen.findByText(STORE)).toBeTruthy()
    expect(
      screen.getByRole("img", { name: `Logo de ${STORE}` }).getAttribute("src"),
    ).toBe(LOGO)

    act(() => handle.current!.setToken("sess-a"))
    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    expect(screen.getByText(STORE)).toBeTruthy()
    expect(
      screen.getByRole("img", { name: `Logo de ${STORE}` }).getAttribute("src"),
    ).toBe(LOGO)

    cleanup()
    entryImpl = () => json(entryBody({ logo_url: null }))
    renderShell()
    expect(await screen.findByText(STORE)).toBeTruthy()
    expect(screen.queryByRole("img", { name: `Logo de ${STORE}` })).toBeNull()
    expect(screen.getByText("P")).toBeTruthy()

    act(() => handle.current!.setToken("sess-b"))
    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    expect(screen.getByText(STORE)).toBeTruthy()
    expect(screen.queryByRole("img", { name: `Logo de ${STORE}` })).toBeNull()
    expect(screen.getByText("P")).toBeTruthy()
  })

  it("13. 404 e 422 da entrada levam a Loja não encontrada", async () => {
    entryImpl = () =>
      json({ company_id: COMPANY_ID, name: "Segredo", logo_url: LOGO }, 404)
    renderShell()
    expect(await screen.findByText("Loja não encontrada")).toBeTruthy()
    expect(screen.queryByText("Segredo")).toBeNull()
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull()

    cleanup()
    entryImpl = () => json(entryBody())
    renderShell()
    expect(await screen.findByText(STORE)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy()
    expect(screen.queryByText("Loja não encontrada")).toBeNull()

    cleanup()
    entryImpl = () => json({ detail: [{ msg: "invalid" }] }, 422)
    renderShell()
    expect(await screen.findByText("Loja não encontrada")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull()
    expect(screen.queryByText(STORE)).toBeNull()
  })

  it("14. falha de rede mantém o login e não vira Loja não encontrada", async () => {
    entryImpl = () => {
      throw new TypeError("Failed to fetch")
    }
    renderShell()
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    expect(screen.getByText("Caixa · Fidelidade")).toBeTruthy()
    expect(screen.queryByText("Loja não encontrada")).toBeNull()

    cleanup()
    entryImpl = () => json(entryBody())
    renderShell()
    expect(await screen.findByText(STORE)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy()
    expect(screen.queryByText("Loja não encontrada")).toBeNull()
  })

  it("15. reservas não dependem da chamada de capabilities", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    const pending = deferred<Response>()
    capsQueue.push(() => pending.promise)
    renderShell()

    expect(await screen.findByRole("heading", { name: "Reservas" })).toBeTruthy()
    await waitFor(() => expect(reservationCalls().length).toBeGreaterThan(0))
    expect(capsCalls()).toHaveLength(1)
    expectColumns(false, false)

    pending.resolve(json(flags(true, true)))
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy()
  })

  it("16. falha nas capabilities não derruba reservas nem o dashboard", async () => {
    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    capsQueue.push(
      () => json(flags(true, false)),
      () => {
        throw new TypeError("Failed to fetch")
      },
    )
    renderShell()

    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy()
    expect(screen.getByText(STORE)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Sair" }))
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    const reservationsBeforeFailure = reservationCalls().length
    act(() => handle.current!.setToken("sess-b"))

    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    expect(await screen.findByRole("heading", { name: "Reservas" })).toBeTruthy()
    expect(screen.getByText(STORE)).toBeTruthy()
    await waitFor(() =>
      expect(reservationCalls().length).toBeGreaterThan(reservationsBeforeFailure),
    )
    await settle()
    expectColumns(false, false)
  })

  it("17. nenhum if (is_demonstration)", async () => {
    const sources = productionSources()
    expect(sources.length).toBeGreaterThan(0)
    for (const file of sources) {
      expect(readFileSync(file, "utf8"), file).not.toContain("is_demonstration")
    }
    expect(
      readFileSync(path.join(ROOT, "components/caixa/cashier-entry.ts"), "utf8"),
    ).toContain("loyalty_checkin_enabled")

    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    capsQueue.push(
      () => json({ ...flags(false, false), is_demonstration: true }),
      () => json({ ...flags(true, false), is_demonstration: true }),
    )
    renderShell()

    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    await waitFor(() => expect(capsCalls()).toHaveLength(1))
    await settle()
    expectColumns(false, false)

    fireEvent.click(screen.getByRole("button", { name: "Sair" }))
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    act(() => handle.current!.setToken("sess-b"))
    expect(await screen.findByRole("button", { name: QR })).toBeTruthy()
    expect(screen.queryByRole("button", { name: VITRINE })).toBeNull()
  })

  it("18. readCapability legado sai quando não há outro consumidor", async () => {
    expect("readCapability" in types).toBe(false)
    for (const file of productionSources()) {
      expect(readFileSync(file, "utf8"), file).not.toContain("readCapability")
    }
    expect(readPrintCapabilities(flags(true, false))).toEqual({
      loyaltyCheckinEnabled: true,
      vitrineCouponEnabled: false,
    })
    expect(
      readPrintCapabilities({
        loyaltyCheckinEnabled: true,
        vitrineCouponEnabled: true,
      }),
    ).toEqual(HIDDEN_PRINT_CAPABILITIES)

    sessionStorage.setItem(`caixa_token:${COMPANY_ID}`, "sess-a")
    capsQueue.push(
      () =>
        json({
          loyaltyCheckinEnabled: true,
          vitrineCouponEnabled: true,
        }),
      () => json(flags(false, true)),
    )
    renderShell()

    expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    await waitFor(() => expect(capsCalls()).toHaveLength(1))
    await settle()
    expectColumns(false, false)

    fireEvent.click(screen.getByRole("button", { name: "Sair" }))
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy()
    act(() => handle.current!.setToken("sess-b"))
    expect(await screen.findByRole("button", { name: VITRINE })).toBeTruthy()
    expect(screen.queryByRole("button", { name: QR })).toBeNull()
  })
})
