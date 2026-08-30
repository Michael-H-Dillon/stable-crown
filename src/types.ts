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
