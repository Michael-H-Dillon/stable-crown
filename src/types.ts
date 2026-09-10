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
  characterConnections?: Array<{ sourceId: string; targetId: string; sentimentScore?: number | null; relationshipType: string; status: 'active' | 'former'; private: boolean; reason: string }>;
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
  worldContext?: { kind: 'existing' | 'original'; setting?: string; era: string; region: string; genre: string; description: string };
  openingScenario?: PackOpeningScenario;
  worldEvents?: PackWorldEvent[];
  secretSystems?: PackSecretSystem[];
  characterProfiles?: PackCharacterProfile[];
  characterAttributes?: Array<{ npcId: string; attributes: CharacterAttributes; skills?: CharacterSkill[] }>;
  /** Public sources consulted by AI generation. Source text is not stored in the pack. */
  researchSources?: PackResearchSource[];
  artwork?: string;
}

export interface Character {
  identityMode?: 'original' | 'existing';
  identitySelection?: { name: string; description: string };
  name: string;
  pronouns: string;
  background: NamedEntry;
  strength: NamedEntry;
  weakness: NamedEntry;
  motivation: NamedEntry;
  attributes?: CharacterAttributes;
  skills?: CharacterSkill[];
}

export interface CharacterSkill { name: string; rating: number }

export interface CharacterAttributes {
  strength: number;
  agility: number;
  endurance: number;
  intelligence: number;
  perception: number;
  willpower: number;
  presence: number;
}

export interface CampaignSetupOptions {
  openingScenePrompt?: string;
}

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
  retryAvailable?: boolean;
  /** Immutable heading captured when the turn was resolved. */
  turnTitle?: string;
  /** @deprecated Use turnTitle. Retained for local save compatibility. */
  dateLabel?: string;
}

export interface Campaign {
  preparedWorld?: WorldPack;
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
