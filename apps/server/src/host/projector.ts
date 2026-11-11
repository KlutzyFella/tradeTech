import type { ProjectorView, RoomStatus } from '@tradetech/contracts'
import type { PrismaClient } from '../generated/prisma/client.ts'
import { sparklines } from '../market/price-history.ts'
import { listPublicNews } from '../news/news-service.ts'
import { hostStandings } from '../results/standings.ts'
import { latestRound, toRoundView } from '../rounds/clock.ts'
import { toStockView } from '../trading/market-state.ts'

const PROJECTOR_NEWS = 5
const PROJECTOR_LEADERS = 10

/**
 * The venue's big-screen snapshot, assembled only from public views: public
 * stock views, the participant news feed and (when shared) ranks without
 * team ids. Private news impacts and drafts can never reach it.
 */
export async function projectorView(db: PrismaClient, roomId: bigint): Promise<ProjectorView> {
  const room = await db.room.findUniqueOrThrow({ where: { id: roomId }, include: { stocks: { orderBy: { ticker: 'asc' } } } })
  const now = new Date()
  const [round, spark, news, standings, teamCount] = await Promise.all([
    latestRound(db, roomId),
    sparklines(db, roomId),
    listPublicNews(db, roomId),
    hostStandings(db, roomId),
    db.team.count({ where: { roomId, status: { not: 'disqualified' } } }),
  ])
  return {
    name: room.name,
    code: room.code,
    status: room.status as RoomStatus,
    round: round ? toRoundView(round, now) : null,
    serverTime: now.toISOString(),
    teamCount,
    stocks: room.stocks.map((s) => ({ ...toStockView(s, now), spark: spark.get(s.id.toString()) ?? [] })),
    news: news.slice(0, PROJECTOR_NEWS),
    leaderboard: standings.leaderboardPublic
      ? {
          final: standings.final,
          entries: standings.entries
            .filter((e): e is typeof e & { rank: number } => e.rank !== null)
            .slice(0, PROJECTOR_LEADERS)
            .map((e) => ({ name: e.name, rank: e.rank, liquidationValuePaise: e.liquidationValuePaise })),
        }
      : null,
  }
}
