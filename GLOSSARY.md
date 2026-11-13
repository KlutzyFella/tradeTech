# TradeTech

A browser-based, host-run stock-trading competition in which teams trade a common catalogue of fictional stocks against a simulated dealer.

## Event

**Room**:
One competition instance with its own teams, stocks, rounds, rules and clock.
_Avoid_: Game, session, lobby

**Host**:
An organiser who configures the room, publishes news and controls rounds.
_Avoid_: Admin, organiser, operator

**Team**:
A participant unit that owns exactly one portfolio in a room.
_Avoid_: Player, user, account

**Round**:
A timed period of trading; either a practice round (reset before scoring) or a scored round (positions carry forward).
_Avoid_: Session, level

**Event template**:
A host's reusable snapshot of a room's starting cash, rules, stocks and news calendar (impacts keyed by ticker). It never includes teams, trades or results, and a room created from it gets a copy.
_Avoid_: Preset, blueprint, clone

## Market

**Simulated dealer**:
The single counterparty that fills every valid order along the price curve.
_Avoid_: Market maker bot, exchange, house

**Anchor**:
A stock's scenario price level, moved only by host news.
_Avoid_: Base price, fair value

**Demand pressure**:
Temporary log-price premium created by participant net buying or selling, which decays over active time.
_Avoid_: Momentum, impact (as a state)

**Noise**:
Optional seeded background log-price disturbance.
_Avoid_: Volatility (as a state), randomness

**Mid-price**:
The reference quote, anchor × exp(pressure + noise); orders fill around it, not at it.
_Avoid_: Price, last price, LTP

**Liquidity depth**:
The number of shares that sets how far an order moves the mid-price.
_Avoid_: Float, shares outstanding, volume

**Sensitivity**:
The impact multiplier applied to an order's size relative to liquidity depth.
_Avoid_: Elasticity, market sensitivity dial

**Borrow pool**:
The per-stock number of shares available for teams to short.
_Avoid_: Float, inventory

**Band**:
The allowed price range around a round's opening reference; crossing it rejects the trade or halts the stock.
_Avoid_: Circuit limit, price limit

**Halt**:
A per-stock state in which participant executions are refused.
_Avoid_: Suspension, freeze

**Pause**:
A stop of the current round's clock, ticks, scheduled news and trading.
_Avoid_: Halt, freeze

**Active time**:
Round time that counts: it advances only while the round is running, never while paused or while the server is down.
_Avoid_: Wall-clock time, elapsed time

**News pause**:
The few seconds after mechanical news during which affected stocks refuse orders so nobody trades on a stale quote.
_Avoid_: Cooldown, halt

## News

**Mechanical news**:
A published item that applies a host-authored shock to one or more anchors.
_Avoid_: Price event, shock news

**Information-only news**:
A published item that leaves anchors unchanged.
_Avoid_: Flavour text, rumour

**Shock**:
The private signed fractional change (greater than −100%) a mechanical news item applies to an anchor.
_Avoid_: Impact, effect

## Portfolio

**Position**:
A team's signed share quantity in one stock: positive is long, negative is short.
_Avoid_: Holding, lot

**Order intent**:
What the team means by an order: buy, sell, short or cover. An order that would cross zero is rejected.
_Avoid_: Side, direction

**Cash**:
A team's total ledger cash, including collateral restricted against shorts.
_Avoid_: Balance, wallet

**Available cash**:
Cash minus restricted collateral; a spending limit, not a value.
_Avoid_: Buying power, free cash

**Equity**:
Cash plus positions marked at mid-price; explains exposure but is never the score.
_Avoid_: Net worth, portfolio value

**Liquidation value**:
Cash after hypothetically closing every position against the same frozen dealer curve; the competition score.
_Avoid_: Score (in code), net worth, P&L

**Liquidation**:
The server closing a failing team's positions along the dealer curve, bypassing opening limits but not halts.
_Avoid_: Margin call, auto-sell

**Maintenance failure**:
The state in which a team's collateral or equity falls below the maintenance threshold and its portfolio is liquidated.
_Avoid_: Margin call, bust
