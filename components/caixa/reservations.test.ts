import { afterEach, describe, expect, it, vi } from "vitest"

import { parseApiError, parseApiErrorDetail } from "@/components/caixa/types"
import {
  actionsForStatus,
  caixaHomeLayoutClass,
  canMarkPresence,
  capacityLabel,
  civilTodayInTimeZone,
  dayReservationsQuery,
  filaChipLabel,
  filterPreviewItems,
  formatReservationListLine,
  formatReservationWhen,
  formatSummaryLine,
  listLineExposesFullPhone,
  listPhoneMask,
  mapReservationInbox,
  mapReservationList,
  pendingFutureBannerCopy,
  PREVIEW_INBOX,
  PREVIEW_RESERVATIONS,
  postThenRefetch,
  resolveCaixaActionIntent,
  shouldPollReservations,
  shouldShowReservationsBlock,
  sortReservationsByStartsAt,
  startReservationsPoll,
  unmarkedBannerCopy,
} from "@/components/caixa/reservations"

describe("formatSummaryLine", () => {
  it("uses maior entrada, never pico", () => {
    const line = formatSummaryLine({
      reservations_count: 12,
      people_count: 34,
      peak_local_time: "20:30",
      cadeiroes_count: 2,
      carrinhos_count: 1,
    })
    expect(line).toBe(
      "Hoje: 12 reservas · 34 pessoas · maior entrada 20h30 · 2 cadeirões · 1 carrinho",
    )
    expect(line.toLowerCase()).not.toContain("pico")
  })
})

describe("unmarkedBannerCopy", () => {
  it("hides when count is zero", () => {
    expect(unmarkedBannerCopy(0)).toBeNull()
  })

  it("keeps chronological copy", () => {
    expect(unmarkedBannerCopy(3)).toBe("3 reservas de hoje sem marcação")
  })
})

describe("sortReservationsByStartsAt", () => {
  it("keeps starts_at ASC even when unmarked is first in input", () => {
    const unmarked = PREVIEW_RESERVATIONS.items.find((item) => item.unmarked)!
    const others = PREVIEW_RESERVATIONS.items.filter((item) => !item.unmarked)
    const sorted = sortReservationsByStartsAt([others[1], unmarked, others[0]])
    expect(sorted.map((item) => item.id)).toEqual([
      "preview-confirmed-unmarked",
      "preview-pending-vaga",
      "preview-pending-lotado",
    ])
  })
})

describe("capacityLabel", () => {
  it("warns pending without vacancy", () => {
    expect(capacityLabel("pending", false)).toBe("Horário sem vaga")
    expect(capacityLabel("pending", true)).toBe("Horário com vaga")
    expect(capacityLabel("confirmed", false)).toBeNull()
  })
})

describe("actionsForStatus", () => {
  it("matches the caixa action matrix", () => {
    expect(actionsForStatus("pending")).toEqual([
      "confirm",
      "decline",
      "cancel",
    ])
    expect(actionsForStatus("confirmed")).toEqual([
      "seat",
      "no_show",
      "cancel",
    ])
    expect(
      actionsForStatus("confirmed", { canMarkPresence: false }),
    ).toEqual(["cancel"])
    expect(actionsForStatus("seated")).toEqual([])
    expect(actionsForStatus("declined")).toEqual([])
  })
})

describe("canMarkPresence", () => {
  it("follows the store timezone, not UTC calendar date", () => {
    const almostMidnightUtc = new Date("2026-09-18T02:00:00.000Z")
    expect(civilTodayInTimeZone("America/Sao_Paulo", almostMidnightUtc)).toBe(
      "2026-09-17",
    )
    expect(
      canMarkPresence("2026-09-17", "America/Sao_Paulo", almostMidnightUtc),
    ).toBe(true)
    expect(
      canMarkPresence("2026-09-30", "America/Sao_Paulo", almostMidnightUtc),
    ).toBe(false)
  })

  it("fail-closes when timezone is missing or invalid", () => {
    const now = new Date("2026-09-18T15:00:00.000Z")
    expect(civilTodayInTimeZone(null, now)).toBeNull()
    expect(civilTodayInTimeZone(undefined, now)).toBeNull()
    expect(civilTodayInTimeZone("", now)).toBeNull()
    expect(civilTodayInTimeZone("Not/AZone", now)).toBeNull()
    expect(canMarkPresence("2026-09-18", null, now)).toBe(false)
    expect(canMarkPresence("2026-09-18", "Not/AZone", now)).toBe(false)
  })
})

describe("resolveCaixaActionIntent", () => {
  const now = new Date("2026-09-18T15:00:00.000Z")
  const future = {
    local_date: "2026-09-30",
    capacity_available: true,
  }
  const todayConfirmed = {
    local_date: "2026-09-18",
    capacity_available: true,
  }

  it("does not dispatch seat or no-show when the reservation is not store-today", () => {
    expect(
      resolveCaixaActionIntent(future, "seat", "America/Sao_Paulo", now),
    ).toBe("block")
    expect(
      resolveCaixaActionIntent(future, "no_show", "America/Sao_Paulo", now),
    ).toBe("block")
    expect(
      resolveCaixaActionIntent(future, "cancel", "America/Sao_Paulo", now),
    ).toBe("post")
  })

  it("still posts seat on the store civil day", () => {
    expect(
      resolveCaixaActionIntent(
        todayConfirmed,
        "seat",
        "America/Sao_Paulo",
        now,
      ),
    ).toBe("post")
  })
})

describe("filaChipLabel", () => {
  it("is Fila today and Todas do dia on another date", () => {
    expect(filaChipLabel(true)).toBe("Fila")
    expect(filaChipLabel(false)).toBe("Todas do dia")
  })
})

describe("list phone", () => {
  it("masks last 4 and never puts the full number on the list line", () => {
    const item = PREVIEW_RESERVATIONS.items[0]
    const line = formatReservationListLine(item)
    expect(listPhoneMask(item.phone_canonical)).toBe("····4321")
    expect(line).toContain("····4321")
    expect(listLineExposesFullPhone(item, line)).toBe(false)
  })
})

describe("shouldShowReservationsBlock", () => {
  it("hides when module is off and does not depend on print flags", () => {
    expect(shouldShowReservationsBlock(true)).toBe(true)
    expect(shouldShowReservationsBlock(false)).toBe(false)
    expect(shouldShowReservationsBlock(null)).toBe(false)
  })
})

describe("print cards stay independent", () => {
  it("loyalty and vitrine flags are not gated by reservations", () => {
    const loyaltyEnabled = true
    const vitrineEnabled = true
    const reservationsOn = shouldShowReservationsBlock(true)
    expect(loyaltyEnabled && reservationsOn).toBe(true)
    expect(vitrineEnabled && reservationsOn).toBe(true)
  })

  it("uses 3 columns when all modules are on, 2 when reservas is off", () => {
    expect(
      caixaHomeLayoutClass({
        loyalty: true,
        vitrine: true,
        reservations: true,
      }),
    ).toContain("lg:grid-cols-3")
    expect(
      caixaHomeLayoutClass({
        loyalty: true,
        vitrine: true,
        reservations: false,
      }),
    ).toContain("lg:grid-cols-2")
    expect(
      caixaHomeLayoutClass({
        loyalty: true,
        vitrine: true,
        reservations: false,
      }),
    ).not.toContain("lg:grid-cols-3")
  })
})

describe("startReservationsPoll", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("clears the timer on unmount", () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    const stop = startReservationsPoll(tick, 30_000)
    vi.advanceTimersByTime(30_000)
    expect(tick).toHaveBeenCalledTimes(1)
    stop()
    vi.advanceTimersByTime(60_000)
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it("does not poll when the tab is hidden", () => {
    expect(
      shouldPollReservations({
        moduleEnabled: true,
        documentVisible: false,
        sessionActive: true,
      }),
    ).toBe(false)
  })
})

describe("postThenRefetch", () => {
  it("uses GET items after POST, not the POST body", async () => {
    const postBody = { id: "1", status: "confirmed" }
    const getItems = [{ id: "1", status: "confirmed", source: "get" }]
    const list = await postThenRefetch({
      post: async () => postBody,
      refetch: async () => getItems,
    })
    expect(list).toBe(getItems)
    expect(list).not.toEqual(postBody)
  })
})

describe("mapReservationList", () => {
  it("sorts items and reads summary", () => {
    const mapped = mapReservationList({
      date: "2026-09-17",
      timezone: "America/Sao_Paulo",
      module_enabled: true,
      unmarked_count: 1,
      summary: {
        reservations_count: 2,
        people_count: 5,
        peak_local_time: "20:30",
        cadeiroes_count: 0,
        carrinhos_count: 0,
      },
      items: [
        {
          id: "b",
          status: "pending",
          starts_at: "2026-09-17T23:30:00.000Z",
          local_date: "2026-09-17",
          local_time: "20:30",
          party_size: 2,
          phone_canonical: "11999998888",
        },
        {
          id: "a",
          status: "confirmed",
          starts_at: "2026-09-17T23:00:00.000Z",
          local_date: "2026-09-17",
          local_time: "20:00",
          party_size: 3,
          unmarked: true,
        },
      ],
    })
    expect(mapped.items.map((item) => item.id)).toEqual(["a", "b"])
    expect(mapped.items[0].local_date).toBe("2026-09-17")
    expect(formatSummaryLine(mapped.summary)).toContain("maior entrada 20h30")
    expect(unmarkedBannerCopy(mapped.unmarked_count)).toContain("sem marcação")
  })
})

describe("mapReservationInbox", () => {
  it("does not treat summary as the inbox source", () => {
    const inbox = mapReservationInbox({
      timezone: "America/Sao_Paulo",
      module_enabled: true,
      pending_future_count: 1,
      summary: { people_count: 34, reservations_count: 12 },
      date: "2026-09-17",
      items: [
        {
          id: "tomorrow",
          status: "pending",
          starts_at: "2026-09-18T23:00:00.000Z",
          local_date: "2026-09-18",
          local_time: "20:00",
          party_size: 4,
        },
      ],
    })
    expect(inbox.pending_future_count).toBe(1)
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0].local_date).toBe("2026-09-18")
    expect("summary" in inbox).toBe(false)
    expect("date" in inbox).toBe(false)
  })
})

describe("pendingFutureBannerCopy", () => {
  it("hides when empty", () => {
    expect(pendingFutureBannerCopy(0)).toBeNull()
  })

  it("does not say pico or mix with the day summary", () => {
    expect(pendingFutureBannerCopy(2)).toBe("2 pedidos futuros sem resposta")
  })
})

describe("formatReservationWhen", () => {
  const today = "2026-09-17"

  it("uses Amanhã within 48h and absolute date afterwards", () => {
    expect(
      formatReservationWhen(
        { local_date: "2026-09-18", local_time: "20:00" },
        today,
      ),
    ).toBe("Amanhã 20:00")
    const far = formatReservationWhen(
      { local_date: "2026-05-10", local_time: "20:00" },
      today,
    )
    expect(far).toContain("20:00")
    expect(far.toLowerCase()).not.toContain("amanhã")
    expect(far).toMatch(/mai/i)
  })
})

describe("dayReservationsQuery", () => {
  it("omits date for today and never uses inbox= on the day GET", () => {
    expect(
      dayReservationsQuery({
        date: null,
        today: "2026-09-17",
        filter: "fila",
      }),
    ).toBe("")
    expect(
      dayReservationsQuery({
        date: "2026-09-17",
        today: "2026-09-17",
        filter: "pending",
      }),
    ).toBe("?status=pending")
    expect(
      dayReservationsQuery({
        date: "2026-09-18",
        today: "2026-09-17",
        filter: "fila",
      }),
    ).toBe("?date=2026-09-18")
  })
})

describe("preview inbox stays out of the day list", () => {
  it("does not merge tomorrow into today's items", () => {
    const todayIds = new Set(PREVIEW_RESERVATIONS.items.map((item) => item.id))
    expect(todayIds.has(PREVIEW_INBOX.items[0].id)).toBe(false)
  })
})

describe("filterPreviewItems", () => {
  it("fila is pending+confirmed only", () => {
    const seated = {
      ...PREVIEW_RESERVATIONS.items[0],
      id: "seated",
      status: "seated",
    }
    const filtered = filterPreviewItems(
      [...PREVIEW_RESERVATIONS.items, seated],
      "fila",
    )
    expect(filtered.every((item) => item.status !== "seated")).toBe(true)
  })
})

describe("parseApiErrorDetail", () => {
  it("keeps 409 capacity code and message", async () => {
    const response = new Response(
      JSON.stringify({
        detail: {
          code: "RESERVA_CAPACITY",
          message: "Não há vaga neste horário.",
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    )
    await expect(parseApiErrorDetail(response)).resolves.toEqual({
      code: "RESERVA_CAPACITY",
      message: "Não há vaga neste horário.",
    })
    const again = new Response(
      JSON.stringify({
        detail: {
          code: "RESERVA_CAPACITY",
          message: "Não há vaga neste horário.",
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    )
    await expect(parseApiError(again)).resolves.toBe("Não há vaga neste horário.")
  })
})
