# One ordered writer per room, enforced by a Postgres advisory lock

Every room mutation (trade, news, tick, pause, round end, liquidation) runs in one database transaction that first takes `pg_advisory_xact_lock(room_id)`. The room's state is therefore a single serial command stream. Several web servers may accept requests, but they never interleave writes for the same room. We chose this over row-level locking with SERIALIZABLE retries because a trade touches the stock curve, the team's cash, the borrow pool and the room's market version together. A room-wide serial order also makes replay deterministic. The cost is no write parallelism within a room, which is acceptable at about 50 teams and one command per second per team.

## Consequences

- Committed events are appended to `room_events` (the outbox) in the same transaction. Sockets deliver only from it, with per-room offsets for resume.
- Order requests carry a client `requestId`, unique per team, so retries are idempotent.
