import { sql } from "./db/index.js";
import { ANNEX_C } from "./annexC.js";

// --- Group standings, computed from our own finished group matches ---
export interface StandingRow {
  teamId: number;
  name: string;
  tla: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  /** through to the knockouts: top 2 of the group, or one of the 8 best third-placed teams. */
  qualified: boolean;
}

// One played result, in whatever home/away orientation: just two teams + goals.
export interface ResultRow { h: number; a: number; hg: number; ag: number }
export interface TeamRow { id: number; name: string; tla: string | null; grp: string }
export type GroupTable = { group: string; decided: boolean; table: StandingRow[] };

// Build sorted group tables from a set of results, marking the teams that qualify
// for the knockouts: top two of every group, plus the 8 best third-placed teams.
// Pure (no DB) so it serves both the actual results and an entrant's predictions.
export function rankGroups(teams: TeamRow[], results: ResultRow[]): GroupTable[] {
  const stat = new Map<number, StandingRow & { grp: string }>();
  for (const t of teams)
    stat.set(t.id, { teamId: t.id, name: t.name, tla: t.tla, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, qualified: false, grp: t.grp });

  for (const m of results) {
    const H = stat.get(m.h);
    const A = stat.get(m.a);
    if (!H || !A) continue;
    H.played++; A.played++;
    H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
    if (m.hg > m.ag) { H.won++; H.points += 3; A.lost++; }
    else if (m.hg < m.ag) { A.won++; A.points += 3; H.lost++; }
    else { H.drawn++; A.drawn++; H.points++; A.points++; }
  }
  for (const s of stat.values()) s.gd = s.gf - s.ga;

  const groups = new Map<string, (StandingRow & { grp: string })[]>();
  for (const s of stat.values()) {
    if (!groups.has(s.grp)) groups.set(s.grp, []);
    groups.get(s.grp)!.push(s);
  }
  // Sort each group and mark the top two as qualified.
  const cmp = (a: StandingRow, b: StandingRow) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name);
  const sortedGroups = [...groups.keys()].sort().map((g) => {
    const rows = groups.get(g)!.sort(cmp);
    rows.forEach((r, i) => { if (i < 2) r.qualified = true; });
    return { group: g, rows };
  });

  // The 8 best third-placed teams across all 12 groups also go through. FIFA ranks
  // them by points, then goal difference, then goals scored, then disciplinary
  // conduct and finally drawing of lots - we don't track conduct, so ties beyond
  // goals scored fall back to name (rare, and the live R32 draw is authoritative).
  const thirds = sortedGroups.map((g) => g.rows[2]).filter(Boolean);
  thirds.sort(cmp);
  thirds.slice(0, 8).forEach((t) => { t.qualified = true; });

  return sortedGroups.map((g) => ({
    group: g.group,
    decided: g.rows.every((r) => r.played >= 3),
    table: g.rows.map(({ grp, ...r }) => r),
  }));
}

export async function teamsByGroup(): Promise<TeamRow[]> {
  return (await sql`select id, name, tla, group_name grp from teams where group_name is not null`) as any[];
}

// Actual group standings, from our own finished group matches.
export async function computeGroupStandings(): Promise<GroupTable[]> {
  const teams = await teamsByGroup();
  const matches = await sql`
    select home_team_id h, away_team_id a, home_goals hg, away_goals ag
    from matches
    where stage = 'GROUP' and status = 'FINISHED' and home_goals is not null and away_goals is not null
  `;
  return rankGroups(teams, matches as any[]);
}

// One entrant's PREDICTED group standings, from their group-stage MATCH picks.
// (They predict every group game, so their tables are always fully decided.)
export async function predictedGroupStandings(entrantId: number, teams?: TeamRow[]): Promise<GroupTable[]> {
  const t = teams ?? (await teamsByGroup());
  const preds = await sql`
    select p.pred_home_team_id h, p.pred_away_team_id a, p.pred_home_goals hg, p.pred_away_goals ag
    from predictions p
    join matches m on m.id = p.match_id
    where p.scope = 'MATCH' and m.stage = 'GROUP'
      and p.entrant_id = ${entrantId} and p.pred_home_team_id is not null and p.pred_away_team_id is not null
  `;
  return rankGroups(t, preds as any[]);
}

// --- Knockout bracket skeleton (2026 format, from Wikipedia) ---
type Src =
  | { type: "w" | "ru"; g: string }
  | { type: "third"; groups: string[] }
  | { type: "mw" | "ml"; m: number };

// Stadium for a knockout fixture by its bracket slot (R32-1..16, R16-1..8,
// QF-1..4, SF-1..2, THIRD, FINAL). Maps to the fixed FIFA match number 73-104.
// Group games have no scheduled venue here, so they return null.
export const venueForSlot = (slot: string | null | undefined): string | null => {
  if (!slot) return null;
  let n = slot === "THIRD" ? 103 : slot === "FINAL" ? 104 : 0;
  if (!n) {
    const [r, i] = slot.split("-");
    const k = Number(i);
    if (k) n = r === "R32" ? 72 + k : r === "R16" ? 88 + k : r === "QF" ? 96 + k : r === "SF" ? 100 + k : 0;
  }
  return (n && SCHEDULE[n]?.venue) || null;
};

// Group-stage venue by the football-data match id (api_match_id). The official
// 2026 schedule fixes a venue per match slot; sourced from the published group
// schedule and normalised to the same city labels as the knockout SCHEDULE above.
export const GROUP_VENUES: Record<number, string> = {
  // Group A
  537327: "Estadio Azteca, Mexico City", 537328: "Estadio Akron, Guadalajara", 537329: "Mercedes-Benz Stadium, Atlanta",
  537330: "Estadio Akron, Guadalajara", 537331: "Estadio Azteca, Mexico City", 537332: "Estadio BBVA, Guadalupe",
  // Group B
  537333: "BMO Field, Toronto", 537334: "Levi's Stadium, Santa Clara", 537335: "SoFi Stadium, Inglewood",
  537336: "BC Place, Vancouver", 537337: "BC Place, Vancouver", 537338: "Lumen Field, Seattle",
  // Group C
  537339: "MetLife Stadium, East Rutherford", 537340: "Gillette Stadium, Foxborough", 537341: "Lincoln Financial Field, Philadelphia",
  537342: "Gillette Stadium, Foxborough", 537343: "Hard Rock Stadium, Miami Gardens", 537344: "Mercedes-Benz Stadium, Atlanta",
  // Group D
  537345: "SoFi Stadium, Inglewood", 537346: "BC Place, Vancouver", 537347: "Levi's Stadium, Santa Clara",
  537348: "Lumen Field, Seattle", 537349: "SoFi Stadium, Inglewood", 537350: "Levi's Stadium, Santa Clara",
  // Group E
  537351: "NRG Stadium, Houston", 537352: "Lincoln Financial Field, Philadelphia", 537353: "BMO Field, Toronto",
  537354: "Arrowhead Stadium, Kansas City", 537355: "MetLife Stadium, East Rutherford", 537356: "Lincoln Financial Field, Philadelphia",
  // Group F
  537357: "AT&T Stadium, Arlington", 537358: "Estadio BBVA, Guadalupe", 537359: "NRG Stadium, Houston",
  537360: "Estadio BBVA, Guadalupe", 537361: "Arrowhead Stadium, Kansas City", 537362: "AT&T Stadium, Arlington",
  // Group G
  537363: "Lumen Field, Seattle", 537364: "SoFi Stadium, Inglewood", 537365: "SoFi Stadium, Inglewood",
  537366: "BC Place, Vancouver", 537367: "BC Place, Vancouver", 537368: "Lumen Field, Seattle",
  // Group H
  537369: "Mercedes-Benz Stadium, Atlanta", 537370: "Hard Rock Stadium, Miami Gardens", 537371: "Mercedes-Benz Stadium, Atlanta",
  537372: "Hard Rock Stadium, Miami Gardens", 537373: "Estadio Akron, Guadalajara", 537374: "NRG Stadium, Houston",
  // Group I
  537391: "MetLife Stadium, East Rutherford", 537392: "Gillette Stadium, Foxborough", 537393: "Lincoln Financial Field, Philadelphia",
  537394: "MetLife Stadium, East Rutherford", 537395: "Gillette Stadium, Foxborough", 537396: "BMO Field, Toronto",
  // Group J
  537397: "Arrowhead Stadium, Kansas City", 537398: "Levi's Stadium, Santa Clara", 537399: "AT&T Stadium, Arlington",
  537400: "Levi's Stadium, Santa Clara", 537401: "AT&T Stadium, Arlington", 537402: "Arrowhead Stadium, Kansas City",
  // Group K
  537403: "NRG Stadium, Houston", 537404: "Estadio Azteca, Mexico City", 537405: "NRG Stadium, Houston",
  537406: "Estadio Akron, Guadalajara", 537407: "Hard Rock Stadium, Miami Gardens", 537408: "Mercedes-Benz Stadium, Atlanta",
  // Group L
  537409: "AT&T Stadium, Arlington", 537410: "BMO Field, Toronto", 537411: "Gillette Stadium, Foxborough",
  537412: "BMO Field, Toronto", 537413: "MetLife Stadium, East Rutherford", 537414: "Lincoln Financial Field, Philadelphia",
};

// Fixed knockout schedule (UTC kickoff + venue), by match number. Formatted to
// British Summer Time on the client.
const SCHEDULE: Record<number, { kickoff: string; venue: string }> = {
  73: { kickoff: "2026-06-28T19:00:00Z", venue: "SoFi Stadium, Inglewood" },
  74: { kickoff: "2026-06-29T20:30:00Z", venue: "Gillette Stadium, Foxborough" },
  75: { kickoff: "2026-06-30T01:00:00Z", venue: "Estadio BBVA, Guadalupe" },
  76: { kickoff: "2026-06-29T17:00:00Z", venue: "NRG Stadium, Houston" },
  77: { kickoff: "2026-06-30T21:00:00Z", venue: "MetLife Stadium, East Rutherford" },
  78: { kickoff: "2026-06-30T17:00:00Z", venue: "AT&T Stadium, Arlington" },
  79: { kickoff: "2026-07-01T01:00:00Z", venue: "Estadio Azteca, Mexico City" },
  80: { kickoff: "2026-07-01T16:00:00Z", venue: "Mercedes-Benz Stadium, Atlanta" },
  81: { kickoff: "2026-07-02T00:00:00Z", venue: "Levi's Stadium, Santa Clara" },
  82: { kickoff: "2026-07-01T20:00:00Z", venue: "Lumen Field, Seattle" },
  83: { kickoff: "2026-07-02T23:00:00Z", venue: "BMO Field, Toronto" },
  84: { kickoff: "2026-07-02T19:00:00Z", venue: "SoFi Stadium, Inglewood" },
  85: { kickoff: "2026-07-03T03:00:00Z", venue: "BC Place, Vancouver" },
  86: { kickoff: "2026-07-03T22:00:00Z", venue: "Hard Rock Stadium, Miami Gardens" },
  87: { kickoff: "2026-07-04T01:30:00Z", venue: "Arrowhead Stadium, Kansas City" },
  88: { kickoff: "2026-07-03T18:00:00Z", venue: "AT&T Stadium, Arlington" },
  89: { kickoff: "2026-07-04T21:00:00Z", venue: "Lincoln Financial Field, Philadelphia" },
  90: { kickoff: "2026-07-04T17:00:00Z", venue: "NRG Stadium, Houston" },
  91: { kickoff: "2026-07-05T20:00:00Z", venue: "MetLife Stadium, East Rutherford" },
  92: { kickoff: "2026-07-06T00:00:00Z", venue: "Estadio Azteca, Mexico City" },
  93: { kickoff: "2026-07-06T19:00:00Z", venue: "AT&T Stadium, Arlington" },
  94: { kickoff: "2026-07-07T00:00:00Z", venue: "Lumen Field, Seattle" },
  95: { kickoff: "2026-07-07T16:00:00Z", venue: "Mercedes-Benz Stadium, Atlanta" },
  96: { kickoff: "2026-07-07T20:00:00Z", venue: "BC Place, Vancouver" },
  97: { kickoff: "2026-07-09T20:00:00Z", venue: "Gillette Stadium, Foxborough" },
  98: { kickoff: "2026-07-10T19:00:00Z", venue: "SoFi Stadium, Inglewood" },
  99: { kickoff: "2026-07-11T21:00:00Z", venue: "Hard Rock Stadium, Miami Gardens" },
  100: { kickoff: "2026-07-12T01:00:00Z", venue: "Arrowhead Stadium, Kansas City" },
  101: { kickoff: "2026-07-14T19:00:00Z", venue: "AT&T Stadium, Arlington" },
  102: { kickoff: "2026-07-15T19:00:00Z", venue: "Mercedes-Benz Stadium, Atlanta" },
  103: { kickoff: "2026-07-18T21:00:00Z", venue: "Hard Rock Stadium, Miami Gardens" },
  104: { kickoff: "2026-07-19T19:00:00Z", venue: "MetLife Stadium, East Rutherford" },
};

const R32: { match: number; a: Src; b: Src }[] = [
  { match: 73, a: { type: "ru", g: "A" }, b: { type: "ru", g: "B" } },
  { match: 74, a: { type: "w", g: "E" }, b: { type: "third", groups: ["A", "B", "C", "D", "F"] } },
  { match: 75, a: { type: "w", g: "F" }, b: { type: "ru", g: "C" } },
  { match: 76, a: { type: "w", g: "C" }, b: { type: "ru", g: "F" } },
  { match: 77, a: { type: "w", g: "I" }, b: { type: "third", groups: ["C", "D", "F", "G", "H"] } },
  { match: 78, a: { type: "ru", g: "E" }, b: { type: "ru", g: "I" } },
  { match: 79, a: { type: "w", g: "A" }, b: { type: "third", groups: ["C", "E", "F", "H", "I"] } },
  { match: 80, a: { type: "w", g: "L" }, b: { type: "third", groups: ["E", "H", "I", "J", "K"] } },
  { match: 81, a: { type: "w", g: "D" }, b: { type: "third", groups: ["B", "E", "F", "I", "J"] } },
  { match: 82, a: { type: "w", g: "G" }, b: { type: "third", groups: ["A", "E", "H", "I", "J"] } },
  { match: 83, a: { type: "ru", g: "K" }, b: { type: "ru", g: "L" } },
  { match: 84, a: { type: "w", g: "H" }, b: { type: "ru", g: "J" } },
  { match: 85, a: { type: "w", g: "B" }, b: { type: "third", groups: ["E", "F", "G", "I", "J"] } },
  { match: 86, a: { type: "w", g: "J" }, b: { type: "ru", g: "H" } },
  { match: 87, a: { type: "w", g: "K" }, b: { type: "third", groups: ["D", "E", "I", "J", "L"] } },
  { match: 88, a: { type: "ru", g: "D" }, b: { type: "ru", g: "G" } },
];

const LATER: { match: number; round: string; a: Src; b: Src }[] = [
  { match: 89, round: "Round of 16", a: { type: "mw", m: 74 }, b: { type: "mw", m: 77 } },
  { match: 90, round: "Round of 16", a: { type: "mw", m: 73 }, b: { type: "mw", m: 75 } },
  { match: 91, round: "Round of 16", a: { type: "mw", m: 76 }, b: { type: "mw", m: 78 } },
  { match: 92, round: "Round of 16", a: { type: "mw", m: 79 }, b: { type: "mw", m: 80 } },
  { match: 93, round: "Round of 16", a: { type: "mw", m: 83 }, b: { type: "mw", m: 84 } },
  { match: 94, round: "Round of 16", a: { type: "mw", m: 81 }, b: { type: "mw", m: 82 } },
  { match: 95, round: "Round of 16", a: { type: "mw", m: 86 }, b: { type: "mw", m: 88 } },
  { match: 96, round: "Round of 16", a: { type: "mw", m: 85 }, b: { type: "mw", m: 87 } },
  { match: 97, round: "Quarter-finals", a: { type: "mw", m: 89 }, b: { type: "mw", m: 90 } },
  { match: 98, round: "Quarter-finals", a: { type: "mw", m: 93 }, b: { type: "mw", m: 94 } },
  { match: 99, round: "Quarter-finals", a: { type: "mw", m: 91 }, b: { type: "mw", m: 92 } },
  { match: 100, round: "Quarter-finals", a: { type: "mw", m: 95 }, b: { type: "mw", m: 96 } },
  { match: 101, round: "Semi-finals", a: { type: "mw", m: 97 }, b: { type: "mw", m: 98 } },
  { match: 102, round: "Semi-finals", a: { type: "mw", m: 99 }, b: { type: "mw", m: 100 } },
  { match: 103, round: "Third-place play-off", a: { type: "ml", m: 101 }, b: { type: "ml", m: 102 } },
  { match: 104, round: "Final", a: { type: "mw", m: 101 }, b: { type: "mw", m: 102 } },
];

// --- Bracket resolver: fill the real knockout fixtures with actual teams ---
// The DB knockout fixture ids ARE the FIFA match numbers (73–104), so the slot
// label is derived directly from the id and matches what entrants predicted.
function slotForMatch(id: number): string | null {
  if (id >= 73 && id <= 88) return `R32-${id - 72}`;
  if (id >= 89 && id <= 96) return `R16-${id - 88}`;
  if (id >= 97 && id <= 100) return `QF-${id - 96}`;
  if (id === 101 || id === 102) return `SF-${id - 100}`;
  if (id === 103) return "THIRD";
  if (id === 104) return "FINAL";
  return null;
}

// Entrants' knockout predictions were imported with slot labels that DON'T line up
// with the actual fixtures' slot numbering (slotForMatch): e.g. an entrant's
// "R32-2" is really the fixture at match 76 ("R32-4"). Matching a prediction to a
// game by equal slot label therefore scored it against the wrong fixture. This map
// (entrant prediction slot -> the real FIFA match number it refers to) was recovered
// from the bracket's group-seed structure + feed graph and verified across every
// entrant. Use it - not the raw label - to tie predictions to fixtures.
export const PRED_SLOT_TO_MATCH: Record<string, number> = {
  "R32-1": 73, "R32-2": 76, "R32-3": 74, "R32-4": 75, "R32-5": 78, "R32-6": 77, "R32-7": 79, "R32-8": 80,
  "R32-9": 82, "R32-10": 81, "R32-11": 84, "R32-12": 83, "R32-13": 85, "R32-14": 88, "R32-15": 86, "R32-16": 87,
  "R16-1": 90, "R16-2": 89, "R16-3": 91, "R16-4": 92, "R16-5": 93, "R16-6": 94, "R16-7": 95, "R16-8": 96,
  "QF-1": 97, "QF-2": 98, "QF-3": 99, "QF-4": 100, "SF-1": 101, "SF-2": 102, "THIRD": 103, "FINAL": 104,
};

// Inverse: an actual fixture's bracket_slot -> the prediction slot label that means
// it. Built once from PRED_SLOT_TO_MATCH so scoring/display can look up the right
// predictions for a given fixture.
export const FIXTURE_SLOT_TO_PRED_SLOT: Record<string, string> = Object.fromEntries(
  Object.entries(PRED_SLOT_TO_MATCH).map(([pred, match]) => [slotForMatch(match)!, pred]),
);

const ALL_KO: { match: number; a: Src; b: Src }[] = [
  ...R32,
  ...LATER.map(({ match, a, b }) => ({ match, a, b })),
];

// The R32 match that hosts each group-winner-vs-third slot (winner -> match no).
const WINNER_MATCH: Record<string, number> = { A: 79, B: 85, D: 81, E: 74, G: 82, I: 77, K: 87, L: 80 };

// FIFA Annex C: work out which third-placed team fills each R32 third slot, from
// the group standings. The 8 best third-placed teams qualify (marked .qualified),
// and which winner each plays is a fixed published table (ANNEX_C), keyed by the
// set of 8 qualifying groups. Only resolves once all 12 groups are decided and
// exactly 8 thirds have qualified. Returns match-number -> the third-placed team.
export function thirdSlotTeams(
  standings: { group: string; decided: boolean; table: StandingRow[] }[],
): Map<number, StandingRow> {
  const out = new Map<number, StandingRow>();
  if (!standings.every((g) => g.decided)) return out;
  const thirdByGroup = new Map<string, StandingRow>();
  const qualGroups: string[] = [];
  for (const g of standings) {
    const third = g.table[2];
    if (!third) continue;
    thirdByGroup.set(g.group, third);
    if (third.qualified) qualGroups.push(g.group);
  }
  if (qualGroups.length !== 8) return out;
  const alloc = ANNEX_C[qualGroups.slice().sort().join("")];
  if (!alloc) return out;
  for (const [winnerGroup, thirdGroup] of Object.entries(alloc)) {
    const match = WINNER_MATCH[winnerGroup];
    const team = thirdByGroup.get(thirdGroup);
    if (match && team) out.set(match, team);
  }
  return out;
}

// Assign bracket slots and resolve actual teams into the knockout fixtures as
// results come in. Deterministic + idempotent; safe to run on every recompute.
//  - winner/runner-up sides resolve from our own group standings once a group is
//    fully played (decided);
//  - "winner/loser of match N" sides resolve from that tie's actual result
//    (explicit winner_team_id wins, else the higher score; a draw with no
//    recorded winner - i.e. an un-entered shootout - stays unresolved);
//  - third-placed sides are auto-filled from FIFA's Annex C table (thirdSlotTeams)
//    once all groups are decided, but ONLY when the slot is still empty - an
//    already-assigned third (admin or real draw) is never overwritten.
// Deterministic sides are owned by the resolver and overwritten/cleared to track
// corrections; third sides are filled-if-empty, then preserved.
export async function resolveBracket(): Promise<void> {
  // 1. Ensure every knockout fixture carries its bracket slot.
  for (const { match } of ALL_KO) {
    const slot = slotForMatch(match);
    if (slot) await sql`update matches set bracket_slot = ${slot} where id = ${match} and bracket_slot is distinct from ${slot}`;
  }

  // 2. Group winners / runners-up (only once a group is decided).
  const standings = await computeGroupStandings();
  const pos = new Map<string, { winner?: StandingRow; runnerUp?: StandingRow; decided: boolean }>();
  for (const g of standings) pos.set(g.group, { winner: g.table[0], runnerUp: g.table[1], decided: g.decided });
  // FIFA Annex C: which third-placed team belongs in each R32 third slot.
  const thirds = thirdSlotTeams(standings);

  // 3. Knockout fixtures in memory, ascending so later rounds see resolved earlier ones.
  const ko = (await sql`
    select id, home_team_id, away_team_id, home_goals, away_goals, winner_team_id, status
    from matches where stage <> 'GROUP' order by id
  `) as any[];
  const byId = new Map<number, any>(ko.map((m) => [m.id, m]));

  const winnerOf = (id: number): number | null => {
    const m = byId.get(id);
    if (!m || m.status !== "FINISHED") return null;
    if (m.winner_team_id) return m.winner_team_id;
    if (m.home_goals == null || m.away_goals == null || m.home_goals === m.away_goals) return null;
    return m.home_goals > m.away_goals ? m.home_team_id : m.away_team_id;
  };
  const loserOf = (id: number): number | null => {
    const m = byId.get(id);
    const w = winnerOf(id);
    if (!m || !w || !m.home_team_id || !m.away_team_id) return null;
    return w === m.home_team_id ? m.away_team_id : m.home_team_id;
  };
  const resolveSrc = (s: Src): number | null => {
    if (s.type === "w") { const p = pos.get(s.g); return p?.decided ? p.winner?.teamId ?? null : null; }
    if (s.type === "ru") { const p = pos.get(s.g); return p?.decided ? p.runnerUp?.teamId ?? null : null; }
    if (s.type === "third") return null; // admin-assigned
    if (s.type === "mw") return winnerOf(s.m);
    if (s.type === "ml") return loserOf(s.m);
    return null;
  };

  // 4. Apply, in ascending order.
  const bySrc = new Map(ALL_KO.map((m) => [m.match, m]));
  for (const m of ko) {
    const src = bySrc.get(m.id);
    if (!src) continue;
    let h = m.home_team_id, a = m.away_team_id, changed = false;
    if (src.a.type === "third") { const t = thirds.get(m.id); if (t && m.home_team_id == null) { h = t.teamId; changed = true; } }
    else { const v = resolveSrc(src.a); if (v !== m.home_team_id) { h = v; changed = true; } }
    if (src.b.type === "third") { const t = thirds.get(m.id); if (t && m.away_team_id == null) { a = t.teamId; changed = true; } }
    else { const v = resolveSrc(src.b); if (v !== m.away_team_id) { a = v; changed = true; } }
    if (changed) {
      await sql`update matches set home_team_id = ${h}, away_team_id = ${a} where id = ${m.id}`;
      m.home_team_id = h; m.away_team_id = a; // keep fresh for downstream winnerOf
    }
  }
}

export async function buildKnockout() {
  const standings = await computeGroupStandings();
  const pos = new Map<string, { winner?: StandingRow; runnerUp?: StandingRow; decided: boolean }>();
  for (const g of standings) pos.set(g.group, { winner: g.table[0], runnerUp: g.table[1], decided: g.decided });
  const thirds = thirdSlotTeams(standings);

  const resolve = (s: Src, matchNo: number) => {
    if (s.type === "w") {
      const p = pos.get(s.g);
      // only reveal the team once the group is confirmed (fully played)
      const team = p?.decided ? p.winner : undefined;
      return { label: `Winner ${s.g}`, team: team ? { name: team.name, tla: team.tla } : null, projected: false };
    }
    if (s.type === "ru") {
      const p = pos.get(s.g);
      const team = p?.decided ? p.runnerUp : undefined;
      return { label: `Runner-up ${s.g}`, team: team ? { name: team.name, tla: team.tla } : null, projected: false };
    }
    if (s.type === "third") { const t = thirds.get(matchNo); return { label: `3rd ${s.groups.join("/")}`, team: t ? { name: t.name, tla: t.tla } : null, projected: false }; }
    if (s.type === "ml") return { label: `Loser of match ${s.m}`, team: null, projected: false };
    if (s.type === "mw") return { label: `Winner of match ${s.m}`, team: null, projected: false };
    return { label: "TBD", team: null, projected: false };
  };

  const withSched = (m: { match: number; a: Src; b: Src }) => ({
    match: m.match,
    a: resolve(m.a, m.match),
    b: resolve(m.b, m.match),
    kickoff: SCHEDULE[m.match]?.kickoff ?? null,
    venue: SCHEDULE[m.match]?.venue ?? null,
  });

  const r32 = { round: "Round of 32", matches: R32.map(withSched) };
  const laterRounds = ["Round of 16", "Quarter-finals", "Semi-finals", "Third-place play-off", "Final"].map((round) => ({
    round,
    matches: LATER.filter((m) => m.round === round).map(withSched),
  }));
  return { rounds: [r32, ...laterRounds] };
}
