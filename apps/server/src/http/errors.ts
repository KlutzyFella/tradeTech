import type { FastifyError, FastifyInstance } from 'fastify'
import { z } from 'zod'

/** An expected, client-facing failure. Its message is safe to show users. */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const notFound = (what: string): AppError => new AppError(404, 'not_found', `${what} not found`)

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new AppError(400, 'validation_failed', 'Some fields are invalid.', z.flattenError(parsed.error))
  }
  return parsed.data
}

/** Consistent error envelope; unexpected errors are logged and never leak internals. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      })
    }
    const status = error.statusCode ?? 500
    if (status < 500) {
      const code = status === 429 ? 'rate_limited' : 'bad_request'
      return reply.status(status).send({ success: false, error: { code, message: error.message } })
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({ success: false, error: { code: 'internal', message: 'Something went wrong.' } })
  })
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ success: false, error: { code: 'not_found', message: 'Route not found' } }),
  )
}

export const ok = <T>(data: T): { success: true; data: T } => ({ success: true, data })
