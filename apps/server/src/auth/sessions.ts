import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client.ts'

export const SESSION_COOKIE = 'tt_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export type AuthContext =
  | { readonly kind: 'host'; readonly hostId: bigint; readonly email: string }
  | { readonly kind: 'team'; readonly teamId: bigint; readonly roomId: bigint }

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export async function createSession(
  db: PrismaClient,
  owner: { hostId: bigint } | { teamId: bigint; roomId: bigint },
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db.session.create({
    data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS), ...owner },
  })
  return token
}

export async function resolveSession(db: PrismaClient, token: string | undefined): Promise<AuthContext | null> {
  if (!token || token.length > 128) return null
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { host: { select: { email: true } }, team: { select: { status: true } } },
  })
  if (!session || session.expiresAt.getTime() <= Date.now()) return null
  if (session.hostId !== null && session.host) return { kind: 'host', hostId: session.hostId, email: session.host.email }
  if (session.teamId !== null && session.roomId !== null && session.team?.status !== 'disqualified') {
    return { kind: 'team', teamId: session.teamId, roomId: session.roomId }
  }
  return null
}

export async function deleteSession(db: PrismaClient, token: string | undefined): Promise<void> {
  if (!token) return
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}
