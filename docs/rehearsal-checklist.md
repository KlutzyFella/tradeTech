# Practice-round rehearsal (10 minutes)

A check of one **running** practice round on production before an event: fills, news-to-price timing and standings. Use two devices: a laptop as host, and a phone (or a second laptop) signed in as a team.

## Before you start

- The latest version is deployed (Railway shows the newest commit as **Success**).
- The event has the two practice stories. Events seeded since November 2026 have them already. For an older event, add them once:

  ```bash
  ssh tradetech 'cd /repo/apps/server && node src/cli/add-practice-stories.ts DEMO'
  ```

  It refuses to add them twice, and it needs stocks OILCO and AIRCO in the event.

## Checklist

1. **Start a round.** Host: Control → **New practice round** (10 minutes) → **Start round**.
   - [ ] Team: on first sign-in on this device, the **Quick start** opens. **Start trading** closes it.
   - [ ] Team: the header shows **Score**, its change since the start, and cash. The round clock counts down.
2. **A fill.** Team: open **AIRCO** → **Buy** → `100`.
   - [ ] The ticket shows the fill price against the market price, spread and fee, **You pay**, and the price after.
   - [ ] Place it. A "Bought 100 AIRCO" toast appears, header cash drops by the **You pay** amount, and the score drops by about the spread and fee.
3. **Paused trading.** Host: Control → **Pause**.
   - [ ] Team: the ticket says "Trading is paused…" beside a disabled button, but estimates still work.
   - [ ] Team: **Sell** → `500`. The ticket says you hold 100 and offers **Use 100** and **Sell all 100**.
   - [ ] Host: **Resume**. The button enables within a second or two. **Sell all 100** fills.
4. **News timing.** Host: News → **Schedule for minute 3** on the rumour and **Schedule for minute 6** on the confirmation. Minutes count active round time, and a minute already passed publishes at once.
   - [ ] At minute 3: the **Breaking** strip shows the rumour on every device. Laptops also show it in the news column beside the market. No price moves.
   - [ ] At minute 6: OILCO jumps about 6% and AIRCO falls about 5% within a second or two of each other on every device. Both show "Trading reopens in a few seconds", then trade normally.
5. **Standings.** Host: **Standings** ranks teams by score, and each team's header score matches its row. **Monitor** shows the teams online and the orders placed above.
6. **Clean up.** Host: Control → **Reset practice**. Scores return to the starting cash.

Note anything that took more than about 2 seconds to appear, or any wording a team found confusing.
