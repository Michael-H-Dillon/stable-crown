"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const prompt_cache_1 = require("../supabase/functions/_shared/prompt-cache");
(0, node_test_1.default)('explicit prompt cache separates stable prefixes from dynamic turn data', () => {
    const request = (0, prompt_cache_1.withExplicitPromptCache)({ model: 'gpt-5.6-luna', instructions: 'stable rules', input: 'changing turn' }, 'story-turn-v1:campaign', { world: 'stable' });
    strict_1.default.equal(request.prompt_cache_key, 'story-turn-v1:campaign');
    strict_1.default.equal(request.prompt_cache_options.mode, 'explicit');
    strict_1.default.equal(request.prompt_cache_options.ttl, '30m');
    strict_1.default.equal(request.input[0].role, 'developer');
    strict_1.default.equal(request.input[0].content[0].prompt_cache_breakpoint.mode, 'explicit');
    strict_1.default.equal(request.input[1].content[0].prompt_cache_breakpoint.mode, 'explicit');
    strict_1.default.equal(request.input[2].content, 'changing turn');
    strict_1.default.equal('instructions' in request, false);
});
