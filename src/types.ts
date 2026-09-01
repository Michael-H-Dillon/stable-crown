export type PackStatus = 'draft' | 'validation-error' | 'ready';
export type ContentRating = 'mature-no-explicit-sex';

export interface NamedEntry { id: string; name: string; description: string }
export interface CharacterOptions {
  backgrounds: NamedEntry[];
  strengths: NamedEntry[];
  weaknesses: NamedEntry[];
  motivations: NamedEntry[];
  motivationsByBackground?: Record<string, NamedEntry[]>;
}

export interface PackOpeningScenario {
  id: string;
  title: string;
  chapterLabel: string;
  narration: string;
  startLocationId: string;
  startingInventory: string[];
  memories: string[];
  unresolvedThreads: string[];
  sceneFacts: string[];
  /** Immediate actions that make sense before the first player turn. */
  suggestions?: string[];
  relationships?: Record<string, number>;
  /** Independent relationship facts. Several roles may apply to the same person. */
  relationshipRoles?: Array<{ entityName: string; relationshipType: string; private?: boolean; reason: string }>;
  calendar: { name: string; year: string; day: number; segment: string };
  playerPreset?: { name: string; pronouns: string; backgroundId: string; strengthId: string; weaknessId: string; motivationId: string };
}

export interface PackWorldEvent {
  id: string;
  name: string;
  description: string;
  earliestDay: number;
  latestDay: number;
  conditions: string[];
}

export interface PackSecretSystem {
  id: string;
  name: string;
  description: string;
  stakes: string[];
  initialAwareness: { entityId: string; level: 'none' | 'suspects' | 'knows'; suspicion: number }[];
  evidenceTypes: string[];
}

export interface PackCharacterProfile {
  npcId: string;
  startingLocation?: { locationId: string; confidence: 'low' | 'medium' | 'high' | 'confirmed'; reason: string };
  values: string[];
  goals: string[];
  loyalties: string[];
  /** Canonical tendencies and precedents. These are a baseline, never absolute restrictions. */
  canonBehaviors?: string[];
  persuasion: {
    baseDifficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
    leverage: string[];
    relationshipThresholds: { cooperative: number; majorRisk: number };
  };
}

export interface PackEconomicProfile {
  id: string;
  name: string;
  backgroundIds: string[];
  currency: string;
  balance: number;
  recurringIncome: number;
  recurringOutgoings: number;
  incomePeriod: string;
  description: string;
}

export interface PackFactionEconomicProfile {
  factionId: string;
  currency: string;
  wealthTier: FactionWealthTier;
  balance: number;
  debt?: number;
  recurringIncome: number;
  recurringOutgoings: number;
  incomePeriod: string;
  description: string;
}

export interface PackResearchSource {
  title: string;
  url: string;
}

export interface WorldPack {
  /** Database identity of this immutable saved version. Not part of exported pack JSON. */
  databaseVersionId?: string;
  schemaVersion: '1.0';
  id: string;
  version: number;
  ownerId: string;
  status: PackStatus;
  metadata: { title: string; tagline: string; author: string; description: string; contentRating: ContentRating };
  premise: string;
  tone: string[];
  factions: NamedEntry[];
  locations: NamedEntry[];
  cultures: NamedEntry[];
  history: string[];
  characterOptions: CharacterOptions;
  items: NamedEntry[];
  rules: string[];
  npcs: NamedEntry[];
  secrets: NamedEntry[];
  scenarioHooks: NamedEntry[];
  aiGuidance: string[];
  safetyBoundaries: string[];
  openingScenario?: PackOpeningScenario;
  worldEvents?: PackWorldEvent[];
  secretSystems?: PackSecretSystem[];
  characterProfiles?: PackCharacterProfile[];
  economicProfiles?: PackEconomicProfile[];
  factionEconomicProfiles?: PackFactionEconomicProfile[];
  /** Public sources consulted by AI generation. Source text is not stored in the pack. */
  researchSources?: PackResearchSource[];
  artwork?: string;
}

export interface Character {
  name: string;
  pronouns: string;
  background: NamedEntry;
  strength: NamedEntry;
  weakness: NamedEntry;
  motivation: NamedEntry;
}

export interface TreasurySetup {
  enabled: boolean;
  source: 'pack' | 'manual' | 'ai';
  manual?: { name: string; currency: string; balance: number; recurringIncome: number; recurringOutgoings: number; incomePeriod: string };
  /** Manual relative estimates for non-player factions. AI setup estimates every faction automatically. */
  factionWealth?: Record<string, FactionWealthTier>;
  quote?: { expectedCost: number; maximumCost: number; estimatedTokens: number; preparationId: string };
}

export type FactionWealthTier = 'very-rich' | 'rich' | 'average' | 'poor' | 'destitute';

export interface CampaignSetupOptions { treasury: TreasurySetup }

export interface GameState {
  locationId: string;
  health: number;
  resolve: number;
  inventory: string[];
  relationships: Record<string, number>;
  memories: string[];
  unresolvedThreads: string[];
  summary: string;
  sceneFacts?: string[];
  campaignDate?: { calendarName: string; year: string; day: number; segment: string };
  condition?: 'alive' | 'wounded' | 'incapacitated' | 'dead';
  conflict?: { opponent: string; round: number; stakes: string; status: 'active' | 'resolved'; outcome: string | null } | null;
}

export interface Intent {
  speech: string[];
  actions: string[];
  targets: string[];
  posture: 'cautious' | 'bold' | 'hostile' | 'neutral';
}

export interface StoryTurn {
  id: string;
  idempotencyKey: string;
  playerText: string;
  intent: Intent;
  narration: string;
  suggestions: string[];
  createdAt: string;
  dateLabel?: string;
}

export interface Campaign {
  id: string;
  ownerId: string;
  title: string;
  packId: string;
  packVersion: number;
  character: Character;
  state: GameState;
  turns: StoryTurn[];
  currentChapter?: number;
  chapterTitle?: string;
  chapterSummary?: string;
  archived: boolean;
  updatedAt: string;
}

export interface UserProfile { id: string; name: string; username?: string; email?: string; creditsRemaining: number }
export interface AppData { user: UserProfile | null; packs: WorldPack[]; campaigns: Campaign[] }
