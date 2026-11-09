import type { RoomStatus } from './host.ts'
import type { OrderIntent } from './orders.ts'

/**
 * Response shapes. Ids are decimal strings; ledger money is integer paise;
 * prices are rupees. Every API response is wrapped in ApiResponse.
 */
export type ApiResponse<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: { readonly code: string; readonly message: string; readonly details?: unknown } }

export interface StockView {
  readonly id: string
  readonly ticker: string
  readonly name: string
  readonly sector: string
  readonly profile: string
  readonly mid: number
  readonly openingPrice: number
  /** Fractional change of mid versus opening price. */
  readonly change: number
  readonly halted: boolean
  readonly shortable: boolean
  readonly borrowAvailable: number
  readonly bandLow: number
  readonly bandHigh: number
  /** ISO time until which trading is paused after mechanical news, if any. */
  readonly pausedUntil: string | null
}

export interface RoundView {
  readonly id: string
  readonly sequence: number
  readonly kind: 'practice' | 'scored'
  readonly status: 'pending' | 'running' | 'paused' | 'ended'
  readonly durationMs: number
  /** Active time left, as of serverTime. Counts down only while running. */
  readonly remainingMs: number
}

export interface MarketView {
  readonly roomStatus: RoomStatus
  readonly marketVersion: number
  /** The latest round that is not ended, else the last ended one; null before any round. */
  readonly round: RoundView | null
  readonly serverTime: string
  readonly stocks: readonly StockView[]
}

/** Participant-facing news: never includes impacts or unpublished items. */
export interface NewsView {
  readonly id: string
  readonly headline: string
  readonly body: string
  readonly sourceLabel: string | null
  readonly publishedAt: string
}

export interface HostNewsView extends Omit<NewsView, 'publishedAt'> {
  readonly kind: 'mechanical' | 'information'
  readonly status: 'draft' | 'scheduled' | 'published'
  readonly impacts: Readonly<Record<string, number>>
  readonly scheduledAtMs: number | null
  readonly publishedAt: string | null
}

export interface LeaderboardEntry {
  readonly teamId: string
  readonly name: string
  readonly status: 'active' | 'frozen' | 'disqualified'
  readonly liquidationValuePaise: number
  /** null for disqualified teams, which are never ranked. */
  readonly rank: number | null
}

/** Host standings: live while the event runs, frozen final results once closed. */
export interface HostStandingsView {
  readonly final: boolean
  readonly frozenAt: string | null
  readonly leaderboardPublic: boolean
  readonly entries: readonly LeaderboardEntry[]
}

/** A team's view of the standings: its own value always; ranks only when the host shares them. */
export interface TeamStandingsView {
  readonly final: boolean
  readonly visible: boolean
  readonly teamCount: number
  readonly me: { readonly liquidationValuePaise: number; readonly rank: number | null }
  readonly entries: readonly Pick<LeaderboardEntry, 'name' | 'liquidationValuePaise' | 'rank'>[]
}

export interface PositionView {
  readonly stockId: string
  readonly ticker: string
  readonly quantity: number
  readonly mid: number
  readonly marketValuePaise: number
  readonly costBasisPaise: number
  readonly unrealizedPnlPaise: number
  readonly realizedPnlPaise: number
}

export interface PortfolioView {
  readonly cashPaise: number
  readonly restrictedCashPaise: number
  readonly availableCashPaise: number
  readonly equityPaise: number
  readonly grossExposurePaise: number
  readonly shortNotionalPaise: number
  /** The competition score: liquidation value against current curves. */
  readonly liquidationValuePaise: number
  readonly startingCashPaise: number
  readonly positions: readonly PositionView[]
}

export interface OrderView {
  readonly id: string
  readonly requestId: string
  readonly acceptSeq: number
  readonly stockId: string
  readonly ticker: string
  readonly intent: OrderIntent
  /** Positive share count requested. */
  readonly quantity: number
  readonly status: 'filled' | 'rejected'
  readonly averagePrice: number | null
  /** Team's signed cash change (negative when paying). */
  readonly cashDeltaPaise: number | null
  readonly rejectReason: string | null
  readonly rejectMessage: string | null
  readonly acceptedAt: string
}

export interface OrderPreview {
  readonly ok: boolean
  readonly averagePrice?: number
  readonly cashDeltaPaise?: number
  readonly midAfter?: number
  readonly reason?: string
  readonly message?: string
  readonly maxQuantity?: number
}

export interface PlaceOrderResult {
  readonly order: OrderView
  /** True when this requestId was already processed and the stored result is returned. */
  readonly replayed: boolean
}

export interface HostStockView extends StockView {
  readonly depth: number
  readonly sensitivity: number
  readonly borrowPool: number
  readonly borrowUsed: number
  readonly haltReason: string | null
}

export interface HostTeamView {
  readonly id: string
  readonly name: string
  readonly loginName: string
  readonly status: 'active' | 'frozen' | 'disqualified'
  readonly cashPaise: number
}

export interface HostRoomView {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly status: RoomStatus
  readonly startingCashPaise: number
  readonly marketVersion: number
  readonly round: RoundView | null
  readonly stocks: readonly HostStockView[]
  readonly teams: readonly HostTeamView[]
}

export interface HostRoomSummary {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly status: RoomStatus
}
