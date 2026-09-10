export const STORY_TURN_CHARACTERS_PER_CROWN = 500;

export function storyTurnCrownCost(playerText: string) {
  return Math.max(
    1,
    Math.ceil(playerText.trim().length / STORY_TURN_CHARACTERS_PER_CROWN),
  );
}
