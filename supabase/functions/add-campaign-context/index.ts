import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MODEL = 'gpt-5.6-terra';
const MAX_API_COST_USD = 0.20;
const MAX_WEB_SEARCHES = 4;
const responseText = (p: any) => typeof p?.output_text === 'string' ? p.output_text : (p?.output || []).flatMap((x: any) => x?.content || []).filter((x: any) => x?.type === 'output_text').map((x: any) => x.text || '').join('');
const usageOf = (p: any) => { const u=p?.usage||{}, d=u.input_tokens_details||{}; return { inputTokens:Number(u.input_tokens||0), outputTokens:Number(u.output_tokens||0), cachedInputTokens:Number(d.cached_tokens||0), cacheWriteTokens:Number(d.cache_write_tokens||0), webSearches:(p?.output||[]).filter((x:any)=>x?.type==='web_search_call').length }; };
// Terra Standard: $1/M input, $0.10/M cached, $1.25/M cache writes, $6/M output; search is $0.01/call.
const costOf = (u: ReturnType<typeof usageOf>) => (Math.max(0,u.inputTokens-u.cachedInputTokens-u.cacheWriteTokens)+u.cachedInputTokens*.1+u.cacheWriteTokens*1.25+u.outputTokens*6)/1e6+u.webSearches*.01;
const slug=(v:string)=>v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'entry';
const clean=(v:unknown,n:number)=>String(v||'').trim().slice(0,n);
const object=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const RESEARCH_RELATIONSHIPS=['parent','child','sibling','spouse','partner','friend','ally','rival','enemy','liege','vassal','bannerman','sworn sword','household member','cousin','uncle','aunt','nephew','niece','grandparent','grandchild','brother-in-law','sister-in-law'] as const;

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  const authHeader=req.headers.get('Authorization');
  if(!authHeader) return Response.json({error:'Unauthorized'},{status:401,headers:corsHeaders});
  const url=Deno.env.get('SUPABASE_URL')!;
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
  const auth=await client.auth.getUser();
  if(!auth.data.user) return Response.json({error:'Unauthorized'},{status:401,headers:corsHeaders});
  const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  try {
    const body=await req.json(), backgroundJobId=req.headers.get('x-background-job-id')||clean(body.backgroundJobId,100)||null, campaignId=String(body.campaignId||''), context=String(body.context||'').trim();
    if(context.length<10||context.length>4000) throw new Error('Context must contain between 10 and 4,000 characters.');
    if(!backgroundJobId){
      const queued=await fetch(`${url}/functions/v1/background-jobs`,{method:'POST',headers:{Authorization:authHeader,apikey:Deno.env.get('SUPABASE_ANON_KEY')!,'Content-Type':'application/json'},body:JSON.stringify({action:'enqueue',jobType:'context_research',payload:{campaignId,context},idempotencyKey:String(body.idempotencyKey||crypto.randomUUID())})});
      const queuedBody=await queued.json();
      return Response.json(queuedBody,{status:queued.status,headers:corsHeaders});
    }
    const progress=async(stage:string,percent:number,message:string)=>{await service.from('background_jobs').update({progress_stage:stage,progress_percent:percent,progress_message:message,last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',backgroundJobId).eq('owner_id',auth.data.user!.id);};
    const [campaign,locations,characters,profile,clock]=await Promise.all([
      service.from('campaigns').select('id,owner_id,title,world_pack_versions(content)').eq('id',campaignId).maybeSingle(),
      service.from('locations').select('id,name,location_type,public_description').eq('campaign_id',campaignId),
      service.from('characters').select('id,entity_id,name,pronouns,background,traits,status').eq('campaign_id',campaignId),
      service.from('profiles').select('credits_balance').eq('id',auth.data.user.id).maybeSingle(),
      service.from('campaign_clock').select('calendar_name,year_label,day_number,segment').eq('campaign_id',campaignId).maybeSingle(),
    ]);
    if(!campaign.data||campaign.data.owner_id!==auth.data.user.id) throw new Error('Campaign not found.');
    for(const r of [locations,characters,profile,clock]) if(r.error) throw r.error;
    const job=await service.from('background_jobs').select('id,job_type,owner_id').eq('id',backgroundJobId).maybeSingle();if(!job.data||job.data.job_type!=='context_research'||job.data.owner_id!==auth.data.user.id)throw new Error('Research background job not found.');
    await progress('researching',20,'Checking the campaign and researching requested world information.');
    const rel=campaign.data.world_pack_versions as any, pack=object(Array.isArray(rel)?rel[0]?.content:rel?.content);
    const heartbeat=setInterval(()=>{void progress('researching',45,'Research is still in progress.');},30000);
    const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:MODEL,store:false,reasoning:{effort:'none'},max_output_tokens:6000,max_tool_calls:MAX_WEB_SEARCHES,
      tools:[{type:'web_search',search_context_size:'low'}],
      instructions:`Curate a private RPG campaign ledger. The campaign ledger is authoritative; web research supplies only missing source-world facts. Search only when external verification is needed and at most ${MAX_WEB_SEARCHES} times. Respect the campaign date: never import later titles, deaths, appointments, allegiances, or knowledge as currently true. Do not overwrite campaign divergences. Add only people and places relevant to the request. Prefer primary or authoritative sources. Verify each character's identity and their status at the campaign date separately: a person appearing in a genealogy may already be dead, missing, or wounded. Do not mark every named family member Alive. statusEvidence must state the dated fact supporting the selected status, and each imported character must have at least one actually consulted source URL. If identity or dated status cannot be supported, omit that character. Every character description must be an individual, natural dossier biography like existing character descriptions: identify who that person is, their family or allegiance, relevant temperament/reputation, and current position in two or three concise sentences. Never put the batch research summary, import commentary, validation notes, or phrases such as 'added from context' into an individual description. relationshipsToPlayer means an established, direct relationship to the playable character personally. It is never the researched person's title, parentage, heirship, biography, usefulness, possible future alliance, geographic relevance, or relationship to somebody else. Use an empty array unless the direct connection is supported by campaign or dated source-world facts; do not infer friendship or alliance from shared interests. Source URLs must have actually been used. Return only the schema.`,
      input:JSON.stringify({campaign:{title:campaign.data.title,clock:clock.data,sourceWorld:pack.name||pack.title||null,sourceDescription:pack.description||null},existingCharacters:characters.data,existingLocations:locations.data,authorRequest:context}),
      text:{format:{type:'json_schema',name:'campaign_context_research',strict:true,schema:{type:'object',additionalProperties:false,required:['characters','locations','summary'],properties:{
        characters:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['name','pronouns','role','description','condition','statusEvidence','locationName','relationshipsToPlayer','sources'],properties:{name:{type:'string'},pronouns:{type:['string','null']},role:{type:'string'},description:{type:'string'},condition:{type:'string',enum:['Alive','Missing','Wounded','Dead','Unknown']},statusEvidence:{type:'string'},locationName:{type:['string','null']},relationshipsToPlayer:{type:'array',maxItems:6,items:{type:'string',enum:RESEARCH_RELATIONSHIPS}},sources:{type:'array',minItems:1,maxItems:4,items:{type:'string'}}}}},
        locations:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['name','type','description','sources'],properties:{name:{type:'string'},type:{type:'string',enum:['realm','region','settlement','landmark','interior','unknown']},description:{type:'string'},sources:{type:'array',maxItems:4,items:{type:'string'}}}}},summary:{type:'string'}
      }}}}
    })}).finally(()=>clearInterval(heartbeat));
    if(!ai.ok){const detail=await ai.text();console.error('context provider',ai.status,detail.slice(0,1000));throw new Error(`Context research provider failed (${ai.status}).`);}
    const payload=await ai.json(), usage=usageOf(payload), apiCost=costOf(usage), crowns=Math.max(1,Math.min(10,Math.ceil(apiCost/.02))), referenceId=crypto.randomUUID();
    if(backgroundJobId)await service.from('background_jobs').update({model_used:MODEL,input_tokens:usage.inputTokens,output_tokens:usage.outputTokens,web_search_count:usage.webSearches,api_cost_usd:Number(apiCost.toFixed(6)),max_api_cost_usd:MAX_API_COST_USD,last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',backgroundJobId).eq('owner_id',auth.data.user.id);
    const ledger=await service.from('ai_cost_ledger').insert({owner_id:auth.data.user.id,operation:'context_ingestion',model:MODEL,cost_usd:Number(apiCost.toFixed(6)),reference_id:referenceId,campaign_id:campaignId,input_tokens:usage.inputTokens,output_tokens:usage.outputTokens,web_search_count:usage.webSearches});
    if(ledger.error) console.error('context cost ledger',ledger.error);
    if(usage.webSearches>MAX_WEB_SEARCHES||apiCost>MAX_API_COST_USD) throw new Error('Context research exceeded its hard usage limit. No Crowns were charged.');
    const rawResult=responseText(payload);
    let result:any;
    try { result=JSON.parse(rawResult); }
    catch(parseError) {
      console.error('context research returned incomplete JSON',{providerStatus:payload?.status,incomplete:payload?.incomplete_details||null,outputLength:rawResult.length,error:parseError instanceof Error?parseError.message:parseError});
      throw new Error('The research response was incomplete. The background job will retry automatically; no Crowns have been settled.');
    }
    await progress('saving',72,'Research complete. Adding verified people and places to the world ledger.');
    const oldLocations=new Set((locations.data||[]).map((x:any)=>String(x.name).trim().toLowerCase()));
    const locationRows=(result.locations||[]).filter((x:any)=>x?.name&&!oldLocations.has(clean(x.name,160).toLowerCase())).map((x:any)=>({campaign_id:campaignId,pack_location_id:`context-${slug(clean(x.name,160))}-${referenceId.slice(0,8)}`,name:clean(x.name,160),location_type:x.type,public_description:clean(x.description,2000)||'Added through researched campaign context.'}));
    if(locationRows.length){const w=await service.from('locations').upsert(locationRows,{onConflict:'campaign_id,name',ignoreDuplicates:true});if(w.error)throw w.error;}
    const refreshed=await service.from('locations').select('id,name').eq('campaign_id',campaignId);if(refreshed.error)throw refreshed.error;
    const locationByName=new Map((refreshed.data||[]).map((x:any)=>[String(x.name).toLowerCase(),x]));
    const characterByName=new Map((characters.data||[]).map((x:any)=>[String(x.name).trim().toLowerCase(),x])), addedCharacters:string[]=[],updatedCharacters:string[]=[];
    for(const item of result.characters||[]){
      const name=clean(item?.name,160),sources=(Array.isArray(item?.sources)?item.sources:[]).map((source:any)=>clean(source,1000)).filter((source:string)=>/^https?:\/\//i.test(source));if(!name||!sources.length||!clean(item?.statusEvidence,1000))continue;
      const description=clean(item.description,2000), label=clean(item.condition,40)||'Unknown';
      const existing=characterByName.get(name.toLowerCase()) as any;
      if(existing){
        // Repair only legacy research records that predate per-character status
        // evidence. Once evidence exists, campaign play remains authoritative.
        if(!existing.traits?.researchedContext||existing.traits?.statusEvidence)continue;
        const nextTraits={...(existing.traits||{}),researchedContext:true,sources:sources.slice(0,4),statusEvidence:clean(item.statusEvidence,1000)};
        const characterUpdate=await service.from('characters').update({pronouns:item.pronouns||existing.pronouns||null,background:{name:clean(item.role,300),description},traits:nextTraits,status:{...(existing.status||{}),active:label==='Alive',label}}).eq('id',existing.id);if(characterUpdate.error)throw characterUpdate.error;
        const entityUpdate=await service.from('world_entities').update({public_description:description}).eq('id',existing.entity_id);if(entityUpdate.error)throw entityUpdate.error;
        const truthUpdate=await service.from('engine_authoritative_entity_state').update({status:{active:label==='Alive',label}}).eq('entity_id',existing.entity_id);if(truthUpdate.error)throw truthUpdate.error;
        const knowledgeUpdate=await service.from('player_knowledge').update({known_status:{label},source_summary:description||clean(item.role,500),updated_at:new Date().toISOString()}).eq('campaign_id',campaignId).eq('viewer_id',auth.data.user.id).eq('entity_id',existing.entity_id);if(knowledgeUpdate.error)throw knowledgeUpdate.error;
        updatedCharacters.push(name);
        continue;
      }
      const entity=await service.from('world_entities').insert({campaign_id:campaignId,entity_type:'character',canonical_name:name,public_description:description}).select('id').single();if(entity.error)throw entity.error;
      const c=await service.from('characters').insert({campaign_id:campaignId,entity_id:entity.data.id,name,pronouns:item.pronouns||null,background:{name:clean(item.role,300),description},traits:{player:false,researchedContext:true,sources:sources.slice(0,4),statusEvidence:clean(item.statusEvidence,1000)},status:{active:label==='Alive',label}});if(c.error)throw c.error;
      const loc=item.locationName?locationByName.get(clean(item.locationName,160).toLowerCase()):null;
      const truth=await service.from('engine_authoritative_entity_state').insert({entity_id:entity.data.id,exact_location_id:loc?.id||null,status:{active:label==='Alive',label},private_goals:{}});if(truth.error)throw truth.error;
      const characterSummary=description||clean(item.role,500)||`${name} was added through researched campaign context.`;
      const knowledge=await service.from('player_knowledge').insert({campaign_id:campaignId,viewer_id:auth.data.user.id,entity_id:entity.data.id,known_status:{label},believed_location_id:loc?.id||null,location_precision:loc?'settlement':'unknown',confidence:'high',source_summary:characterSummary});if(knowledge.error)throw knowledge.error;
      for(const relation of Array.isArray(item.relationshipsToPlayer)?item.relationshipsToPlayer:[]){const type=clean(relation,60).toLowerCase();if(!RESEARCH_RELATIONSHIPS.includes(type as any))continue;const role=await service.from('campaign_relationship_roles').insert({campaign_id:campaignId,entity_id:entity.data.id,entity_name:name,relationship_type:type,status:'active',private:false,started_reason:'Verified as a direct connection through researched campaign context.'});if(role.error&&role.error.code!=='23505')throw role.error;}
      addedCharacters.push(name);characterByName.set(name.toLowerCase(),{entity_id:entity.data.id});
    }
    // Charge only after every requested ledger write succeeds. The earlier balance
    // check prevents ordinary insufficient-funds races without charging failed work.
    await progress('billing',92,'Finalizing the actual Crown cost.');
    const charged=backgroundJobId
      ? await service.rpc('settle_context_research_crowns',{p_user:auth.data.user.id,p_job:backgroundJobId,p_campaign:campaignId,p_context:context,p_cost:crowns,p_hold:10})
      : await client.rpc('add_campaign_context',{p_campaign_id:campaignId,p_context:context,p_cost:crowns});
    if(charged.error) throw charged.error;
    return Response.json({...charged.data,recognized:{characters:addedCharacters,updatedCharacters,locations:locationRows.map((x:any)=>x.name),summary:result.summary},apiCostUsd:Number(apiCost.toFixed(6)),usage},{headers:corsHeaders});
  }catch(error){console.error('add-campaign-context',error);return Response.json({error:error instanceof Error?error.message:'Campaign context could not be processed.'},{status:400,headers:corsHeaders});}
});
