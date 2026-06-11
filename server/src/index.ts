import "dotenv/config";
import { scryptSync, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_SCORING } from "@wc/shared";
import { sql } from "./db/index.js";
import { fd, mapGroup } from "./footballData.js";
import { recomputeAll, loadConfig } from "./score.js";
import { scoreGroupMatch } from "@wc/shared";
import { getMatches as getEspnMatches } from "./espn.js";
import { dbNameMap, resolveEspn, liveEvents } from "./sync.js";
import { computeGroupStandings, buildKnockout } from "./wc.js";
import { runImport, savePredictions, checkUnresolved } from "./importSheet.js";
import { extractFromPhoto, toPredictions } from "./photoImport.js";
import { startPoller } from "./poller.js";

const ScoringConfigSchema = z.object({
  outcome: z.number().int().min(0).max(1000),
  teamGoals: z.number().int().min(0).max(1000),
  exactBonus: z.number().int().min(0).max(1000),
  knockoutTeam: z.number().int().min(0).max(1000),
});

const PORT = Number(process.env.PORT ?? 8790);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? "";

function verifyPassword(password: string): boolean {
  if (!ADMIN_PASSWORD_HASH.includes(":")) return false;
  const [salt, hash] = ADMIN_PASSWORD_HASH.split(":");
  const stored = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, stored.length);
  return derived.length === stored.length && timingSafeEqual(derived, stored);
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });

function requireAdmin(req: any, reply: any): boolean {
  if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

app.get("/api/health", async () => ({ ok: true }));

// Admin login: verify email + password, hand back the session token the admin
// endpoints already expect (x-admin-token).
app.post("/api/admin/login", async (req: any, reply) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (email === ADMIN_EMAIL && verifyPassword(password)) {
    return { token: ADMIN_TOKEN };
  }
  reply.code(401).send({ error: "Invalid email or password" });
});

// Cheap check that a stored token is still valid (for the auth gate).
app.get("/api/admin/check", async (req: any, reply) => {
  if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    reply.code(401).send({ ok: false });
    return;
  }
  return { ok: true };
});

// Live leaderboard for the (single) default league.
app.get("/api/leaderboard", async () => {
  const rows = await sql`
    select e.id as "entrantId", e.name, e.name_incomplete as "nameIncomplete",
           coalesce(sum(case when m.stage = 'GROUP' and m.matchday = 1 then s.points end), 0)::int as week1,
           coalesce(sum(case when m.stage = 'GROUP' and m.matchday = 2 then s.points end), 0)::int as week2,
           coalesce(sum(case when m.stage = 'GROUP' and m.matchday = 3 then s.points end), 0)::int as week3,
           coalesce(sum(case when m.stage = 'LAST_32' then s.points end), 0)::int as r32,
           coalesce(sum(s.points), 0)::int as total
    from entrants e
    left join scores s on s.entrant_id = e.id
    left join matches m on s.ref like 'match:%' and m.id = split_part(s.ref, ':', 2)::int
    group by e.id, e.name, e.name_incomplete
    order by total desc, e.name asc
  `;
  return rows;
});

// Fun stats for the standings — leaders by various measures, with ties as
// "name + N others".
app.get("/api/stats", async () => {
  const rows = (await sql`
    select e.name,
      count(*) filter (where (s.breakdown->>'exact')::boolean)::int as exact_cnt,
      count(*) filter (where (s.breakdown->>'outcome')::boolean)::int as outcome_cnt
    from entrants e
    left join scores s on s.entrant_id = e.id and s.kind = 'MATCH'
    group by e.id, e.name
  `) as any[];
  const leader = (key: string) => {
    const max = rows.reduce((mx, r) => Math.max(mx, r[key]), 0);
    const names = rows.filter((r) => r[key] === max && max > 0).map((r) => r.name).sort();
    return { value: max, name: names[0] ?? null, others: Math.max(0, names.length - 1) };
  };

  // longest runs of consecutive exact scores / correct results (chronological)
  const seq = (await sql`
    select s.entrant_id as eid, e.name,
      (s.breakdown->>'exact')::boolean as exact,
      (s.breakdown->>'outcome')::boolean as outcome
    from scores s
    join entrants e on e.id = s.entrant_id
    join matches m on s.kind = 'MATCH' and m.id = split_part(s.ref, ':', 2)::int and m.status = 'FINISHED'
    order by s.entrant_id, m.kickoff_utc, m.id
  `) as any[];
  type St = { name: string; exCur: number; exMax: number; reCur: number; reMax: number };
  const streak = new Map<number, St>();
  for (const r of seq) {
    let st = streak.get(r.eid);
    if (!st) streak.set(r.eid, (st = { name: r.name, exCur: 0, exMax: 0, reCur: 0, reMax: 0 }));
    if (r.exact) { st.exCur++; if (st.exCur > st.exMax) st.exMax = st.exCur; } else st.exCur = 0;
    if (r.outcome) { st.reCur++; if (st.reCur > st.reMax) st.reMax = st.reCur; } else st.reCur = 0;
  }
  const streakLeader = (key: "exMax" | "reMax") => {
    const vals = [...streak.values()];
    const max = vals.reduce((mx, s) => Math.max(mx, s[key]), 0);
    const names = vals.filter((s) => s[key] === max && max > 0).map((s) => s.name).sort();
    return { value: max, name: names[0] ?? null, others: Math.max(0, names.length - 1) };
  };

  return {
    mostExact: leader("exact_cnt"),
    mostResults: leader("outcome_cnt"),
    longestExactStreak: streakLeader("exMax"),
    longestResultStreak: streakLeader("reMax"),
  };
});

// Knockout competition group tables: each entrant is scored ONLY on their own
// World Cup group's fixtures (entrant Group A ⇒ WC Group A games, etc.), split by
// matchday (Week 1/2/3) + total. Ranked by total; top 2 qualify.
app.get("/api/groups", async () => {
  const cfg = await loadConfig();
  const rows = (await sql`
    select e.id as "entrantId", e.name, e.name_incomplete as "nameIncomplete", e.entrant_group as grp,
           coalesce(sum(case when m.matchday = 1 then s.points end), 0)::int as week1,
           coalesce(sum(case when m.matchday = 2 then s.points end), 0)::int as week2,
           coalesce(sum(case when m.matchday = 3 then s.points end), 0)::int as week3,
           coalesce(sum(case when m.id is not null then s.points end), 0)::int as total
    from entrants e
    left join scores s on s.entrant_id = e.id and s.kind = 'MATCH'
    left join matches m on m.id = split_part(s.ref, ':', 2)::int
                       and m.stage = 'GROUP' and m.group_name = e.entrant_group
    where e.entrant_group is not null
    group by e.id, e.name, e.name_incomplete, e.entrant_group
  `) as any[];
  const entrantGroup = new Map(rows.map((r) => [r.entrantId, r.grp]));

  // provisional points from IN-PLAY group games — but still only the entrant's
  // own WC group counts toward their knockout-competition score.
  const liveMatches = await sql`
    select id, matchday, group_name grp, home_team_id mh, home_goals hg, away_goals ag
    from matches
    where stage = 'GROUP' and status = 'IN_PLAY' and home_goals is not null and away_goals is not null
  `;
  const live = new Map<number, { w: [number, number, number, number]; total: number }>();
  if ((liveMatches as any[]).length) {
    const ids = (liveMatches as any[]).map((m) => m.id);
    const byMatch = new Map((liveMatches as any[]).map((m) => [m.id, m]));
    const preds = await sql`
      select entrant_id, match_id, pred_home_team_id ph, pred_home_goals phg, pred_away_goals pag
      from predictions where scope = 'MATCH' and match_id in ${sql(ids)}
    `;
    for (const p of preds as any[]) {
      const m = byMatch.get(p.match_id);
      if (!m) continue;
      if (entrantGroup.get(p.entrant_id) !== m.grp) continue; // only your own WC group
      const predH = p.ph === m.mh ? p.phg : p.pag;
      const predA = p.ph === m.mh ? p.pag : p.phg;
      const pts = scoreGroupMatch(predH, predA, m.hg, m.ag, cfg).points;
      const cur = live.get(p.entrant_id) ?? { w: [0, 0, 0, 0], total: 0 };
      cur.w[m.matchday] = (cur.w[m.matchday] ?? 0) + pts;
      cur.total += pts;
      live.set(p.entrant_id, cur);
    }
  }
  for (const r of rows) {
    const l = live.get(r.entrantId);
    r.live = !!l;
    if (l) {
      r.week1 += l.w[1]; r.week2 += l.w[2]; r.week3 += l.w[3]; r.total += l.total;
    }
  }

  const byGroup = new Map<string, any[]>();
  for (const r of rows) {
    if (!byGroup.has(r.grp)) byGroup.set(r.grp, []);
    byGroup.get(r.grp)!.push(r);
  }

  return [...byGroup.keys()]
    .sort()
    .map((group) => {
      const entrants = byGroup
        .get(group)!
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
        .map((e, i) => ({ ...e, rank: i + 1, qualifying: i < 2 }));
      return { group, entrants };
    });
});

// One entrant's predictions + per-ref points.
app.get("/api/entrants/:id", async (req: any) => {
  const id = Number(req.params.id);
  const [entrant] = await sql`select id, name from entrants where id = ${id}`;
  const scoresRows = await sql`select kind, ref, points, breakdown from scores where entrant_id = ${id}`;
  const preds = await sql`select scope, match_id, bracket_slot, pred_home_team_id, pred_away_team_id, pred_home_goals, pred_away_goals from predictions where entrant_id = ${id}`;
  return { entrant, scores: scoresRows, predictions: preds };
});

// An entrant's full wallchart: group predictions (with actual + points) grouped
// by group, plus their predicted knockout bracket, plus point totals by kind.
const ROUND_OF: Record<string, { round: string; label: string; order: number }> = {
  R32: { round: "LAST_32", label: "Round of 32", order: 0 },
  R16: { round: "LAST_16", label: "Round of 16", order: 1 },
  QF: { round: "QF", label: "Quarter-finals", order: 2 },
  SF: { round: "SF", label: "Semi-finals", order: 3 },
  THIRD: { round: "THIRD_PLACE", label: "Third place", order: 4 },
  FINAL: { round: "FINAL", label: "Final", order: 5 },
};

app.get("/api/entrants/:id/wallchart", async (req: any, reply) => {
  const id = Number(req.params.id);
  const [entrant] = await sql`select id, name from entrants where id = ${id}`;
  if (!entrant) return reply.code(404).send({ error: "not found" });

  // Group predictions + the real fixture + actual result + the match's score row.
  const groupRows = await sql`
    select m.group_name grp, m.matchday, m.status, m.home_team_id mh,
           m.home_goals ah, m.away_goals aa,
           ht.name home, at.name away,
           p.pred_home_team_id ph, p.pred_home_goals phg, p.pred_away_goals pag,
           s.points, s.breakdown
    from predictions p
    join matches m on m.id = p.match_id
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    left join scores s on s.entrant_id = p.entrant_id and s.ref = 'match:' || m.id
    where p.entrant_id = ${id} and p.scope = 'MATCH'
    order by m.group_name, m.matchday, m.id
  `;

  const groupsMap = new Map<string, any[]>();
  for (const r of groupRows as any[]) {
    // align the prediction to the fixture's home/away
    const predHome = r.ph === r.mh ? r.phg : r.pag;
    const predAway = r.ph === r.mh ? r.pag : r.phg;
    const match = {
      home: r.home,
      away: r.away,
      predHome,
      predAway,
      actualHome: r.ah,
      actualAway: r.aa,
      status: r.status,
      points: r.points ?? null,
      breakdown: r.breakdown ?? null,
    };
    if (!groupsMap.has(r.grp)) groupsMap.set(r.grp, []);
    groupsMap.get(r.grp)!.push(match);
  }
  const groups = [...groupsMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, matches]) => ({ group, matches }));

  // Predicted knockout bracket.
  const koRows = await sql`
    select p.bracket_slot slot, p.pred_home_goals phg, p.pred_away_goals pag, ht.name home, at.name away
    from predictions p
    join teams ht on ht.id = p.pred_home_team_id
    join teams at on at.id = p.pred_away_team_id
    where p.entrant_id = ${id} and p.scope = 'SLOT'
  `;
  const knockout = (koRows as any[])
    .map((r) => {
      const prefix = r.slot.split("-")[0];
      const meta = ROUND_OF[prefix] ?? { round: prefix, label: prefix, order: 9 };
      const idx = Number(r.slot.split("-")[1] ?? 0);
      return { round: meta.round, label: meta.label, order: meta.order, idx, slot: r.slot, home: r.home, away: r.away, predHome: r.phg, predAway: r.pag };
    })
    .sort((a, b) => a.order - b.order || a.idx - b.idx);

  // Totals by score kind.
  const totalsRows = await sql`select kind, coalesce(sum(points),0)::int s from scores where entrant_id = ${id} group by kind`;
  const totals: Record<string, number> = { total: 0, MATCH: 0, PROGRESSION: 0, FINALTHIRD: 0 };
  for (const t of totalsRows as any[]) {
    totals[t.kind] = t.s;
    totals.total += t.s;
  }

  return { entrant, totals, groups, knockout };
});

// Live actual group tables, proxied from football-data standings.
app.get("/api/table", async () => {
  try {
    const data = await fd.standings();
    return (data.standings ?? [])
      .filter((s: any) => s.type === "TOTAL" && s.group)
      .map((s: any) => ({
        group: mapGroup(s.group),
        rows: (s.table ?? []).map((row: any) => ({
          teamId: row.team?.id,
          name: row.team?.shortName ?? row.team?.name,
          played: row.playedGames,
          points: row.points,
          gd: row.goalDifference,
        })),
      }));
  } catch (e: any) {
    app.log.warn(`/api/table: ${e.message}`);
    return [];
  }
});

// Knockout matches as the bracket fills in.
app.get("/api/bracket", async () => {
  const rows = await sql`
    select m.id, m.stage, m.bracket_slot, m.status, m.home_goals, m.away_goals,
           ht.name as home, at.name as away
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    where m.stage <> 'GROUP'
    order by m.kickoff_utc asc nulls last
  `;
  return rows;
});

// Editable wallchart for manual completion: every group fixture (teams fixed) +
// every knockout slot, pre-filled with the entrant's predictions, blank where
// the import missed them.
const KO_SLOTS: { slot: string; label: string }[] = [
  ...Array.from({ length: 16 }, (_, i) => ({ slot: `R32-${i + 1}`, label: "Round of 32" })),
  ...Array.from({ length: 8 }, (_, i) => ({ slot: `R16-${i + 1}`, label: "Round of 16" })),
  ...Array.from({ length: 4 }, (_, i) => ({ slot: `QF-${i + 1}`, label: "Quarter-finals" })),
  ...Array.from({ length: 2 }, (_, i) => ({ slot: `SF-${i + 1}`, label: "Semi-finals" })),
  { slot: "THIRD", label: "Third place" },
  { slot: "FINAL", label: "Final" },
];

app.get("/api/entrants/:id/edit", async (req: any, reply) => {
  const id = Number(req.params.id);
  const [entrant] = await sql`select id, name from entrants where id = ${id}`;
  if (!entrant) return reply.code(404).send({ error: "not found" });

  const groupRows = await sql`
    select m.id "matchId", m.group_name grp, ht.name home, at.name away, m.home_team_id mh,
           p.pred_home_team_id ph, p.pred_home_goals phg, p.pred_away_goals pag
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    left join predictions p on p.match_id = m.id and p.entrant_id = ${id} and p.scope = 'MATCH'
    where m.stage = 'GROUP'
    order by m.group_name, m.matchday, m.id
  `;
  const groups = (groupRows as any[]).map((r) => {
    const has = r.ph != null;
    const predHome = has ? (r.ph === r.mh ? r.phg : r.pag) : null;
    const predAway = has ? (r.ph === r.mh ? r.pag : r.phg) : null;
    return { matchId: r.matchId, group: r.grp, home: r.home, away: r.away, homeGoals: predHome, awayGoals: predAway };
  });

  const koExisting = await sql`
    select p.bracket_slot slot, ht.name home, at.name away, p.pred_home_goals phg, p.pred_away_goals pag
    from predictions p
    join teams ht on ht.id = p.pred_home_team_id
    join teams at on at.id = p.pred_away_team_id
    where p.entrant_id = ${id} and p.scope = 'SLOT'
  `;
  const bySlot = new Map((koExisting as any[]).map((r) => [r.slot, r]));
  const knockout = KO_SLOTS.map(({ slot, label }) => {
    const e = bySlot.get(slot);
    return { slot, label, home: e?.home ?? null, away: e?.away ?? null, homeGoals: e?.phg ?? null, awayGoals: e?.pag ?? null };
  });

  return { entrant, groups, knockout };
});

// Live page feed: every in-play match, today's upcoming fixtures, and all
// results so far — each with a points board (what each entrant scores/scored at
// that scoreline) and, for in-play games, ESPN's live minute + goal/card events.
app.get("/api/live", async () => {
  const cfg = await loadConfig();
  const rows = await sql`
    select m.id, m.stage, m.group_name grp, m.status, m.home_goals hg, m.away_goals ag, m.kickoff_utc,
           m.home_team_id mh, m.away_team_id ma,
           ht.name home, ht.tla home_code, at.name away, at.tla away_code
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.status in ('IN_PLAY', 'FINISHED')
       or (m.status = 'SCHEDULED'
           and m.kickoff_utc >= date_trunc('day', now() at time zone 'utc')
           and m.kickoff_utc <  date_trunc('day', now() at time zone 'utc') + interval '1 day')
    order by
      (case m.status when 'IN_PLAY' then 0 when 'SCHEDULED' then 1 else 2 end),
      case when m.status = 'FINISHED' then m.kickoff_utc end desc nulls last,
      case when m.status <> 'FINISHED' then m.kickoff_utc end asc nulls last
  `;

  // all group predictions in one pass, grouped by match
  const allPreds = await sql`
    select p.match_id mid, e.id eid, e.name, p.pred_home_team_id ph, p.pred_home_goals phg, p.pred_away_goals pag
    from predictions p join entrants e on e.id = p.entrant_id
    where p.scope = 'MATCH'
  `;
  const predsByMatch = new Map<number, any[]>();
  for (const p of allPreds as any[]) {
    if (!predsByMatch.has(p.mid)) predsByMatch.set(p.mid, []);
    predsByMatch.get(p.mid)!.push(p);
  }

  // most-common predicted score + result for a match (aligned to its home/away)
  const mostCommon = (preds: any[], mh: number) => {
    if (!preds?.length) return { score: null as string | null, scoreCount: 0, result: null as "HOME" | "DRAW" | "AWAY" | null, resultCount: 0, total: 0 };
    const scoreCount = new Map<string, number>();
    const resultCount = { HOME: 0, DRAW: 0, AWAY: 0 };
    for (const p of preds) {
      const h = p.ph === mh ? p.phg : p.pag;
      const a = p.ph === mh ? p.pag : p.phg;
      scoreCount.set(`${h}-${a}`, (scoreCount.get(`${h}-${a}`) ?? 0) + 1);
      resultCount[h > a ? "HOME" : h < a ? "AWAY" : "DRAW"]++;
    }
    let score: string | null = null, sc = 0;
    for (const [k, c] of scoreCount) if (c > sc) { score = k; sc = c; }
    const result = (["HOME", "DRAW", "AWAY"] as const).reduce((a, b) => (resultCount[b] > resultCount[a] ? b : a));
    return { score, scoreCount: sc, result, resultCount: resultCount[result], total: preds.length };
  };

  // ESPN live enrichment (minute + events), keyed by DB team-id pair
  const espnByPair = new Map<string, { espn: any; homeId: number }>();
  try {
    const byNorm = await dbNameMap();
    for (const e of await getEspnMatches()) {
      const h = resolveEspn(e.home, byNorm);
      const a = resolveEspn(e.away, byNorm);
      if (h && a) espnByPair.set([h, a].sort((x, y) => x - y).join("-"), { espn: e, homeId: h });
    }
  } catch {
    /* ESPN unavailable — fall back to DB-only (no minute/events) */
  }

  return (rows as any[]).map((m) => {
    const hg = m.hg ?? 0;
    const ag = m.ag ?? 0;
    const scored = m.status === "IN_PLAY" || m.status === "FINISHED";

    let board: any[] = [];
    if (m.stage === "GROUP" && scored) {
      board = (predsByMatch.get(m.id) ?? [])
        .map((p) => {
          const predH = p.ph === m.mh ? p.phg : p.pag;
          const predA = p.ph === m.mh ? p.pag : p.phg;
          const b = scoreGroupMatch(predH, predA, hg, ag, cfg);
          const tier = b.exact ? "exact" : b.outcome ? "result" : (b.homeGoals || b.awayGoals) ? "diff" : "miss";
          return { entrantId: p.eid, name: p.name, pick: `${predH}-${predA}`, points: b.points, tier };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    }

    // attach ESPN minute/events, aligning event side to our home/away
    const enrich = espnByPair.get([m.mh, m.ma].sort((x, y) => x - y).join("-"));
    let minute: number | null = null;
    let half: string | null = null;
    let period: number | null = null;
    // synthesised goal log (already aligned to this match's home/away)
    const events: any[] = (liveEvents.get(m.id) ?? []).slice().sort((a, b) => a.minute - b.minute);
    if (enrich) {
      const liveNow = m.status === "IN_PLAY";
      minute = liveNow ? enrich.espn.minute : null;
      half = liveNow ? enrich.espn.half : null;
      period = liveNow ? enrich.espn.period : null;
    }

    const mc = m.stage === "GROUP" ? mostCommon(predsByMatch.get(m.id) ?? [], m.mh) : { score: null, result: null };

    return {
      id: m.id,
      home: m.home,
      away: m.away,
      homeCode: m.home_code ?? "",
      awayCode: m.away_code ?? "",
      stage: m.stage,
      group: m.grp,
      status: m.status,
      kickoff: m.kickoff_utc,
      minute,
      half,
      period,
      homeScore: hg,
      awayScore: ag,
      mostCommonScore: mc.score,
      mostCommonScoreCount: mc.scoreCount,
      mostCommonResult: mc.result,
      mostCommonResultCount: mc.resultCount,
      mostCommonTotal: mc.total,
      events,
      board,
    };
  });
});

// All fixtures + results, chronological (knockout teams are null until resolved).
app.get("/api/fixtures", async () => {
  const rows = await sql`
    select m.id, m.stage, m.group_name grp, m.matchday, m.kickoff_utc, m.status,
           m.home_goals hg, m.away_goals ag,
           ht.name home, ht.tla home_code, at.name away, at.tla away_code
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    order by m.kickoff_utc asc nulls last, m.id
  `;

  // aggregate group-match predictions for the most-common score + result per fixture
  const preds = await sql`
    select p.match_id mid, p.pred_home_team_id ph, p.pred_home_goals phg, p.pred_away_goals pag, m.home_team_id mh
    from predictions p join matches m on m.id = p.match_id
    where p.scope = 'MATCH'
  `;
  const agg = new Map<number, { score: Map<string, number>; result: { HOME: number; DRAW: number; AWAY: number }; total: number }>();
  for (const p of preds as any[]) {
    const h = p.ph === p.mh ? p.phg : p.pag; // align to the fixture's home/away
    const a = p.ph === p.mh ? p.pag : p.phg;
    let g = agg.get(p.mid);
    if (!g) agg.set(p.mid, (g = { score: new Map(), result: { HOME: 0, DRAW: 0, AWAY: 0 }, total: 0 }));
    g.score.set(`${h}-${a}`, (g.score.get(`${h}-${a}`) ?? 0) + 1);
    g.result[h > a ? "HOME" : h < a ? "AWAY" : "DRAW"]++;
    g.total++;
  }
  const modeScore = (s: Map<string, number>) => {
    let key: string | null = null, count = 0;
    for (const [k, c] of s) if (c > count) { key = k; count = c; }
    return { key, count };
  };
  const modeResult = (r: { HOME: number; DRAW: number; AWAY: number }) => {
    const key = (["HOME", "DRAW", "AWAY"] as const).reduce((a, b) => (r[b] > r[a] ? b : a));
    return { key, count: r[key] };
  };

  return (rows as any[]).map((m) => {
    const g = agg.get(m.id);
    const ms = g ? modeScore(g.score) : { key: null, count: 0 };
    const mr = g ? modeResult(g.result) : { key: null as "HOME" | "DRAW" | "AWAY" | null, count: 0 };
    return {
      id: m.id,
      stage: m.stage,
      group: m.grp,
      matchday: m.matchday,
      kickoff: m.kickoff_utc,
      status: m.status,
      home: m.home,
      homeCode: m.home_code,
      away: m.away,
      awayCode: m.away_code,
      homeScore: m.hg,
      awayScore: m.ag,
      mostCommonScore: ms.key,
      mostCommonScoreCount: ms.count,
      mostCommonResult: mr.key,
      mostCommonResultCount: mr.count,
      mostCommonTotal: g?.total ?? 0,
    };
  });
});

// One fixture + every entrant's prediction and the points it scores for this game.
app.get("/api/fixtures/:id", async (req: any, reply) => {
  const id = Number(req.params.id);
  const cfg = await loadConfig();
  const [m] = await sql`
    select m.id, m.stage, m.group_name grp, m.matchday, m.kickoff_utc, m.status,
           m.home_goals hg, m.away_goals ag, m.home_team_id mh,
           ht.name home, ht.tla home_code, at.name away, at.tla away_code
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    where m.id = ${id}
  `;
  if (!m) return reply.code(404).send({ error: "not found" });

  const played = m.status === "IN_PLAY" || m.status === "FINISHED";
  let board: any[] = [];
  if (m.stage === "GROUP") {
    const preds = await sql`
      select e.id eid, e.name, p.pred_home_team_id ph, p.pred_home_goals phg, p.pred_away_goals pag
      from predictions p join entrants e on e.id = p.entrant_id
      where p.match_id = ${id} and p.scope = 'MATCH'
    `;
    board = (preds as any[])
      .map((p) => {
        const predH = p.ph === m.mh ? p.phg : p.pag;
        const predA = p.ph === m.mh ? p.pag : p.phg;
        const b = played ? scoreGroupMatch(predH, predA, m.hg ?? 0, m.ag ?? 0, cfg) : null;
        const tier = b ? (b.exact ? "exact" : b.outcome ? "result" : (b.homeGoals || b.awayGoals) ? "diff" : "miss") : "miss";
        return { entrantId: p.eid, name: p.name, pick: `${predH}-${predA}`, points: b ? b.points : 0, tier };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }

  return {
    match: {
      id: m.id, stage: m.stage, group: m.grp, kickoff: m.kickoff_utc, status: m.status,
      home: m.home, homeCode: m.home_code, away: m.away, awayCode: m.away_code,
      homeScore: m.hg, awayScore: m.ag,
    },
    played,
    board,
  };
});

// Real World Cup group tables, computed from our finished group matches.
app.get("/api/wc-groups", async () => computeGroupStandings());

// Real World Cup knockout bracket: who qualifies into each game (group
// winners/runners-up projected from current standings).
app.get("/api/wc-knockout", async () => buildKnockout());

// Current scoring config (public read, for the settings form).
app.get("/api/scoring-config", async () => {
  const [row] = await sql`select config from scoring_config where id = 1`;
  return row?.config ?? DEFAULT_SCORING;
});

// --- Admin ---
// Update the scoring config, then re-score everyone with the new values.
app.put("/api/admin/scoring-config", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const parsed = ScoringConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: "invalid config", details: parsed.error.flatten() });
    return;
  }
  await sql`
    insert into scoring_config (id, config) values (1, ${JSON.stringify(parsed.data)}::jsonb)
    on conflict (id) do update set config = excluded.config
  `;
  const rescored = await recomputeAll();
  return { ok: true, config: parsed.data, rescored };
});

// Upload one entrant's filled spreadsheet (multipart: file + "name" field).
app.post("/api/admin/import-entrant", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  let name = "";
  let buffer: Buffer | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") buffer = await part.toBuffer();
    else if (part.fieldname === "name") name = String(part.value).trim();
  }
  if (!name) {
    reply.code(400).send({ error: "missing entrant name" });
    return;
  }
  if (!buffer) {
    reply.code(400).send({ error: "missing spreadsheet file" });
    return;
  }
  try {
    const result = await runImport(buffer, name);
    await recomputeAll();
    return result;
  } catch (e: any) {
    reply.code(400).send({ error: e.message });
  }
});

// Extract predictions from a photo for REVIEW (does not save).
app.post("/api/admin/extract-photo", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  let buffer: Buffer | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") buffer = await part.toBuffer();
  }
  if (!buffer) {
    reply.code(400).send({ error: "missing image" });
    return;
  }
  try {
    const extracted = await extractFromPhoto(buffer);
    const predictions = toPredictions(extracted);
    const unresolved = await checkUnresolved(predictions);
    return { name: extracted.name, predictions, unresolved };
  } catch (e: any) {
    reply.code(400).send({ error: e.message });
  }
});

// Save reviewed predictions (from photo or any source) for a named entrant.
app.post("/api/admin/save-predictions", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const { name, predictions } = req.body ?? {};
  if (!name || !Array.isArray(predictions)) {
    reply.code(400).send({ error: "name and predictions[] required" });
    return;
  }
  const result = await savePredictions(String(name).trim(), predictions);
  await recomputeAll();
  return result;
});

app.get("/api/entrants", async () => {
  return sql`
    select e.id, e.name, e.name_incomplete as "nameIncomplete",
      (select count(*)::int from predictions p where p.entrant_id = e.id) as predictions
    from entrants e order by e.name asc
  `;
});

app.patch("/api/admin/entrants/:id", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number(req.params.id);
  const body = req.body ?? {};
  if (typeof body.name === "string" && body.name.trim()) {
    await sql`update entrants set name = ${body.name.trim()} where id = ${id}`;
  }
  if (typeof body.incomplete === "boolean") {
    await sql`update entrants set name_incomplete = ${body.incomplete} where id = ${id}`;
  }
  return { ok: true };
});

app.delete("/api/admin/entrants/:id", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number(req.params.id);
  await sql`delete from scores where entrant_id = ${id}`;
  await sql`delete from predictions where entrant_id = ${id}`;
  await sql`delete from entrants where id = ${id}`;
  return { ok: true };
});

app.post("/api/admin/recompute", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const n = await recomputeAll();
  return { recomputed: n };
});

app.patch("/api/admin/matches/:id", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number(req.params.id);
  const { homeGoals, awayGoals, status } = req.body ?? {};
  await sql`
    update matches set home_goals = ${homeGoals ?? null}, away_goals = ${awayGoals ?? null},
      status = ${status ?? "FINISHED"}, result_overridden = true
    where id = ${id}
  `;
  await recomputeAll();
  return { ok: true };
});

// In production the same service serves the built React app. Registered after
// all /api routes so they take precedence; everything else falls back to the
// SPA's index.html for client-side routing.
const webDist = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) reply.code(404).send({ error: "not found" });
    else reply.sendFile("index.html");
  });
}

await app.listen({ port: PORT, host: "0.0.0.0" });
startPoller();
