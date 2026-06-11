-- Standings history for rank-movement + sparklines.
-- Run once:  psql "$DATABASE_URL" -f migrations/0001_leaderboard_snapshots.sql
-- (or add the table to db/schema.ts and `drizzle-kit push`).

create table if not exists leaderboard_snapshots (
  id          serial primary key,
  seq         integer not null,
  entrant_id  integer not null references entrants(id) on delete cascade,
  rank        integer not null,
  total       integer not null,
  captured_at timestamptz default now(),
  constraint uniq_snapshot unique (seq, entrant_id)
);

create index if not exists idx_snapshot_seq on leaderboard_snapshots (seq);
