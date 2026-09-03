"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const worldWizard_1 = require("../src/worldWizard");
(0, node_test_1.default)('existing world needs only a setting and era, never a player', () => {
    strict_1.default.equal(worldWizard_1.worldWizardSteps.length, 3);
    const answers = { ...worldWizard_1.emptyWorldAnswers, world: 'A Song of Ice and Fire', era: 'Before the War of the Five Kings' };
    strict_1.default.equal((0, worldWizard_1.canAdvanceWorldStep)(0, worldWizard_1.emptyWorldAnswers), false);
    strict_1.default.equal((0, worldWizard_1.canAdvanceWorldStep)(1, { ...answers, era: ' ' }), false);
    strict_1.default.equal((0, worldWizard_1.canAdvanceWorldStep)(2, answers), true);
    const request = (0, worldWizard_1.buildWorldRequest)(answers);
    strict_1.default.equal(request.worldContext.era, answers.era);
    strict_1.default.equal('character' in request, false);
    strict_1.default.equal('startingPoint' in request, false);
});
(0, node_test_1.default)('original worlds require a genre and premise', () => {
    const answers = { ...worldWizard_1.emptyWorldAnswers, basis: 'Original world', world: 'Ashfall', genre: 'Post-apocalyptic', description: 'Rival communities rebuilding a ruined coastal city.' };
    strict_1.default.equal((0, worldWizard_1.canAdvanceWorldStep)(2, answers), true);
    strict_1.default.equal((0, worldWizard_1.canAdvanceWorldStep)(1, { ...answers, genre: '' }), false);
    strict_1.default.equal((0, worldWizard_1.canAdvanceWorldStep)(1, { ...answers, description: '' }), false);
    strict_1.default.equal((0, worldWizard_1.buildWorldRequest)(answers).worldContext.description, answers.description);
});
(0, node_test_1.default)('switching to existing world removes original genre and premise from the request', () => {
    const request = (0, worldWizard_1.buildWorldRequest)({ ...worldWizard_1.emptyWorldAnswers, world: 'Fallout', era: '2281', genre: 'Fantasy', description: 'Old original idea' });
    strict_1.default.equal(request.worldContext.genre, '');
    strict_1.default.equal(request.worldContext.description, '');
});
