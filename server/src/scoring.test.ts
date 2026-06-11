import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreGroupMatch, progressionPoints, DEFAULT_SCORING } from "@wc/shared";

const c = DEFAULT_SCORING; // outcome 1, teamGoals 1 (each), exactBonus 2, knockoutTeam 2

test("exact score = outcome + both teams' goals + exact bonus = 5", () => {
  const b = scoreGroupMatch(2, 0, 2, 0, c);
  assert.equal(b.outcome, true);
  assert.equal(b.homeGoals, true);
  assert.equal(b.awayGoals, true);
  assert.equal(b.exact, true);
  assert.equal(b.points, 5);
});

test("correct outcome + Team A goals, wrong Team B = 2", () => {
  // pred 2-1, actual 2-0: home win (1) + Team A's 2 right (1), Team B wrong, not exact.
  const b = scoreGroupMatch(2, 1, 2, 0, c);
  assert.equal(b.outcome, true);
  assert.equal(b.homeGoals, true);
  assert.equal(b.awayGoals, false);
  assert.equal(b.exact, false);
  assert.equal(b.points, 2);
});

test("correct outcome only (both goal counts wrong) = 1", () => {
  // pred 3-1, actual 2-0: home win (1), neither tally right.
  const b = scoreGroupMatch(3, 1, 2, 0, c);
  assert.equal(b.outcome, true);
  assert.equal(b.homeGoals, false);
  assert.equal(b.awayGoals, false);
  assert.equal(b.points, 1);
});

test("one team's goals right but wrong outcome = 1", () => {
  // pred 1-1 (draw), actual 2-1 (home win): Team B's 1 right, outcome wrong.
  const b = scoreGroupMatch(1, 1, 2, 1, c);
  assert.equal(b.outcome, false);
  assert.equal(b.awayGoals, true);
  assert.equal(b.points, 1);
});

test("everything wrong = 0", () => {
  const b = scoreGroupMatch(0, 2, 2, 0, c);
  assert.equal(b.points, 0);
});

test("progression: 2 of 3 predicted teams in position", () => {
  const r = progressionPoints([10, 11, 12], [10, 12, 99], c.knockoutTeam);
  assert.equal(r.correctTeamIds.length, 2);
  assert.equal(r.points, 4);
});
