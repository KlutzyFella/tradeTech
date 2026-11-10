/**
 * The client this build is branded for. TradeTech is the product; the client
 * (EcoTech first) supplies the logo, colours and event identity. Colours live
 * in the brand's CSS file (src/brand/ecotech.css); this module holds names and
 * asset paths, so screens never hard-code a client.
 */
export interface Brand {
  /** The product name shown alongside the client's identity. */
  readonly productName: string
  /** The client's display name, e.g. in "TradeTech × EcoTech". */
  readonly clientName: string
  /** Square symbol (vector) for headers, the favicon and small spaces. */
  readonly markSrc: string
  /** Stacked symbol + wordmark for sign-in and splash screens. */
  readonly lockupSrc: string
  /** Wordmark only, for horizontal lockups. */
  readonly wordmarkSrc: string
  /** One line describing the event, shown on the sign-in screen. */
  readonly tagline: string
}

export const brand: Brand = {
  productName: "TradeTech",
  clientName: "EcoTech",
  markSrc: "/brand/ecotech/ecotech-mark.svg",
  lockupSrc: "/brand/ecotech/ecotech-lockup.png",
  wordmarkSrc: "/brand/ecotech/ecotech-wordmark.png",
  tagline: "A live trading competition. Read the news, size your bets, beat the room.",
}
