import type { PrismaClient } from '../generated/prisma/client.ts'
import { hashPassword } from './password.ts'

const MIN_PASSWORD_LENGTH = 8

/** Creates a host account. Hosts are provisioned by an operator (see the seed CLI), not self-registered. */
export async function createHost(db: PrismaClient, email: string, password: string): Promise<{ id: bigint }> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`host password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  return db.host.create({
    data: { email: email.trim().toLowerCase(), passwordHash: await hashPassword(password) },
    select: { id: true },
  })
}
