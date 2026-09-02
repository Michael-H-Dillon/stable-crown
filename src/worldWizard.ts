export const worldWizardSteps = ['Setting', 'World basics', 'Review'] as const;
export const emptyWorldAnswers = {
  world: '', basis: 'Existing setting', era: '', region: '', genre: '', description: '',
};
export type WorldAnswers = typeof emptyWorldAnswers;
export function canAdvanceWorldStep(step: number, a: WorldAnswers) {
  const setting = a.world.trim().length >= 3;
  const basics = a.basis === 'Existing setting' ? a.era.trim().length >= 3 : !!a.genre.trim() && a.description.trim().length >= 10;
  return step === 0 ? setting : setting && basics;
}
export function buildWorldRequest(a: WorldAnswers) {
  return {
    world: a.world.trim(),
    worldContext: {
      kind: a.basis === 'Existing setting' ? 'existing' as const : 'original' as const,
      era: a.era.trim(), region: a.region.trim(),
      genre: a.basis === 'Original world' ? a.genre.trim() : '',
      description: a.basis === 'Original world' ? a.description.trim() : '',
    },
  };
}
