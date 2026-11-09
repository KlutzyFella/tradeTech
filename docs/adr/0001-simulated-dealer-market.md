# Teams trade against a simulated dealer, not each other

Every order fills immediately against a single simulated dealer along the curve M·exp(λx/L), with host news moving a separate anchor. We rejected host-driven prices, where team trades have no effect, because they remove interaction between teams. We also rejected a participant order book, because small rooms would have poor liquidity and we would need partial fills and queues. The event needs dependable buy, sell, short and cover even when only one team trades a stock.

## Consequences

- Prices are a model output, so scoring must use liquidation value, not mark-to-mid (see ADR 0003).
- There is no finite share float. Shorts are bounded by a separate per-stock borrow pool.
