# Deploying to Render

Single web service (Fastify API **+** built React app) backed by a Render PostgreSQL.
CI (GitHub Actions) type-checks and builds on every push; Render auto-deploys `main`.

## 1. Create the database
Render → **New → PostgreSQL** (name e.g. `wc-predictor-db`). Copy its **Internal Database URL**
(for the web service) and **External Database URL** (for the one-time data migration below).

## 2. Configure the web service
The service builds from the repo's `Dockerfile` (`render.yaml` sets
`runtime: docker`). On your existing web service → **Settings**:

| Setting | Value |
|---|---|
| Runtime | Docker |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` (repo root) |
| Health Check Path | `/api/health` |
| Auto-Deploy | On (`main`) |

> The image builds the web bundle and prunes dev tooling; the server runs via
> `tsx` (a runtime dependency). No Build/Start commands are needed - the
> Dockerfile's `CMD` starts the app. Render injects `PORT`, which the server
> honours. See `DOCKER.md` to run the same image locally.

## 3. Environment variables
Service → **Environment** → add (copy the **values** from your local `server/.env`,
which is gitignored — never commit them):

- `NODE_ENV` = `production`
- `DATABASE_URL` = *the Postgres Internal Database URL* (or “Add from Database”)
- `ANTHROPIC_API_KEY`
- `ADMIN_TOKEN`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `FOOTBALL_DATA_TOKEN` *(optional — only used for knockout structure sync)*
- `VISION_MODEL` = `claude-sonnet-4-6`

`PORT` is provided by Render automatically — don't set it.

## 4. Migrate your data (one-time)
Your local Postgres holds the teams, fixtures, 37 entrants and all their predictions.
Dump it and restore into the Render database (schema + data in one shot):

```bash
# from your machine
pg_dump --no-owner --no-acl worldcup > wc-dump.sql
psql "<RENDER_EXTERNAL_DATABASE_URL>" < wc-dump.sql
```

(If you'd rather start fresh instead: `npm run db:push` to create the schema, then
`npm run seed`, then re-import each entrant.)

## 5. Deploy
Push to `main` → CI runs → Render builds & deploys. Open the service URL; the React app
is served from the same origin and the API lives under `/api`.

### Make CI gate the deploy (optional)
In **Settings → Build & Deploy**, enable “wait for CI checks to pass” (or protect `main`
with a required check) so a red CI run blocks the deploy.

## Caveats
- **Free plans spin down** on inactivity — when the web service sleeps the live-score
  poller stops, so live updates pause. For the tournament, use a paid (`starter`) instance
  so it stays awake 24/7. Free Postgres also expires after 90 days.
- The live feed is ESPN's free endpoint (no key); football-data is optional.
