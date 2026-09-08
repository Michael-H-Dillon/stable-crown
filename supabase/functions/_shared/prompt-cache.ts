/**
 * Put reusable instructions and campaign reference material before the changing
 * request suffix. GPT-5.6 caches each marked prefix independently per model.
 */
export function withExplicitPromptCache(payload:any,key:string,stableContext?:unknown){
  const {instructions,input,...rest}=payload;
  const messages:any[]=[{
    role:'developer',
    content:[{type:'input_text',text:String(instructions||''),prompt_cache_breakpoint:{mode:'explicit'}}],
  }];
  if(stableContext!==undefined) messages.push({
    role:'developer',
    content:[{type:'input_text',text:JSON.stringify(stableContext),prompt_cache_breakpoint:{mode:'explicit'}}],
  });
  messages.push({role:'user',content:typeof input==='string'?input:JSON.stringify(input)});
  return {...rest,prompt_cache_key:key.slice(0,64),prompt_cache_options:{mode:'explicit',ttl:'30m'},input:messages};
}
