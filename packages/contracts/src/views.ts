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
}

export interface MarketView {
  readonly roomStatus: RoomStatus
  readonly marketVersion: number
  readonly stocks: readonly StockView[]
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
