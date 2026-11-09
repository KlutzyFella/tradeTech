import { z } from 'zod'

/**
 * Wire contracts shared by the server and the web client.
 *
 * A participant never supplies an authoritative cash balance, execution price,
 * rank or team identity: team identity comes from the session, prices from the
 * server. Clients send a stable requestId so retries are idempotent.
 */

export const ORDER_INTENTS = ['buy', 'sell', 'short', 'cover'] as const
export const orderIntentSchema = z.enum(ORDER_INTENTS)
export type OrderIntent = z.infer<typeof orderIntentSchema>

const MAX_ORDER_SHARES = 10_000_000

export const placeOrderSchema = z
  .object({
    requestId: z.uuid(),
    /** Decimal string of the stock's BigInt id (BigInt is not JSON-serializable). */
    stockId: z.string().regex(/^[1-9]\d{0,17}$/),
    intent: orderIntentSchema,
    quantity: z.number().int().positive().max(MAX_ORDER_SHARES),
    /** Execution protection: max average price for buy/cover, min for sell/short. */
    limitPrice: z.number().positive().finite().optional(),
    /** Market version the client saw; stale tickets are rechecked against current prices. */
    seenMarketVersion: z.number().int().nonnegative(),
  })
  .strict()
export type PlaceOrder = z.infer<typeof placeOrderSchema>

export const ORDER_STATUSES = ['received', 'filled', 'rejected'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Live events are delivered with a monotonically increasing per-room offset for resume.
 * offset/marketVersion are BigInt in the database; the server converts them to
 * numbers at the boundary (safe up to 2^53).
 */
export const roomEventEnvelopeSchema = z.object({
  roomId: z.string(),
  offset: z.number().int().nonnegative(),
  marketVersion: z.number().int().nonnegative(),
  type: z.string(),
  payload: z.unknown(),
})
export type RoomEventEnvelope = z.infer<typeof roomEventEnvelopeSchema>

export const resumeRequestSchema = z.object({
  lastOffset: z.number().int().nonnegative(),
})
export type ResumeRequest = z.infer<typeof resumeRequestSchema>
