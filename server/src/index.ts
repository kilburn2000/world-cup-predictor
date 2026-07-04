import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_SCORING } from "@wc/shared";
import { sql } from "./db/index.js";
import { fd, mapGroup, mapStage } from "./footballData.js";
import { recomputeAll, loadConfig } from "./score.js";
import { scoreGroupMatch, standingKey, knockoutGroupKey } from "@wc/shared";
import { getMatches as getEspnMatches } from "./espn.js";
import { dbNameMap, resolveEspn, liveEvents } from "./sync.js";
import { computeGroupStandings, buildKnockout, venueForSlot, GROUP_VENUES, predictedGroupStandings, PRED_SLOT_TO_MATCH } from "./wc.js";
import { topScorerStandings, eventsForMatches, matchEvents, topScorerTrend } from "./scorers.js";
import { loginByEmail, userForToken, deleteSession, hashPassword, SESSION_COOKIE, type SessionUser } from "./auth.js";
import { runImport, savePredictions, checkUnresolved, diffAgainstCurrent } from "./importSheet.js";
import { REUPLOAD_2026_06_16 } from "./reupload_2026_06_16.js";
import { extractFromPhoto, toPredictions } from "./photoImport.js";
import { startPoller } from "./poller.js";

const ScoringConfigSchema = z.object({
  outcome: z.number().int().min(0).max(1000),
  drawOutcome: z.number().int().min(0).max(1000),
  teamGoals: z.number().int().min(0).max(1000),
  exactBonus: z.number().int().min(0).max(1000),
  knockoutTeam: z.number().int().min(0).max(1000),
});

const PORT = Number(process.env.PORT ?? 8790);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
await app.register(cookie);

// Attach the logged-in user (from the session cookie) to every request.
app.addHook("preHandler", async (req: any) => {
  req.user = await userForToken(req.cookies?.[SESSION_COOKIE]);
});

function requireAdmin(req: any, reply: any): boolean {
  if (!req.user?.isAdmin) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

function setSessionCookie(reply: any, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

app.get("/api/health", async () => ({ ok: true }));

// --- Auth: email + password, httpOnly session cookie ---
app.post("/api/login", async (req: any, reply) => {
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return reply.code(400).send({ error: "Email and password required" });
  const token = await loginByEmail(email, password);
  if (!token) return reply.code(401).send({ error: "Invalid email or password" });
  setSessionCookie(reply, token);
  return { user: await userForToken(token) };
});

app.post("/api/logout", async (req: any, reply) => {
  await deleteSession(req.cookies?.[SESSION_COOKIE]);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

// The current user (null if not logged in).
app.get("/api/me", async (req: any) => ({ user: (req.user as SessionUser) ?? null }));

// The "current football day" (a host-country / Pacific date). Unlike a calendar
// rollover at midnight, it stays on today's slate until the day's LAST game has
// finished, then advances - so a game that ends in the small hours doesn't flip
// the app to "tomorrow" while it's still being talked about, and the morning
// after, the just-played slate reads as "yesterday". Defined as the earliest
// host-day that still has an unfinished game (or the final day once it's all
// over). Used for the Yesterday/Today/Tomorrow buckets and their date labels.
const CURRENT_DAY = sql`(
  select coalesce(
    min((kickoff_utc at time zone 'America/Los_Angeles')::date) filter (where status <> 'FINISHED'),
    max((kickoff_utc at time zone 'America/Los_Angeles')::date)
  )
  from matches where kickoff_utc is not null
)`;

// Order-independent key for a fixture's two DB team ids - how the ESPN feed is
// aligned to our fixtures across every live view.
const pairKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");

// Live minute per fixture (keyed by team-id pair) from the ESPN feed, so the
// live form chips' tooltips can show the minute like the standings do. One ESPN
// pass, shared by both in-play builders; callers that don't need minutes pass an
// empty map instead of paying for the fetch. dbNameMap is a DB read left outside
// the try so a genuine DB failure surfaces - only the ESPN feed is optional.
async function espnPairMinutes(): Promise<Map<string, number>> {
  const byPair = new Map<string, number>();
  const byNorm = await dbNameMap();
  try {
    for (const e of await getEspnMatches()) {
      const h = resolveEspn(e.home, byNorm);
      const a = resolveEspn(e.away, byNorm);
      if (h && a && e.minute != null) byPair.set(pairKey(h, a), e.minute);
    }
  } catch { /* ESPN feed unavailable - no minutes */ }
  return byPair;
}

// Provisional points from group matches IN PLAY right now - so everything moves
// mid-game. Returns entrantId -> list of their in-play games with the breakdown.
interface LiveFormGame {
  matchday: number; group: string; kickoff: any; points: number; exact: boolean; outcome: boolean;
  // enough to render a form chip + tooltip, like a finished game (FormGame shape)
  home: string; away: string; homeName: string; awayName: string;
  hs: number; as: number; predHome: number; predAway: number; tier: string; minute: number | null;
}
async function inPlayProvisional(minutes: Map<string, number>) {
  const cfg = await loadConfig();
  const liveMatches = (await sql`
    select m.id, m.matchday, m.group_name grp, m.home_team_id mh, m.away_team_id ma, m.home_goals hg, m.away_goals ag, m.kickoff_utc,
           ht.tla hcode, at.tla acode, ht.name hname, at.name aname
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.stage = 'GROUP' and m.status = 'IN_PLAY' and m.home_goals is not null and m.away_goals is not null
  `) as any[];
  const map = new Map<number, LiveFormGame[]>();
  if (!liveMatches.length) return map;
  const ids = liveMatches.map((m) => m.id);
  const byMatch = new Map(liveMatches.map((m) => [m.id, m]));
  const preds = (await sql`
    select entrant_id, match_id, pred_home_team_id ph, pred_home_goals phg, pred_away_goals pag
    from predictions where scope = 'MATCH' and match_id in ${sql(ids)}
  `) as any[];
  for (const p of preds) {
    const m = byMatch.get(p.match_id);
    if (!m) continue;
    const predH = p.ph === m.mh ? p.phg : p.pag;
    const predA = p.ph === m.mh ? p.pag : p.phg;
    const b = scoreGroupMatch(predH, predA, m.hg, m.ag, cfg);
    const tier = b.exact ? "exact" : b.outcome ? "result" : b.homeGoals || b.awayGoals ? "diff" : "miss";
    const arr = map.get(p.entrant_id) ?? [];
    arr.push({
      matchday: m.matchday, group: m.grp, kickoff: m.kickoff_utc, points: b.points, exact: b.exact, outcome: b.outcome,
      home: m.hcode, away: m.acode, homeName: m.hname, awayName: m.aname,
      hs: m.hg, as: m.ag, predHome: predH, predAway: predA, tier, minute: minutes.get(pairKey(m.mh, m.ma)) ?? null,
    });
    map.set(p.entrant_id, arr);
  }
  return map;
}

// A live in-play game rendered as a form chip (FormGame shape + live flag).
const liveFormGame = (x: LiveFormGame) => ({
  points: x.points, tier: x.tier, home: x.home, away: x.away, homeName: x.homeName, awayName: x.awayName,
  hs: x.hs, as: x.as, predHome: x.predHome, predAway: x.predAway, minute: x.minute, live: true,
});

// In-play KNOCKOUT ties, per entrant, for the live form chip + total. Unlike the
// group path, knockout points are already written to the scores table for IN_PLAY
// ties (the live column reads them), so we surface the STORED points here as a
// live delta - the caller records them in `live` (so the client can strip them and
// re-add the fresh feed figure) but does NOT re-add them to the base total. Carries
// the actual teams + live score; the caller enriches with the entrant's own picks.
async function inPlayKnockout(minutes: Map<string, number>) {
  const rows = (await sql`
    select m.id, m.stage, m.matchday, m.home_team_id mh, m.away_team_id ma, m.home_goals hg, m.away_goals ag,
           ht.tla hcode, at.tla acode, ht.name hname, at.name aname
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.stage <> 'GROUP' and m.status = 'IN_PLAY' and m.home_goals is not null and m.away_goals is not null
  `) as any[];
  const map = new Map<number, any[]>();
  if (!rows.length) return map;
  const byMatch = new Map<number, any>(rows.map((m) => [m.id, m]));
  const ids = rows.map((m) => m.id);
  const scoreRows = (await sql`
    select entrant_id eid, ref, points, breakdown bd from scores
    where kind = 'KNOCKOUT' and split_part(ref, ':', 2)::int in ${sql(ids)}
  `) as any[];
  for (const s of scoreRows) {
    const m = byMatch.get(Number(s.ref.split(":")[1]));
    if (!m) continue;
    const sl = (s.bd ?? {}).scoreline ?? {};
    const tier = sl.exact ? "exact" : sl.outcome ? "result" : sl.homeGoals || sl.awayGoals ? "diff" : "miss";
    const arr = map.get(s.eid) ?? [];
    arr.push({
      matchNo: m.id, stage: m.stage, matchday: m.matchday, points: s.points, tier,
      home: m.hcode, away: m.acode, homeName: m.hname, awayName: m.aname, hs: m.hg, as: m.ag, minute: minutes.get(pairKey(m.mh, m.ma)) ?? null,
    });
    map.set(s.eid, arr);
  }
  return map;
}

// Live leaderboard for the (single) default league. Includes in-play provisional
// points so the overall standings (and everything built on them) move mid-game.
app.get("/api/leaderboard", async () => {
  const rows = (await sql`
    select e.id as "entrantId", e.name, e.name_incomplete as "nameIncomplete",
           coalesce(sum(case when m.stage = 'GROUP' and m.matchday = 1 then s.points end), 0)::int as week1,
           coalesce(sum(case when m.stage = 'GROUP' and m.matchday = 2 then s.points end), 0)::int as week2,
           coalesce(sum(case when m.stage = 'GROUP' and m.matchday = 3 then s.points end), 0)::int as week3,
           coalesce(sum(case when m.stage = 'LAST_32' then s.points end), 0)::int as r32,
           coalesce(sum(case when m.stage = 'LAST_16' then s.points end), 0)::int as r16,
           coalesce(sum(case when coalesce((s.breakdown->>'exact')::boolean, false) or coalesce((s.breakdown->'scoreline'->>'exact')::boolean, false) then 1 else 0 end), 0)::int as "exactCount",
           coalesce(sum(case when coalesce((s.breakdown->>'outcome')::boolean, false) or coalesce((s.breakdown->'scoreline'->>'outcome')::boolean, false) then 1 else 0 end), 0)::int as "resultCount",
           coalesce(sum(s.points), 0)::int as total
    from entrants e
    left join scores s on s.entrant_id = e.id
    left join matches m on s.ref like 'match:%' and m.id = split_part(s.ref, ':', 2)::int
    group by e.id, e.name, e.name_incomplete
  `) as any[];

  const minutes = await espnPairMinutes();
  const live = await inPlayProvisional(minutes);
  const liveKo = await inPlayKnockout(minutes);
  if (live.size || liveKo.size) {
    for (const r of rows) {
      const games = live.get(r.entrantId) ?? [];
      const koGames = liveKo.get(r.entrantId) ?? [];
      if (!games.length && !koGames.length) continue;
      // Also expose the live delta on its own so the client can recompute the
      // tally from the (faster, ESPN-fresh) /api/live feed and keep the points
      // column in lockstep with the live chips.
      const lv = { total: 0, week1: 0, week2: 0, week3: 0, r32: 0, r16: 0, exact: 0, result: 0 };
      for (const g of games) {
        lv.total += g.points;
        if (g.exact) lv.exact += 1;
        if (g.outcome) lv.result += 1;
        if (g.matchday === 1) lv.week1 += g.points;
        else if (g.matchday === 2) lv.week2 += g.points;
        else if (g.matchday === 3) lv.week3 += g.points;
      }
      // Group in-play points aren't in the stored base, so fold them into the tally.
      r.total += lv.total;
      r.exactCount += lv.exact;
      r.resultCount += lv.result;
      r.week1 += lv.week1;
      r.week2 += lv.week2;
      r.week3 += lv.week3;
      // Knockout in-play points ARE already in the stored base (total + r32/r16),
      // so DON'T re-add them - only record them in the live delta so the client
      // strips the server figure and re-adds the fresh live-feed one (no double count).
      for (const g of koGames) {
        lv.total += g.points;
        if (g.stage === "LAST_32") lv.r32 += g.points;
        else if (g.stage === "LAST_16") lv.r16 += g.points;
      }
      r.live = lv;
    }
  }
  // Each entrant's last up-to-5 finished games (chronological), for a form column.
  // Carries enough to render a per-game tooltip: the fixture, their pick, the
  // actual score and what it scored on.
  const recent = (await sql`
    select s.entrant_id eid, s.points pts, s.breakdown bd, m.kickoff_utc ko, m.stage, m.matchday, m.bracket_slot slot, m.id "matchId",
           ht.tla hcode, at.tla acode, ht.name hname, at.name aname, m.home_goals hg, m.away_goals ag,
           m.home_goals_90 hg90, m.away_goals_90 ag90,
           p.pred_home_goals phg, p.pred_away_goals pag
    from scores s
    join matches m on m.status = 'FINISHED' and s.ref = 'match:' || m.id
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    left join predictions p on p.entrant_id = s.entrant_id and p.match_id = m.id and p.scope = 'MATCH'
  `) as any[];
  // Knockout predictions are scope='SLOT' (not by match id), and their slot label
  // differs from the fixture's, so index each entrant's SLOT picks - teams + score -
  // to render the form tooltip for finished knockout games.
  const slotPreds = (await sql`
    select p.entrant_id eid, p.bracket_slot slot, ht.tla hcode, at.tla acode, ht.name hname, at.name aname,
           p.pred_home_goals phg, p.pred_away_goals pag
    from predictions p
    join teams ht on ht.id = p.pred_home_team_id
    join teams at on at.id = p.pred_away_team_id
    where p.scope = 'SLOT'
  `) as any[];
  // Index each entrant's SLOT picks by the FIXTURE (FIFA match number) they map to,
  // using the SAME per-entrant mapping the bracket uses - so the form tooltip and the
  // predicted-bracket tab are one source of truth.
  const koByEntrant = new Map<number, Map<number, any>>();
  for (const p of slotPreds) {
    const matchNo = PRED_SLOT_TO_MATCH[p.slot] ?? null;
    if (matchNo == null) continue;
    if (!koByEntrant.has(p.eid)) koByEntrant.set(p.eid, new Map());
    koByEntrant.get(p.eid)!.set(matchNo, p);
  }
  const mkGame = (x: any) => {
    const bd = x.bd ?? {};
    const tier = bd.exact ? "exact" : bd.outcome ? "result" : bd.homeGoals || bd.awayGoals ? "diff" : "miss";
    // Knockout: the entrant's own predicted teams + score for THIS fixture, matched
    // by the per-entrant slot->fixture mapping (not the raw slot label).
    const ko = x.stage !== "GROUP" ? koByEntrant.get(x.eid)?.get(x.matchId) : null;
    return {
      points: x.pts, tier,
      home: x.hcode, away: x.acode,
      homeName: x.hname, awayName: x.aname,
      hs: x.hg, as: x.ag,
      // the after-90-minutes score (what knockout scoring uses); null for group games
      // and equal to hs/as unless the tie went to extra time.
      hs90: x.hg90 ?? x.hg, as90: x.ag90 ?? x.ag,
      predHome: ko ? ko.phg : x.phg, predAway: ko ? ko.pag : x.pag,
      predHomeCode: ko ? ko.hcode : null, predAwayCode: ko ? ko.acode : null,
      predHomeTeam: ko ? ko.hname : null, predAwayTeam: ko ? ko.aname : null,
    };
  };
  // Which standings phase a finished game belongs to (mirrors the week/r32/r16 tabs).
  const phaseOf = (x: any): string | null =>
    x.stage === "GROUP" ? (x.matchday >= 1 && x.matchday <= 3 ? `week${x.matchday}` : null)
    : x.stage === "LAST_32" ? "r32"
    : x.stage === "LAST_16" ? "r16"
    : null;
  const recentByEntrant = new Map<number, any[]>();
  for (const x of recent) {
    if (!recentByEntrant.has(x.eid)) recentByEntrant.set(x.eid, []);
    recentByEntrant.get(x.eid)!.push(x);
  }
  for (const r of rows as any[]) {
    const list = (recentByEntrant.get(r.entrantId) ?? []).sort((a, b) => (a.ko < b.ko ? -1 : a.ko > b.ko ? 1 : 0));
    // Append any in-play game(s) as the most recent form entries, so the form
    // column moves live alongside the points - flagged so the chip reads as live.
    const liveGames = (live.get(r.entrantId) ?? []).map(liveFormGame);
    // Live knockout ties, enriched with THIS entrant's predicted teams (from the
    // same per-entrant slot->fixture mapping) so the tooltip's KoOutcomeChip shows
    // which teams they placed right - one source of truth with the bracket.
    const liveKoGames = (liveKo.get(r.entrantId) ?? []).map((x) => {
      const ko = koByEntrant.get(r.entrantId)?.get(x.matchNo);
      return {
        stage: x.stage, points: x.points, tier: x.tier,
        home: x.home, away: x.away, homeName: x.homeName, awayName: x.awayName, hs: x.hs, as: x.as,
        predHome: ko?.phg ?? 0, predAway: ko?.pag ?? 0,
        predHomeCode: ko?.hcode ?? null, predAwayCode: ko?.acode ?? null,
        predHomeTeam: ko?.hname ?? null, predAwayTeam: ko?.aname ?? null,
        minute: x.minute, live: true,
      };
    });
    r.last5 = [...list.slice(-5).map(mkGame), ...liveGames, ...liveKoGames].slice(-5);
    // Per-phase form + tiebreak stats: each entrant's last up-to-5 finished games
    // within each week/round (for the form column) and that phase's exact/result
    // counts (so the week-by-week tables can break ties the same way Overall does).
    const byPhase: Record<string, any[]> = {};
    const statsByPhase: Record<string, { exact: number; result: number }> = {};
    for (const x of list) {
      const ph = phaseOf(x);
      if (!ph) continue;
      (byPhase[ph] = byPhase[ph] ?? []).push(x);
      const st = (statsByPhase[ph] = statsByPhase[ph] ?? { exact: 0, result: 0 });
      const bd = x.bd ?? {};
      // group games flag exact/outcome at the top level; knockout games nest them
      // under scoreline (the correct SCORE regardless of the teams) - count both.
      if (bd.exact || bd.scoreline?.exact) st.exact++;
      if (bd.outcome || bd.scoreline?.outcome) st.result++;
    }
    r.formByPhase = Object.fromEntries(Object.entries(byPhase).map(([k, v]) => [k, v.slice(-5).map(mkGame)]));
    // Live game also belongs to its week's form column (week1/2/3).
    for (const lg of live.get(r.entrantId) ?? []) {
      const ph = `week${lg.matchday}`;
      const arr = (r.formByPhase[ph] = r.formByPhase[ph] ?? []);
      arr.push(liveFormGame(lg));
      if (arr.length > 5) arr.splice(0, arr.length - 5);
    }
    // Live knockout tie also belongs to its round's form column (r32/r16).
    for (const g of liveKoGames) {
      const ph = g.stage === "LAST_32" ? "r32" : g.stage === "LAST_16" ? "r16" : null;
      if (!ph) continue;
      const arr = (r.formByPhase[ph] = r.formByPhase[ph] ?? []);
      arr.push(g);
      if (arr.length > 5) arr.splice(0, arr.length - 5);
    }
    r.statsByPhase = statsByPhase;
  }
  rows.sort((a, b) => standingKey(b.total, b.exactCount, b.resultCount) - standingKey(a.total, a.exactCount, a.resultCount) || a.name.localeCompare(b.name));
  return rows;
});

// Which scoring phases have kicked off (any game no longer SCHEDULED). Used by
// the standings to show "0" rather than "–" once a week is under way.
app.get("/api/phases", async () => {
  // A phase counts as "started" once its own games kick off OR the previous phase
  // is fully finished - so week 2 opens the moment week 1 ends, week 3 when week 2
  // ends, the knockout when the group stage ends, etc. "done" = every game in that
  // phase finished (prizes lock in then).
  const [r] = await sql`
    with p as (
      select
        coalesce(bool_or(stage = 'GROUP'   and matchday = 1 and status <> 'SCHEDULED'), false) as w1_started,
        coalesce(bool_or(stage = 'GROUP'   and matchday = 2 and status <> 'SCHEDULED'), false) as w2_started,
        coalesce(bool_or(stage = 'GROUP'   and matchday = 3 and status <> 'SCHEDULED'), false) as w3_started,
        coalesce(bool_or(stage = 'LAST_32' and status <> 'SCHEDULED'), false) as r32_started,
        coalesce(bool_or(stage = 'LAST_16' and status <> 'SCHEDULED'), false) as r16_started,
        coalesce(bool_and(status = 'FINISHED') filter (where stage = 'GROUP'   and matchday = 1), false) as w1_done,
        coalesce(bool_and(status = 'FINISHED') filter (where stage = 'GROUP'   and matchday = 2), false) as w2_done,
        coalesce(bool_and(status = 'FINISHED') filter (where stage = 'GROUP'   and matchday = 3), false) as w3_done,
        coalesce(bool_and(status = 'FINISHED') filter (where stage = 'LAST_32'), false) as r32_done,
        coalesce(bool_and(status = 'FINISHED') filter (where stage = 'LAST_16'), false) as r16_done,
        coalesce(bool_and(status = 'FINISHED'), false) as all_done
      from matches
    )
    select
      w1_started as week1,
      (w1_done or w2_started) as week2,
      (w2_done or w3_started) as week3,
      (w3_done or r32_started) as r32,
      (r32_done or r16_started) as r16,
      w1_done as "week1Done",
      w2_done as "week2Done",
      w3_done as "week3Done",
      r32_done as "r32Done",
      r16_done as "r16Done",
      r32_started as "r32Started",
      r16_started as "r16Started",
      all_done as done,
      to_char(${CURRENT_DAY}, 'YYYY-MM-DD') as "currentDay"
    from p
  `;
  return r;
});

// Top Scorer side competition: each entrant's player pair + combined goals.
app.get("/api/top-scorer", async () => topScorerStandings());

// Position trend: an entrant's per-game points + running rank over time, scoped to
// one competition (overall / a week / a round / their knockout group). One finished
// game per point, in kickoff order, carrying enough to render a form-style chip +
// tooltip and to plot the entrant's rank after that game. Ties share a rank.
app.get("/api/entrants/:id/trend", async (req: any, reply) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return reply.code(400).send({ error: "Bad id" });
  const scope = String(req.query?.scope ?? "overall");
  // Top Scorer ranks by goals, not prediction points - its own (goals) builder.
  if (scope === "topscorer") {
    const t = await topScorerTrend(id);
    return t ?? reply.code(404).send({ error: "Unknown entrant" });
  }
  const [ent] = await sql`select name, entrant_group grp from entrants where id = ${id}`;
  if (!ent) return reply.code(404).send({ error: "Unknown entrant" });

  // scope -> which finished games make up the timeline
  const filters: Record<string, any> = {
    overall: sql`m.status = 'FINISHED'`,
    week1: sql`m.status = 'FINISHED' and m.stage = 'GROUP' and m.matchday = 1`,
    week2: sql`m.status = 'FINISHED' and m.stage = 'GROUP' and m.matchday = 2`,
    week3: sql`m.status = 'FINISHED' and m.stage = 'GROUP' and m.matchday = 3`,
    r32: sql`m.status = 'FINISHED' and m.stage = 'LAST_32'`,
    r16: sql`m.status = 'FINISHED' and m.stage = 'LAST_16'`,
    knockout: sql`m.status = 'FINISHED' and m.stage = 'GROUP' and m.group_name = ${ent.grp}`,
  };
  const mf = filters[scope];
  if (!mf) return reply.code(400).send({ error: "Bad scope" });
  // who is in the ranking field: the whole league, or just this entrant's WC group
  const fieldFilter = scope === "knockout" ? sql`e.entrant_group = ${ent.grp}` : sql`true`;

  // timeline games, chronological
  const games = (await sql`
    select m.id, m.kickoff_utc ko, m.stage, m.matchday, ht.name home, ht.tla hcode, at.name away, at.tla acode,
           m.home_goals hg, m.away_goals ag
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where ${mf}
    order by m.kickoff_utc asc, m.id asc
  `) as any[];
  // short phase label per game, used to draw the week/round breaks on the chart
  const phaseLabel = (stage: string, md: number | null) =>
    stage === "GROUP" ? `Week ${md}` : stage === "LAST_32" ? "R32" : stage === "LAST_16" ? "R16"
    : stage === "LAST_8" ? "QF" : stage === "LAST_4" ? "SF" : stage === "FINAL" ? "Final" : stage;
  if (!games.length) return { scope, fieldSize: 0, points: [] };

  // every field entrant's points per timeline game (for the running cumulative + rank)
  const pts = (await sql`
    select s.entrant_id eid, m.id mid, s.points
    from scores s
    join entrants e on e.id = s.entrant_id
    join matches m on m.id = split_part(s.ref, ':', 2)::int and ${mf}
    where s.kind = 'MATCH' and ${fieldFilter}
  `) as any[];

  // the clicked entrant's per-game breakdown + prediction (chip tier + tooltip)
  const mine = (await sql`
    select m.id mid, s.points, s.breakdown bd, p.pred_home_goals phg, p.pred_away_goals pag
    from scores s
    join matches m on m.id = split_part(s.ref, ':', 2)::int and ${mf}
    left join predictions p on p.entrant_id = ${id} and p.match_id = m.id and p.scope = 'MATCH'
    where s.kind = 'MATCH' and s.entrant_id = ${id}
  `) as any[];

  const fieldEnts = (await sql`select e.id from entrants e where ${fieldFilter}`) as any[];
  const cum = new Map<number, number>(fieldEnts.map((e) => [e.id, 0]));
  const ptsByGame = new Map<number, Map<number, number>>();
  for (const r of pts) {
    let g = ptsByGame.get(r.mid);
    if (!g) ptsByGame.set(r.mid, (g = new Map()));
    g.set(r.eid, r.points);
  }
  const mineByGame = new Map<number, any>(mine.map((r) => [r.mid, r]));

  const out: any[] = [];
  for (const g of games) {
    const gp = ptsByGame.get(g.id);
    if (gp) for (const [eid, p] of gp) cum.set(eid, (cum.get(eid) ?? 0) + p);
    const my = mineByGame.get(g.id);
    if (!my) continue; // entrant wasn't scored on this game (no prediction)
    const myCum = cum.get(id) ?? 0;
    let rank = 1;
    for (const [eid, c] of cum) if (eid !== id && c > myCum) rank++;
    const bd = my.bd ?? {};
    const tier = bd.exact ? "exact" : bd.outcome ? "result" : bd.homeGoals || bd.awayGoals ? "diff" : "miss";
    out.push({
      matchId: g.id, kickoff: g.ko, phase: phaseLabel(g.stage, g.matchday),
      home: g.home, away: g.away, homeCode: g.hcode, awayCode: g.acode,
      hs: g.hg, as: g.ag, predHome: my.phg, predAway: my.pag,
      points: my.points, tier, cumulative: myCum, rank,
    });
  }
  return { scope, entrant: ent.name, fieldSize: fieldEnts.length, points: out };
});

// Admin: list all tracked players with their feed + manual goal tallies.
app.get("/api/admin/scorer-players", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  return await sql`
    select id, name, country, feed_goals as "feedGoals", manual_goals as "manualGoals",
           coalesce(manual_goals, feed_goals) as goals
    from scorer_players order by name
  `;
});

// Admin: set (or clear, with null) a player's manual goal override.
app.patch("/api/admin/scorer-players/:id", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number(req.params.id);
  const raw = req.body?.manualGoals;
  const manual = raw === null || raw === undefined || raw === "" ? null : Math.max(0, Math.trunc(Number(raw)));
  await sql`update scorer_players set manual_goals = ${manual} where id = ${id}`;
  return { ok: true };
});

// The "Everyone" consensus: a virtual entrant who, for every game, picks the
// most-predicted scoreline (and most-predicted result for the outcome point),
// scored live. Not a real entrant - only shown as a toggle-on comparison in the
// standings, never in stats or prizes.
app.get("/api/consensus", async () => {
  const cfg = await loadConfig();
  const matches = (await sql`
    select id, matchday, home_team_id mh, home_goals hg, away_goals ag
    from matches
    where stage = 'GROUP' and status in ('FINISHED', 'IN_PLAY') and home_goals is not null and away_goals is not null
  `) as any[];
  const out = { name: "Everyone", week1: 0, week2: 0, week3: 0, r32: 0, r16: 0, total: 0 };
  if (!matches.length) return out;

  const ids = matches.map((m) => m.id);
  const byMatch = new Map(matches.map((m) => [m.id, m]));
  const preds = (await sql`
    select match_id mid, pred_home_team_id ph, pred_home_goals phg, pred_away_goals pag
    from predictions where scope = 'MATCH' and match_id in ${sql(ids)}
  `) as any[];
  const agg = new Map<number, { score: Map<string, number>; res: { HOME: number; DRAW: number; AWAY: number } }>();
  for (const p of preds) {
    const m = byMatch.get(p.mid);
    if (!m) continue;
    const h = p.ph === m.mh ? p.phg : p.pag;
    const a = p.ph === m.mh ? p.pag : p.phg;
    let g = agg.get(p.mid);
    if (!g) agg.set(p.mid, (g = { score: new Map(), res: { HOME: 0, DRAW: 0, AWAY: 0 } }));
    g.score.set(`${h}-${a}`, (g.score.get(`${h}-${a}`) ?? 0) + 1);
    g.res[h > a ? "HOME" : h < a ? "AWAY" : "DRAW"]++;
  }

  const wk = [0, 0, 0, 0];
  for (const m of matches) {
    const g = agg.get(m.id);
    if (!g) continue;
    let bestScore = "0-0", bc = 0;
    for (const [k, c] of g.score) if (c > bc) { bestScore = k; bc = c; }
    const [ch, ca] = bestScore.split("-").map(Number);
    const cRes = (["HOME", "DRAW", "AWAY"] as const).reduce((x, y) => (g.res[y] > g.res[x] ? y : x));
    const actRes = m.hg > m.ag ? "HOME" : m.hg < m.ag ? "AWAY" : "DRAW";
    let pts = 0;
    const exact = ch === m.hg && ca === m.ag;
    if (cRes === actRes) pts += actRes === "DRAW" && !exact ? cfg.drawOutcome : cfg.outcome;
    if (ch === m.hg) pts += cfg.teamGoals;
    if (ca === m.ag) pts += cfg.teamGoals;
    if (exact) pts += cfg.exactBonus;
    wk[m.matchday] += pts;
  }
  out.week1 = wk[1]; out.week2 = wk[2]; out.week3 = wk[3];
  out.total = wk[1] + wk[2] + wk[3];
  return out;
});

// Fun stats for the standings - leaders by various measures, with ties as
// "name + N others".
app.get("/api/stats", async () => {
  const rows = (await sql`
    select e.id as eid, e.name,
      count(*) filter (where (s.breakdown->>'exact')::boolean)::int as exact_cnt,
      count(*) filter (where (s.breakdown->>'outcome')::boolean)::int as outcome_cnt
    from entrants e
    left join scores s on s.entrant_id = e.id and s.kind = 'MATCH'
    group by e.id, e.name
  `) as any[];

  // fold in IN-PLAY games so the stats move mid-game too (stats ignore the live
  // minute, so skip the ESPN fetch and pass an empty minutes map)
  const live = await inPlayProvisional(new Map());
  for (const r of rows) {
    for (const g of live.get(r.eid) ?? []) {
      if (g.exact) r.exact_cnt++;
      if (g.outcome) r.outcome_cnt++;
    }
  }

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
  // extend each entrant's run with their IN-PLAY games (latest by kickoff)
  for (const [eid, games] of live) {
    let st = streak.get(eid);
    if (!st) streak.set(eid, (st = { name: rows.find((r) => r.eid === eid)?.name ?? "", exCur: 0, exMax: 0, reCur: 0, reMax: 0 }));
    for (const g of [...games].sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1))) {
      if (g.exact) { st.exCur++; if (st.exCur > st.exMax) st.exMax = st.exCur; } else st.exCur = 0;
      if (g.outcome) { st.reCur++; if (st.reCur > st.reMax) st.reMax = st.reCur; } else st.reCur = 0;
    }
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
// Entrant-group ties that were settled arbitrarily on the day (a nominated match's
// scores), which the usual overall-total tiebreak can't reproduce. Hardcoded winner
// beats loser whenever they're level on group points. [winnerName, loserName].
const GROUP_TIEBREAK: [string, string][] = [
  ["[redacted]", "[redacted]"],
  ["[redacted]", "[redacted]"],
];
const groupTieOverride = (aName: string, bName: string): number => {
  for (const [w, l] of GROUP_TIEBREAK) {
    if (aName === w && bName === l) return -1;
    if (aName === l && bName === w) return 1;
  }
  return 0;
};

// World Cup group's fixtures (entrant Group A ⇒ WC Group A games, etc.), split by
// matchday (Week 1/2/3) + total. Ranked by total; top 2 qualify.
app.get("/api/groups", async () => {
  const cfg = await loadConfig();
  const rows = (await sql`
    select e.id as "entrantId", e.name, e.name_incomplete as "nameIncomplete", e.entrant_group as grp,
           coalesce(sum(case when m.matchday = 1 then s.points end), 0)::int as week1,
           coalesce(sum(case when m.matchday = 2 then s.points end), 0)::int as week2,
           coalesce(sum(case when m.matchday = 3 then s.points end), 0)::int as week3,
           coalesce(sum(case when m.id is not null then s.points end), 0)::int as total,
           (select coalesce(sum(sc.points), 0)::int from scores sc where sc.entrant_id = e.id) as "overallTotal"
    from entrants e
    left join scores s on s.entrant_id = e.id and s.kind = 'MATCH'
    left join matches m on m.id = split_part(s.ref, ':', 2)::int
                       and m.stage = 'GROUP' and m.group_name = e.entrant_group
    where e.entrant_group is not null
    group by e.id, e.name, e.name_incomplete, e.entrant_group
  `) as any[];
  const entrantGroup = new Map(rows.map((r) => [r.entrantId, r.grp]));

  // provisional points from IN-PLAY group games - but still only the entrant's
  // own WC group counts toward their knockout-competition score.
  const liveMatches = await sql`
    select m.id, m.matchday, m.group_name grp, m.home_team_id mh, m.home_goals hg, m.away_goals ag,
           ht.tla hcode, at.tla acode, ht.name hname, at.name aname
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.stage = 'GROUP' and m.status = 'IN_PLAY' and m.home_goals is not null and m.away_goals is not null
  `;
  const live = new Map<number, { w: [number, number, number, number]; total: number; games: any[] }>();
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
      const b = scoreGroupMatch(predH, predA, m.hg, m.ag, cfg);
      const tier = b.exact ? "exact" : b.outcome ? "result" : b.homeGoals || b.awayGoals ? "diff" : "miss";
      const cur = live.get(p.entrant_id) ?? { w: [0, 0, 0, 0], total: 0, games: [] };
      cur.w[m.matchday] = (cur.w[m.matchday] ?? 0) + b.points;
      cur.total += b.points;
      cur.games.push({
        points: b.points, tier, home: m.hcode, away: m.acode, homeName: m.hname, awayName: m.aname,
        hs: m.hg, as: m.ag, predHome: predH, predAway: predA, live: true,
      });
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

  // Group-filtered form: each entrant's last up-to-5 finished games IN THEIR OWN
  // WC group - the only fixtures that count toward this competition. Carries
  // enough to render the same per-game tooltip as the overall standings.
  const recent = (await sql`
    select s.entrant_id eid, s.points pts, s.breakdown bd, m.kickoff_utc ko,
           ht.tla hcode, at.tla acode, ht.name hname, at.name aname, m.home_goals hg, m.away_goals ag,
           p.pred_home_goals phg, p.pred_away_goals pag
    from scores s
    join entrants e on e.id = s.entrant_id
    join matches m on m.status = 'FINISHED' and m.stage = 'GROUP'
                  and m.group_name = e.entrant_group and s.ref = 'match:' || m.id
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    left join predictions p on p.entrant_id = s.entrant_id and p.match_id = m.id and p.scope = 'MATCH'
  `) as any[];
  const recentBy = new Map<number, any[]>();
  for (const x of recent) {
    if (!recentBy.has(x.eid)) recentBy.set(x.eid, []);
    recentBy.get(x.eid)!.push(x);
  }
  for (const r of rows) {
    const list = (recentBy.get(r.entrantId) ?? []).sort((a, b) => (a.ko < b.ko ? -1 : a.ko > b.ko ? 1 : 0));
    // Group-scoped tiebreak stats: exacts/results only on the entrant's own WC
    // group games (the only fixtures that count toward this competition).
    r.exactCount = list.filter((x) => x.bd?.exact).length;
    r.resultCount = list.filter((x) => x.bd?.outcome).length;
    const finished = list.slice(-5).map((x) => {
      const bd = x.bd ?? {};
      const tier = bd.exact ? "exact" : bd.outcome ? "result" : bd.homeGoals || bd.awayGoals ? "diff" : "miss";
      return {
        points: x.pts, tier,
        home: x.hcode, away: x.acode, homeName: x.hname, awayName: x.aname,
        hs: x.hg, as: x.ag, predHome: x.phg, predAway: x.pag,
      };
    });
    // Append any in-play game in the entrant's WC group as the most recent chip.
    r.last5 = [...finished, ...(live.get(r.entrantId)?.games ?? [])].slice(-5);
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
        .sort((a, b) => (b.total - a.total) || groupTieOverride(a.name, b.name) || knockoutGroupKey(b.total, b.overallTotal) - knockoutGroupKey(a.total, a.overallTotal) || a.name.localeCompare(b.name))
        .map((e, i) => ({ ...e, rank: i + 1, qualifying: i < 2 }));
      return { group, entrants };
    });
});

// The ENTRANT knockout bracket: the top 2 of each of the 8 entrant groups (16
// qualifiers) play a player-vs-player bracket alongside the real WC knockout rounds.
// Each tie is won by whoever scores the most in THAT WC round (tie-break: higher
// overall total). Computed on the fly - no persisted bracket.
const KO_ROUNDS = [
  { round: "R16", stage: "LAST_16", label: "Round of 16" },
  { round: "QF", stage: "QF", label: "Quarter-finals" },
  { round: "SF", stage: "SF", label: "Semi-finals" },
  { round: "FINAL", stage: "FINAL", label: "Final" },
] as const;
// R16 seeding by group seed: winner of A v runner-up of B, runner-up of A v winner of B, ...
const KO_R16_SEEDS: [string, string][] = [
  ["W-A", "RU-B"], ["RU-A", "W-B"], ["W-C", "RU-D"], ["RU-C", "W-D"],
  ["W-E", "RU-F"], ["RU-E", "W-F"], ["W-G", "RU-H"], ["RU-G", "W-H"],
];

app.get("/api/entrant-knockout", async () => {
  const rows = (await sql`
    select e.id eid, e.name, e.entrant_group grp,
      coalesce(sum(case when m.stage = 'GROUP' and m.group_name = e.entrant_group then s.points end), 0)::int as grp_pts,
      coalesce(sum(s.points), 0)::int as overall
    from entrants e
    left join scores s on s.entrant_id = e.id
    left join matches m on m.id = split_part(s.ref, ':', 2)::int
    where e.entrant_group is not null
    group by e.id, e.name, e.entrant_group
  `) as any[];
  const stageRows = (await sql`
    select s.entrant_id eid, m.stage, coalesce(sum(s.points), 0)::int pts
    from scores s join matches m on m.id = split_part(s.ref, ':', 2)::int
    where m.stage in ('LAST_16', 'QF', 'SF', 'FINAL')
    group by s.entrant_id, m.stage
  `) as any[];
  const stagePts = new Map<string, number>();
  for (const r of stageRows) stagePts.set(`${r.eid}:${r.stage}`, r.pts);
  const stageStatus = (await sql`
    select stage, coalesce(bool_and(status = 'FINISHED'), false) done, coalesce(bool_or(status <> 'SCHEDULED'), false) started
    from matches where stage in ('LAST_16', 'QF', 'SF', 'FINAL') group by stage
  `) as any[];
  const doneOf = new Map<string, boolean>(), startedOf = new Map<string, boolean>();
  for (const r of stageStatus) { doneOf.set(r.stage, r.done); startedOf.set(r.stage, r.started); }
  const [{ d: groupsDecided } = { d: false }] = (await sql`select coalesce(bool_and(status = 'FINISHED'), false) d from matches where stage = 'GROUP'`) as any[];

  // Group winner / runner-up (WC-group-games points, then overall, then name).
  const byGroup = new Map<string, any[]>();
  for (const r of rows) { if (!byGroup.has(r.grp)) byGroup.set(r.grp, []); byGroup.get(r.grp)!.push(r); }
  const seed = new Map<string, any>();
  for (const [g, arr] of byGroup) {
    arr.sort((a, b) => b.grp_pts - a.grp_pts || groupTieOverride(a.name, b.name) || b.overall - a.overall || a.name.localeCompare(b.name));
    if (arr[0]) seed.set(`W-${g}`, arr[0]);
    if (arr[1]) seed.set(`RU-${g}`, arr[1]);
  }

  const player = (r: any, stage: string) => (r ? { id: r.eid, name: r.name, points: stagePts.get(`${r.eid}:${stage}`) ?? 0 } : null);
  const winnerRow = (aRow: any, bRow: any, stage: string, decided: boolean): any => {
    if (!aRow || !bRow || !decided) return null;
    const ap = stagePts.get(`${aRow.eid}:${stage}`) ?? 0, bp = stagePts.get(`${bRow.eid}:${stage}`) ?? 0;
    if (ap !== bp) return ap > bp ? aRow : bRow;
    return aRow.overall >= bRow.overall ? aRow : bRow; // tie-break: higher overall total
  };

  let prev: any[] = [];
  const roundsOut: any[] = [];
  for (let ri = 0; ri < KO_ROUNDS.length; ri++) {
    const { round, stage, label } = KO_ROUNDS[ri];
    const decided = !!doneOf.get(stage);
    const pairs: [any, any][] = ri === 0
      ? KO_R16_SEEDS.map(([h, aw]) => [seed.get(h), seed.get(aw)])
      : prev.reduce((acc: [any, any][], _, i) => (i % 2 === 0 ? [...acc, [prev[i], prev[i + 1]]] : acc), []);
    const ties = pairs.map(([aRow, bRow]) => {
      const w = winnerRow(aRow, bRow, stage, decided);
      return { a: player(aRow, stage), b: player(bRow, stage), winnerId: w ? w.eid : null, decided };
    });
    prev = pairs.map(([aRow, bRow]) => winnerRow(aRow, bRow, stage, decided));
    roundsOut.push({ round, label, stage, started: !!startedOf.get(stage), decided, ties });
  }
  return { qualified: groupsDecided, rounds: roundsOut };
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

  const cfg = await loadConfig();

  // ESPN live enrichment so in-play group games show the live score + provisional
  // points, rather than waiting for the poller to write the DB score.
  const espnByPair = new Map<string, { espn: any; homeId: number }>();
  try {
    const byNorm = await dbNameMap();
    for (const e of await getEspnMatches()) {
      const h = resolveEspn(e.home, byNorm);
      const a = resolveEspn(e.away, byNorm);
      if (h && a) espnByPair.set(pairKey(h, a), { espn: e, homeId: h });
    }
  } catch {
    /* ESPN unavailable - DB scores only */
  }

  // Group predictions + the real fixture + actual result + the match's score row.
  const groupRows = await sql`
    select m.group_name grp, m.matchday, m.status, m.home_team_id mh, m.away_team_id ma,
           m.home_goals ah, m.away_goals aa,
           ht.name home, ht.tla home_code, at.name away, at.tla away_code,
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

    // in-play: use the live ESPN score + provisional points; finished: the stored score.
    let ah = r.ah;
    let aa = r.aa;
    let points = r.points ?? null;
    if (r.status === "IN_PLAY") {
      const enrich = espnByPair.get(pairKey(r.mh, r.ma));
      if (enrich) {
        const ours = enrich.homeId === r.mh;
        ah = ours ? enrich.espn.homeScore : enrich.espn.awayScore;
        aa = ours ? enrich.espn.awayScore : enrich.espn.homeScore;
      }
      if (ah != null && aa != null) points = scoreGroupMatch(predHome, predAway, ah, aa, cfg).points;
    }

    const match = {
      home: r.home,
      homeCode: r.home_code,
      away: r.away,
      awayCode: r.away_code,
      predHome,
      predAway,
      actualHome: ah,
      actualAway: aa,
      status: r.status,
      points,
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
  // The actual knockout fixtures (their id IS the FIFA match number) and this
  // entrant's knockout points, so each predicted tie can show the real fixture,
  // score and what it scored.
  const koFixtures = await sql`
    select m.id, m.status,
           coalesce(m.home_goals_90, m.home_goals) hg, coalesce(m.away_goals_90, m.away_goals) ag,
           ht.name home, ht.tla hcode, at.name away, at.tla acode
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    where m.stage <> 'GROUP'
  `;
  const fixById = new Map<number, any>((koFixtures as any[]).map((f) => [f.id, f]));
  const koScoreRows = await sql`select ref, points, breakdown from scores where entrant_id = ${id} and kind = 'KNOCKOUT'`;
  const koScoreByRef = new Map<string, any>((koScoreRows as any[]).map((s) => [s.ref, s]));
  // Global slot -> fixture mapping (fixed bracket positions), the same for every
  // entrant - matches how the knockout is scored (positional, one source of truth).
  const knockout = (koRows as any[])
    .map((r) => {
      const prefix = r.slot.split("-")[0];
      const meta = ROUND_OF[prefix] ?? { round: prefix, label: prefix, order: 9 };
      const idx = Number(r.slot.split("-")[1] ?? 0);
      const matchNo = PRED_SLOT_TO_MATCH[r.slot] ?? null;
      const fx = matchNo ? fixById.get(matchNo) : null;
      const sc = matchNo ? koScoreByRef.get(`match:${matchNo}`) : null;
      const live = fx && (fx.status === "FINISHED" || fx.status === "IN_PLAY");
      const drawn = fx && fx.home != null && fx.away != null;
      return {
        round: meta.round, label: meta.label, order: meta.order, idx, slot: r.slot,
        home: r.home, away: r.away, predHome: r.phg, predAway: r.pag,
        actualHome: fx?.home ?? null, actualAway: fx?.away ?? null,
        actualHomeCode: fx?.hcode ?? null, actualAwayCode: fx?.acode ?? null,
        actualHomeScore: live ? fx.hg : null, actualAwayScore: live ? fx.ag : null,
        // whether the entrant got each team in the right position, each side's goal
        // tally, and the exact score.
        homeCorrect: !!(drawn && r.home === fx.home),
        awayCorrect: !!(drawn && r.away === fx.away),
        homeGoalsCorrect: !!(live && r.phg === fx.hg),
        awayGoalsCorrect: !!(live && r.pag === fx.ag),
        scoreCorrect: !!(live && r.phg === fx.hg && r.pag === fx.ag),
        status: fx?.status ?? null,
        points: sc ? sc.points : null,
      };
    })
    .sort((a, b) => a.order - b.order || a.idx - b.idx);

  // Totals by score kind.
  const totalsRows = await sql`select kind, coalesce(sum(points),0)::int s from scores where entrant_id = ${id} group by kind`;
  const totals: Record<string, number> = { total: 0, MATCH: 0, PROGRESSION: 0, FINALTHIRD: 0 };
  for (const t of totalsRows as any[]) {
    totals[t.kind] = t.s;
    totals.total += t.s;
  }

  // The entrant's PREDICTED group tables (from their group-score picks), same shape
  // as /api/wc-groups, to sit above the per-game results on the entrant page.
  const predictedStandings = await predictedGroupStandings(id);

  return { entrant, totals, groups, knockout, predictedStandings };
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
  const [entrant] = await sql`
    select e.id, e.name, u.email
    from entrants e left join users u on u.entrant_id = e.id
    where e.id = ${id}
  `;
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

// Build the rich LiveMatch[] (per-entrant points board + ESPN minute/events +
// most-common score) for a set of already-queried match rows. Shared by
// /api/live (the day's games) and /api/fixtures (every fixture).
async function buildLiveMatches(rows: any[], myId: number | null) {
  const cfg = await loadConfig();

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
      if (h && a) espnByPair.set(pairKey(h, a), { espn: e, homeId: h });
    }
  } catch {
    /* ESPN unavailable - fall back to DB-only (no minute/events) */
  }

  const evMap = await eventsForMatches((rows as any[]).map((m) => m.id));

  // Knockout fixtures: the matchup is projected from the group standings until the
  // teams are confirmed, and each entrant's pick is a SLOT prediction (their own
  // predicted teams + score for that bracket slot).
  const hasKo = (rows as any[]).some((m) => m.stage !== "GROUP" && m.slot);
  const projBySlot = new Map<string, { home: string; away: string; homeCode: string; awayCode: string }>();
  // Boards keyed by the actual FIFA match number (= the knockout fixture id), each
  // entrant's SLOT pick placed at the fixture IT maps to via the per-entrant mapping.
  const koBoardByMatch = new Map<number, any[]>();
  const koMcByMatch = new Map<number, { score: string; count: number; total: number; home: string; away: string; homeName: string; awayName: string; penSide: "home" | "away" | null }>();
  if (hasKo) {
    try {
      const ko = await buildKnockout();
      const ROUND_PREFIX: Record<string, string> = { "Round of 32": "R32", "Round of 16": "R16", "Quarter-finals": "QF", "Semi-finals": "SF", "Third-place play-off": "THIRD", "Final": "FINAL" };
      for (const r of ko.rounds) {
        const prefix = ROUND_PREFIX[r.round];
        if (!prefix) continue;
        r.matches.forEach((mm: any, i: number) => {
          const slot = prefix === "THIRD" || prefix === "FINAL" ? prefix : `${prefix}-${i + 1}`;
          projBySlot.set(slot, {
            home: mm.a.team?.name ?? mm.a.label, away: mm.b.team?.name ?? mm.b.label,
            homeCode: mm.a.team?.tla ?? "", awayCode: mm.b.team?.tla ?? "",
          });
        });
      }
    } catch { /* projection unavailable - fall back to TBD */ }
    const slotPreds = await sql`
      select p.bracket_slot slot, e.id eid, e.name, p.pred_home_team_id phid, p.pred_away_team_id paid,
             ht.tla phome, ht.name phomename, at.tla paway, at.name pawayname, p.pred_home_goals phg, p.pred_away_goals pag
      from predictions p
      join entrants e on e.id = p.entrant_id
      join teams ht on ht.id = p.pred_home_team_id
      join teams at on at.id = p.pred_away_team_id
      where p.scope = 'SLOT'
    `;
    // Stored knockout scores (the one source of truth for points) keyed by
    // matchNo:entrantId, so every board reads the same points, not a fresh calc.
    const koScoreRows = await sql`select entrant_id eid, ref, points from scores where kind = 'KNOCKOUT'`;
    const koPoints = new Map<string, number>();
    for (const s of koScoreRows as any[]) koPoints.set(`${s.ref.split(":")[1]}:${s.eid}`, s.points);
    // Each entrant's bracket, so a drawn tie can show who they advanced (on pens):
    // the team that reappears in the slot this one feeds into.
    const bySlotByEntrant = new Map<number, Map<string, any>>();
    for (const p of slotPreds as any[]) {
      if (!bySlotByEntrant.has(p.eid)) bySlotByEntrant.set(p.eid, new Map());
      bySlotByEntrant.get(p.eid)!.set(p.slot, p);
    }
    // The slot a winner feeds into. We don't assume WHICH side (home/away) it
    // lands on - the real bracket's pairings don't follow a tidy odd/even rule -
    // so we just look at the next match and see which of the drawn pair reappears.
    const nextSlot = (slot: string): string | null => {
      const [r, nStr] = slot.split("-");
      const n = Number(nStr);
      if (r === "R32") return `R16-${Math.ceil(n / 2)}`;
      if (r === "R16") return `QF-${Math.ceil(n / 2)}`;
      if (r === "QF") return `SF-${Math.ceil(n / 2)}`;
      if (r === "SF") return "FINAL";
      return null;
    };
    for (const p of slotPreds as any[]) {
      let penSide: "home" | "away" | null = null;
      if (p.phg === p.pag) {
        const ns = nextSlot(p.slot);
        const np = ns && bySlotByEntrant.get(p.eid)?.get(ns);
        if (np) {
          // whichever drawn team the entrant carried into the next match won the shoot-out
          const inNext = (id: number) => np.phid === id || np.paid === id;
          penSide = inNext(p.phid) ? "home" : inNext(p.paid) ? "away" : null;
        }
      }
      p.penSide = penSide;
      p.matchNo = PRED_SLOT_TO_MATCH[p.slot] ?? null;
      if (p.matchNo == null) continue;
      const arr = koBoardByMatch.get(p.matchNo) ?? [];
      arr.push({ entrantId: p.eid, name: p.name, pick: `${p.phg}-${p.pag}`, predHome: p.phome, predAway: p.paway, predHomeName: p.phomename, predAwayName: p.pawayname, penSide, points: koPoints.get(`${p.matchNo}:${p.eid}`) ?? null, tier: null });
      koBoardByMatch.set(p.matchNo, arr);
    }
    for (const arr of koBoardByMatch.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

    // single most-predicted full pick per knockout FIXTURE (teams + score combined)
    const koAgg = new Map<number, { full: Map<string, { count: number; home: string; away: string; homeName: string; awayName: string; score: string; penHome: number; penAway: number }>; total: number }>();
    for (const p of slotPreds as any[]) {
      if (p.matchNo == null) continue;
      let a = koAgg.get(p.matchNo);
      if (!a) { a = { full: new Map(), total: 0 }; koAgg.set(p.matchNo, a); }
      a.total++;
      const key = `${p.phid}-${p.paid}-${p.phg}-${p.pag}`;
      const f = a.full.get(key) ?? { count: 0, home: p.phome, away: p.paway, homeName: p.phomename, awayName: p.pawayname, score: `${p.phg}-${p.pag}`, penHome: 0, penAway: 0 };
      f.count++;
      if (p.penSide === "home") f.penHome++; else if (p.penSide === "away") f.penAway++;
      a.full.set(key, f);
    }
    for (const [matchNo, a] of koAgg) {
      let top: any = null, tc = 0;
      for (const f of a.full.values()) if (f.count > tc) { top = f; tc = f.count; }
      if (top) {
        const penSide = top.penHome > top.penAway ? "home" : top.penAway > top.penHome ? "away" : null;
        koMcByMatch.set(matchNo, { score: top.score, count: tc, total: a.total, home: top.home, away: top.away, homeName: top.homeName, awayName: top.awayName, penSide });
      }
    }
  }

  return (rows as any[]).map((m) => {
    // ESPN live enrichment (minute + live score + events), keyed by team-id pair.
    const enrich = espnByPair.get(pairKey(m.mh, m.ma));

    // For in-play matches use the live ESPN score so predictions recompute as fast
    // as the feed; the stored DB score only refreshes on the poller's cadence.
    let hg = m.hg ?? 0;
    let ag = m.ag ?? 0;
    if (enrich && m.status === "IN_PLAY") {
      const espnHomeIsOurs = enrich.homeId === m.mh;
      hg = espnHomeIsOurs ? enrich.espn.homeScore : enrich.espn.awayScore;
      ag = espnHomeIsOurs ? enrich.espn.awayScore : enrich.espn.homeScore;
    }
    const scored = m.status === "IN_PLAY" || m.status === "FINISHED";

    // board for every group fixture - points/tier once it's in play/finished,
    // just the picks (points null) before kick-off.
    let board: any[] = [];
    if (m.stage === "GROUP") {
      board = (predsByMatch.get(m.id) ?? []).map((p) => {
        const predH = p.ph === m.mh ? p.phg : p.pag;
        const predA = p.ph === m.mh ? p.pag : p.phg;
        if (scored) {
          const b = scoreGroupMatch(predH, predA, hg, ag, cfg);
          const tier = b.exact ? "exact" : b.outcome ? "result" : (b.homeGoals || b.awayGoals) ? "diff" : "miss";
          return { entrantId: p.eid, name: p.name, pick: `${predH}-${predA}`, points: b.points, tier };
        }
        return { entrantId: p.eid, name: p.name, pick: `${predH}-${predA}`, points: null, tier: null };
      });
      if (scored) board.sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.name.localeCompare(b.name));
      else board.sort((a, b) => a.name.localeCompare(b.name));
    } else if (m.slot) {
      // knockout: everyone's bracket pick for this slot (predicted teams + score).
      // Predictions use a different slot numbering than fixtures, so map first.
      board = koBoardByMatch.get(m.id) ?? [];
    }

    // attach ESPN minute/events, aligning event side to our home/away
    let minute: number | null = null;
    let half: string | null = null;
    let period: number | null = null;
    // real key events from the summary feed (goals + cards with the scorer's
    // name); fall back to the synthesised goal log if the feed hasn't filled yet.
    const feedEvents = evMap.get(m.id);
    const events: any[] = (feedEvents?.length ? feedEvents : liveEvents.get(m.id) ?? []).slice().sort((a, b) => a.minute - b.minute);
    if (enrich) {
      const liveNow = m.status === "IN_PLAY";
      minute = liveNow ? enrich.espn.minute : null;
      half = liveNow ? enrich.espn.half : null;
      period = liveNow ? enrich.espn.period : null;
    }

    const koMc = koMcByMatch.get(m.id);
    const mc = m.stage === "GROUP"
      ? mostCommon(predsByMatch.get(m.id) ?? [], m.mh)
      : { score: koMc?.score ?? null, scoreCount: koMc?.count ?? 0, result: null as "HOME" | "DRAW" | "AWAY" | null, resultCount: 0, total: koMc?.total ?? 0 };
    const mine = myId ? board.find((b) => b.entrantId === myId) : null;

    return {
      id: m.id,
      myPick: mine?.pick ?? null,
      myPoints: mine?.points ?? null,
      myTier: mine?.tier ?? null,
      // The teams they predicted: for a knockout slot that's their bracket matchup
      // (can differ from the actual/projected fixture); for a group game it's just
      // the fixture teams (you only predict the score there).
      myPredHomeCode: mine ? (m.slot ? mine.predHome : m.home_code ?? null) : null,
      myPredAwayCode: mine ? (m.slot ? mine.predAway : m.away_code ?? null) : null,
      myPredHomeName: mine ? (m.slot ? mine.predHomeName : m.home ?? null) : null,
      myPredAwayName: mine ? (m.slot ? mine.predAwayName : m.away ?? null) : null,
      home: m.home ?? projBySlot.get(m.slot)?.home ?? "TBD",
      away: m.away ?? projBySlot.get(m.slot)?.away ?? "TBD",
      homeCode: m.home_code ?? projBySlot.get(m.slot)?.homeCode ?? "",
      awayCode: m.away_code ?? projBySlot.get(m.slot)?.awayCode ?? "",
      // Whether the actual fixture teams are confirmed (drawn) vs still projected -
      // so the UI only ticks a correct knockout team pick once the tie is really set.
      homeKnown: m.mh != null,
      awayKnown: m.ma != null,
      stage: m.stage,
      group: m.grp,
      matchday: m.matchday,
      venue: venueForSlot(m.slot) ?? GROUP_VENUES[m.api_id] ?? null,
      status: m.status,
      kickoff: m.kickoff_utc,
      minute,
      half,
      period,
      homeScore: hg,
      awayScore: ag,
      // A knockout tie level after 90 mins is settled on penalties; flag which side
      // went through (and the shootout score if we have it) for the match card.
      penWinner: m.status === "FINISHED" && hg === ag && m.winner ? (m.winner === m.mh ? "home" : "away") : null,
      homePens: m.hpen ?? null,
      awayPens: m.apen ?? null,
      mostCommonScore: mc.score,
      mostCommonScoreCount: mc.scoreCount,
      mostCommonResult: mc.result,
      mostCommonResultCount: mc.resultCount,
      mostCommonTotal: mc.total,
      koMatchup: koMc ? { home: koMc.home, away: koMc.away, homeName: koMc.homeName, awayName: koMc.awayName, score: koMc.score, count: koMc.count, penSide: koMc.penSide } : null,
      events,
      board,
    };
  });
}

// Live page feed: every in-play match, today's upcoming fixtures, and all results
// so far - each with a points board and, for in-play games, ESPN minute + events.
app.get("/api/live", async (req: any) => {
  const myId = req.user?.entrantId ?? null;
  const day = Math.max(-1, Math.min(1, Math.trunc(Number(req.query?.day) || 0))); // -1 yesterday, 0 today, +1 tomorrow
  const rows = await sql`
    select m.id, m.api_match_id api_id, m.stage, m.group_name grp, m.matchday, m.status, m.home_goals hg, m.away_goals ag, m.kickoff_utc, m.bracket_slot slot,
           m.home_team_id mh, m.away_team_id ma, m.winner_team_id winner, m.home_penalties hpen, m.away_penalties apen,
           ht.name home, ht.tla home_code, at.name away, at.tla away_code
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    -- games on the selected host-country day (US/Canada/Mexico), using the
    -- westernmost host tz so no game lands on the wrong day. day = -1/0/+1,
    -- relative to the current football day (which rolls over when the last
    -- game of the day ends, not at midnight - see CURRENT_DAY).
    where (m.kickoff_utc at time zone 'America/Los_Angeles')::date
        = ${CURRENT_DAY} + ${day}::int
    order by
      (case m.status when 'IN_PLAY' then 0 when 'SCHEDULED' then 1 else 2 end),
      case when m.status = 'FINISHED' then m.kickoff_utc end desc nulls last,
      case when m.status <> 'FINISHED' then m.kickoff_utc end asc nulls last
  `;
  return buildLiveMatches(rows, myId);
});

// All fixtures + results, chronological (knockout teams are null until resolved),
// each with the same full board + events as the live feed.
app.get("/api/fixtures", async (req: any) => {
  const myId = req.user?.entrantId ?? null;
  const rows = await sql`
    select m.id, m.api_match_id api_id, m.stage, m.group_name grp, m.matchday, m.status, m.home_goals hg, m.away_goals ag, m.kickoff_utc, m.bracket_slot slot,
           m.home_team_id mh, m.away_team_id ma, m.winner_team_id winner, m.home_penalties hpen, m.away_penalties apen,
           ht.name home, ht.tla home_code, at.name away, at.tla away_code
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    order by m.kickoff_utc asc nulls last, m.id
  `;
  return buildLiveMatches(rows, myId);
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
    events: await matchEvents(id),
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

// Preview how a parsed prediction set differs from what's stored, WITHOUT saving.
// Lets the admin see the changes before committing a destructive replace.
app.post("/api/admin/diff-predictions", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const { name, predictions } = req.body ?? {};
  if (!name || !Array.isArray(predictions)) {
    reply.code(400).send({ error: "name and predictions[] required" });
    return;
  }
  return diffAgainstCurrent(String(name).trim(), predictions);
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
  // The login account (users row) email + password for this entrant.
  if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.trim();
    const clash = await sql`select 1 from users where lower(email) = lower(${email}) and entrant_id <> ${id} limit 1`;
    if (clash.length) return reply.code(409).send({ error: "That email is already in use by another account." });
    await sql`update entrants set email = ${email} where id = ${id}`;
    await sql`update users set email = ${email} where entrant_id = ${id}`;
  }
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 6) return reply.code(400).send({ error: "Password must be at least 6 characters." });
    await sql`update users set password_hash = ${hashPassword(body.password)} where entrant_id = ${id}`;
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
  const { homeGoals, awayGoals, status, winnerTeamId } = req.body ?? {};
  await sql`
    update matches set home_goals = ${homeGoals ?? null}, away_goals = ${awayGoals ?? null},
      status = ${status ?? "FINISHED"}, winner_team_id = ${winnerTeamId ?? null}, result_overridden = true
    where id = ${id}
  `;
  await recomputeAll();
  return { ok: true };
});

// Manually set the two teams in a knockout fixture. Needed for the third-placed
// R32 slots (FIFA's best-thirds assignment is a published lookup, not derivable
// from standings) and as a correction tool. The bracket resolver owns the
// deterministic sides; it never overwrites a third-place side set here.
app.patch("/api/admin/matches/:id/teams", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number(req.params.id);
  const { homeTeamId, awayTeamId } = req.body ?? {};
  await sql`
    update matches set home_team_id = ${homeTeamId ?? null}, away_team_id = ${awayTeamId ?? null}
    where id = ${id}
  `;
  await recomputeAll();
  return { ok: true };
});

// Admin: one entrant's full per-game scoring (group + knockout) for reconciling
// against an external spreadsheet. Each row is the fixture, their pick, the actual
// result and the points it scored; grouped so you can diff a single game.
app.get("/api/admin/entrant-breakdown/:id", async (req: any, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number(req.params.id);
  const [ent] = await sql`select name from entrants where id = ${id}`;
  if (!ent) return reply.code(404).send({ error: "not found" });

  const groupRows = (await sql`
    select m.matchday, m.group_name grp, m.status,
           ht.name home, at.name away,
           case when p.pred_home_team_id = m.home_team_id then p.pred_home_goals else p.pred_away_goals end ph,
           case when p.pred_home_team_id = m.home_team_id then p.pred_away_goals else p.pred_home_goals end pa,
           m.home_goals ah, m.away_goals aa, coalesce(s.points, 0)::int points
    from predictions p
    join matches m on m.id = p.match_id
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    left join scores s on s.entrant_id = p.entrant_id and s.ref = 'match:' || m.id
    where p.entrant_id = ${id} and p.scope = 'MATCH' and m.stage = 'GROUP'
    order by m.matchday, m.kickoff_utc, m.id
  `) as any[];
  const group = groupRows.map((r) => ({
    phase: `Week ${r.matchday}`, group: r.grp,
    home: r.home, away: r.away, pick: `${r.ph}-${r.pa}`,
    actual: r.status === "FINISHED" ? `${r.ah}-${r.aa}` : "-",
    points: r.points,
  }));

  const koPreds = (await sql`
    select p.bracket_slot slot, ht.name home, at.name away, p.pred_home_goals phg, p.pred_away_goals pag
    from predictions p
    join teams ht on ht.id = p.pred_home_team_id
    join teams at on at.id = p.pred_away_team_id
    where p.entrant_id = ${id} and p.scope = 'SLOT'
  `) as any[];
  const koFix = (await sql`
    select m.id, m.status, coalesce(m.home_goals_90, m.home_goals) hg, coalesce(m.away_goals_90, m.away_goals) ag,
           ht.name home, at.name away
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    where m.stage <> 'GROUP'
  `) as any[];
  const fixById = new Map<number, any>(koFix.map((f) => [f.id, f]));
  const koPts = new Map<number, number>();
  for (const s of (await sql`select ref, points from scores where entrant_id = ${id} and kind = 'KNOCKOUT'`) as any[]) {
    koPts.set(Number(s.ref.split(":")[1]), s.points);
  }
  const ROUND_LABEL: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", THIRD: "Third place", FINAL: "Final" };
  const knockout = koPreds.map((r) => {
    const matchNo = PRED_SLOT_TO_MATCH[r.slot] ?? null;
    const fx = matchNo != null ? fixById.get(matchNo) : null;
    const played = fx && (fx.status === "FINISHED" || fx.status === "IN_PLAY");
    return {
      phase: ROUND_LABEL[r.slot.split("-")[0]] ?? r.slot, slot: r.slot, order: matchNo ?? 999,
      home: r.home, away: r.away, pick: `${r.phg}-${r.pag}`,
      actual: fx ? `${fx.home ?? "???"} ${played ? `${fx.hg}-${fx.ag}` : "v"} ${fx.away ?? "???"}` : "-",
      points: matchNo != null ? (koPts.get(matchNo) ?? 0) : 0,
    };
  }).sort((a, b) => a.order - b.order);

  return { entrant: ent.name, group, knockout };
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

// Idempotent data migrations - safe to run on every boot (so production picks
// them up on deploy without a manual step).
try {
  await sql`update teams set name = 'Bosnia' where name = 'Bosnia-Herzegovina'`;
  // match_events is managed via raw SQL (not the drizzle schema), so a fresh DB
  // from `drizzle-kit push` won't have it. Create it before the ALTERs below -
  // otherwise the first ALTER throws on a fresh DB and aborts the whole block,
  // leaving later columns (home_goals_90) missing and the leaderboard 500ing.
  await sql`create table if not exists match_events (
    id serial primary key,
    match_id integer not null references matches(id) on delete cascade,
    minute integer,
    type text,
    team text,
    player text,
    own boolean not null default false,
    penalty boolean not null default false
  )`;
  await sql`alter table match_events add column if not exists own boolean not null default false`;
  await sql`alter table match_events add column if not exists penalty boolean not null default false`;
  // Knockout ties store the FINAL score (home_goals/away_goals, incl. extra time)
  // for display; these hold the AFTER-90-MINUTES score, which is what scoring uses.
  await sql`alter table matches add column if not exists home_goals_90 integer`;
  await sql`alter table matches add column if not exists away_goals_90 integer`;
  // One-time: drop finished-match key events so the poller's backfill re-captures
  // them with the latest flags (own goal, penalty). Guarded so it runs only once.
  await sql`create table if not exists app_meta (key text primary key)`;
  const [recaptured] = await sql`select 1 from app_meta where key = 'own_recapture_v3'`;
  if (!recaptured) {
    await sql`delete from match_events where match_id in (select id from matches where status = 'FINISHED')`;
    await sql`insert into app_meta (key) values ('own_recapture_v3')`;
  }

  // One-time: corrections found re-reading the entry photos against the DB
  // (2026-06-16). Each update only touches the one intended prediction; the final
  // recompute also re-scores everyone under the new "called-draw" rule.
  const [audited] = await sql`select 1 from app_meta where key = 'pred_audit_fix_v1'`;
  if (!audited) {
    const fixes: [string, string, string, number, number][] = [
      ["[redacted]", "Spain", "Cape Verde", 5, 0],
      ["[redacted]", "Belgium", "Egypt", 2, 0],
      ["[redacted]", "Saudi Arabia", "Uruguay", 0, 2],
      ["[redacted]", "Iran", "New Zealand", 2, 1],
      ["[redacted]", "Portugal", "Uzbekistan", 3, 0],
      ["[redacted]", "Argentina", "Algeria", 2, 0],
      ["[redacted]", "Uzbekistan", "Colombia", 0, 1],
      ["[redacted]", "Colombia", "Congo DR", 2, 0],
      ["[redacted]", "Iran", "New Zealand", 3, 1],
      ["[redacted]", "Senegal", "Iraq", 1, 0],
    ];
    for (const [ent, h, a, gh, ga] of fixes) {
      await sql`
        update predictions p set pred_home_goals = ${gh}, pred_away_goals = ${ga}
        from entrants e, teams ht, teams at
        where p.entrant_id = e.id and p.pred_home_team_id = ht.id and p.pred_away_team_id = at.id
          and p.match_id is not null
          and e.name = ${ent} and ht.name = ${h} and at.name = ${a}`;
    }
    // [redacted]'s R32: opponent was transcribed as Sweden but the sheet reads
    // Senegal (score 3-0 unchanged); Sweden was wrongly placed in two R32 ties.
    await sql`
      update predictions p set pred_away_team_id = (select id from teams where name = 'Senegal')
      from entrants e, teams ht, teams at
      where p.entrant_id = e.id and p.pred_home_team_id = ht.id and p.pred_away_team_id = at.id
        and p.match_id is null
        and e.name = '[redacted]' and ht.name = 'Germany' and at.name = 'Sweden'
        and p.pred_home_goals = 3 and p.pred_away_goals = 0`;
    await sql`insert into app_meta (key) values ('pred_audit_fix_v1')`;
    await recomputeAll();
  }

  // 2026-06-16: [redacted] & [redacted] handed in fresh sheets - the OCR import
  // was unreliable, so both were re-transcribed by hand and fully replaced. Runs
  // once (prod picks it up on deploy); savePredictions wipes + re-inserts each.
  // v3: more transcription fixes after re-reading the photos against the DB -
  // Lucy: Rep. of Korea v Czechia 1-1 (was 2-1). Dave: England v Croatia 2-1
  // (was 0-0) and Switzerland v Bosnia 2-1 (was 1-0).
  const [reuploaded] = await sql`select 1 from app_meta where key = 'dave_lucy_reupload_v3'`;
  if (!reuploaded) {
    for (const { entrant, predictions } of REUPLOAD_2026_06_16) {
      const r = await savePredictions(entrant, predictions);
      if (r.unresolved.length) console.warn(`reupload ${entrant}: unresolved ${r.unresolved.join(", ")}`);
      if (r.groupPredictions !== 72 || r.knockoutPredictions !== 32) {
        throw new Error(`reupload ${entrant} wrote ${r.groupPredictions} group + ${r.knockoutPredictions} knockout (expected 72 + 32) - aborting, key not set`);
      }
    }
    await sql`insert into app_meta (key) values ('dave_lucy_reupload_v3')`;
    await recomputeAll();
    console.log("reupload dave_lucy_reupload_v3 applied");
  }

  // 2026-07-02: the two evening R32 kickoff times were swapped versus the real
  // schedule. football-data has them right (Spain v Austria 19:00Z, played 3-0;
  // Portugal v Croatia 23:00Z, still to come), but knockout fixtures don't sync
  // kickoff by api_match_id, so the seeded/swapped times stuck - leaving the
  // already-passed 19:00 Portugal tie jammed as the "current" game. Correct them
  // by team, and clear result_overridden so the 23:00 Portugal score still
  // auto-imports from ESPN (which skips overridden rows). Runs once.
  const [koTimeFix] = await sql`select 1 from app_meta where key = 'r32_kickoff_fix_v1'`;
  if (!koTimeFix) {
    await sql`update matches m set kickoff_utc = '2026-07-02 23:00:00+00', result_overridden = false
      from teams h, teams a
      where m.home_team_id = h.id and m.away_team_id = a.id and m.stage = 'LAST_32'
        and h.name = 'Portugal' and a.name = 'Croatia'`;
    await sql`update matches m set kickoff_utc = '2026-07-02 19:00:00+00', result_overridden = false
      from teams h, teams a
      where m.home_team_id = h.id and m.away_team_id = a.id and m.stage = 'LAST_32'
        and h.name = 'Spain' and a.name = 'Austria'`;
    await sql`insert into app_meta (key) values ('r32_kickoff_fix_v1')`;
    console.log("r32_kickoff_fix_v1 applied");
  }

  // 2026-07-03: knockout scoring now uses the fixed positional map
  // (PRED_SLOT_TO_MATCH) - slot N scored against the actual game N, exactly how the
  // paper sheets are scored. Two entrants also needed prediction data fixes the
  // import got wrong: [redacted]'s R32 away column had slipped (Morocco dropped,
  // Sweden duplicated); [redacted]'s re-typed sheet had its R32 + R16 rows in a
  // scrambled slot order. Both corrected here from the original photos. Runs once.
  const [koFix] = await sql`select 1 from app_meta where key = 'ko_positional_fix_v1'`;
  if (!koFix) {
    await sql`
      update predictions p set pred_away_team_id = t.id
      from entrants e, teams t, (values
        ('R32-4','Morocco'),('R32-5','Norway'),('R32-6','Sweden'),('R32-7','Haiti'),
        ('R32-8','Congo DR'),('R32-9','Senegal'),('R32-10','Qatar'),('R32-11','Austria'),
        ('R32-12','England'),('R32-13','New Zealand'),('R32-14','Egypt')
      ) as fix(slot, away)
      where e.name = '[redacted]' and p.entrant_id = e.id and p.scope = 'SLOT'
        and p.bracket_slot = fix.slot and t.name = fix.away`;
    await sql`
      update predictions p set pred_home_team_id = h.id, pred_away_team_id = a.id,
        pred_home_goals = fix.hg, pred_away_goals = fix.ag
      from entrants e, teams h, teams a, (values
        ('R32-1','South Africa','Bosnia',2,0),('R32-2','Brazil','Japan',2,0),('R32-3','Germany','Scotland',2,0),
        ('R32-4','Netherlands','Morocco',3,0),('R32-5','Ivory Coast','Senegal',2,1),('R32-6','France','United States',2,1),
        ('R32-7','Mexico','Ecuador',1,0),('R32-8','England','Congo DR',1,0),('R32-9','Belgium','Czechia',3,1),
        ('R32-10','Paraguay','Canada',2,1),('R32-11','Spain','Austria',2,0),('R32-12','Colombia','Croatia',1,0),
        ('R32-13','Switzerland','New Zealand',1,0),('R32-14','Türkiye','Egypt',1,2),('R32-15','Argentina','Uruguay',1,1),
        ('R32-16','Portugal','Norway',2,0),('R16-1','South Africa','Netherlands',2,0),('R16-2','Germany','France',1,2),
        ('R16-3','Brazil','Ivory Coast',3,1),('R16-4','Mexico','England',2,2),('R16-5','Colombia','Spain',1,3),
        ('R16-6','Paraguay','Belgium',2,0),('R16-7','Argentina','Egypt',2,0),('R16-8','Switzerland','Portugal',1,2)
      ) as fix(slot, home, away, hg, ag)
      where e.name = '[redacted]' and p.entrant_id = e.id and p.scope = 'SLOT'
        and p.bracket_slot = fix.slot and h.name = fix.home and a.name = fix.away`;
    await sql`insert into app_meta (key) values ('ko_positional_fix_v1')`;
    console.log("ko_positional_fix_v1 applied");
  }

  // 2026-07-04: kickoff times were wrong for most knockout fixtures. Knockout
  // rows don't sync their kickoff by api_match_id (that linkage is unreliable),
  // and sim/test runs stamped some kickoffs to now(). football-data holds the
  // real times, so match its fixtures by TEAM PAIR + STAGE (order-independent,
  // NOT api_match_id) and correct kickoff_utc wherever it differs. Kickoff only -
  // scores and result_overridden are left untouched, so no manual result override
  // is disturbed. Guarded; if the feed is unreachable the outer catch leaves the
  // key unset so it retries on the next boot.
  const [koTimes] = await sql`select 1 from app_meta where key = 'kickoff_restore_v1'`;
  if (!koTimes) {
    const { matches: feed } = await fd.matches();
    const teamMap = new Map(
      (await sql`select id, api_team_id from teams where api_team_id is not null`)
        .map((r: any) => [r.api_team_id as number, r.id as number]),
    );
    const fixed: string[] = [];
    for (const fm of feed as any[]) {
      const hid = fm.homeTeam?.id ? teamMap.get(fm.homeTeam.id) : null;
      const aid = fm.awayTeam?.id ? teamMap.get(fm.awayTeam.id) : null;
      if (!hid || !aid || !fm.utcDate) continue; // teams not yet known / no time
      const stage = mapStage(fm.stage);
      const rows = (await sql`
        update matches
        set kickoff_utc = ${fm.utcDate}
        where stage = ${stage}
          and ((home_team_id = ${hid} and away_team_id = ${aid})
            or (home_team_id = ${aid} and away_team_id = ${hid}))
          and kickoff_utc is distinct from ${fm.utcDate}::timestamptz
        returning id, result_overridden ovr
      `) as any[];
      for (const r of rows) fixed.push(`m${r.id} ${stage}->${fm.utcDate}${r.ovr ? " (still overridden)" : ""}`);
    }
    console.log(`[kickoff_restore_v1] corrected ${fixed.length} kickoff(s): ${fixed.join(", ") || "none"}`);
    await sql`insert into app_meta (key) values ('kickoff_restore_v1')`;
  }
} catch (e) {
  console.error("startup migration failed", e);
}

// Recompute all scores on boot (this also resolves the knockout bracket first),
// so a deploy that changes scoring logic - or third-placed teams confirmed by
// already-played results - is applied immediately, not only on the next result
// change. Deterministic and safe to run every startup.
try {
  await recomputeAll();
} catch (e) {
  console.error("startup recompute failed", e);
}

await app.listen({ port: PORT, host: "0.0.0.0" });
startPoller();
