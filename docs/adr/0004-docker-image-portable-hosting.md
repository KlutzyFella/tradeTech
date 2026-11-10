# One Docker image, hosted on Railway, portable to Fly.io

The whole product ships as a single Docker image: the Node API serves the built web app from the same origin, and migrations run before each deploy. We host on Railway for now, but use only what any container host offers (a Dockerfile, an HTTP health check, env vars and managed Postgres) and keep a `fly.toml` alongside `railway.json`, so moving to Fly.io is a config change, not a rewrite. Serving the web app from the API's origin keeps session cookies first-party and avoids CORS for both HTTP and WebSockets.

## Consequences

- Scale is configured, not coded: `DATABASE_POOL_MAX`, `TICK_INTERVAL_MS`, `LOGIN_RATE_LIMIT_MAX` and, for more than one instance, `REDIS_URL` (Socket.IO Redis adapter). Room writes are already safe across instances (ADR 0002).
- The baseline event is 20 teams for one hour. Load tests run at several times that.
