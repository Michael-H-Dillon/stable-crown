/** Edit here, then run `npm run deploy:backend`. Model names are not secrets.
 * Text choices with existing cost accounting: gpt-5.6-luna, gpt-5.6-terra, gpt-5.6-sol.
 * In-flight background jobs retain their checkpointed model until complete.
 */
export const AI_MODELS = {
  storyTurn: 'gpt-5.6-terra',
  canonPlanning: 'gpt-5.6-sol',
  characterAssessment: 'gpt-5.6-sol',
  characterIdentity: 'gpt-5.6-luna',
  characterRelationships: 'gpt-5.6-terra',
  campaignPreparation: 'gpt-5.6-terra',
  worldResearch: 'gpt-5.6-terra',
  worldConstruction: 'gpt-5.6-terra',
  contextResearch: 'gpt-5.6-terra',
  worldTick: 'gpt-5.6-terra',
  ledgerAudit: 'gpt-5.6-terra',
  narrationAudio: 'gpt-4o-mini-tts',
};

export const STORY_REASONING: { routine: 'low' | 'medium' | 'high'; complex: 'low' | 'medium' | 'high' } = {
  routine: 'medium',
  complex: 'high',
};
