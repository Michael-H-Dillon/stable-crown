"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const intent_actions_1 = require("../supabase/functions/_shared/intent-actions");
(0, node_test_1.default)('consequential player actions remain attempts in the intent ledger', () => {
    strict_1.default.deepEqual((0, intent_actions_1.normalizeIntentActions)([
        'Ride up to open the saddlebag',
        'Stab Serjeant Hollis in the throat with a dagger',
    ]), [
        'Ride up to open the saddlebag',
        'Attempt to stab Serjeant Hollis in the throat with a dagger',
    ]);
});
(0, node_test_1.default)('already qualified attempts are not rewritten twice', () => {
    strict_1.default.deepEqual((0, intent_actions_1.normalizeIntentActions)(['Attempt to escape the patrol', 'Try to persuade Eddard']), [
        'Attempt to escape the patrol',
        'Try to persuade Eddard',
    ]);
});
