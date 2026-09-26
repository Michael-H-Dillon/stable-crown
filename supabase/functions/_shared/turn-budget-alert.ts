type TurnCost = {
  campaignId: string;
  userId: string;
  requestId: string;
  model: string;
  cost: number;
  threshold: number;
  input: number;
  output: number;
};

/** Cost monitoring runs after the provider responds and must never reject or delay the player's turn. */
export async function reportTurnCost(
  turn: TurnCost,
  options: { service: any; to?: string; apiKey?: string; from?: string; send?: typeof fetch; log?: (message: string) => void },
) {
  if (turn.cost <= turn.threshold) return;
  const log = options.log || console.error;
  try {
    const saved = await options.service.from('operational_alerts').insert({
      alert_type: 'ai_turn_recovery', severity: turn.cost > turn.threshold * 2 ? 'critical' : 'warning',
      user_id: turn.userId, reference_id: turn.campaignId,
      details: { stage: 'turn_budget', ...turn, action: 'continued_turn' },
    });
    if (saved.error) log('Could not record turn budget alert.');
  } catch { log('Could not record turn budget alert.'); }
  try {
    if (!options.to || !options.apiKey) { log('Turn monitoring email is not configured.'); return; }
    const response = await (options.send || fetch)('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `turn-budget-${turn.requestId}` },
      body: JSON.stringify({
        from: options.from || 'Ashen Crown <support@sablecrown.com>', to: [options.to],
        subject: `Ashen Crown turn: $${turn.cost.toFixed(4)} exceeds $${turn.threshold.toFixed(2)}`,
        text: `A completed turn exceeded its monitoring threshold and continued successfully.\n\nModel: ${turn.model}\nEstimated API cost: $${turn.cost.toFixed(6)}\nAlert threshold: $${turn.threshold.toFixed(2)}\nInput tokens: ${turn.input}\nOutput tokens: ${turn.output}\nCampaign: ${turn.campaignId}\nUser: ${turn.userId}\nAI request: ${turn.requestId}`,
      }),
    });
    if (!response.ok) log(`Turn monitoring email failed (${response.status}).`);
  } catch { log('Turn monitoring email failed.'); }
}
