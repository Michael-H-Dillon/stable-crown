export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      profiles: Table<{ id: string; username: string; display_name: string; turns_balance: number; created_at: string }>;
      campaigns: Table<{ id: string; owner_id: string; pack_version_id: string; title: string; status: string; current_chapter: number; created_at: string; updated_at: string }>;
      characters: Table<{ id: string; campaign_id: string; entity_id: string; name: string; pronouns: string | null; background: Json; traits: Json; status: Json; created_at: string }>;
      world_entities: Table<{ id: string; campaign_id: string; entity_type: string; canonical_name: string; public_description: string | null; created_at: string }>;
      player_knowledge: Table<{ id: string; campaign_id: string; viewer_id: string; entity_id: string; known_status: Json; believed_location_id: string | null; location_precision: string; confidence: string; last_confirmed_at: string | null; source_summary: string | null; resource_estimates: Json; updated_at: string }>;
      locations: Table<{ id: string; campaign_id: string; parent_id: string | null; name: string; location_type: string; public_description: string | null; created_at: string }>;
      intel_reports: Table<{ id: string; campaign_id: string; viewer_id: string; entity_id: string | null; reported_location_id: string | null; source_type: string; source_label: string | null; confidence: string; observed_at: string; received_at: string; report_text: string; payload: Json }>;
      campaign_turns: Table<{ id: string; campaign_id: string; idempotency_key: string; player_text: string; structured_intent: Json; narration: string; suggestions: Json; state_changes: Json; usage_units: number; created_at: string }>;
      credit_ledger: Table<{ id: string; user_id: string; amount: number; reason: string; reference_id: string | null; created_at: string }>;
      world_packs: Table<{ id: string; owner_id: string | null; title: string; slug: string; is_system: boolean; created_at: string }>;
      world_pack_versions: Table<{ id: string; pack_id: string; version: number; status: string; schema_version: string; content: Json; created_at: string }>;
      campaign_memories: Table<{ id: string; campaign_id: string; source_turn_id: string | null; memory_type: string; fact: string; importance: number; tags: string[]; created_at: string }>;
      plot_threads: Table<{ id: string; campaign_id: string; opened_by_turn_id: string | null; resolved_by_turn_id: string | null; title: string; status: string; importance: number; updated_at: string }>;
      relationship_history: Table<{ id: string; campaign_id: string; turn_id: string | null; entity_id: string | null; entity_name: string; change: number; reason: string; created_at: string }>;
      chapter_summaries: Table<{ id: string; campaign_id: string; chapter_number: number; through_turn: number; summary: string; unresolved_threads: Json; created_at: string }>;
      campaign_clock: Table<{ campaign_id: string; calendar_name: string; year_label: string; day_number: number; segment: string; updated_at: string }>;
      campaign_relationships: Table<{ id: string; campaign_id: string; entity_id: string | null; entity_name: string; score: number; updated_at: string }>;
      resource_accounts: Table<{ id: string; campaign_id: string; name: string; account_type: string; controller_name: string; currency: string; balance: number; recurring_income: number; recurring_outgoings: number; morale: number | null; status: string; updated_at: string }>;
      resource_transactions: Table<{ id: string; campaign_id: string; account_id: string; turn_id: string | null; transaction_type: string; amount: number; reason: string; counterparty: string | null; world_date: string | null; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
