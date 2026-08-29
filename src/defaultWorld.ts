import { WorldPack } from './types';

export const defaultWorld: WorldPack = {
  schemaVersion: '1.0', id: 'the-ashen-marches', version: 1, ownerId: 'system', status: 'ready',
  metadata: {
    title: 'The Ashen Marches', tagline: 'Every oath leaves a scar.', author: 'Sable Crown',
    description: 'A rain-dark realm of rival houses, old debts, and a crown left dangerously empty.',
    contentRating: 'mature-no-explicit-sex',
  },
  premise: 'Queen Merrow died without a named heir. Five houses gather at Gloamspire to choose a successor while border fires and an older power stir beneath the peat.',
  tone: ['grounded political intrigue', 'dangerous loyalties', 'restrained low magic', 'consequences over spectacle'],
  factions: [
    { id: 'house-vale', name: 'House Valehart', description: 'Wardens of the northern passes; proud, disciplined, and nearly bankrupt.' },
    { id: 'house-mere', name: 'House Meren', description: 'River lords whose grain and barges keep the capital alive.' },
    { id: 'veiled-synod', name: 'The Veiled Synod', description: 'Priests who record every coronation and forget nothing willingly.' },
  ],
  locations: [
    { id: 'gloamspire', name: 'Gloamspire', description: 'A black-stone fortress above a city of wet slate and torch smoke.' },
    { id: 'reed-market', name: 'The Reed Market', description: 'A maze of awnings, informants, ferrymen, and illicit letters.' },
    { id: 'hollow-road', name: 'The Hollow Road', description: 'An ancient causeway where travelers hear hoofbeats behind them.' },
  ],
  cultures: [{ id: 'marchfolk', name: 'Marchfolk', description: 'Oaths are witnessed over salt; hospitality is sacred until dawn.' }],
  history: ['The Cinder War united the marches forty years ago.', 'The royal bloodline ended with Queen Merrow—or so the court believes.'],
  characterOptions: {
    backgrounds: [
      { id: 'minor-heir', name: 'Heir of a Minor House', description: 'Educated in courtly custom, burdened by a fragile name.' },
      { id: 'sworn-blade', name: 'Sworn Blade', description: 'A proven fighter bound by an oath that may become impossible.' },
      { id: 'court-scribe', name: 'Court Scribe', description: 'Keeper of letters, ledgers, and truths powerful people misplace.' },
    ],
    strengths: [
      { id: 'perceptive', name: 'Perceptive', description: 'You notice what people work to conceal.' },
      { id: 'commanding', name: 'Commanding', description: 'Your certainty moves people before doubt can.' },
      { id: 'steadfast', name: 'Steadfast', description: 'Fear and pain have difficulty turning you.' },
    ],
    weaknesses: [
      { id: 'proud', name: 'Proud', description: 'You struggle to retreat from a public challenge.' },
      { id: 'merciful', name: 'Merciful', description: 'You hesitate when cruelty would be expedient.' },
      { id: 'haunted', name: 'Haunted', description: 'An old failure still shapes your choices.' },
    ],
    motivations: [
      { id: 'restore-house', name: 'Restore Your House', description: 'Win the standing your family lost.' },
      { id: 'find-truth', name: 'Uncover the Succession', description: 'Learn what truly happened in the queen’s final hours.' },
      { id: 'keep-peace', name: 'Prevent a New War', description: 'Keep the realm whole, whatever the personal cost.' },
    ],
  },
  items: [
    { id: 'signet', name: 'Worn Signet Ring', description: 'Recognized by heralds, creditors, and old enemies.' },
    { id: 'court-blade', name: 'Court Blade', description: 'Elegant enough for ceremony, sharp enough for consequences.' },
  ],
  rules: ['Promises create social obligations.', 'Violence is fast, risky, and politically consequential.', 'Magic remains ambiguous and costly.'],
  npcs: [
    { id: 'lady-serit', name: 'Lady Serit Valehart', description: 'A severe northern claimant who never wastes a word.' },
    { id: 'oren-voss', name: 'Oren Voss', description: 'The queen’s smiling former spymaster, officially retired.' },
    { id: 'tamsin-reed', name: 'Tamsin Reed', description: 'A market courier who knows which seals are forged.' },
  ],
  secrets: [{ id: 'last-letter', name: 'The Last Letter', description: 'The queen wrote a final command that never reached the council.' }],
  scenarioHooks: [{ id: 'empty-throne', name: 'The Empty Throne', description: 'Begin during the first convocation, when a bloodied courier collapses at the player’s feet.' }],
  aiGuidance: ['Keep characters strategically intelligent.', 'Make every success create a new obligation.', 'Never decide the player character’s thoughts or dialogue.'],
  safetyBoundaries: ['No explicit sexual content.', 'No sexual violence.', 'No sexual content involving minors.'],
};

export const openingNarration = (name: string) => `Rain needles the high windows of Gloamspire as the succession bell tolls thirteen times—one stroke for each sovereign, and one for the empty throne.\n\n${name} stands beneath the gallery among silk-clad claimants and mud-spattered envoys when the western doors burst open. A young courier staggers across the black tiles, one hand clamped to a wound beneath his ribs. His eyes find yours.\n\n“Not the council,” he whispers, pressing a warm, rain-soaked letter into your palm. “Trust no one wearing the silver ash.”\n\nAcross the hall, Oren Voss is already watching you smile.`;
