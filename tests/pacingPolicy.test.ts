import test from "node:test";
import assert from "node:assert/strict";
import { dayAdvanceAcrossClockBoundary, pacingPolicyForTurn } from "../supabase/functions/_shared/pacing-policy";

test("routine rest advances to waking without requiring an explicit fast-forward", () => {
  const policy = pacingPolicyForTurn("Nothing needs doing. I return to bed.");
  assert.equal(policy.allowAutomaticTimeSkip, true);
  assert.equal(policy.skipReason, "sleep_or_rest");
  assert.equal(policy.maximumDaysThisTurn, 3);
});

test("recovery, travel, and waiting receive useful automatic skip windows", () => {
  assert.equal(pacingPolicyForTurn("I recuperate until the wound heals.").skipReason, "injury_recovery");
  assert.equal(pacingPolicyForTurn("We travel to Winterfell.").skipReason, "uneventful_travel");
  assert.equal(pacingPolicyForTurn("I wait for the report.").skipReason, "waiting");
  assert.equal(pacingPolicyForTurn("We travel to Winterfell.", true).skipReason, null);
});

test("low-agency childhood can advance across years", () => {
  const policy = pacingPolicyForTurn("Let my childhood pass until I come of age.");
  assert.equal(policy.skipReason, "limited_agency_childhood");
  assert.equal(policy.maximumDaysThisTurn, 7300);
});

test("clock segments crossing midnight advance the campaign day", () => {
  assert.equal(dayAdvanceAcrossClockBoundary("midnight", "dawn", 0), 1);
  assert.equal(dayAdvanceAcrossClockBoundary("evening", "pre-dawn", 0), 1);
  assert.equal(dayAdvanceAcrossClockBoundary("dawn", "morning", 0), 0);
  assert.equal(dayAdvanceAcrossClockBoundary("midnight", "dawn", 2), 2);
});
