import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreGroupMatch, progressionPoints, DEFAULT_SCORING } from "@wc/shared";

const c = DEFAULT_SCORING;

test("exact group score = outcome + GD + exact = 20", () => {
  const b = scoreGroupMatch(2, 1, 2, 1, c);
  assert.equal(b.exact, true);
  assert.equal(b.points, 20);
});

test("correct outcome + GD, not exact = 10", () => {
  // pred 3-2, actual 2-1: home win + GD 1, not exact, low-scoring.
  const b = scoreGroupMatch(3, 2, 2, 1, c);
  assert.equal(b.outcome, true);
  assert.equal(b.goalDifference, true);
  assert.equal(b.exact, false);
  assert.equal(b.points, 10);
});

test("correct outcome only (wrong GD) = 5", () => {
  const b = scoreGroupMatch(3, 0, 2, 1, c);
  assert.equal(b.outcome, true);
  assert.equal(b.goalDifference, false);
  assert.equal(b.points, 5);
});

test("wrong outcome = 0", () => {
  const b = scoreGroupMatch(0, 1, 2, 1, c);
  assert.equal(b.points, 0);
});

test("many-goals bonus on a big goal difference", () => {
  // actual 5-0 (GD 5 >= 4), predicted 4-0: outcome right (5), GD wrong, within 1 -> +3.
  const b = scoreGroupMatch(4, 0, 5, 0, c);
  assert.equal(b.outcome, true);
  assert.equal(b.goalDifference, false);
  assert.equal(b.manyGoals, true);
  assert.equal(b.points, 5 + 3);
});

test("exact high-scoring draw stacks the many-goals bonus", () => {
  // actual 4-4 (draw, >=4), predicted 4-4: outcome+GD+exact+many = 5+5+10+3 = 23.
  const b = scoreGroupMatch(4, 4, 4, 4, c);
  assert.equal(b.manyGoals, true);
  assert.equal(b.points, 23);
});

test("progression: 2 of 3 predicted teams reached the round", () => {
  const r = progressionPoints([10, 11, 12], [10, 12, 99], c.knockoutTeam);
  assert.equal(r.correctTeamIds.length, 2);
  assert.equal(r.points, 20);
});
