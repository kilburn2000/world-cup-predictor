# World Cup 2026 Predictor

[![CI/CD](https://github.com/kilburn2000/world-cup-predictor/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/kilburn2000/world-cup-predictor/actions/workflows/ci-cd.yml)

A prediction game for the 2026 World Cup: entrants predict every group and
knockout result, and the app scores them live against real fixtures (via the
football-data.org and ESPN feeds), with live standings, form, and per-competition
trends.

## Stack

- **Web:** React + Vite + Tailwind (`web/`)
- **API:** Node + Fastify, run from TypeScript via `tsx` (`server/`)
- **Shared:** scoring/standings logic used by both (`shared/`)
- **Database:** PostgreSQL (Drizzle)
- **Deploy:** single Docker image, served on Render

Participant data (names, predictions) lives only in the database, never in this
repository.

## Development

```bash
npm ci
npm run dev          # web + api together
npm test             # Vitest (shared logic + web components)
npm run lint         # ESLint
npm run type-check   # tsc --noEmit (web + server)
```

See [DEPLOY.md](DEPLOY.md) for Render deployment and [DOCKER.md](DOCKER.md) for
running the whole stack locally with Docker.
