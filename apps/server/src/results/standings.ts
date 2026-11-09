import type { HostStandingsView, LeaderboardEntry, TeamStandingsView } from '@tradetech/contracts'
import { closingValuation, rankStandings } from '@tradetech/engine'
import type { PrismaClient } from '../generated/prisma/client.ts'
import type { Tx } from '../rooms/room-lock.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { quotesFor } from '../trading/market-state.ts'

type Db = PrismaClient | Tx

interface ValuedTeam {
  readonly teamId: bigint
  readonly name: string
  readonly loginName: string
  readonly status: LeaderboardEntry['status']
  readonly valuePaise: bigint
  readonly breakdown: object
}

/**
 * Values every team against one market snapshot (blueprint §7). Disqualified
 * teams are valued but never ranked. Pass a transaction for a consistent read.
 */
async function valueTeams(db: Db, roomId: bigint): Promise<(ValuedTeam & { rank: number | null })[]> {
  const room = await db.room.findUniqueOrThrow({ where: { id: roomId } })
  const stocks = await db.stock.findMany({ where: { roomId } })
  const teams = await db.team.findMany({ where: { roomId }, include: { positions: { where: { quantity: { not: 0 } } } } })
  const quotes = quotesFor(stocks, parseRoomRules(room.rules))
  const tickers = new Map(stocks.map((s) => [s.id.toString(), s.ticker]))

  const valued: ValuedTeam[] = teams.map((team) => {
    const { totalPaise, lines } = closingValuation(
      team.cashPaise,
      new Map(team.positions.map((p) => [p.stockId.toString(), p.quantity])),
      quotes,
    )
    return {
      teamId: team.id,
      name: team.name,
      loginName: team.loginName,
      status: team.status,
      valuePaise: totalPaise,
      breakdown: {
        cashPaise: team.cashPaise.toString(),
        positions: lines.map((l) => ({ ...l, ticker: tickers.get(l.stockId), closingCashPaise: l.closingCashPaise.toString() })),
      },
    }
  })
  const ranked = rankStandings(valued.filter((t) => t.status !== 'disqualified'))
  const unranked = valued.filter((t) => t.status === 'disqualified').map((t) => ({ ...t, rank: null }))
  return [...ranked, ...unranked]
}

/**
 * Close barrier: values every team against the frozen state committed in
 * this transaction and stores final scores. Caller holds the room lock and
 * has already stopped trading. Idempotent: an existing freeze is kept.
 */
export async function freezeFinalScores(tx: Tx, roomId: bigint, now: Date): Promise<void> {
  if ((await tx.finalScore.count({ where: { roomId } })) > 0) return
  const valued = await valueTeams(tx, roomId)
  await tx.finalScore.createMany({
    data: valued.map((t) => ({
      roomId,
      teamId: t.teamId,
      liquidationPaise: t.valuePaise,
      rank: t.rank ?? 0,
      breakdown: { ...t.breakdown, ranked: t.rank !== null },
      frozenAt: now,
    })),
  })
}

export interface StandingsRow extends LeaderboardEntry {
  readonly loginName: string
}

/** Final scores once frozen, otherwise live standings from a consistent snapshot. */
export async function currentStandings(db: PrismaClient, roomId: bigint): Promise<{ final: boolean; frozenAt: Date | null; rows: StandingsRow[] }> {
  const finals = await db.finalScore.findMany({ where: { roomId }, include: { team: true } })
  if (finals.length > 0) {
    const rows = finals
      .map((f) => {
        const ranked = (f.breakdown as { ranked?: boolean }).ranked !== false
        return {
          teamId: f.teamId.toString(),
          name: f.team.name,
          loginName: f.team.loginName,
          status: f.team.status,
          liquidationValuePaise: Number(f.liquidationPaise),
          rank: ranked ? f.rank : null,
        }
      })
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name))
    return { final: true, frozenAt: finals[0]!.frozenAt, rows }
  }
  const valued = await db.$transaction((tx) => valueTeams(tx, roomId), { isolationLevel: 'RepeatableRead' })
  return {
    final: false,
    frozenAt: null,
    rows: valued.map((t) => ({
      teamId: t.teamId.toString(),
      name: t.name,
      loginName: t.loginName,
      status: t.status,
      liquidationValuePaise: Number(t.valuePaise),
      rank: t.rank,
    })),
  }
}

export async function hostStandings(db: PrismaClient, roomId: bigint): Promise<HostStandingsView> {
  const room = await db.room.findUniqueOrThrow({ where: { id: roomId }, select: { leaderboardPublic: true } })
  const { final, frozenAt, rows } = await currentStandings(db, roomId)
  return {
    final,
    frozenAt: frozenAt?.toISOString() ?? null,
    leaderboardPublic: room.leaderboardPublic,
    entries: rows.map(({ loginName: _login, ...entry }) => entry),
  }
}

async function ownValuePaise(db: PrismaClient, ref: { roomId: bigint; teamId: bigint }): Promise<number> {
  const [room, stocks, team] = await db.$transaction(
    [
      db.room.findUniqueOrThrow({ where: { id: ref.roomId } }),
      db.stock.findMany({ where: { roomId: ref.roomId } }),
      db.team.findUniqueOrThrow({ where: { id: ref.teamId }, include: { positions: { where: { quantity: { not: 0 } } } } }),
    ],
    { isolationLevel: 'RepeatableRead' },
  )
  const { totalPaise } = closingValuation(
    team.cashPaise,
    new Map(team.positions.map((p) => [p.stockId.toString(), p.quantity])),
    quotesFor(stocks, parseRoomRules(room.rules)),
  )
  return Number(totalPaise)
}

/** A team always sees its own value; ranks and the table only when the host shares them. */
export async function teamStandings(db: PrismaClient, ref: { roomId: bigint; teamId: bigint }): Promise<TeamStandingsView> {
  const room = await db.room.findUniqueOrThrow({ where: { id: ref.roomId }, select: { leaderboardPublic: true } })
  if (!room.leaderboardPublic && (await db.finalScore.count({ where: { roomId: ref.roomId } })) === 0) {
    // Hidden live board: value only this team rather than the whole room on every poll.
    return {
      final: false,
      visible: false,
      teamCount: await db.team.count({ where: { roomId: ref.roomId, status: { not: 'disqualified' } } }),
      me: { liquidationValuePaise: await ownValuePaise(db, ref), rank: null },
      entries: [],
    }
  }
  const { final, rows } = await currentStandings(db, ref.roomId)
  const mine = rows.find((r) => r.teamId === ref.teamId.toString())
  const visible = room.leaderboardPublic
  return {
    final,
    visible,
    teamCount: rows.filter((r) => r.rank !== null).length,
    me: { liquidationValuePaise: mine?.liquidationValuePaise ?? 0, rank: visible ? (mine?.rank ?? null) : null },
    entries: visible
      ? rows.filter((r) => r.rank !== null).map((r) => ({ name: r.name, liquidationValuePaise: r.liquidationValuePaise, rank: r.rank }))
      : [],
  }
}
