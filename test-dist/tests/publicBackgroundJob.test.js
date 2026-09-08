"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const public_background_job_1 = require("../supabase/functions/_shared/public-background-job");
(0, node_test_1.default)('background job responses omit internal AI telemetry', () => {
    const visible = (0, public_background_job_1.publicBackgroundJob)({
        id: 'job', model_used: 'gpt-5.6-luna', input_tokens: 21875,
        output_tokens: 2143, web_search_count: 2, api_cost_usd: .026947,
        max_api_cost_usd: 5, stage_timings: { building: 1 }, checkpoint: { responseId: 'private' }, result: {
            pack: { id: 'world' }, creditsRemaining: 80,
            apiCostUsd: .026947, inputTokens: 21875, outputTokens: 2143,
            webSearchCount: 2, modelUsed: 'gpt-5.6-luna', stageTimings: { building: 1 },
        },
    });
    strict_1.default.deepEqual(visible.result, { pack: { id: 'world' }, creditsRemaining: 80 });
    strict_1.default.equal('model_used' in visible, false);
    strict_1.default.equal('input_tokens' in visible, false);
    strict_1.default.equal('api_cost_usd' in visible, false);
    strict_1.default.equal('checkpoint' in visible, false);
});
