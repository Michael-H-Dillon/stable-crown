export type PlayerDirectives={actions:string[];privateIntent:string[];knowledgeCorrections:string[];canonGuidance:string[];otherComments:string[]};
export function parsePlayerDirectives(text:unknown):PlayerDirectives{
  const result:PlayerDirectives={actions:[],privateIntent:[],knowledgeCorrections:[],canonGuidance:[],otherComments:[]};
  const value=String(text||'');
  for(const match of value.matchAll(/\[([^\]]+)\]|\(([^()]+)\)/g)){
    const note=String(match[1]||match[2]||'').trim(); if(!note)continue;
    if(/\b(?:does not know|doesn't know|knows that|knowledge:|is unaware|is aware)\b/i.test(note)) result.knowledgeCorrections.push(note);
    else if(/(?:\booc\s*:|\bcanon\s*:|\bin the books?\b|\bsource material\b|\bas (?:he|she|they|it) (?:has|does|did)\b|\bi assume .*\b(?:canon|books?|name|appoint|happen)\b)/i.test(note)) result.canonGuidance.push(note);
    else if(/^(?:i\s+)?(?:walk|leave|enter|go|move|take|give|look|wait|bow|sit|stand|attack|open|close|follow|return|kiss|nod|shake|draw|raise|lower)\b/i.test(note)) result.actions.push(note);
    else if(/\b(?:i do not want|i don't want|i want|i think|i suspect|i can tell|privately|silently|without .* hearing|not .* in front of)\b/i.test(note)) result.privateIntent.push(note);
    else result.otherComments.push(note);
  }
  return result;
}
