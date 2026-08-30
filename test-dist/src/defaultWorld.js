"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openingNarration = exports.defaultWorld = void 0;
exports.defaultWorld = {
    schemaVersion: '1.0', id: 'the-ashen-marches', version: 2, ownerId: 'system', status: 'ready',
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
            { id: 'knight', name: 'Knight', description: 'A trained warrior with arms, armour, a warhorse, and an oath that may become impossible.' },
            { id: 'lord', name: 'Lord', description: 'A landed ruler commanding a household, subjects, soldiers, and dangerous political obligations.' },
            { id: 'serf', name: 'Serf', description: 'A commoner hardened by labour, rich in practical knowledge, and largely unseen by the powerful.' },
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
        motivations: [],
        motivationsByBackground: {
            knight: [
                { id: 'serve-with-honour', name: 'Serve With Honour', description: 'Remain faithful to your lord without surrendering your conscience.' },
                { id: 'first-blade', name: 'Become the First Blade of the Marches', description: 'Become the most renowned warrior in the realm.' },
                { id: 'win-lordship', name: 'Win a Lordship', description: 'Earn land, title, and a dynasty of your own.' },
            ],
            lord: [
                { id: 'rule-well', name: 'Rule Well', description: 'Protect your people and leave your lands stronger than you found them.' },
                { id: 'extinguish-rivals', name: 'Extinguish My Rivals', description: 'Break the houses threatening your bloodline.' },
                { id: 'claim-crown', name: 'Claim the Crown', description: 'Become sovereign of the Ashen Marches.' },
            ],
            serf: [
                { id: 'earn-spurs', name: 'Earn My Spurs', description: 'Become a knight through courage, service, or opportunity.' },
                { id: 'rise-lordship', name: 'Rise to Lordship', description: 'Acquire land and force the nobility to recognise you.' },
                { id: 'take-crown', name: 'Take the Crown', description: 'Rise from the fields to rule the realm.' },
            ],
        },
    },
    items: [
        { id: 'signet', name: 'Worn Signet Ring', description: 'Recognized by heralds, creditors, and old enemies.' },
        { id: 'court-blade', name: 'Court Blade', description: 'Elegant enough for ceremony, sharp enough for consequences.' },
        { id: 'mail-and-sword', name: 'Mail, Sword, and Warhorse', description: 'The costly tools by which a knight serves and survives.' },
        { id: 'household-seal', name: 'Household Seal and Treasury Key', description: 'Authority made tangible, coveted by servants and rivals alike.' },
        { id: 'work-knife', name: 'Work Knife and Mended Cloak', description: 'Common possessions kept useful through years of hard labour.' },
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
    safetyBoundaries: ['Adult consensual relationships and intimacy may develop naturally; intimate scenes fade to black before graphic detail.', 'Sexual violence may be acknowledged only as a non-graphic off-screen crime or historical consequence; never depict or eroticise it and never offer it as a player action.', 'No sexual content involving minors.'],
};
const openingNarration = (name, backgroundId = 'lord') => {
    const arrival = backgroundId === 'knight'
        ? `${name} stands on guard below the high gallery, close enough to the great lords to die for them and too lowborn to share their counsels.`
        : backgroundId === 'serf'
            ? `${name} is carrying fresh rushes across the black floor, ignored by silk-clad claimants and mud-spattered envoys alike.`
            : `${name} stands beneath the gallery among the gathered rulers, measuring which smiles conceal fear and which conceal knives.`;
    return `Rain needles the high windows of Gloamspire as the succession bell tolls thirteen times—one stroke for each sovereign, and one for the empty throne.\n\n${arrival}\n\nThe western doors burst open. A young courier staggers across the tiles, one hand clamped to a wound beneath his ribs. Of everyone in the hall, his eyes find yours.\n\n“Not the council,” he whispers, pressing a warm, rain-soaked letter into your palm. “Trust no one wearing the silver ash.”\n\nAcross the hall, Oren Voss is already watching you smile.`;
};
exports.openingNarration = openingNarration;
