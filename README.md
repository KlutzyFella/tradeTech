# TradeTech

A live, host-run stock-trading competition. Teams buy, sell, short and cover a shared catalogue of fictional stocks against a simulated dealer. Hosts run the rounds and publish news. A deterministic server prices every fill and ranks teams by portfolio liquidation value.

- Design: [docs/blueprint.md](docs/blueprint.md)
- Vocabulary: [GLOSSARY.md](GLOSSARY.md)
- Decisions: [docs/adr/](docs/adr/)

## Deploying

See [docs/runbook.md](docs/runbook.md): Railway now, Fly.io-ready, one Docker image. To try the production image locally: `docker compose --profile app up --build`, then open http://localhost:8080.

## Quick start

Requires Node 24+, pnpm 10 and Docker.

```bash
pnpm install
pnpm db:up
cp .env.example apps/server/.env
pnpm --filter @tradetech/server db:migrate
pnpm dev
```

The API runs on http://localhost:3000 (health check at `/health`). The web app runs on http://localhost:5173 and proxies `/api` and `/socket.io` to the API.

### Try it with demo data

```bash
SEED_HOST_EMAIL=host@tradetech.local SEED_HOST_PASSWORD='choose-a-password' pnpm --filter @tradetech/server seed
```

This creates room `DEMO`, with 10 fictional stocks across 5 sectors and 6 teams. It opens the room for practice and prints each team's password once. Sign in as the host at http://localhost:5173 ("Host sign-in"), open the event and start a round on the Control tab; teams can trade only while a round is running. Teams sign in with the room code, their login and password.

### Tests

```bash
pnpm test                               # engine unit tests + server integration tests (needs pnpm db:up)
pnpm --filter @tradetech/web exec playwright test   # phone-viewport E2E (needs the dev host above)
```

## Status

| Blueprint stage | State |
|---|---|
| A. Rules & numerical prototype | Curve, news shocks, pressure decay, order evaluation and risk limits, position accounting, liquidation value and rounding. All test-first against §4.4 and §6. |
| B. Event core | Host and team login, room/stock/team setup API, buy/sell/short/cover with idempotent requests under a per-room lock, cash ledger, practice reset, and participant web app (market, order slip, portfolio, activity). |
| C. Live event | Host console (setup, phases, rounds, news desk, halts, standings). Server clock on active time, with pressure fading, scheduled news and restart recovery. Mechanical news with fair-publication pause and band halts. Margin liquidation. Team timer and news feed. Not built yet: offset-based socket resume. |
| D. Competition close | Closing the event freezes one market state and stores every team's final liquidation value and rank (exact paise, ties share a rank, disqualified teams unranked). Host-controlled leaderboard visibility, with each team always seeing its own score. CSV exports of standings, orders, ledger and news. Team password reset and disqualification. |
| E. Rehearsal & calibration | Event-shaped load test (`pnpm --filter @tradetech/server loadtest`). Baseline 20 teams: order p95 113 ms with no errors. Per-room ceiling is about 50 orders/s. Production Docker image serves API and web from one origin, runs migrations at start, and passes E2E. Railway (`railway.json`) and Fly.io (`fly.toml`) configs, CI, and the operator runbook ([docs/runbook.md](docs/runbook.md)). |
