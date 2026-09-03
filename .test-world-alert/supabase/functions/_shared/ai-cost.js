"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseTokenCost = responseTokenCost;
function responseTokenCost(payload, model) {
    const rates = {
        'gpt-5.6-terra': [2, .2, 12], 'gpt-5.6-sol': [4, .4, 20], 'gpt-5.6-luna': [.2, .02, 1.2],
        'gpt-5.5': [5, .5, 30], 'gpt-5.4': [2.5, .25, 15], 'gpt-5.4-mini': [.75, .075, 4.5],
    };
    const rate = rates[model];
    if (!rate)
        throw new Error(`Configure lookup pricing for ${model} before using character search.`);
    const input = Number(payload?.usage?.input_tokens || 0);
    const cached = Math.min(input, Number(payload?.usage?.input_tokens_details?.cached_tokens || 0));
    return ((input - cached) * rate[0] + cached * rate[1] + Number(payload?.usage?.output_tokens || 0) * rate[2]) / 1_000_000;
}
