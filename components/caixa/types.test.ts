import { describe, expect, it } from "vitest"

import { formatRewardWhen, parseApiError } from "@/components/caixa/types"

describe("formatRewardWhen", () => {
  it("formats valid ISO in pt-BR", () => {
    const label = formatRewardWhen("2026-07-30T22:10:00.000Z")
    expect(label).toMatch(/\d{2}\/\d{2}/)
    expect(label).toMatch(/\d{2}:\d{2}/)
  })

  it("returns empty for invalid date", () => {
    expect(formatRewardWhen("not-a-date")).toBe("")
  })
})

describe("parseApiError", () => {
  it("reads detail.message from loyalty errors", async () => {
    const response = new Response(
      JSON.stringify({
        detail: { code: "REPRINT_NOT_FOUND", message: "Resgate não encontrado." },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    )
    await expect(parseApiError(response)).resolves.toBe("Resgate não encontrado.")
  })
})
