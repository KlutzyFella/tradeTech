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

## Status

| Blueprint stage | State |
|---|---|
| A. Rules & numerical prototype | Started: curve, news, pressure decay, liquidation value and rounding are tested against §4.4 |
| B. Event core | Schema and service skeleton only |
| C. Live event | Socket.IO wired, delivery contract not implemented |
| D. Competition close | Not started |
| E. Rehearsal & calibration | Not started |
