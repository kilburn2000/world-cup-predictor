import { sql } from "./db/index.js";

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
}

export async function computeGroupStandings(): Promise<{ group: string; decided: boolean; table: StandingRow[] }[]> {
  const teams = await sql`select id, name, tla, group_name grp from teams where group_name is not null`;
  const matches = await sql`
    select home_team_id h, away_team_id a, home_goals hg, away_goals ag
    from matches
    where stage = 'GROUP' and status = 'FINISHED' and home_goals is not null and away_goals is not null
  `;
  const stat = new Map<number, StandingRow & { grp: string }>();
  for (const t of teams as any[])
    stat.set(t.id, { teamId: t.id, name: t.name, tla: t.tla, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, grp: t.grp });

  for (const m of matches as any[]) {
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
  return [...groups.keys()].sort().map((g) => {
    const rows = groups.get(g)!.sort(
      (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name),
    );
    return {
      group: g,
      decided: rows.every((r) => r.played >= 3),
      table: rows.map(({ grp, ...r }) => r),
    };
  });
}

// --- Knockout bracket skeleton (2026 format, from Wikipedia) ---
type Src =
  | { type: "w" | "ru"; g: string }
  | { type: "third"; groups: string[] }
  | { type: "mw" | "ml"; m: number };

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

const ALL_KO: { match: number; a: Src; b: Src }[] = [
  ...R32,
  ...LATER.map(({ match, a, b }) => ({ match, a, b })),
];

// Assign bracket slots and resolve actual teams into the knockout fixtures as
// results come in. Deterministic + idempotent; safe to run on every recompute.
//  - winner/runner-up sides resolve from our own group standings once a group is
//    fully played (decided);
//  - "winner/loser of match N" sides resolve from that tie's actual result
//    (explicit winner_team_id wins, else the higher score; a draw with no
//    recorded winner — i.e. an un-entered shootout — stays unresolved);
//  - third-placed sides are NOT touched here (admin assigns those, since FIFA's
//    best-thirds slotting is a published lookup, not derivable from standings).
// Deterministic sides are owned by the resolver and overwritten/cleared to track
// corrections; third sides are preserved.
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
    if (src.a.type !== "third") { const v = resolveSrc(src.a); if (v !== m.home_team_id) { h = v; changed = true; } }
    if (src.b.type !== "third") { const v = resolveSrc(src.b); if (v !== m.away_team_id) { a = v; changed = true; } }
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

  const resolve = (s: Src) => {
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
    if (s.type === "third") return { label: `3rd ${s.groups.join("/")}`, team: null, projected: false };
    if (s.type === "ml") return { label: `Loser of match ${s.m}`, team: null, projected: false };
    if (s.type === "mw") return { label: `Winner of match ${s.m}`, team: null, projected: false };
    return { label: "TBD", team: null, projected: false };
  };

  const withSched = (m: { match: number; a: Src; b: Src }) => ({
    match: m.match,
    a: resolve(m.a),
    b: resolve(m.b),
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
