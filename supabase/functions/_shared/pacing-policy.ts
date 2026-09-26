export type PacingSkipReason =
  | "explicit"
  | "sleep_or_rest"
  | "injury_recovery"
  | "uneventful_travel"
  | "waiting"
  | "limited_agency_childhood"
  | null;

export function pacingPolicyForTurn(playerText: string, activeConflict = false) {
  const text = String(playerText || "");
  const explicit = /\b(?:fast[ -]?forward|skip (?:ahead|to)|time[ -]?skip|wait until|continue until|travel until|ride until|montage|years? pass)\b/i.test(text);
  const childhood = /\b(?:infant|baby|toddler|childhood|grow up|growing up|come of age|until (?:I(?:'m| am)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)) older)\b/i.test(text);
  const recovery = /\b(?:recover|recuperate|convalesce|heal|bed ?rest|until (?:the|my) (?:wound|injur|bones?))\b/i.test(text);
  const rest = /\b(?:go|return|head|retire) (?:back )?to bed\b|\b(?:sleep|turn in|rest (?:for|until|through)|sleep through)\b/i.test(text);
  const waiting = /\b(?:wait|hold position|remain here|stay here)\b/i.test(text);
  const travel = /\b(?:travel|journey|ride|sail|voyage|march|cross|make (?:my|our|the) way)\b/i.test(text);

  let reason: PacingSkipReason = null;
  if (explicit) reason = "explicit";
  else if (childhood) reason = "limited_agency_childhood";
  else if (recovery) reason = "injury_recovery";
  else if (rest) reason = "sleep_or_rest";
  else if (waiting) reason = "waiting";
  else if (travel && !activeConflict) reason = "uneventful_travel";

  const maximumDaysThisTurn = reason === "limited_agency_childhood"
    ? 7300
    : reason === "explicit"
      ? 3650
    : reason === "injury_recovery"
      ? 180
      : reason === "uneventful_travel" || reason === "waiting"
        ? 30
        : reason === "sleep_or_rest"
            ? 3
            : 3;

  return {
    allowAutomaticTimeSkip: reason !== null,
    skipReason: reason,
    explicitFastForward: explicit,
    maximumDaysThisTurn,
  };
}

const CLOCK_SEGMENTS = [
  "pre-dawn",
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "dusk",
  "near nightfall",
  "evening",
  "midnight",
] as const;

export function dayAdvanceAcrossClockBoundary(
  currentSegment: unknown,
  nextSegment: unknown,
  statedDays: unknown,
) {
  const days = Math.max(0, Number(statedDays) || 0);
  if (days > 0) return days;
  const current = CLOCK_SEGMENTS.indexOf(
    String(currentSegment || "").trim().toLocaleLowerCase() as typeof CLOCK_SEGMENTS[number],
  );
  const next = CLOCK_SEGMENTS.indexOf(
    String(nextSegment || "").trim().toLocaleLowerCase() as typeof CLOCK_SEGMENTS[number],
  );
  return current >= 0 && next >= 0 && next < current ? 1 : 0;
}

export function nextClockSegment(currentSegment: unknown) {
  const current = CLOCK_SEGMENTS.indexOf(
    String(currentSegment || "").trim().toLocaleLowerCase() as typeof CLOCK_SEGMENTS[number],
  );
  return current >= 0 ? CLOCK_SEGMENTS[(current + 1) % CLOCK_SEGMENTS.length] : null;
}
