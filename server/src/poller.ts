import cron from "node-cron";
import { syncMatches, syncFromEspn } from "./sync.js";
import { recomputeAll } from "./score.js";
import { syncScorers } from "./scorers.js";

// Live scores come from ESPN's free feed every 30s. A slow football-data pass
// every 10 min keeps the bracket structure fresh (knockout team resolution),
// which ESPN's score feed doesn't give us. Both are free.
let liveRunning = false;
let structRunning = false;

async function liveTick() {
  if (liveRunning) return;
  liveRunning = true;
  try {
    const changed = await syncFromEspn();
    if (changed > 0) {
      const n = await recomputeAll();
      console.log(`[espn] ${changed} match(es) changed → rescored ${n} predictions`);
    }
    await syncScorers(); // tally goal scorers for the Top Scorer competition
  } catch (e: any) {
    console.warn(`[espn] ${e.message}`);
  } finally {
    liveRunning = false;
  }
}

async function structTick() {
  if (structRunning) return;
  structRunning = true;
  try {
    await syncMatches(); // resolves knockout matchups; result scoring stays with ESPN
  } catch (e: any) {
    console.warn(`[struct] ${e.message}`);
  } finally {
    structRunning = false;
  }
}

export function startPoller() {
  cron.schedule("*/15 * * * * *", liveTick); // every 15 seconds
  console.log("[poller] ESPN live scores every 15s");
  // football-data structure sync is OFF: it overwrote ESPN's live scores with
  // stale/null data. ESPN is the source of truth for all live scores/results.
  // (Re-introduce a knockout-only structure resolver before the R32 if needed.)
  void structTick;
  liveTick();
}
