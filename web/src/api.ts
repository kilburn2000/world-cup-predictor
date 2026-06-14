import { useQuery } from "@tanstack/react-query";
import { useDemoMatches, useDemoLeaderboard, useDemoGroups, useDemoTopScorer } from "./demo.js";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export interface LeaderboardRow {
  entrantId: number;
  name: string;
  total: number;
  nameIncomplete?: boolean;
  week1: number;
  week2: number;
  week3: number;
  r32: number;
  r16: number;
  /** number of exact group scorelines correctly predicted */
  exactCount: number;
  /** Optional (sent once the snapshot backend is enabled). */
  rank?: number;
  /** prev rank − current rank. Positive = climbed. */
  move?: number;
  /** recent ranks (oldest → newest) for the trend sparkline. */
  spark?: number[];
}
export interface GroupTable {
  group: string;
  rows: { teamId: number; name: string; played: number; points: number; gd: number }[];
}

export const useLeaderboard = () => {
  const demo = useDemoLeaderboard();
  const q = useQuery({ queryKey: ["leaderboard"], queryFn: () => get<LeaderboardRow[]>("/api/leaderboard"), refetchInterval: 15_000, enabled: demo == null });
  return demo ? ({ ...q, data: demo, isLoading: false, isError: false, error: null } as typeof q) : q;
};

export interface GroupEntrant {
  entrantId: number;
  name: string;
  nameIncomplete?: boolean;
  week1: number;
  week2: number;
  week3: number;
  total: number;
  rank: number;
  qualifying: boolean;
  live?: boolean;
}
export interface EntrantGroup {
  group: string;
  entrants: GroupEntrant[];
}
export const useGroups = () => {
  const demo = useDemoGroups();
  const q = useQuery({ queryKey: ["groups"], queryFn: () => get<EntrantGroup[]>("/api/groups"), refetchInterval: 15_000, enabled: demo == null });
  return demo ? ({ ...q, data: demo, isLoading: false, isError: false, error: null } as typeof q) : q;
};

export interface Consensus {
  name: string;
  week1: number;
  week2: number;
  week3: number;
  r32: number;
  r16: number;
  total: number;
}
export const useConsensus = () =>
  useQuery({ queryKey: ["consensus"], queryFn: () => get<Consensus>("/api/consensus"), refetchInterval: 15_000 });

export interface PhasesStarted {
  week1: boolean;
  week2: boolean;
  week3: boolean;
  r32: boolean;
  r16: boolean;
  // "done" = every game in that period is finished (prizes lock in then).
  week1Done: boolean;
  week2Done: boolean;
  week3Done: boolean;
  r32Done: boolean;
  r16Done: boolean;
  done: boolean;
}
export const usePhasesStarted = () =>
  useQuery({ queryKey: ["phases"], queryFn: () => get<PhasesStarted>("/api/phases"), refetchInterval: 30_000 });

// ---- Top Scorer side competition ----
export interface ScorerPick {
  name: string;
  country: string;
  goals: number;
}
export interface TopScorerRow {
  entrantId: number;
  name: string;
  nameIncomplete?: boolean;
  players: ScorerPick[];
  total: number;
}
export const useTopScorer = () => {
  const demo = useDemoTopScorer();
  const q = useQuery({ queryKey: ["top-scorer"], queryFn: () => get<TopScorerRow[]>("/api/top-scorer"), refetchInterval: 10_000, enabled: demo == null });
  return demo ? ({ ...q, data: demo, isLoading: false, isError: false, error: null } as typeof q) : q;
};

export interface AdminScorerPlayer {
  id: number;
  name: string;
  country: string;
  feedGoals: number;
  manualGoals: number | null;
  goals: number;
}
export async function getScorerPlayers(adminToken: string) {
  const res = await fetch("/api/admin/scorer-players", { headers: { "x-admin-token": adminToken } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AdminScorerPlayer[]>;
}
export async function setScorerGoals(id: number, manualGoals: number | null, adminToken: string) {
  const res = await fetch(`/api/admin/scorer-players/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ manualGoals }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface StatLeader {
  value: number;
  name: string | null;
  others: number;
}
export interface Stats {
  mostExact: StatLeader;
  mostResults: StatLeader;
  longestExactStreak: StatLeader;
  longestResultStreak: StatLeader;
}
export const useStats = () =>
  useQuery({ queryKey: ["stats"], queryFn: () => get<Stats>("/api/stats"), refetchInterval: 15_000 });

export const useTable = () =>
  useQuery({ queryKey: ["table"], queryFn: () => get<GroupTable[]>("/api/table") });

export interface ScoringConfig {
  outcome: number;
  teamGoals: number;
  exactBonus: number;
  knockoutTeam: number;
}

export const useScoringConfig = () =>
  useQuery({ queryKey: ["scoring-config"], queryFn: () => get<ScoringConfig>("/api/scoring-config") });

export async function saveScoringConfig(cfg: ScoringConfig, adminToken: string) {
  const res = await fetch("/api/admin/scoring-config", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; rescored: number }>;
}

export interface WallchartMatch {
  home: string;
  homeCode: string | null;
  away: string;
  awayCode: string | null;
  predHome: number;
  predAway: number;
  actualHome: number | null;
  actualAway: number | null;
  status: string;
  points: number | null;
}
export interface Wallchart {
  entrant: { id: number; name: string };
  totals: { total: number; MATCH: number; PROGRESSION: number; FINALTHIRD: number };
  groups: { group: string; matches: WallchartMatch[] }[];
  knockout: { round: string; label: string; slot: string; home: string; away: string; predHome: number; predAway: number }[];
}

export const useWallchart = (id: string | number) =>
  useQuery({ queryKey: ["wallchart", id], queryFn: () => get<Wallchart>(`/api/entrants/${id}/wallchart`), refetchInterval: 15_000 });

export interface EditGroup {
  matchId: number;
  group: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
}
export interface EditKnockout {
  slot: string;
  label: string;
  home: string | null;
  away: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
}
export interface EditWallchart {
  entrant: { id: number; name: string };
  groups: EditGroup[];
  knockout: EditKnockout[];
}

export const useEditWallchart = (id: string | number) =>
  useQuery({ queryKey: ["edit", id], queryFn: () => get<EditWallchart>(`/api/entrants/${id}/edit`) });

export interface EntrantRow {
  id: number;
  name: string;
  predictions: number;
  nameIncomplete?: boolean;
}

export async function setEntrantIncomplete(id: number, incomplete: boolean, adminToken: string) {
  const res = await fetch(`/api/admin/entrants/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ incomplete }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const useEntrants = () =>
  useQuery({ queryKey: ["entrants"], queryFn: () => get<EntrantRow[]>("/api/entrants") });

export async function uploadEntrant(name: string, file: File, adminToken: string) {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  const res = await fetch("/api/admin/import-entrant", {
    method: "POST",
    headers: { "x-admin-token": adminToken },
    body: form,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{
    entrant: string;
    groupPredictions: number;
    knockoutPredictions: number;
    unresolved: string[];
  }>;
}

export async function deleteEntrant(id: number, adminToken: string) {
  const res = await fetch(`/api/admin/entrants/${id}`, {
    method: "DELETE",
    headers: { "x-admin-token": adminToken },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function renameEntrant(id: number, name: string, adminToken: string) {
  const res = await fetch(`/api/admin/entrants/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface ParsedPrediction {
  kind: "group" | "knockout";
  slot?: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

export async function extractPhoto(file: File, adminToken: string) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/extract-photo", {
    method: "POST",
    headers: { "x-admin-token": adminToken },
    body: form,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ name: string; predictions: ParsedPrediction[]; unresolved: string[] }>;
}

export async function savePredictions(name: string, predictions: ParsedPrediction[], adminToken: string) {
  const res = await fetch("/api/admin/save-predictions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ name, predictions }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ entrant: string; groupPredictions: number; knockoutPredictions: number }>;
}

// ---- Live scores ----
export type LiveTier = "exact" | "diff" | "result" | "miss";

export interface LiveBoardRow {
  entrantId: number;
  name: string;
  pick: string; // "2-1"
  points: number | null; // null before kick-off
  tier: LiveTier | null;
}
export interface LiveEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "var";
  team: "home" | "away";
  player?: string;
  detail?: string;
  /** own goal (counts for `team`, scored by a `player` of the other team) */
  own?: boolean;
  /** goal scored from a penalty */
  penalty?: boolean;
}
export interface LiveMatch {
  id: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  stage: string;
  group?: string | null;
  venue?: string;
  status: "SCHEDULED" | "IN_PLAY" | "PAUSED" | "FINISHED";
  /** kickoff time (ISO) - present for upcoming fixtures. */
  kickoff?: string;
  /** null when not in play. */
  minute: number | null;
  /** ESPN half/period label, e.g. "First Half", "Halftime", "Second Half". */
  half?: string | null;
  period?: number | null;
  homeScore: number;
  awayScore: number;
  /** the logged-in entrant's own pick/points/tier for this match (null if not). */
  myPick?: string | null;
  myPoints?: number | null;
  myTier?: LiveTier | null;
  mostCommonScore?: string | null;
  mostCommonScoreCount?: number;
  mostCommonResult?: "HOME" | "DRAW" | "AWAY" | null;
  mostCommonResultCount?: number;
  mostCommonTotal?: number;
  events: LiveEvent[];
  /** entrants ranked by points they'd win if it ended at the current score. */
  board: LiveBoardRow[];
}

// ---- Fixtures + per-fixture entrant points ----
export interface Fixture {
  id: number;
  stage: string;
  group: string | null;
  matchday: number | null;
  kickoff: string | null;
  status: "SCHEDULED" | "IN_PLAY" | "FINISHED";
  home: string | null;
  homeCode: string | null;
  away: string | null;
  awayCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  mostCommonScore?: string | null;
  mostCommonScoreCount?: number;
  mostCommonResult?: "HOME" | "DRAW" | "AWAY" | null;
  mostCommonResultCount?: number;
  mostCommonTotal?: number;
  exactCorrect?: number;
  resultCorrect?: number;
  myPick?: string | null;
  myPoints?: number | null;
}
export const useFixtures = () =>
  useQuery({ queryKey: ["fixtures"], queryFn: () => get<Fixture[]>("/api/fixtures"), refetchInterval: 30_000 });

export interface FixtureDetail {
  match: {
    id: number; stage: string; group: string | null; kickoff: string | null; status: string;
    home: string | null; homeCode: string | null; away: string | null; awayCode: string | null;
    homeScore: number | null; awayScore: number | null;
  };
  played: boolean;
  board: LiveBoardRow[];
  events: LiveEvent[];
}
export const useFixture = (id: string | number) =>
  useQuery({ queryKey: ["fixture", id], queryFn: () => get<FixtureDetail>(`/api/fixtures/${id}`), refetchInterval: 30_000 });

// ---- Real World Cup: group tables + knockout bracket ----
export interface WcStanding {
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
export interface WcGroup {
  group: string;
  decided: boolean;
  table: WcStanding[];
}
export const useWcGroups = () =>
  useQuery({ queryKey: ["wc-groups"], queryFn: () => get<WcGroup[]>("/api/wc-groups"), refetchInterval: 30_000 });

export interface KoSide {
  label: string;
  team: { name: string; tla: string | null } | null;
  projected: boolean;
}
export interface KoMatch {
  match: number;
  a: KoSide;
  b: KoSide;
  kickoff: string | null;
  venue: string | null;
}
export interface KoRound {
  round: string;
  matches: KoMatch[];
}
export const useWcKnockout = () =>
  useQuery({ queryKey: ["wc-knockout"], queryFn: () => get<{ rounds: KoRound[] }>("/api/wc-knockout"), refetchInterval: 30_000 });

/** day: -1 yesterday, 0 today, +1 tomorrow. Polls every 15s. */
export const useLiveMatches = (day = 0) => {
  const demo = useDemoMatches();
  const demoOn = demo != null && day === 0;
  const q = useQuery({
    queryKey: ["live", day],
    queryFn: () => get<LiveMatch[]>(`/api/live?day=${day}`),
    refetchInterval: 10_000,
    enabled: !demoOn,
  });
  // During a demo, day-0 consumers (the toasts + today's scores) see the scripted
  // feed; the real query is paused and resumes when the demo ends.
  return demoOn ? ({ ...q, data: demo, isLoading: false, isError: false, error: null } as typeof q) : q;
};
