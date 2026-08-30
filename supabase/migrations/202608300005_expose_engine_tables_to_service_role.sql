-- Edge Functions use PostgREST, which only reaches API-exposed schemas. Keep
-- authoritative simulation data in public with no client grants; service_role
-- is the only API role allowed to read or mutate these engine tables.
alter table private.authoritative_entity_state set schema public;
alter table public.authoritative_entity_state rename to engine_authoritative_entity_state;

alter table private.world_events set schema public;
alter table public.world_events rename to engine_world_events;

alter table private.scheduled_campaign_events set schema public;
alter table public.scheduled_campaign_events rename to engine_scheduled_campaign_events;

alter table private.campaign_secrets set schema public;
alter table public.campaign_secrets rename to engine_campaign_secrets;

alter table private.entity_secret_awareness set schema public;
alter table public.entity_secret_awareness rename to engine_entity_secret_awareness;

alter table private.secret_evidence set schema public;
alter table public.secret_evidence rename to engine_secret_evidence;

revoke all on public.engine_authoritative_entity_state, public.engine_world_events,
  public.engine_scheduled_campaign_events, public.engine_campaign_secrets,
  public.engine_entity_secret_awareness, public.engine_secret_evidence
from public, anon, authenticated;

grant all on public.engine_authoritative_entity_state, public.engine_world_events,
  public.engine_scheduled_campaign_events, public.engine_campaign_secrets,
  public.engine_entity_secret_awareness, public.engine_secret_evidence
to service_role;
