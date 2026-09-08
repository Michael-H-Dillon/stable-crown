const PRIVATE_RESULT_FIELDS = new Set([
  'apiCostUsd',
  'inputTokens',
  'outputTokens',
  'webSearchCount',
  'modelUsed',
  'stageTimings',
]);
const PRIVATE_JOB_FIELDS = new Set([
  'stage_timings', 'model_used', 'input_tokens', 'output_tokens',
  'web_search_count', 'api_cost_usd', 'max_api_cost_usd', 'checkpoint',
  'worker_lease_token', 'worker_lease_until', 'stage_started_at',
]);

/** Remove internal provider and cost telemetry from a job returned to its owner. */
export function publicBackgroundJob(row: any) {
  if (!row) return row;
  const publicRow = Object.fromEntries(Object.entries(row).filter(([key]) => !PRIVATE_JOB_FIELDS.has(key)));
  const result = row.result && typeof row.result === 'object' && !Array.isArray(row.result)
    ? Object.fromEntries(Object.entries(row.result).filter(([key]) => !PRIVATE_RESULT_FIELDS.has(key)))
    : row.result;
  return { ...publicRow, result };
}
