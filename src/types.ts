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
  relationships?: Record<string, number>;
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

export interface WorldPack {
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
  archived: boolean;
  updatedAt: string;
}

export interface UserProfile { id: string; name: string; username?: string; email?: string; turnsRemaining: number }
export interface AppData { user: UserProfile | null; packs: WorldPack[]; campaigns: Campaign[] }
