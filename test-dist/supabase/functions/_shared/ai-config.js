"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORY_REASONING = exports.AI_MODELS = void 0;
/** Edit here, then run `npm run deploy:backend`. Model names are not secrets.
 * Text choices with existing cost accounting: gpt-5.6-luna, gpt-5.6-terra, gpt-5.6-sol.
 * In-flight background jobs retain their checkpointed model until complete.
 */
exports.AI_MODELS = {
    // Change this line to try Terra or Sol for the main story response.
    storyTurn: 'gpt-5.6-terra',
    canonPlanning: 'gpt-5.6-sol',
    characterAssessment: 'gpt-5.6-sol',
    characterIdentity: 'gpt-5.6-terra',
    characterRelationships: 'gpt-5.6-terra',
    campaignPreparation: 'gpt-5.6-terra',
    worldResearch: 'gpt-5.6-terra',
    worldConstruction: 'gpt-5.6-terra',
    contextResearch: 'gpt-5.6-terra',
    worldTick: 'gpt-5.6-terra',
    ledgerAudit: 'gpt-5.6-terra',
    narrationAudio: 'gpt-4o-mini-tts',
};
exports.STORY_REASONING = {
    routine: 'low',
    complex: 'medium',
};
