"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyWorldAnswers = exports.worldWizardSteps = void 0;
exports.canAdvanceWorldStep = canAdvanceWorldStep;
exports.buildWorldRequest = buildWorldRequest;
exports.worldWizardSteps = ['Setting', 'World basics', 'Review'];
exports.emptyWorldAnswers = {
    world: '', basis: 'Existing setting', era: '', region: '', genre: '', description: '',
};
function canAdvanceWorldStep(step, a) {
    const setting = a.world.trim().length >= 3;
    const basics = a.basis === 'Existing setting' ? a.era.trim().length >= 3 : !!a.genre.trim() && a.description.trim().length >= 10;
    return step === 0 ? setting : setting && basics;
}
function buildWorldRequest(a) {
    return {
        world: a.world.trim(),
        worldContext: {
            kind: a.basis === 'Existing setting' ? 'existing' : 'original',
            era: a.era.trim(), region: a.region.trim(),
            genre: a.basis === 'Original world' ? a.genre.trim() : '',
            description: a.basis === 'Original world' ? a.description.trim() : '',
        },
    };
}
