import { z } from 'zod'

const password = z.string().min(8).max(200)

export const hostLoginSchema = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(200) })
  .strict()
export type HostLogin = z.infer<typeof hostLoginSchema>

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,12}$/, 'Room codes are 4–12 letters or digits')

export const loginNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{1,31}$/, 'Logins are 2–32 letters, digits, - or _')

export const teamLoginSchema = z
  .object({ roomCode: roomCodeSchema, loginName: loginNameSchema, password: z.string().min(1).max(200) })
  .strict()
export type TeamLogin = z.infer<typeof teamLoginSchema>

export type Me =
  | { readonly kind: 'host'; readonly hostId: string; readonly email: string }
  | {
      readonly kind: 'team'
      readonly teamId: string
      readonly teamName: string
      readonly roomId: string
      readonly roomName: string
      readonly roomCode: string
    }

export const newPasswordSchema = password
