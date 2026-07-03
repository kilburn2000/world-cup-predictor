import { describe, it, expect } from "vitest";
import {
  progressionPoints,
  scoreGroupMatch,
  standingKey,
  knockoutGroupKey,
  DEFAULT_SCORING,
} from "./index.js";

const c = DEFAULT_SCORING;

describe("progressionPoints (knockout team progression)", () => {
  it("awards pointsPerTeam for each predicted team that actually progressed", () => {
    const r = progressionPoints([10, 11, 12], [11, 12, 99], c.knockoutTeam);
    expect(r.correctTeamIds).toEqual([11, 12]);
    expect(r.points).toBe(2 * c.knockoutTeam);
  });

  it("ignores duplicate predictions so a team can't be counted twice", () => {
    const r = progressionPoints([7, 7, 7], [7], c.knockoutTeam);
    expect(r.correctTeamIds).toEqual([7]);
    expect(r.points).toBe(c.knockoutTeam);
  });

  it("scores zero when none of the predicted teams progressed", () => {
    expect(progressionPoints([1, 2], [3, 4], c.knockoutTeam).points).toBe(0);
  });
});

describe("scoreGroupMatch draw rule", () => {
  it("rewards a correctly-called draw (right result, wrong score) above a win", () => {
    // pred 1-1, actual 2-2: draw called right, no exact score, no single tally.
    const b = scoreGroupMatch(1, 1, 2, 2, c);
    expect(b.outcome).toBe(true);
    expect(b.exact).toBe(false);
    expect(b.points).toBe(c.drawOutcome); // 2, not 1
  });
});

describe("standings ordering keys", () => {
  it("standingKey orders purely by points with the default tiebreak", () => {
    expect(standingKey(10)).toBeGreaterThan(standingKey(9));
  });

  it("knockoutGroupKey breaks ties on the overall total", () => {
    // equal group points, higher overall total ranks ahead
    expect(knockoutGroupKey(5, 120)).toBeGreaterThan(knockoutGroupKey(5, 80));
  });
});
