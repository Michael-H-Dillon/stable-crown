"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const pacing_policy_1 = require("../supabase/functions/_shared/pacing-policy");
(0, node_test_1.default)("routine rest advances to waking without requiring an explicit fast-forward", () => {
    const policy = (0, pacing_policy_1.pacingPolicyForTurn)("Nothing needs doing. I return to bed.");
    strict_1.default.equal(policy.allowAutomaticTimeSkip, true);
    strict_1.default.equal(policy.skipReason, "sleep_or_rest");
    strict_1.default.equal(policy.maximumDaysThisTurn, 3);
});
(0, node_test_1.default)("recovery, travel, and waiting receive useful automatic skip windows", () => {
    strict_1.default.equal((0, pacing_policy_1.pacingPolicyForTurn)("I recuperate until the wound heals.").skipReason, "injury_recovery");
    strict_1.default.equal((0, pacing_policy_1.pacingPolicyForTurn)("We travel to Winterfell.").skipReason, "uneventful_travel");
    strict_1.default.equal((0, pacing_policy_1.pacingPolicyForTurn)("I wait for the report.").skipReason, "waiting");
    strict_1.default.equal((0, pacing_policy_1.pacingPolicyForTurn)("We travel to Winterfell.", true).skipReason, null);
});
(0, node_test_1.default)("low-agency childhood can advance across years", () => {
    const policy = (0, pacing_policy_1.pacingPolicyForTurn)("Let my childhood pass until I come of age.");
    strict_1.default.equal(policy.skipReason, "limited_agency_childhood");
    strict_1.default.equal(policy.maximumDaysThisTurn, 7300);
});
(0, node_test_1.default)("clock segments crossing midnight advance the campaign day", () => {
    strict_1.default.equal((0, pacing_policy_1.dayAdvanceAcrossClockBoundary)("midnight", "dawn", 0), 1);
    strict_1.default.equal((0, pacing_policy_1.dayAdvanceAcrossClockBoundary)("evening", "pre-dawn", 0), 1);
    strict_1.default.equal((0, pacing_policy_1.dayAdvanceAcrossClockBoundary)("dawn", "morning", 0), 0);
    strict_1.default.equal((0, pacing_policy_1.dayAdvanceAcrossClockBoundary)("midnight", "dawn", 2), 2);
});
