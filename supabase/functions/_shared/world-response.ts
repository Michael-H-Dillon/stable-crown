export function responseText(payload: any): string {
  return payload.output_text || (payload.output || [])
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === 'output_text')
    .map((item: any) => item.text || '').join('\n');
}

export function canRecoverResearch(payload: any, stage: string, retries: number): boolean {
  return stage === 'researching' && payload.status === 'incomplete'
    && payload.incomplete_details?.reason === 'max_output_tokens' && retries < 1;
}

export function responseFailure(payload: any, stage: string): string {
  const reason = payload.incomplete_details?.reason;
  if (payload.error?.message) return payload.error.message;
  if (reason === 'max_output_tokens') return `${stage === 'researching' ? 'World research' : 'World construction'} reached its response limit before finishing.`;
  return `${stage} ended with status ${payload.status || 'unknown'}${reason ? ` (${reason})` : ''}.`;
}
