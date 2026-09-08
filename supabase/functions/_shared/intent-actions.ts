const outcomeDependentAction = /^(?:stab|strike|hit|attack|kill|shoot|fire|cut|slash|thrust|choke|strangle|poison|trip|tackle|grab|seize|capture|restrain|disarm|steal|pickpocket|break|force|persuade|convince|intimidate|deceive|bluff|sneak|hide|escape|flee|climb|jump|dodge|parry)\b/i;
const alreadyAttempt = /^(?:attempt|try|tries|seek)\b/i;

/** Keep the intent ledger distinct from the resolved outcome of the turn. */
export const normalizeIntentActions = (actions: unknown): string[] =>
  (Array.isArray(actions) ? actions : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((action) => {
      if (alreadyAttempt.test(action) || !outcomeDependentAction.test(action)) return action;
      return `Attempt to ${action.charAt(0).toLocaleLowerCase()}${action.slice(1)}`;
    });
