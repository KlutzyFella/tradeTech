# Client demo and acceptance walkthrough

A 25-minute live demonstration of the full TradeTech event workflow on the production site. Each step lists what to do and what the client should see. Tick the box when it happens.

**Site:** https://tradetechserver-production.up.railway.app
**You need:** a laptop for the host console, and two phones (or one phone plus a private browser window) as two teams.

---

## Before the client arrives (10 minutes)

### 1. Automated check (30 seconds)

From the repo on your machine, run the full browser test suite against production as your host account:

```bash
cd ~/projects/tradeTech/apps/web
E2E_BASE_URL=https://tradetechserver-production.up.railway.app \
E2E_HOST_EMAIL='you@example.com' E2E_HOST_PASSWORD='your-host-password' \
npx playwright test
```

Expect `3 passed`. This signs in as a host, sets up an event, runs a round, publishes news, trades as a team, and closes the event, all on the live site. It leaves two test events, "E2E Cup" and "Host E2E Cup", in your host console. Close or ignore them.

### 2. Create the demo event

This creates room **DEMO** with 10 fictional companies across 5 sectors and 6 teams, opens practice, and prints each team's password **once**. Copy them somewhere safe.

```bash
ssh tradetech 'cd /repo/apps/server && SEED_HOST_EMAIL=you@example.com SEED_HOST_PASSWORD=not-used-when-host-exists node src/cli/seed-demo.ts'
```

Use **exactly** the email of the host account you already created. The seed attaches the room to that host. With a different email, it would create a new host with the placeholder password.

### 3. Prepare the devices

- **Laptop:** open the site, choose **Host sign-in**, sign in, and open **Demo Trading Cup**.
- **Phone A:** room `DEMO`, login `team1`, with its printed password.
- **Phone B:** room `DEMO`, login `team2`, with its printed password.

---

## The demo (about 25 minutes)

### Part 1: Setting up an event (host)

- [ ] **Setup tab:** the 10 stocks show their opening prices and liquidity depth, and the 6 teams show "signs in as …" and ₹10,00,000 cash each.
  *Talking point:* hosts add companies and bulk-import teams here. Depth is suggested automatically from the number of teams.
- [ ] **Edit a stock and a rule:** click **Edit** next to a stock, change its profile and save. Then, under **Rules**, change the fee (shown as a percentage) and save.
  *Talking point:* rules lock when the event goes live, so every scored trade uses the same rules. Names and profiles stay editable for typos.
- [ ] **Save as template** (event sidebar), then **All events**: the template is listed. When creating an event, it can be chosen under **Start from**, which brings over the stocks, rules and news calendar, but never teams.
- [ ] **Control tab:** "Practice — results don't count and can be reset."
- [ ] **Projector:** in the event sidebar, click **Open projector view**, drag the window to the venue screen and click **Full screen**.
  It shows the event name, a giant round clock, a market board with mini price charts, the latest headline and how to join (site + room code). Leave it up for the rest of the demo: every step below also shows there.
  *Talking point:* the big screen only ever shows public information. Draft news and the host's private price moves can't appear on it.

### Part 2: Practice round and trading (host + phones)

- [ ] **Host:** Control → **New practice round** (20 minutes) → **Start round**.
  **Phones:** a countdown appears in the header within a second or two.
- [ ] **Phone A:** Market → tap **SOLAR** → **Buy**, Shares `2000`.
  The slip shows the **estimated average price, "You pay", and the price after the order** before anything is sent.
- [ ] **Phone A:** tap **Buy 2,000 SOLAR**.
  A toast says "Bought 2,000 SOLAR at ₹… average", and the order appears under **Portfolio** and **Activity**.
- [ ] **Phone B:** SOLAR's price has ticked up slightly.
  *Talking point:* trades move prices. Bigger orders move them more, and every team sees it live.
- [ ] **Phone B:** tap **SOLAR**. The ticket opens with this round's **price chart**: the line steps up where Phone A bought. Drag along the chart (or tab to it and use the arrow keys) to read the price at any moment. News appears as markers on the timeline, in red when the story names this stock.
- [ ] **Phone A:** try SOLAR, Shares `500000`.
  The slip explains the order is too big or unaffordable *before* sending it, disables the button, and offers **Use N**. Nothing is placed.
- [ ] **Phone B:** **Short** 1,000 **AIRCO**, then **Cover** 1,000.
  Both fill. Portfolio shows the short while it's open, with cash held as collateral, and the position disappears after covering.

### Part 3: News (host → phones)

- [ ] **Host:** News → headline "Analysts debate Skyline Airways fuel costs" → **Information only** → **Publish now**.
  **Phones and laptops:** a red **Breaking** strip under the header shows the actual headline, with an **AIRCO** chip at its live price, because the story names Skyline Airways, and the **News** tab gets an unread count. Prices don't jump.
- [ ] **Host:** News → headline "Meridian Oil refinery outage cuts supply" → **Moves prices** → OILCO `8`, AIRCO `-6` → **Publish now**.
  **Teams:** the breaking strip names the story and shows **OILCO** and **AIRCO** chips. OILCO jumps about 8% and AIRCO falls about 6%, and both show **News pause** for about 3 seconds, so nobody can trade on the stale price.
- [ ] **Phone A:** tap **OILCO** in the strip. The order ticket opens on OILCO straight from the story.
- [ ] **Laptop as a team:** open the **News** tab. Stories show as a large reader with **New** markers, "You hold …" flags and live stock chips, while the order ticket stays docked on the right. Under "Where news shows on your desk", try **Beside market** (a news column next to the prices) and **Tab only**.
  *Talking point:* the percentages are private. Teams see the headline and the market's reaction, never the numbers the host typed.
- [ ] **Host:** a price-moving news item, SOLAR `30` → **Publish now**.
  SOLAR jumps beyond its ±20% band and halts automatically. The phones show **Halted**, and the host's Control tab shows "Halted: band".
- [ ] **Host:** Control → SOLAR → **Reopen**, then confirm re-centring the band. Trading resumes from the new price.

### Part 4: Round control

- [ ] **Host:** **Pause**. The phones show "Paused" instead of the clock, and orders are refused.
- [ ] **Host:** **Resume**. The countdown continues from where it stopped, because paused time never counts.

### Part 5: Standings and fairness

- [ ] **Host:** Standings shows a live ranking by **liquidation value**: what each team would have after closing everything at the dealer's prices.
  *Talking point:* teams can't pump their own score by buying their own stock, because the score uses closing prices including costs.
- [ ] **Phones:** Portfolio says "Your host is keeping the leaderboard hidden for now."
- [ ] **Host:** **Show leaderboard to teams**. The phones now show their rank and the table, and the **projector** swaps "Leaderboard hidden" for the top ten.

### Part 6: Going live and closing

- [ ] **Host:** Control → **Reset practice**. Every team's cash returns to ₹10,00,000 and their positions clear.
- [ ] **Host:** **Go live**, then confirm. Practice trading and practice news are wiped, and the status reads "Live — trades count".
- [ ] **Host:** **New scored round** (say 5 minutes) → **Start round**. Both phones place a couple of trades.
- [ ] **Host:** **Close the event**, then confirm. Standings shows **Final results** with a freeze time.
  **Phones:** Portfolio shows **Final result** with the final score and rank.
  *Talking point:* results are frozen against one shared market state and can't change afterwards. Teams with exactly equal values share a rank.

### Part 7: Records and administration

- [ ] **Host:** Standings → download **Standings**, **Orders**, **Cash ledger** and **News log**, then open one in Excel or Sheets.
  *Talking point:* every trade, cash movement and news item is recorded for audits and disputes.
- [ ] *(Optional; use team3 so the phones stay signed in):* Setup → **Reset password** on Team 3. Any device signed in as team3 is signed out immediately.

---

## What has been verified automatically

These checks run on every code change and were measured on the production build:

- **72 rule tests** on the market maths. They include the worked example from the design document, to the paisa: a ₹1,00,652.43 purchase closing at ₹1,08,378.99.
- **63 server tests** against a real database. They cover duplicate-order protection, two simultaneous orders never overspending one team's cash, short and cover reconciliation, news, halts, margin liquidation, the round clock, restarts, final scoring, and CSV exports.
- **3 end-to-end tests** on a phone-sized browser, covering the whole event lifecycle (repeated against production in the check above).
- **Load test** with every team ordering every second, the maximum the rules allow:
  - 20 teams: 95% of orders confirmed within 113 ms, zero errors.
  - 60 teams: within 455 ms, zero errors.
  - The round clock stayed accurate to within 10 ms.

## After the demo

- Close **Demo Trading Cup** and any test events if you won't reuse them.
- The real event follows the one-hour format in [runbook.md](runbook.md).
