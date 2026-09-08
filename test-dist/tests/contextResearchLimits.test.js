"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const source = (0, node_fs_1.readFileSync)('supabase/functions/add-campaign-context/index.ts', 'utf8');
(0, node_test_1.default)('context research has room for broad cast research', () => {
    strict_1.default.match(source, /const MAX_WEB_SEARCHES = 20;/);
    strict_1.default.match(source, /const MAX_API_COST_USD = 1\.00;/);
    strict_1.default.match(source, /const MAX_OUTPUT_TOKENS = 48000;/);
    strict_1.default.match(source, /Do not stop after a general overview or substitute a long location list for the requested cast\./);
    strict_1.default.match(source, /If at least 12 relevant named people can be verified, return 12–50 individual characters\./);
    strict_1.default.match(source, /characters:\{type:'array',maxItems:50/);
    strict_1.default.match(source, /filter\(\(item:any\)=>isIndividualCharacterName\(item\?\.name\)\)/);
});
(0, node_test_1.default)('collective cast labels are rejected before ledger insertion', () => {
    strict_1.default.match(source, /Reach Lords and Ladies/);
    strict_1.default.match(source, /const collectiveCharacterName=/);
});
(0, node_test_1.default)('background context research keeps relationship work alive without a request timeout', () => {
    strict_1.default.match(source, /research:result,backgroundJob:true/);
    strict_1.default.match(source, /const relationshipHeartbeat=setInterval/);
});
