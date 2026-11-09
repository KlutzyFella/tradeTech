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
})

const MAX_STARTING_CASH_RUPEES = 1_000_000_000

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: roomCodeSchema,
    startingCashRupees: z.number().int().positive().max(MAX_STARTING_CASH_RUPEES),
    rules: roomRulesSchema.partial().optional(),
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
