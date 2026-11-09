# Rank teams by liquidation value, not mark-to-mid equity

The score is cash minus the cost of closing every position against the same frozen dealer curve. Each team is valued independently, and valuation never mutates shared state. Mark-to-mid equity is easier to explain, but a team can inflate it by buying its own stock. In the blueprint's worked example, a 1,000-share buy shows about ₹503 of fake profit. Host-anchor settlement was deferred because it changes the nature of the contest.

## Consequences

- The UI must show liquidation value as the score and label equity clearly as a secondary figure.
- Teams must see the scoring rule before the first scored trade.
