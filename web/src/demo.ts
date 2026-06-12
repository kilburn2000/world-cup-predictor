import { useSyncExternalStore } from "react";
import type { LiveMatch, LeaderboardRow, EntrantGroup, TopScorerRow } from "./api.js";

// A tiny external store the live-game demo writes to. When non-null, the live +
// standings hooks serve these snapshots instead of the real feed, so every
// toast, score card, stat card and table animates against scripted data on each
// goal. See DemoController.
export interface DemoSnapshot {
  matches: LiveMatch[];
  leaderboard?: LeaderboardRow[];
  groups?: EntrantGroup[];
  topScorer?: TopScorerRow[];
}

let snap: DemoSnapshot | null = null;
const listeners = new Set<() => void>();

export function setDemo(s: DemoSnapshot | null) {
  snap = s;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function useSnap() {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

export function useDemoMatches() { return useSnap()?.matches ?? null; }
export function useDemoLeaderboard() { return useSnap()?.leaderboard ?? null; }
export function useDemoGroups() { return useSnap()?.groups ?? null; }
export function useDemoTopScorer() { return useSnap()?.topScorer ?? null; }
