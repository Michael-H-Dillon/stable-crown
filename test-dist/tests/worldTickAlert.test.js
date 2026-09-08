"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const world_tick_alert_1 = require("../supabase/functions/_shared/world-tick-alert");
const tick = { campaignId: 'campaign', userId: 'owner', requestId: 'response', model: 'gpt-5.6-sol', cost: .1692, threshold: .1, input: 1000, output: 8000 };
(0, node_test_1.default)('over-budget tick records an alert and emails the administrator', async () => {
    const records = [];
    const emails = [];
    await (0, world_tick_alert_1.reportWorldTickCost)(tick, {
        service: { from: () => ({ insert: async (row) => { records.push(row); return {}; } }) },
        to: 'admin@example.com', apiKey: 'test',
        send: async (_url, init) => { emails.push(init); return new Response('{}'); },
    });
    strict_1.default.equal(records[0].details.action, 'continued_turn');
    const email = JSON.parse(emails[0].body);
    strict_1.default.deepEqual(email.to, ['admin@example.com']);
    strict_1.default.match(email.text, /0.169200/);
    strict_1.default.match(email.text, /Campaign: campaign/);
    strict_1.default.equal(emails[0].headers['Idempotency-Key'], 'world-tick-budget-response');
});
(0, node_test_1.default)('at or below threshold produces no alert', async () => {
    for (const cost of [.05, .1])
        await (0, world_tick_alert_1.reportWorldTickCost)({ ...tick, cost }, {
            service: { from: () => { strict_1.default.fail('No alert expected'); } },
            send: async () => { strict_1.default.fail('No email expected'); },
        });
});
(0, node_test_1.default)('database and email failures never reject the turn', async () => {
    let emailAttempts = 0;
    const messages = [];
    await strict_1.default.doesNotReject((0, world_tick_alert_1.reportWorldTickCost)(tick, {
        service: { from: () => { throw new Error('Database unavailable'); } },
        to: 'admin@example.com', apiKey: 'test', log: message => messages.push(message),
        send: async () => { emailAttempts++; throw new Error('Email unavailable'); },
    }));
    strict_1.default.equal(emailAttempts, 1);
    strict_1.default.equal(messages.length, 2);
});
(0, node_test_1.default)('provider rejection is logged without rejecting the turn', async () => {
    const messages = [];
    await strict_1.default.doesNotReject((0, world_tick_alert_1.reportWorldTickCost)(tick, {
        service: { from: () => ({ insert: async () => ({}) }) },
        to: 'admin@example.com', apiKey: 'test', log: message => messages.push(message),
        send: async () => new Response('{}', { status: 429 }),
    }));
    strict_1.default.match(messages[0], /429/);
});
