import { closingFill, maintenanceStatus, portfolioMetrics } from '@tradetech/engine'
import type { Stock } from '../generated/prisma/client.ts'
import { appendRoomEvent, type Tx } from '../rooms/room-lock.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { recordForcedFill } from '../trading/fills.ts'
import { quotesFor, stockQuote } from '../trading/market-state.ts'

const tradable = (stock: Stock, now: Date): boolean => !stock.halted && !(stock.reopensAt && stock.reopensAt > now)

/**
 * Blueprint §6: teams failing maintenance are closed out through the current
 * curves, bypassing opening limits but not halts (halted or news-paused
 * positions wait for reopening). A team left with negative cash and nothing
 * to close is frozen; its loss is recorded, never reset. Caller holds the lock.
 * Returns the ids of teams that were liquidated.
 */
export async function enforceMaintenance(tx: Tx, roomId: bigint, now: Date): Promise<bigint[]> {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } })
  const rules = parseRoomRules(room.rules)
  const stocks = new Map((await tx.stock.findMany({ where: { roomId } })).map((s) => [s.id, s]))
  const teams = await tx.team.findMany({
    where: { roomId, status: 'active' },
    include: { positions: { where: { quantity: { not: 0 } } } },
  })
  const liquidated: bigint[] = []

  for (const team of teams) {
    if (team.positions.length === 0 && team.cashPaise >= 0n) continue
    const metrics = portfolioMetrics(
      Number(team.cashPaise) / 100,
      new Map(team.positions.map((p) => [p.stockId.toString(), p.quantity])),
      quotesFor([...stocks.values()], rules),
      rules,
    )
    const check = maintenanceStatus(metrics, rules)
    if (check.ok) continue

    let cash = team.cashPaise
    let deferred = 0
    let closed = 0
    for (const position of team.positions) {
      const stock = stocks.get(position.stockId)
      if (!stock || !tradable(stock, now)) {
        deferred += 1
        continue
      }
      const fill = closingFill(stockQuote(stock, rules), position.quantity)
      const result = await recordForcedFill(tx, { roomId, teamId: team.id }, stock, fill)
      stocks.set(stock.id, result.stock)
      cash += fill.cashDeltaPaise
      closed += 1
    }
    if (closed === 0 && cash >= 0n) continue

    if (deferred === 0 && cash < 0n) {
      await tx.team.update({ where: { id: team.id }, data: { status: 'frozen', statusReason: 'Insolvent after margin liquidation' } })
    }
    await appendRoomEvent(tx, roomId, {
      type: 'liquidation',
      payload: { teamId: team.id.toString(), reason: check.reason, closed, deferred },
      isPublic: false,
      marketChanged: closed > 0,
    })
    liquidated.push(team.id)
  }
  return liquidated
}
