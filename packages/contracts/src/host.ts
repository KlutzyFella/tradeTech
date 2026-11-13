import { z } from 'zod'
import { loginNameSchema, newPasswordSchema, roomCodeSchema } from './auth.ts'

export const ROOM_STATUSES = ['draft', 'practice', 'live', 'paused', 'closed'] as const
export type RoomStatus = (typeof ROOM_STATUSES)[number]

/** Per-room economic rules (blueprint §6, §8). All fractions, not percentages. */
export const roomRulesSchema = z
  .object({
    halfSpread: z.number().min(0).max(0.1),
    fee: z.number().min(0).max(0.1),
    collateralRatio: z.number().min(1).max(5),
    maxGrossExposure: z.number().positive().max(10),
    maxPositionFraction: z.number().positive().max(1),
    maxShortFraction: z.number().min(0).max(1),
    maxOrderMove: z.number().positive().max(0.5),
    minOrderIntervalMs: z.number().int().min(0).max(60_000),
    maintenanceCollateralRatio: z.number().min(1).max(5),
    maintenanceEquityRatio: z.number().min(0).max(1),
    /** Fair-publication pause on stocks hit by mechanical news. */
    newsPauseMs: z.number().int().min(0).max(60_000),
  })
  .strict()
export type RoomRules = z.infer<typeof roomRulesSchema>

export const DEFAULT_ROOM_RULES: RoomRules = Object.freeze({
  halfSpread: 0.001,
  fee: 0.0005,
  collateralRatio: 1.5,
  maxGrossExposure: 1,
  maxPositionFraction: 0.25,
  maxShortFraction: 0.25,
  maxOrderMove: 0.02,
  minOrderIntervalMs: 1000,
  maintenanceCollateralRatio: 1.3,
  maintenanceEquityRatio: 0.75,
  newsPauseMs: 3000,
})

const MAX_STARTING_CASH_RUPEES = 1_000_000_000

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: roomCodeSchema,
    startingCashRupees: z.number().int().positive().max(MAX_STARTING_CASH_RUPEES),
    rules: roomRulesSchema.partial().optional(),
    /** Start from a saved template: its stocks, rules and news (as drafts). Typed values win. */
    templateId: z.string().regex(/^[1-9]\d{0,17}$/).optional(),
  })
  .strict()
export type CreateRoom = z.infer<typeof createRoomSchema>

export const teamImportSchema = z
  .object({
    teams: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            loginName: loginNameSchema,
            password: newPasswordSchema,
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
export type TeamImport = z.infer<typeof teamImportSchema>

export const createStockSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{0,9}$/),
    name: z.string().trim().min(1).max(120),
    sector: z.string().trim().min(1).max(60),
    profile: z.string().max(4000).default(''),
    openingPrice: z.number().positive().max(1_000_000),
    depth: z.number().positive().max(1e12),
    sensitivity: z.number().min(0).max(10).default(1),
    shortable: z.boolean().default(true),
    borrowPool: z.number().int().min(0).max(1e12),
    bandFraction: z.number().positive().max(0.9).default(0.2),
  })
  .strict()
export type CreateStock = z.input<typeof createStockSchema>

export const setRoomStatusSchema = z.object({ status: z.enum(ROOM_STATUSES) }).strict()

/** Allowed host transitions. Practice can only be reset before going live. */
export const ROOM_TRANSITIONS: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  draft: ['practice', 'live'],
  practice: ['draft', 'live'],
  live: ['paused', 'closed'],
  paused: ['live', 'closed'],
  closed: [],
}

export const createRoundSchema = z.object({ durationMinutes: z.number().positive().max(240) }).strict()

export const ROUND_ACTIONS = ['start', 'pause', 'resume', 'end'] as const
export type RoundAction = (typeof ROUND_ACTIONS)[number]

/** Shock is a fraction: 0.08 = +8%. Must stay above −100%. */
const shockSchema = z.number().gt(-0.95).lt(10)

export const NEWS_KINDS = ['mechanical', 'information'] as const

export const createNewsSchema = z
  .object({
    headline: z.string().trim().min(1).max(200),
    body: z.string().max(4000).default(''),
    sourceLabel: z.string().trim().max(80).optional(),
    kind: z.enum(NEWS_KINDS),
    /** stockId → shock. Required (non-empty) for mechanical news, forbidden for information-only. */
    impacts: z.record(z.string().regex(/^[1-9]\d{0,17}$/), shockSchema).default({}),
    /** publish now, keep as draft, or fire at this many active minutes into the current round. */
    mode: z.enum(['publish', 'draft', 'schedule']),
    scheduleAtMinute: z.number().min(0).max(240).optional(),
  })
  .strict()
  .refine((n) => (n.kind === 'mechanical') === Object.keys(n.impacts).length > 0, {
    message: 'Mechanical news needs at least one stock impact; information-only news has none.',
    path: ['impacts'],
  })
  .refine((n) => n.mode !== 'schedule' || n.scheduleAtMinute !== undefined, {
    message: 'Choose when to publish.',
    path: ['scheduleAtMinute'],
  })
export type CreateNews = z.input<typeof createNewsSchema>

export const haltSchema = z.object({ halted: z.boolean(), rebaseBand: z.boolean().default(false) }).strict()

export const leaderboardVisibilitySchema = z.object({ public: z.boolean() }).strict()

export const teamStatusSchema = z
  .object({ status: z.enum(['active', 'disqualified']), reason: z.string().trim().max(200).default('') })
  .strict()
  .refine((t) => t.status !== 'disqualified' || t.reason.length > 0, { message: 'Give a reason for disqualifying.', path: ['reason'] })

export const resetPasswordSchema = z.object({ password: newPasswordSchema }).strict()

export const EXPORT_KINDS = ['standings', 'orders', 'ledger', 'news'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

/** Partial rule changes; the merged result is validated against roomRulesSchema. */
export const updateRulesSchema = roomRulesSchema
  .partial()
  .strict()
  .refine((r) => Object.keys(r).length > 0, { message: 'Change at least one rule.' })

/** Ticker is fixed once created (history, news and templates refer to it). */
export const updateStockSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    sector: z.string().trim().min(1).max(60),
    profile: z.string().max(4000),
    openingPrice: z.number().positive().max(1_000_000),
    depth: z.number().positive().max(1e12),
    sensitivity: z.number().min(0).max(10),
    shortable: z.boolean(),
    borrowPool: z.number().int().min(0).max(1e12),
    bandFraction: z.number().positive().max(0.9),
  })
  .partial()
  .strict()
  .refine((s) => Object.keys(s).length > 0, { message: 'Change at least one field.' })
export type UpdateStock = z.infer<typeof updateStockSchema>

export const scheduleDraftSchema = z.object({ minute: z.number().min(0).max(240) }).strict()

const templateStockSchema = createStockSchema
const templateNewsSchema = z
  .object({
    headline: z.string().trim().min(1).max(200),
    body: z.string().max(4000).default(''),
    sourceLabel: z.string().trim().max(80).optional(),
    kind: z.enum(NEWS_KINDS),
    /** ticker → shock (fraction). Tickers, not ids, so templates move between events. */
    impacts: z.record(z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/), z.number().gt(-0.95).lt(10)).default({}),
    plannedMinute: z.number().min(0).max(240).optional(),
  })
  .strict()

/** A reusable event: starting cash, rules, stocks and a news calendar. Never teams. */
export const eventTemplateDataSchema = z
  .object({
    version: z.literal(1),
    startingCashRupees: z.number().int().positive().max(1_000_000_000),
    rules: roomRulesSchema,
    stocks: z.array(templateStockSchema).min(1).max(50),
    news: z.array(templateNewsSchema).max(200).default([]),
  })
  .strict()
  .superRefine((t, ctx) => {
    const tickers = new Set<string>()
    t.stocks.forEach((s, i) => {
      if (tickers.has(s.ticker)) ctx.addIssue({ code: 'custom', path: ['stocks', i, 'ticker'], message: `Duplicate ticker ${s.ticker}` })
      tickers.add(s.ticker)
    })
    t.news.forEach((n, i) => {
      for (const ticker of Object.keys(n.impacts)) {
        if (!tickers.has(ticker)) ctx.addIssue({ code: 'custom', path: ['news', i, 'impacts'], message: `Unknown ticker ${ticker} (not in this template's stocks)` })
      }
      if ((n.kind === 'mechanical') !== Object.keys(n.impacts).length > 0) {
        ctx.addIssue({ code: 'custom', path: ['news', i, 'impacts'], message: 'Mechanical news needs impacts; information-only news has none.' })
      }
    })
  })
export type EventTemplateData = z.infer<typeof eventTemplateDataSchema>

export const saveTemplateSchema = z
  .object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default('') })
  .strict()

export const importTemplateSchema = saveTemplateSchema.safeExtend({ data: eventTemplateDataSchema }).strict()
