"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const public_error_1 = require("../supabase/functions/_shared/public-error");
const fallback = 'The service is temporarily unavailable.';
(0, node_test_1.default)('provider billing details are never exposed to customers', () => {
    strict_1.default.equal((0, public_error_1.publicAiErrorMessage)(new Error('You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing/.'), fallback), fallback);
    strict_1.default.equal((0, public_error_1.publicAiErrorMessage)(new Error('insufficient_quota'), fallback), fallback);
    strict_1.default.equal((0, public_error_1.publicAiErrorMessage)(new Error('Invalid API key supplied'), fallback), fallback);
});
(0, node_test_1.default)('ordinary actionable customer errors remain visible', () => {
    strict_1.default.equal((0, public_error_1.publicAiErrorMessage)(new Error('You do not have enough Crowns.'), fallback), 'You do not have enough Crowns.');
});
