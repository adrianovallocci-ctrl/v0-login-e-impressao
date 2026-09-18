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
  listWhatsAppHref,
  reservationWhatsAppHref,
  reservationWhatsAppMessage,
  whatsappE164Digits,
  mapReservationInbox,
  mapReservationList,
  pendingFutureBannerCopy,
  PREVIEW_INBOX,
  PREVIEW_RESERVATIONS,
  PRESENCE_BLOCKED_TOAST,
  postThenRefetch,
  rememberStoreToday,
  selectedDateFromPicker,
  selectedDateFromShift,
  liveStoreToday,
  dateSelectorValue,
  parseOptionalInt,
  mapReservationItem,
  resolveCaixaActionIntent,
  shiftPreviewInboxToDate,
  shiftPreviewReservationsToDate,
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
  it("matches the caixa action matrix and fail-closes presence", () => {
    expect(actionsForStatus("pending")).toEqual([
      "confirm",
      "decline",
      "cancel",
    ])
    expect(actionsForStatus("confirmed")).toEqual(["cancel"])
    expect(
      actionsForStatus("confirmed", { canMarkPresence: false }),
    ).toEqual(["cancel"])
    expect(
      actionsForStatus("confirmed", { canMarkPresence: true }),
    ).toEqual(["seat", "no_show", "cancel"])
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
    expect(PRESENCE_BLOCKED_TOAST).toBe("Disponível no dia da reserva.")
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
  it("masks the visible line while the WhatsApp href still carries the full number", () => {
    const item = PREVIEW_RESERVATIONS.items[0]
    const line = formatReservationListLine(item)
    const message = reservationWhatsAppMessage({
      guestName: item.guest_name,
      storeName: "KiPizza",
      localDate: item.local_date,
      localTime: item.local_time,
      partySize: item.party_size,
      environmentNome: item.environment_nome,
    })
    const href = listWhatsAppHref(item, message)
    expect(listPhoneMask(item.phone_canonical)).toBe("····4321")
    expect(line).toContain("····4321")
    expect(listLineExposesFullPhone(item, line)).toBe(false)
    expect(href).toContain("https://wa.me/5511987654321?text=")
    expect(href).toBe(reservationWhatsAppHref(item.phone_canonical, message))
    expect(item.phone_canonical).toBe("11987654321")
  })
})

describe("whatsappE164Digits", () => {
  it("accepts BR mobile and fail-closes landline or junk", () => {
    expect(whatsappE164Digits("1133334444")).toBeNull()
    expect(whatsappE164Digits("11987654321")).toBe("5511987654321")
    expect(whatsappE164Digits("5511987654321")).toBe("5511987654321")
    expect(whatsappE164Digits("not-a-phone")).toBeNull()
  })
})

describe("reservationWhatsAppMessage", () => {
  it("matches the caixa opener for Lucas at KiPizza", () => {
    expect(
      reservationWhatsAppMessage({
        guestName: "Lucas",
        storeName: "KiPizza",
        localDate: "2026-09-19",
        localTime: "18:30",
        partySize: 2,
        environmentNome: "Piso superior",
      }),
    ).toBe(
      "Oi, Lucas! É sobre sua reserva aqui — KiPizza — de sáb., 19/09 às 18:30, 2 pessoas, Piso superior.",
    )
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
    expect(
      dayReservationsQuery({
        date: "2026-09-30",
        today: null,
        filter: "fila",
      }),
    ).toBe("")
  })
})

describe("rememberStoreToday", () => {
  it("captures the first mapped date even if another day is already selected", () => {
    expect(rememberStoreToday(null, "2026-09-18")).toBe("2026-09-18")
    expect(rememberStoreToday("2026-09-18", "2026-09-30")).toBe("2026-09-18")
    expect(rememberStoreToday(null, null)).toBeNull()
  })
})

describe("date selector after midnight", () => {
  it("follows hojeLoja even when storeToday stayed on yesterday", () => {
    const storeToday = "2026-09-17"
    const hojeLoja = "2026-09-18"
    const live = liveStoreToday(hojeLoja, storeToday)
    expect(dateSelectorValue(null, live)).toBe("2026-09-18")
    expect(selectedDateFromPicker("2026-09-18", live)).toBeNull()
    expect(selectedDateFromPicker("2026-09-17", live)).toBe("2026-09-17")
    expect(selectedDateFromShift("2026-09-17", 1, live)).toBeNull()
  })
})

describe("parseOptionalInt", () => {
  it("does not fabricate 0 when tolerancia is missing", () => {
    expect(parseOptionalInt(undefined)).toBeNull()
    expect(parseOptionalInt("")).toBeNull()
    expect(parseOptionalInt(15)).toBe(15)
    expect(mapReservationItem({ id: "x" })?.tolerancia_min).toBeNull()
    expect(
      mapReservationItem({ id: "y", tolerancia_min: 15 })?.tolerancia_min,
    ).toBe(15)
  })
})

describe("shiftPreviewReservationsToDate", () => {
  it("moves fixture dates to store-today so presence can show in preview", () => {
    const today = "2026-09-18"
    const now = new Date("2026-09-18T15:00:00.000Z")
    const shifted = shiftPreviewReservationsToDate(PREVIEW_RESERVATIONS, today)
    expect(shifted.date).toBe(today)
    const confirmed = shifted.items.find((item) => item.status === "confirmed")
    expect(confirmed?.local_date).toBe(today)
    expect(
      canMarkPresence(confirmed?.local_date, shifted.timezone, now),
    ).toBe(true)
    expect(actionsForStatus("confirmed", { canMarkPresence: true })).toEqual([
      "seat",
      "no_show",
      "cancel",
    ])
    const days = 1
    const inbox = shiftPreviewInboxToDate(PREVIEW_INBOX, days)
    expect(inbox.items[0].local_date).toBe("2026-09-19")
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
