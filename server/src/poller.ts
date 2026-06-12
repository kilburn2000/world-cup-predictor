import cron from "node-cron";
import { syncMatches, syncFromEspn } from "./sync.js";
import { recomputeAll } from "./score.js";
import { syncScorers, backfillScorers } from "./scorers.js";

// Live scores come from ESPN's free feed every 30s. A slow football-data pass
// every 10 min keeps the bracket structure fresh (knockout team resolution),
// which ESPN's score feed doesn't give us. Both are free.
let liveRunning = false;
let structRunning = false;
let scorerRunning = false;

async function liveTick() {
  if (liveRunning) return;
  liveRunning = true;
  try {
    const changed = await syncFromEspn();
    if (changed > 0) {
      const n = await recomputeAll();
      console.log(`[espn] ${changed} match(es) changed → rescored ${n} predictions`);
    }
  } catch (e: any) {
    console.warn(`[espn] ${e.message}`);
  } finally {
    liveRunning = false;
  }
}

// Top Scorer feed runs on its own faster cadence so goal tallies update promptly.
async function scorerTick() {
  if (scorerRunning) return;
  scorerRunning = true;
  try {
    await syncScorers();
  } catch (e: any) {
    console.warn(`[scorers] ${e.message}`);
  } finally {
    scorerRunning = false;
  }
}

// Backfill finished matches that dropped off the live scoreboard (key events +
// scorers), so past results aren't blank. Runs at startup and periodically.
let backfillRunning = false;
async function backfillTick() {
  if (backfillRunning) return;
  backfillRunning = true;
  try {
    const n = await backfillScorers();
    if (n > 0) console.log(`[scorers] backfilled ${n} finished match(es)`);
  } catch (e: any) {
    console.warn(`[backfill] ${e.message}`);
  } finally {
    backfillRunning = false;
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
  cron.schedule("*/10 * * * * *", scorerTick); // Top Scorer feed + live events, every 10s
  cron.schedule("0 */5 * * * *", backfillTick); // backfill finished matches every 5 min
  console.log("[poller] ESPN live scores every 15s, scorer/events feed every 10s");
  // football-data structure sync is OFF: it overwrote ESPN's live scores with
  // stale/null data. ESPN is the source of truth for all live scores/results.
  // (Re-introduce a knockout-only structure resolver before the R32 if needed.)
  void structTick;
  liveTick();
  scorerTick();
  backfillTick();
}
