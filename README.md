# TradeTech

A live, host-run stock-trading competition. Teams buy, sell, short and cover a shared catalogue of fictional stocks against a simulated dealer. Hosts run the rounds and publish news. A deterministic server prices every fill and ranks teams by portfolio liquidation value.

- Design: [docs/blueprint.md](docs/blueprint.md)
- Vocabulary: [GLOSSARY.md](GLOSSARY.md)
- Decisions: [docs/adr/](docs/adr/)

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

This creates room `DEMO`, with 10 fictional stocks across 5 sectors and 6 teams. It opens the room for practice and prints each team's password once. Sign in at http://localhost:5173 with the room code, a team login and its password.

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
| C. Live event | Sockets signal changes after commit. Not built yet: server clock and rounds, news desk, halts, margin liquidation, offset-based resume and the host console UI. |
| D. Competition close | Not started |
| E. Rehearsal & calibration | Not started |
