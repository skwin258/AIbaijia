import test from "node:test";
import assert from "node:assert/strict";
import { buildRecommendation } from "../server.js";

test("observes when there are too few rounds", () => {
  const recommendation = buildRecommendation([
    { result: "banker" },
    { result: "player" },
  ]);
  assert.equal(recommendation.action, "observe");
  assert.equal(recommendation.riskLevel, "high");
});

test("follows a long streak with medium risk", () => {
  const recommendation = buildRecommendation([
    { result: "player" },
    { result: "banker" },
    { result: "banker" },
    { result: "banker" },
    { result: "banker" },
    { result: "banker" },
  ]);
  assert.equal(recommendation.action, "banker");
  assert.ok(recommendation.confidence >= 70);
});

test("returns observe when recent road is balanced", () => {
  const recommendation = buildRecommendation([
    { result: "banker" },
    { result: "player" },
    { result: "banker" },
    { result: "player" },
    { result: "banker" },
    { result: "player" },
  ]);
  assert.equal(recommendation.action, "observe");
});
