export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      profiles: Table<{ id: string; username: string; display_name: string; email: string | null; credits_balance: number; world_job_email_notifications: boolean; world_job_push_notifications: boolean; created_at: string }>;
      push_notification_devices: Table<{ id: string; owner_id: string; expo_push_token: string; platform: string; enabled: boolean; created_at: string; updated_at: string }>;
      campaigns: Table<{ id: string; owner_id: string; pack_version_id: string; title: string; status: string; current_chapter: number; current_chapter_title: string; setup_preferences: Json; created_at: string; updated_at: string }>;
      characters: Table<{ id: string; campaign_id: string; entity_id: string; name: string; pronouns: string | null; background: Json; traits: Json; status: Json; created_at: string }>;
      world_entities: Table<{ id: string; campaign_id: string; entity_type: string; canonical_name: string; public_description: string | null; created_at: string }>;
      player_knowledge: Table<{ id: string; campaign_id: string; viewer_id: string; entity_id: string; known_status: Json; believed_location_id: string | null; location_precision: string; confidence: string; last_confirmed_at: string | null; source_summary: string | null; resource_estimates: Json; updated_at: string }>;
      locations: Table<{ id: string; campaign_id: string; parent_id: string | null; pack_location_id: string; name: string; location_type: string; public_description: string | null; created_at: string }>;
      intel_reports: Table<{ id: string; campaign_id: string; viewer_id: string; entity_id: string | null; reported_location_id: string | null; source_type: string; source_label: string | null; confidence: string; observed_at: string; received_at: string; report_text: string; payload: Json }>;
      campaign_turns: Table<{ id: string; campaign_id: string; idempotency_key: string; player_text: string; structured_intent: Json; narration: string; suggestions: Json; state_changes: Json; usage_units: number; chapter_number: number; compacted_at: string | null; model_used: string | null; input_tokens: number; output_tokens: number; api_cost_usd: number; world_tick_cost_usd: number; created_at: string }>;
      credit_ledger: Table<{ id: string; user_id: string; amount: number; reason: string; reference_id: string | null; created_at: string }>;
      world_packs: Table<{ id: string; owner_id: string | null; title: string; slug: string; is_system: boolean; created_at: string }>;
      world_pack_versions: Table<{ id: string; pack_id: string; version: number; status: string; schema_version: string; content: Json; created_at: string }>;
      campaign_memories: Table<{ id: string; campaign_id: string; source_turn_id: string | null; memory_type: string; fact: string; importance: number; tags: string[]; created_at: string }>;
      plot_threads: Table<{ id: string; campaign_id: string; opened_by_turn_id: string | null; resolved_by_turn_id: string | null; title: string; status: string; importance: number; updated_at: string }>;
      relationship_history: Table<{ id: string; campaign_id: string; turn_id: string | null; entity_id: string | null; entity_name: string; change: number; reason: string; created_at: string }>;
      character_trait_history: Table<{ id: string; campaign_id: string; character_id: string; turn_id: string | null; trait_name: string; change_type: string; previous_trait: string | null; scope: string; target_name: string | null; strength_delta: number; reason: string; created_at: string }>;
      chapter_summaries: Table<{ id: string; campaign_id: string; chapter_number: number; through_turn: number; title: string | null; transition_reason: string | null; summary: string; unresolved_threads: Json; created_at: string }>;
      campaign_clock: Table<{ campaign_id: string; calendar_name: string; year_label: string; day_number: number; segment: string; updated_at: string }>;
      campaign_relationships: Table<{ id: string; campaign_id: string; entity_id: string | null; entity_name: string; score: number; updated_at: string }>;
      campaign_relationship_roles: Table<{ id: string; campaign_id: string; entity_id: string | null; entity_name: string; relationship_type: string; status: 'active' | 'former'; private: boolean; started_by_turn_id: string | null; ended_by_turn_id: string | null; started_reason: string; ended_reason: string | null; started_at: string; ended_at: string | null; updated_at: string }>;
      campaign_relationship_role_history: Table<{ id: string; campaign_id: string; relationship_role_id: string | null; turn_id: string | null; entity_id: string | null; entity_name: string; relationship_type: string; change_type: 'started' | 'ended' | 'restored'; reason: string; created_at: string }>;
      campaign_world_ticks: Table<{ id: string; campaign_id: string; turn_id: string; tick_number: number; from_day: number | null; through_day: number | null; model: string; input_tokens: number; output_tokens: number; api_cost_usd: number; result: Json; created_at: string }>;
      ai_cost_ledger: Table<{ id: string; owner_id: string; operation: 'turn' | 'world_tick' | 'narration' | 'world_generation'; model: string; cost_usd: number; reference_id: string; campaign_id: string | null; created_at: string }>;
      turn_response_feedback: Table<{ id: string; turn_id: string; campaign_id: string; owner_id: string; rating: 'helpful' | 'unhelpful'; created_at: string; updated_at: string }>;
      resource_accounts: Table<{ id: string; campaign_id: string; name: string; account_type: string; controller_name: string; currency: string; balance: number; recurring_income: number; recurring_outgoings: number; income_period: string; source_summary: string | null; morale: number | null; status: string; updated_at: string }>;
      resource_transactions: Table<{ id: string; campaign_id: string; account_id: string; turn_id: string | null; transaction_type: string; amount: number; reason: string; counterparty: string | null; world_date: string | null; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: { import_world_pack: { Args: { p_pack: Json }; Returns: Json } };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
