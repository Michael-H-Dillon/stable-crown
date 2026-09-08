-- Background-job status is exposed through the owner-scoped Edge Function,
-- which returns a deliberately limited projection. Keep provider telemetry
-- available only to service-role monitoring and operational tooling.
revoke select on table public.background_jobs from authenticated, anon;
