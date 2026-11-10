#!/bin/sh
# Applies pending migrations, then starts the server. Prisma's migrate lock
# makes concurrent instances safe; set RUN_MIGRATIONS=false to run them elsewhere.
set -eu
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  ./node_modules/.bin/prisma migrate deploy
fi
exec node src/server.ts
