import { useQuery } from "@tanstack/react-query";
import { useDemoMatches, useDemoLeaderboard, useDemoGroups, useDemoTopScorer } from "./demo.js";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/** one of an entrant's recent games, for a form chip + its hover tooltip. */
export interface FormGame {
  points: number;
  tier: LiveTier | null;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  hs: number;
  as: number;
  predHome: number;
  predAway: number;
  /** knockout only: the teams the entrant predicted for this tie (code + name). */
  predHomeCode?: string | null;
  predAwayCode?: string | null;
  predHomeTeam?: string | null;
  predAwayTeam?: string | null;
  /** true when this is the match currently in play (provisional points so far) */
  live?: boolean;
}

/** one game on an entrant's position-trend graph: their points + rank after it. */
export interface TrendPoint {
  matchId: number;
  kickoff: string;
  /** short phase label (Week 1 / R32 / ...) - used to draw week/round breaks */
  phase: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  hs: number;
  as: number;
  predHome: number | null;
  predAway: number | null;
  points: number;
  tier: LiveTier | null;
  cumulative: number;
  rank: number;
  /** Top Scorer trend: who scored that game (instead of a prediction). */
  note?: string;
}
export interface TrendData {
  scope: string;
  entrant: string;
  fieldSize: number;
  points: TrendPoint[];
}
export const useEntrantTrend = (id: number | null, scope: string, enabled: boolean) =>
  useQuery({
    queryKey: ["trend", id, scope],
    queryFn: () => get<TrendData>(`/api/entrants/${id}/trend?scope=${scope}`),
    enabled: enabled && id != null,
    staleTime: 30_000,
  });

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
  /** number of correct results (right outcome) predicted */
  resultCount: number;
  /** Optional (sent once the snapshot backend is enabled). */
  rank?: number;
  /** prev rank − current rank. Positive = climbed. */
  move?: number;
  /** recent ranks (oldest → newest) for the trend sparkline. */
  spark?: number[];
  /** the in-play provisional portion of total/week/exact (already folded into
   * those fields). Lets the client re-derive the tally from the live feed so it
   * tracks the chips in real time. Absent when the entrant has no live game. */
  live?: { total: number; week1: number; week2: number; week3: number; exact: number };
  /** each of the entrant's last (up to) 5 finished games, oldest first, with
   * enough to render a per-game form tooltip. */
  last5?: FormGame[];
  /** the same, but split per standings phase (week1/2/3, r32, r16) so each
   * week-by-week table shows form scoped to that phase's games. */
  formByPhase?: Partial<Record<"week1" | "week2" | "week3" | "r32" | "r16", FormGame[]>>;
  /** exact/result counts per phase, so each week-by-week table can break ties
   * the same way Overall does (scoped to that phase's games). */
  statsByPhase?: Partial<Record<"week1" | "week2" | "week3" | "r32" | "r16", { exact: number; result: number }>>;
}
export interface GroupTable {
  group: string;
  rows: { teamId: number; name: string; played: number; points: number; gd: number }[];
}

export const useLeaderboard = () => {
  const demo = useDemoLeaderboard();
  const q = useQuery({ queryKey: ["leaderboard"], queryFn: () => get<LeaderboardRow[]>("/api/leaderboard"), refetchInterval: 10_000, enabled: demo == null });
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
  /** the entrant's overall points (whole tournament) - the group competition's
   * secondary tiebreak after group points. */
  overallTotal: number;
  rank: number;
  qualifying: boolean;
  live?: boolean;
  /** last up-to-5 finished games in the entrant's own WC group, for the form column. */
  last5?: FormGame[];
  /** exact/result counts on the entrant's own WC group games, for the tiebreak. */
  exactCount?: number;
  resultCount?: number;
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

// The entrant player-vs-player knockout bracket (16 group qualifiers).
export interface EntrantKoPlayer { id: number; name: string; points: number }
export interface EntrantKoTie { a: EntrantKoPlayer | null; b: EntrantKoPlayer | null; winnerId: number | null; decided: boolean }
export interface EntrantKoRound { round: string; label: string; stage: string; started: boolean; decided: boolean; ties: EntrantKoTie[] }
export interface EntrantKnockout { qualified: boolean; rounds: EntrantKoRound[] }
export const useEntrantKnockout = () =>
  useQuery({ queryKey: ["entrant-knockout"], queryFn: () => get<EntrantKnockout>("/api/entrant-knockout"), refetchInterval: 30_000 });

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
  /** raw "a game in this round has kicked off" (unlike r32/r16 which also count the
   *  previous round finishing) - so a round prize stays empty until it's played. */
  r32Started: boolean;
  r16Started: boolean;
  done: boolean;
  /** The current "football day" (YYYY-MM-DD, host/Pacific date) - rolls over when
   *  the day's last game ends, not at midnight. Anchors Yesterday/Today/Tomorrow. */
  currentDay: string;
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
  drawOutcome: number;
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
  knockout: {
    round: string; label: string; slot: string;
    home: string; away: string; predHome: number; predAway: number;
    actualHome: string | null; actualAway: string | null;
    actualHomeCode: string | null; actualAwayCode: string | null;
    actualHomeScore: number | null; actualAwayScore: number | null;
    homeCorrect: boolean; awayCorrect: boolean;
    homeGoalsCorrect: boolean; awayGoalsCorrect: boolean; scoreCorrect: boolean;
    status: string | null; points: number | null;
  }[];
  /** the entrant's predicted final group tables (same shape as /api/wc-groups). */
  predictedStandings: WcGroup[];
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
  entrant: { id: number; name: string; email: string | null };
  groups: EditGroup[];
  knockout: EditKnockout[];
}

// Admin: update an entrant's name and/or their login account email + password.
export async function updateEntrant(id: number, patch: { name?: string; email?: string; password?: string }, adminToken: string) {
  const res = await fetch(`/api/admin/entrants/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json();
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

export interface PredictionDiff {
  entrant: string;
  exists: boolean;
  group: { changed: { fixture: string; from: string; to: string }[]; added: { fixture: string; to: string }[]; missing: string[]; unchanged: number };
  knockout: { changed: { slot: string; from: string; to: string }[]; added: { slot: string; to: string }[]; missing: string[]; unchanged: number };
  totalNew: number;
  totalChanged: number;
}

// Preview the changes a parsed sheet would make, before committing the replace.
export async function diffPredictions(name: string, predictions: ParsedPrediction[], adminToken: string) {
  const res = await fetch("/api/admin/diff-predictions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ name, predictions }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<PredictionDiff>;
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
  /** knockout only: the entrant's own predicted teams for the slot (code + name). */
  predHome?: string | null;
  predAway?: string | null;
  predHomeName?: string | null;
  predAwayName?: string | null;
  /** knockout draw: which side the entrant has advancing on penalties. */
  penSide?: "home" | "away" | null;
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
  matchday?: number | null;
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
  /** knockout tie level after 90 mins: which side won the shootout, + pens score. */
  penWinner?: "home" | "away" | null;
  homePens?: number | null;
  awayPens?: number | null;
  /** the logged-in entrant's own pick/points/tier for this match (null if not). */
  myPick?: string | null;
  myPoints?: number | null;
  myTier?: LiveTier | null;
  /** the teams the logged-in entrant predicted for this match (knockouts: their
   *  bracket matchup, which can differ from the actual fixture; groups: the fixture
   *  teams). null when they have no pick. */
  myPredHomeCode?: string | null;
  myPredAwayCode?: string | null;
  myPredHomeName?: string | null;
  myPredAwayName?: string | null;
  mostCommonScore?: string | null;
  mostCommonScoreCount?: number;
  mostCommonResult?: "HOME" | "DRAW" | "AWAY" | null;
  mostCommonResultCount?: number;
  mostCommonTotal?: number;
  /** knockout: the single most-predicted full pick (teams + score) for the slot. */
  koMatchup?: { home: string; away: string; homeName: string; awayName: string; score: string; count: number; penSide?: "home" | "away" | null } | null;
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
// /api/fixtures now returns the same rich LiveMatch shape as /api/live (full
// board + events per fixture), so the fixtures page can use the match cards.
export const useFixtures = () =>
  useQuery({ queryKey: ["fixtures"], queryFn: () => get<LiveMatch[]>("/api/fixtures"), refetchInterval: 30_000 });

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
  /** through to the knockouts (top 2, or one of the 8 best third-placed teams). */
  qualified: boolean;
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
