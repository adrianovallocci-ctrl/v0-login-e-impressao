import { describe, expect, it, vi } from "vitest"

import { resolveCashierCompanyId } from "./resolve-cashier-segment"

const MOLINO_UUID = "41ca0a64-355c-4b02-b115-630a22e081e1"

describe("resolveCashierCompanyId (5c-caixa audit)", () => {
  it("C-A9: UUID válido → fluxo intacto (retorna o mesmo company_id)", async () => {
    const fetchMock = vi.fn()
    const result = await resolveCashierCompanyId(MOLINO_UUID, fetchMock)

    expect(result).toBe(MOLINO_UUID)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("C-A9: UUID com maiúsculas normaliza para minúsculas", async () => {
    const upper = MOLINO_UUID.toUpperCase()
    const result = await resolveCashierCompanyId(upper, vi.fn())

    expect(result).toBe(MOLINO_UUID)
  })

  it("C-A10: slug existente → resolve company_id via backend público", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ company_id: MOLINO_UUID }),
    })

    const result = await resolveCashierCompanyId("molinopizzeria001", fetchMock)

    expect(result).toBe(MOLINO_UUID)
    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toContain("/public/cashier-tenant/molinopizzeria001")
  })

  it("C-A11: slug inexistente → null (404 limpo, sem oráculo)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not Found" }),
    })

    const result = await resolveCashierCompanyId("naoexiste999", fetchMock)

    expect(result).toBeNull()
  })

  it("C-A11: slug com formato inválido no backend → null", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not Found" }),
    })

    expect(await resolveCashierCompanyId("molino-001", fetchMock)).toBeNull()
  })

  it("segmento vazio → null", async () => {
    expect(await resolveCashierCompanyId("  ", vi.fn())).toBeNull()
  })
})

describe("isValidCompanyUuid", () => {
  it("rejeita slug como UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ company_id: MOLINO_UUID }),
    })

    await resolveCashierCompanyId("molinopizzeria001", fetchMock)
    expect(fetchMock).toHaveBeenCalled()
  })
})
