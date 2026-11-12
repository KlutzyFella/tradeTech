# Operator runbook

How to deploy TradeTech and run a live event. The baseline is 20 teams for one hour. Everything below scales with configuration.

## Deploy on Railway

1. Create a project with a **PostgreSQL** database (`railway add --database postgres`) and a service from this repo with **Root Directory `/`**.
   Service settings live in [`.railway/railway.ts`](../.railway/railway.ts) (Railway infrastructure-as-code, scoped to this service only):
   the Dockerfile build, entrypoint start command, `/health` check and watch paths. Preview with `railway config plan`, apply with `railway config apply`.
   Do not use the dashboard's auto-detected monorepo services (separate `web`/`server` with `pnpm` commands): the server image serves the web app itself.
2. Set these service variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway reference: private network, direct connection) |
   | `WEB_ORIGIN` | `https://<your-domain>`: the exact public URL teams open |
   | `TRUST_PROXY` | `true`. Railway terminates TLS in front of the app. **Required:** the server refuses to start in production without it, because getting it wrong makes every team share one IP in the login limiter. |

   Railway sets `PORT` itself. Migrations run automatically at start (`RUN_MIGRATIONS=true`). Use the database's **direct** connection URL, not a pooler (PgBouncer) URL: migrations need session-level locks.
3. Generate a domain, deploy, and check `https://<your-domain>/health` returns `{"status":"ok"}`.
4. Create a host account from a Railway shell (or locally, with the production `DATABASE_URL`):
   ```bash
   pnpm --filter @tradetech/server create-host organiser@example.com
   ```
   The password is printed once. Never use the development host `host-password-1` in production.
5. Leave sleeping off and keep one replica. A live round must never scale to zero.
6. Make the service domain's **target port** match `PORT` (3000): `railway domain update <domain> --port 3000`.

## Moving to Fly.io

The same image runs unchanged. `fly launch --no-deploy --copy-config` uses `fly.toml`. Then set `DATABASE_URL` and `WEB_ORIGIN` with `fly secrets set`, and run `fly deploy`. `fly.toml` already keeps one machine always running.

## Scaling knobs

| Setting | Default | When to change |
|---|---|---|
| `DATABASE_POOL_MAX` | 10 | More concurrent readers per instance; keep under the database's connection limit. |
| `MARKET_SIGNAL_THROTTLE_MS` | 500 | Lower for snappier price refresh with few teams; raise for very large rooms. |
| `TICK_INTERVAL_MS` | 1000 | The clock granularity. Rarely worth changing. |
| `LOGIN_RATE_LIMIT_MAX` | 10/min per IP and account | Raise for venues with many retries. |
| `PREVIEW_RATE_LIMIT_PER_SEC` | 10 per team | Order-estimate requests. |
| `REDIS_URL` | unset | **Required** when running more than one instance, so live signals reach every instance's sockets. Without it, extra replicas fail silently: teams connected to another instance miss price updates. |

Measured capacity (60 s load tests, every team placing one order per second, the maximum the rules allow; production image on a developer laptop):

| Teams per room | Order p95 | Errors | Clock drift |
|---|---|---|---|
| 20 | 113 ms | 0 | under 10 ms |
| 60 | 455 ms | 0 | under 10 ms |
| 150 | ~2 s (saturated) | 0 | under 10 ms |

The ceiling is the per-room single writer (ADR 0002): about 50 orders/s per room. Rooms are independent of each other. To go well past that within one room, shorten the locked order transaction (merge its round-trips). More hardware won't help. Re-measure with the command below (it refuses non-local targets without `--i-know-this-writes-data`, because it creates a room and teams):
```bash
BASE_URL=https://<domain> HOST_EMAIL=... HOST_PASSWORD=... pnpm --filter @tradetech/server loadtest --teams 60 --seconds 60
```

## Suggested one-hour format (20 teams)

| Segment | Minutes |
|---|---|
| Briefing: rules, the scoring rule (liquidation value), and how shorting works | 5 |
| Practice round, then **Reset practice** | 10 |
| **Go live**, then 3 scored rounds of 12 minutes with 2-minute breaks | 40 |
| **Close the event**, results, and exports | 5 |

Prepare 6–10 news items per scored hour in advance (blueprint §5). Schedule them with the news desk's "At round minute" field, and keep a few drafts for unscheduled moments.

## The venue screen

In the host console, open the event and click **Open projector view** in the sidebar. A new window opens at `/projector/<event id>`. Drag it to the projector or second display and click **Full screen**.

- It shows the event name and status, a giant round clock, a market board with mini price charts, the latest headline (it flashes once when news breaks), and how to join: the site address and room code.
- The leaderboard appears only after **Standings → Show leaderboard to teams**. After **Close the event**, it shows the final results.
- It is built from a public-only snapshot: draft news, the private price moves and team logins never reach it. It updates every 2 seconds and needs the host signed in on that browser.

## During the event

- **Server restarted mid-round:** the round comes back **paused** (downtime never counts as active time). Check the market on Control, then press **Resume**.
- **A stock behaves strangely:** **Halt** it on Control. When reopening, choose whether to re-centre its band on the current price.
- **News crossed a band:** the stock halts automatically (shown as "Halted: band"). Reopen it, usually re-centring the band.
- **A team is locked out:** Setup → **Reset password**. This signs them out everywhere.
- **Collusion or rule-breaking:** Setup → **Disqualify** with a reason. Their trades stay on record, but they are never ranked.
- **Disputes afterwards:** Standings → download **Orders**, **Cash ledger** and **News log**. Forced margin closes are marked `liquidation` in the orders file.
