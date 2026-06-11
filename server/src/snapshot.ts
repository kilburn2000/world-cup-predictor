import { sql } from "./db/index.js";

/**
 * Standings history for rank-movement arrows + sparklines.
 *
 * Each call to `snapshotStandings()` writes one row per entrant tagged with a
 * monotonically increasing `seq`, BUT only when the standings actually changed
 * since the last snapshot — so polling that changes nothing doesn't spam history.
 * Call it at the end of `recomputeAll()`.
 */
export async function snapshotStandings(): Promise<boolean> {
  const rows = (await sql`
    select e.id as entrant_id, e.name, coalesce(sum(s.points), 0)::int as total
    from entrants e
    left join scores s on s.entrant_id = e.id
    group by e.id, e.name
    order by total desc, e.name asc
  `) as { entrant_id: number; name: string; total: number }[];

  if (!rows.length) return false;

  const [{ seq: maxSeq } = { seq: null }] =
    (await sql`select max(seq)::int as seq from leaderboard_snapshots`) as { seq: number | null }[];

  // Skip if nothing changed vs the latest snapshot.
  if (maxSeq != null) {
    const prev = (await sql`
      select entrant_id, total from leaderboard_snapshots where seq = ${maxSeq}
    `) as { entrant_id: number; total: number }[];
    const prevMap = new Map(prev.map((p) => [p.entrant_id, p.total]));
    const unchanged =
      rows.length === prev.length && rows.every((r) => prevMap.get(r.entrant_id) === r.total);
    if (unchanged) return false;
  }

  const nextSeq = (maxSeq ?? 0) + 1;
  let rank = 0;
  for (const r of rows) {
    rank++;
    await sql`
      insert into leaderboard_snapshots (seq, entrant_id, rank, total, captured_at)
      values (${nextSeq}, ${r.entrant_id}, ${rank}, ${r.total}, now())
      on conflict (seq, entrant_id) do update set rank = excluded.rank, total = excluded.total
    `;
  }
  return true;
}

export interface MovementInfo {
  /** prev snapshot rank − current rank. Positive = climbed. */
  move: Map<number, number>;
  /** entrantId → array of recent ranks (oldest → newest), for sparklines. */
  spark: Map<number, number[]>;
}

/** Read the last `history` snapshots and derive movement + sparkline series. */
export async function getMovement(history = 8): Promise<MovementInfo> {
  const seqRows = (await sql`
    select distinct seq from leaderboard_snapshots order by seq desc limit ${history}
  `) as { seq: number }[];
  const seqs = seqRows.map((s) => s.seq).reverse(); // oldest → newest

  const move = new Map<number, number>();
  const spark = new Map<number, number[]>();
  if (!seqs.length) return { move, spark };

  const rows = (await sql`
    select seq, entrant_id, rank from leaderboard_snapshots where seq = any(${seqs})
  `) as { seq: number; entrant_id: number; rank: number }[];

  const bySeq = new Map<number, Map<number, number>>();
  for (const r of rows) {
    if (!bySeq.has(r.seq)) bySeq.set(r.seq, new Map());
    bySeq.get(r.seq)!.set(r.entrant_id, r.rank);
  }

  const lastSeq = seqs[seqs.length - 1];
  const prevSeq = seqs.length >= 2 ? seqs[seqs.length - 2] : null;
  const entrantIds = new Set<number>();
  for (const m of bySeq.values()) for (const id of m.keys()) entrantIds.add(id);

  for (const id of entrantIds) {
    const series = seqs
      .map((sq) => bySeq.get(sq)?.get(id))
      .filter((x): x is number => x != null);
    spark.set(id, series);
    const cur = bySeq.get(lastSeq)?.get(id);
    const prev = prevSeq != null ? bySeq.get(prevSeq)?.get(id) : null;
    move.set(id, prev != null && cur != null ? prev - cur : 0);
  }

  return { move, spark };
}
