import { z } from 'zod'

export const ORDER_INTENTS = ['buy', 'sell', 'short', 'cover'] as const
export const orderIntentSchema = z.enum(ORDER_INTENTS)
export type OrderIntent = z.infer<typeof orderIntentSchema>

const MAX_ORDER_SHARES = 10_000_000

/** Decimal string of a BigInt database id (BigInt is not JSON-serializable). */
export const idSchema = z.string().regex(/^[1-9]\d{0,17}$/)

export const orderTicketSchema = z
  .object({
    stockId: idSchema,
    intent: orderIntentSchema,
    quantity: z.number().int().positive().max(MAX_ORDER_SHARES),
    /** Execution protection on the all-in average price: max for buy/cover, min for sell/short. */
    limitPrice: z.number().positive().finite().optional(),
  })
  .strict()
export type OrderTicketInput = z.infer<typeof orderTicketSchema>

/**
 * A participant never supplies an authoritative cash balance, execution
 * price, rank or team identity: team identity comes from the session. The
 * client-generated requestId makes retries idempotent.
 */
export const placeOrderSchema = orderTicketSchema
  .extend({ requestId: z.uuid() })
  .strict()
export type PlaceOrder = z.infer<typeof placeOrderSchema>

export const ORDER_STATUSES = ['received', 'filled', 'rejected'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
