# TradeTech

A browser-based, stocks-only trading competition. Teams trade fictional stocks against a simulated dealer, and hosts control rounds and news. The authoritative design is [docs/blueprint.md](docs/blueprint.md). Domain vocabulary is in [GLOSSARY.md](GLOSSARY.md), and decisions are in [docs/adr/](docs/adr/).

## Layout

- `packages/engine`: pure, deterministic market math (curve, news, pressure, valuation, rounding). It has no I/O and is the critical path, so every rule change starts here, test-first.
- `packages/contracts`: zod schemas shared by the server and the web app (order requests, event envelopes).
- `apps/server`: Fastify 5, Socket.IO and Prisma 7 (Postgres). Run on Node 24 with native type stripping (`node src/server.ts`), with no build step.
- `apps/web`: Vite, React 19, Tailwind 4 and shadcn/ui (Base UI, `nova` preset). Phone-first.

## Commands

```bash
pnpm install
pnpm db:up                                   # Postgres 17 in Docker
cp .env.example apps/server/.env
pnpm --filter @tradetech/server db:migrate   # apply migrations + generate client
pnpm dev                                     # server :3000, web :5173
pnpm test                                    # all packages (vitest); server tests use DB tradetech_test
pnpm typecheck
pnpm --filter @tradetech/server db:generate  # Prisma 7: migrate dev does NOT regenerate the client
pnpm --filter @tradetech/server seed         # demo room; needs SEED_HOST_EMAIL / SEED_HOST_PASSWORD
pnpm --filter @tradetech/web exec playwright test
```

## API conventions

- All routes are under `/api`, and every response is `{ success, data }` or `{ success: false, error: { code, message } }`. Throw `AppError` for expected failures.
- Ids are decimal strings on the wire. Ledger money is integer paise (`*Paise`), and prices are rupee numbers.
- Team routes take team and room from `request.auth` (the session) and never from the body. Host room routes go through `ownedRoom` and return 404 for rooms the host doesn't own.
- Room mutations use `withRoomLock` and record changes with `appendRoomEvent`. Sockets only signal changes after commit, and clients refetch over HTTP.
- Rule rejections are persisted as `rejected` orders with a reason. Infrastructure refusals (`market_closed`, `rate_limited`) are not persisted.

## Invariants (do not break)

- The server is authoritative for prices, cash, clock and rank. Clients never send prices, balances or team identity.
- Money in the ledger is integer paise (`BigInt`). Use `settleToPaise` once per fill, which rounds in the dealer's favour.
- News moves the anchor, trades move pressure and noise moves noise. Never mix them.
- The score is liquidation value (ADR 0003), never mark-to-mid equity.
- All room writes go through one transaction holding `pg_advisory_xact_lock(roomId)` and append to `room_events` (ADR 0002). Broadcast only committed events.
- Host-only fields (`NewsItem.impacts`, drafts) must never be serialized to participants.
- Server TS must be erasable syntax (no `enum`, no parameter properties, no namespaces). Imports use `.ts` extensions.

## Workflow

- Engine and ledger changes are TDD: write the failing test from the blueprint's worked examples and acceptance list (§4.4, §11) first.
- Use the project skills in `.agents/skills`: `tdd`, `vitest`, `fastify-best-practices`, `websocket-engineer`, `prisma-client-api`, `supabase-postgres-best-practices`, `shadcn`, `frontend-design`, `domain-modeling`, `playwright-best-practices`.
- Update `GLOSSARY.md` when a term is resolved, and add an ADR only for hard-to-reverse trade-offs.
