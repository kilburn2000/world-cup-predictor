import { useSyncExternalStore } from "react";
import type { LiveMatch } from "./api.js";

// A tiny external store the live-game demo writes to. When non-null, the live
// hooks serve these matches instead of the real feed, so the existing toasts and
// score cards animate against scripted data. See DemoController.
let matches: LiveMatch[] | null = null;
const listeners = new Set<() => void>();

export function setDemoMatches(m: LiveMatch[] | null) {
  matches = m;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useDemoMatches(): LiveMatch[] | null {
  return useSyncExternalStore(subscribe, () => matches, () => matches);
}
