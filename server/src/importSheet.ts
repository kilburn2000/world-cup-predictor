import "dotenv/config";
import * as XLSX from "xlsx";
import { sql } from "./db/index.js";

// Normalised team-name aliasing: a few sheet names differ from the football-data
// names. Used by the resolver shared between the spreadsheet and photo importers.
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z]/g, "");
const ALIAS: Record<string, string> = {
  [norm("Bosnia - Hertz")]: norm("Bosnia"),
  [norm("Cape Verde Islands")]: norm("Cape Verde"),
  [norm("Columbia")]: norm("Colombia"),
  [norm("IR Iran")]: norm("Iran"),
  [norm("Rep. of Korea")]: norm("South Korea"),
  [norm("Turkiye")]: norm("Türkiye"),
  [norm("USA")]: norm("United States"),
};

// Normalised prediction list - the common shape produced by EITHER the
// spreadsheet parser or the (forthcoming) photo extractor, then handed to
// savePredictions(). Group fixtures map by team pair; knockouts carry a slot.
export type ParsedPrediction =
  | { kind: "group"; home: string; away: string; homeGoals: number; awayGoals: number }
  | { kind: "knockout"; slot: string; home: string; away: string; homeGoals: number; awayGoals: number };

export interface ImportResult {
  entrant: string;
  groupPredictions: number;
  knockoutPredictions: number;
  unresolved: string[];
}

// Entry To Copy row (1-based) -> knockout bracket slot. Rows 1-72 are group
// fixtures; the template's knockout order is fixed.
function knockoutSlot(row: number): string | null {
  if (row <= 72) return null;
  if (row <= 88) return `R32-${row - 72}`;
  if (row <= 96) return `R16-${row - 88}`;
  if (row <= 100) return `QF-${row - 96}`;
  if (row <= 102) return `SF-${row - 100}`;
  if (row === 103) return "THIRD";
  if (row === 104) return "FINAL";
  return null;
}

// Parse the spreadsheet's "Entry To Copy" sheet into the common prediction shape.
export function parseEntrySheet(file: Buffer): ParsedPrediction[] {
  const wb = XLSX.read(file, { type: "buffer" });
  const ws = wb.Sheets["Entry To Copy"];
  if (!ws) throw new Error('Sheet "Entry To Copy" not found - is this the right template?');
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });

  const out: ParsedPrediction[] = [];
  for (let i = 1; i <= 104 && i < rows.length; i++) {
    const r = rows[i] as any[];
    const home = String(r[0] ?? "").trim();
    const homeGoals = Number(r[1]);
    const awayGoals = Number(r[2]);
    const away = String(r[3] ?? "").trim();
    if (!home || !away || Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) continue;

    const slot = knockoutSlot(i);
    if (slot) out.push({ kind: "knockout", slot, home, away, homeGoals, awayGoals });
    else out.push({ kind: "group", home, away, homeGoals, awayGoals });
  }
  return out;
}

// Resolve team names, upsert the entrant in the Main League, and replace their
// predictions. Shared by every import source.
export async function savePredictions(
  entrantName: string,
  predictions: ParsedPrediction[],
): Promise<ImportResult> {
  const dbTeams = await sql`select id, name from teams`;
  const byNorm = new Map<string, number>(dbTeams.map((t: any) => [norm(t.name), t.id]));
  const unresolved = new Set<string>();
  const resolve = (name: string): number | null => {
    const n = norm(name);
    // Try the literal name first, then the alias - a real team name must never
    // be rerouted by an alias (e.g. "Cape Verde" exists; don't send it to an alias).
    const id = byNorm.get(n) ?? byNorm.get(ALIAS[n] ?? "");
    if (!id && name.trim()) unresolved.add(name.trim());
    return id ?? null;
  };

  // Group fixture lookup: sorted team-id pair -> match id.
  const groupMatches = await sql`select id, home_team_id, away_team_id from matches where stage = 'GROUP'`;
  const pairToMatch = new Map<string, number>();
  for (const m of groupMatches as any[]) {
    pairToMatch.set([m.home_team_id, m.away_team_id].sort((a, b) => a - b).join("-"), m.id);
  }

  const [{ id: leagueId }] = await sql`select id from leagues where join_code = 'MAIN'`;
  const existing = await sql`select id from entrants where league_id = ${leagueId} and name = ${entrantName}`;
  const entrantId = existing.length
    ? existing[0].id
    : (await sql`insert into entrants (league_id, name) values (${leagueId}, ${entrantName}) returning id`)[0].id;
  await sql`delete from predictions where entrant_id = ${entrantId}`;

  let groupCount = 0;
  let koCount = 0;
  for (const p of predictions) {
    const homeId = resolve(p.home);
    const awayId = resolve(p.away);
    if (!homeId || !awayId) continue;

    if (p.kind === "group") {
      const matchId = pairToMatch.get([homeId, awayId].sort((a, b) => a - b).join("-"));
      if (!matchId) continue;
      await sql`
        insert into predictions (entrant_id, scope, match_id, pred_home_team_id, pred_away_team_id, pred_home_goals, pred_away_goals)
        values (${entrantId}, 'MATCH', ${matchId}, ${homeId}, ${awayId}, ${p.homeGoals}, ${p.awayGoals})
        on conflict (entrant_id, match_id) do update set
          pred_home_team_id = excluded.pred_home_team_id, pred_away_team_id = excluded.pred_away_team_id,
          pred_home_goals = excluded.pred_home_goals, pred_away_goals = excluded.pred_away_goals
      `;
      groupCount++;
    } else {
      await sql`
        insert into predictions (entrant_id, scope, bracket_slot, pred_home_team_id, pred_away_team_id, pred_home_goals, pred_away_goals)
        values (${entrantId}, 'SLOT', ${p.slot}, ${homeId}, ${awayId}, ${p.homeGoals}, ${p.awayGoals})
        on conflict (entrant_id, bracket_slot) do update set
          pred_home_team_id = excluded.pred_home_team_id, pred_away_team_id = excluded.pred_away_team_id,
          pred_home_goals = excluded.pred_home_goals, pred_away_goals = excluded.pred_away_goals
      `;
      koCount++;
    }
  }

  return { entrant: entrantName, groupPredictions: groupCount, knockoutPredictions: koCount, unresolved: [...unresolved] };
}

// Spreadsheet import = parse + save.
export async function runImport(file: Buffer, entrantName: string): Promise<ImportResult> {
  return savePredictions(entrantName, parseEntrySheet(file));
}

export interface PredictionDiff {
  entrant: string;
  exists: boolean;
  group: { changed: { fixture: string; from: string; to: string }[]; added: { fixture: string; to: string }[]; missing: string[]; unchanged: number };
  knockout: { changed: { slot: string; from: string; to: string }[]; added: { slot: string; to: string }[]; missing: string[]; unchanged: number };
  totalNew: number;
  totalChanged: number;
}

// Compare a parsed prediction set against what's currently stored for an entrant,
// WITHOUT writing anything. Powers the admin "preview changes before replace" step.
export async function diffAgainstCurrent(entrantName: string, predictions: ParsedPrediction[]): Promise<PredictionDiff> {
  const dbTeams = await sql`select id, name from teams`;
  const idToName = new Map<number, string>(dbTeams.map((t: any) => [t.id, t.name]));
  const byNorm = new Map<string, number>(dbTeams.map((t: any) => [norm(t.name), t.id]));
  const resolve = (name: string) => byNorm.get(norm(name)) ?? byNorm.get(ALIAS[norm(name)] ?? "") ?? null;
  const groupMatches = await sql`select id, home_team_id, away_team_id from matches where stage = 'GROUP'`;
  const pairToMatch = new Map<string, number>();
  for (const m of groupMatches as any[]) pairToMatch.set([m.home_team_id, m.away_team_id].sort((a, b) => a - b).join("-"), m.id);

  const league = await sql`select id from leagues where join_code = 'MAIN'`;
  const ent = league.length ? await sql`select id from entrants where league_id = ${league[0].id} and name = ${entrantName}` : [];
  const exists = ent.length > 0;
  const rows = exists
    ? await sql`select scope, match_id, bracket_slot, pred_home_team_id as h, pred_away_team_id as a, pred_home_goals as hg, pred_away_goals as ag from predictions where entrant_id = ${ent[0].id}`
    : [];
  const curGroup = new Map<number, string>(); // matchId -> "hg-ag" (in match orientation)
  const curKo = new Map<string, string>();     // slot -> "Home hg-ag Away"
  for (const r of rows as any[]) {
    if (r.scope === "MATCH") curGroup.set(r.match_id, `${r.hg}-${r.ag}`);
    else curKo.set(r.bracket_slot, `${idToName.get(r.h)} ${r.hg}-${r.ag} ${idToName.get(r.a)}`);
  }

  const diff: PredictionDiff = {
    entrant: entrantName, exists,
    group: { changed: [], added: [], missing: [], unchanged: 0 },
    knockout: { changed: [], added: [], missing: [], unchanged: 0 },
    totalNew: predictions.length, totalChanged: 0,
  };
  const seenMatches = new Set<number>();
  const seenSlots = new Set<string>();
  for (const p of predictions) {
    if (p.kind === "group") {
      const h = resolve(p.home), a = resolve(p.away);
      if (!h || !a) continue;
      const mid = pairToMatch.get([h, a].sort((x, y) => x - y).join("-"));
      if (!mid) continue;
      seenMatches.add(mid);
      // express the new score in the DB's match orientation (home_team_id first)
      const matchHomeIsP = idToName.get(h) === idToName.get((groupMatches as any[]).find((m) => m.id === mid).home_team_id);
      const newScore = matchHomeIsP ? `${p.homeGoals}-${p.awayGoals}` : `${p.awayGoals}-${p.homeGoals}`;
      const fixture = `${idToName.get(h)} v ${idToName.get(a)}`;
      const old = curGroup.get(mid);
      if (old === undefined) diff.group.added.push({ fixture, to: `${p.homeGoals}-${p.awayGoals}` });
      else if (old !== newScore) diff.group.changed.push({ fixture, from: old, to: newScore });
      else diff.group.unchanged++;
    } else {
      seenSlots.add(p.slot);
      const to = `${p.home} ${p.homeGoals}-${p.awayGoals} ${p.away}`;
      const old = curKo.get(p.slot);
      if (old === undefined) diff.knockout.added.push({ slot: p.slot, to });
      else if (old !== to) diff.knockout.changed.push({ slot: p.slot, from: old, to });
      else diff.knockout.unchanged++;
    }
  }
  for (const [mid] of curGroup) if (!seenMatches.has(mid)) diff.group.missing.push((groupMatches as any[]).filter((m) => m.id === mid).map((m) => `${idToName.get(m.home_team_id)} v ${idToName.get(m.away_team_id)}`)[0]);
  for (const [slot] of curKo) if (!seenSlots.has(slot)) diff.knockout.missing.push(slot);
  diff.totalChanged = diff.group.changed.length + diff.group.added.length + diff.knockout.changed.length + diff.knockout.added.length;
  return diff;
}

// Which predicted team names don't map to a known team (for the review step).
export async function checkUnresolved(predictions: ParsedPrediction[]): Promise<string[]> {
  const dbTeams = await sql`select name from teams`;
  const known = new Set<string>(dbTeams.map((t: any) => norm(t.name)));
  const bad = new Set<string>();
  for (const p of predictions) {
    for (const name of [p.home, p.away]) {
      const n = norm(name);
      if (name && !known.has(n) && !known.has(ALIAS[n] ?? "")) bad.add(name);
    }
  }
  return [...bad];
}
