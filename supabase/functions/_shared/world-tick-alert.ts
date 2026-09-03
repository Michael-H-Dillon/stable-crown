type TickCost = {
  campaignId: string; userId: string; requestId: string; model: string;
  cost: number; threshold: number; input: number; output: number;
};

/** Monitoring must never reject a paid story turn. */
export async function reportWorldTickCost(
  tick: TickCost,
  options: { service: any; to?: string; apiKey?: string; from?: string; send?: typeof fetch; log?: (message: string) => void },
) {
  if (tick.cost <= tick.threshold) return;
  const log = options.log || console.error;
  try {
    const saved = await options.service.from('operational_alerts').insert({
      alert_type: 'ai_turn_recovery', severity: 'warning', user_id: tick.userId,
      reference_id: tick.campaignId, details: { stage: 'world_tick_budget', ...tick, action: 'continued_turn' },
    });
    if (saved.error) log('Could not record world-tick budget alert.');
  } catch { log('Could not record world-tick budget alert.'); }
  try {
    if (!options.to || !options.apiKey) { log('World-tick monitoring email is not configured.'); return; }
    const response = await (options.send || fetch)('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `world-tick-budget-${tick.requestId}` },
      body: JSON.stringify({ from: options.from || 'Sable Crown <support@sablecrown.com>', to: [options.to],
        subject: `Sable Crown world tick: $${tick.cost.toFixed(4)} exceeds $${tick.threshold.toFixed(2)}`,
        text: `The world-tick cost threshold was exceeded. This is a monitoring alert; the budget check did not block the turn.\n\nModel: ${tick.model}\nEstimated API cost: $${tick.cost.toFixed(6)}\nAlert threshold: $${tick.threshold.toFixed(2)}\nInput tokens: ${tick.input}\nOutput tokens: ${tick.output}\nCampaign: ${tick.campaignId}\nUser: ${tick.userId}\nAI request: ${tick.requestId}`,
      }),
    });
    if (!response.ok) log(`World-tick monitoring email failed (${response.status}).`);
  } catch { log('World-tick monitoring email failed.'); }
}
