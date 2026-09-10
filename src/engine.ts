import { Campaign, GameState, Intent, StoryTurn, WorldPack } from './types';
import { storyTurnCrownCost } from '../supabase/functions/_shared/turn-pricing';

const blocked = /(minor.*sexual|sexual.*minor|\b(?:i|we|my character)\s+(?:will\s+|want to\s+|try to\s+)?(?:rape|sexually assault)\b|(?:describe|write|show)\s+(?:an?\s+)?(?:explicit|graphic)\s+(?:rape|sexual assault)|how (do|can) i (make|build) (a bomb|poison))/i;
export function isContentAllowed(text: string) { return !blocked.test(text); }

export function interpretIntent(text: string): Intent {
  const quoted = [...text.matchAll(/[“\"]([^”\"]+)[”\"]/g)].map(m => m[1].trim());
  const withoutSpeech = text.replace(/[“\"]([^”\"]+)[”\"]/g, ' ').replace(/\s+/g, ' ').trim();
  const targets = ['courier', 'Oren Voss', 'council', 'guards', 'letter'].filter(t => text.toLowerCase().includes(t.toLowerCase()));
  const lower = text.toLowerCase();
  const posture = /attack|strike|draw my sword|threaten/.test(lower) ? 'hostile' : /run|charge|demand|shout/.test(lower) ? 'bold' : /hide|wait|watch|careful/.test(lower) ? 'cautious' : 'neutral';
  return { speech: quoted, actions: withoutSpeech ? [withoutSpeech.replace(/^i\s+/i, '')] : [], targets, posture };
}

function resolveState(campaign: Campaign, intent: Intent): GameState {
  const state: GameState = JSON.parse(JSON.stringify(campaign.state));
  const action = intent.actions.join(' ').toLowerCase();
  if (action.includes('letter') && !state.inventory.includes('Sealed royal letter')) state.inventory.push('Sealed royal letter');
  if (action.includes('follow') || action.includes('market')) state.unresolvedThreads.push('A trail leads toward the Reed Market.');
  if (intent.posture === 'hostile') state.resolve = Math.max(0, state.resolve - 6);
  state.inventory = state.inventory
    .map(titleCaseInventoryItem)
    .sort((left, right) => Number(inventoryMentioned(right, action)) - Number(inventoryMentioned(left, action)));
  state.memories = [...state.memories, campaign.turns.length ? `You chose to ${intent.actions[0] || 'speak'}.` : 'The wounded courier trusted you with a sealed letter.'].slice(-8);
  return state;
}

const titleCaseInventoryItem = (value: string) => value.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase().replace(/(^|[\s/])([\p{L}\p{N}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`);
const inventoryMentioned = (item: string, text: string) => {
  const normalized = item.toLocaleLowerCase();
  return text.includes(normalized) || (normalized.match(/[\p{L}\p{N}]{4,}/gu) || []).some(word => text.includes(word));
};

function narrate(campaign: Campaign, intent: Intent) {
  const speech = intent.speech.length ? `“${intent.speech.join(' ” you say, then “')}”\n\n` : '';
  const action = intent.actions[0]?.toLowerCase() || '';
  if (/draw.*sword|attack|strike/.test(action)) return `${speech}Steel clears leather with a whisper that carries farther than the succession bell. Conversations die around you. The nearest guards lower their halberds—not yet at you, but no longer away.\n\nOren Voss’s smile thins. “A bold answer to a message you have not opened.” His gaze drops to your closed fist. The courier uses the distraction to crawl behind a marble pillar, leaving a bright line across the black floor.\n\nLady Serit Valehart rises in the northern gallery. She does not call for your arrest. That may be more dangerous.`;
  if (/run|flee/.test(action)) return `${speech}You move before the court can decide whether motion is guilt. Boots hammer the black tiles behind you, but the crowd folds into confusion as nobles protect silk, rank, and secrets.\n\nYou reach the servants’ passage with the letter still warm in your hand. Someone catches the door before it closes. Not a guard—Tamsin Reed, wearing a courier’s grey cloak and an expression of exhausted disbelief.\n\n“If you want to live,” she says, “stop running where they expect you to.”`;
  if (/open|read|letter/.test(action)) return `${speech}The black wax breaks beneath your thumb. Inside, the queen’s hand is unmistakable, though the final line trails as if written during an earthquake: *The blood has not ended. Seek the child beneath the—*\n\nThe remainder has been cut cleanly from the page. A dusting of silver ash clings to the fold. Across the hall, three courtiers wear ash-grey pins. Only one of them is looking away.`;
  if (/help|courier|wound/.test(action)) return `${speech}You catch the courier before his head strikes stone. Beneath his cloak, the wound is narrow and deliberate. He grips your wrist with surprising strength.\n\n“Reed Market,” he breathes. “Find Tamsin. The queen knew.”\n\nWhen the guards arrive, Oren Voss arrives with them. He kneels just beyond the blood and studies your hands as though they are evidence already entered into a ledger.`;
  return `${speech}The choice changes the room in ways that are difficult to name. A courtier steps back. A guard looks toward Oren Voss for permission and does not receive it.\n\nThe former spymaster approaches with measured calm. “Whatever our dying friend gave you,” he says quietly, “half this hall will kill to possess it. The other half will kill to ensure it never existed.”\n\nBehind him, the courier’s fingers trace two words in blood: *Reed Market.*`;
}

export interface TurnResult { turn: StoryTurn; nextState: GameState; usage: number }
export async function submitTurn(campaign: Campaign, pack: WorldPack, playerText: string, idempotencyKey: string): Promise<TurnResult> {
  const prior = campaign.turns.find(t => t.idempotencyKey === idempotencyKey);
  if (prior) return { turn: prior, nextState: campaign.state, usage: 0 };
  if (!isContentAllowed(playerText)) throw new Error('That request crosses this world’s safety boundary. Try taking the story in another direction.');
  const intent = interpretIntent(playerText);
  await new Promise(resolve => setTimeout(resolve, 550));
  const nextState = resolveState(campaign, intent);
  const suggestions = intent.posture === 'hostile' ? ['Lower the blade—but not your guard', 'Demand Oren explain himself', 'Signal Lady Serit'] : ['Break the seal', 'Help the courier', 'Watch who wears silver ash'];
  return { turn: { id: `turn-${Date.now()}`, idempotencyKey, playerText, intent, narration: narrate(campaign, intent), suggestions, createdAt: new Date().toISOString() }, nextState, usage: storyTurnCrownCost(playerText) };
}

// Production provider boundary. Implement this only in a trusted server runtime.
export interface GameMasterProvider { generate(campaign: Campaign, pack: WorldPack, input: string, idempotencyKey: string): Promise<TurnResult> }
