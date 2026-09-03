"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseText = responseText;
exports.canRecoverResearch = canRecoverResearch;
exports.responseFailure = responseFailure;
function responseText(payload) {
    return payload.output_text || (payload.output || [])
        .flatMap((item) => item.content || [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text || '').join('\n');
}
function canRecoverResearch(payload, stage, retries) {
    return stage === 'researching' && payload.status === 'incomplete'
        && payload.incomplete_details?.reason === 'max_output_tokens' && retries < 1;
}
function responseFailure(payload, stage) {
    const reason = payload.incomplete_details?.reason;
    if (payload.error?.message)
        return payload.error.message;
    if (reason === 'max_output_tokens')
        return `${stage === 'researching' ? 'World research' : 'World construction'} reached its response limit before finishing.`;
    return `${stage} ended with status ${payload.status || 'unknown'}${reason ? ` (${reason})` : ''}.`;
}
