"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const turn_budget_alert_1 = require("../supabase/functions/_shared/turn-budget-alert");
const turn = { campaignId: 'campaign', userId: 'owner', requestId: 'response', model: 'gpt-5.6-luna', cost: .2595, threshold: .25, input: 100000, output: 4000 };
(0, node_test_1.default)('over-budget completed turn records an alert and emails the administrator', async () => {
    const records = [];
    const emails = [];
    await (0, turn_budget_alert_1.reportTurnCost)(turn, { service: { from: () => ({ insert: async (row) => { records.push(row); return {}; } }) }, to: 'admin@example.com', apiKey: 'test',
        send: async (_url, init) => { emails.push(init); return new Response('{}'); } });
    strict_1.default.equal(records[0].details.action, 'continued_turn');
    strict_1.default.equal(records[0].details.stage, 'turn_budget');
    const email = JSON.parse(emails[0].body);
    strict_1.default.match(email.text, /continued successfully/);
    strict_1.default.equal(emails[0].headers['Idempotency-Key'], 'turn-budget-response');
});
(0, node_test_1.default)('turn monitoring failures never reject gameplay', async () => {
    await strict_1.default.doesNotReject((0, turn_budget_alert_1.reportTurnCost)(turn, { service: { from: () => { throw new Error('db'); } }, to: 'admin@example.com', apiKey: 'test', send: async () => { throw new Error('email'); }, log: () => { } }));
});
