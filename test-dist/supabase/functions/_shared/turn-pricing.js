"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORY_TURN_CHARACTERS_PER_CROWN = void 0;
exports.storyTurnCrownCost = storyTurnCrownCost;
exports.STORY_TURN_CHARACTERS_PER_CROWN = 500;
function storyTurnCrownCost(playerText) {
    return Math.max(1, Math.ceil(playerText.trim().length / exports.STORY_TURN_CHARACTERS_PER_CROWN));
}
