import { z } from 'zod'

export * from './auth.ts'
export * from './host.ts'
export * from './orders.ts'
export * from './views.ts'

/**
 * Live events carry a monotonically increasing per-room offset for resume.
 * offset/marketVersion are BigInt in the database; the server converts them
 * to numbers at the boundary (safe up to 2^53).
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
