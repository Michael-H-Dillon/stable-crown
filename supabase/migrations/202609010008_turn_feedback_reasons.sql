alter table public.turn_response_feedback
  add column reason_category text check(reason_category in ('continuity','character','pacing','tone','outcome','other')),
  add column explanation text check(char_length(explanation) <= 1000);

