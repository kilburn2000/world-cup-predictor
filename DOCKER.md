# Running in Docker

One image bundles the Fastify API and the built React app (served from the same
origin, API under `/api`). The server runs from TypeScript source via `tsx`, so
no separate compile step is needed.

## Quick start (app + Postgres)

```bash
docker compose up --build
```

On the **first** run the database is empty, so create the schema and seed it:

```bash
docker compose exec app npm run db:push   # create tables
docker compose exec app npm run seed      # reference data (teams, fixtures, ...)
```

Then open <http://localhost:8790>. Data persists in the `wc-pgdata` volume, so
you only need those two commands once.

## Secrets

Put any of these in a root `.env` (git/dockerignored); compose reads it
automatically and it is fine to omit:

```
ANTHROPIC_API_KEY=...       # photo import (OCR) only
ADMIN_TOKEN=...
ADMIN_EMAIL=...
ADMIN_PASSWORD_HASH=...
FOOTBALL_DATA_TOKEN=...      # optional: knockout structure sync
```

`DATABASE_URL`, `PORT`, `NODE_ENV` and `VISION_MODEL` are set by compose.

## Image only (external Postgres)

```bash
docker build -t wc-predictor .
docker run -p 8790:8790 \
  -e DATABASE_URL="postgres://user:pass@host:5432/worldcup" \
  wc-predictor
```

The container listens on `PORT` (default `8790`) and exposes `/api/health` for
health checks. This is the same artefact Render runs; Render itself uses the
Node buildpack (see `DEPLOY.md`), so the Dockerfile is for local/self-hosting.
