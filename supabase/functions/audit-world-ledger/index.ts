import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MODEL='gpt-5.6-luna';
const responseText=(payload:any)=>typeof payload?.output_text==='string'?payload.output_text:(payload?.output||[]).flatMap((item:any)=>item?.content||[]).filter((item:any)=>item?.type==='output_text').map((item:any)=>item.text||'').join('');
const costOf=(payload:any)=>(Number(payload?.usage?.input_tokens||0)*0.125+Number(payload?.usage?.output_tokens||0)*0.6)/1_000_000;

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  const authHeader=req.headers.get('Authorization');
  if(!authHeader) return Response.json({error:'Unauthorized'},{status:401,headers:corsHeaders});
  const url=Deno.env.get('SUPABASE_URL')!;
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
  const auth=await client.auth.getUser();
  if(!auth.data.user) return Response.json({error:'Unauthorized'},{status:401,headers:corsHeaders});
  const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  try{
    const {campaignId}=await req.json();
    const campaign=await service.from('campaigns').select('id,owner_id').eq('id',campaignId).maybeSingle();
    if(!campaign.data||campaign.data.owner_id!==auth.data.user.id) throw new Error('Campaign not found.');
    const [characters,entities,knowledge,locations,memories,threads,secrets,evidence,titles,recent]=await Promise.all([
      service.from('characters').select('*').eq('campaign_id',campaignId),
      service.from('world_entities').select('*').eq('campaign_id',campaignId),
      service.from('player_knowledge').select('*').eq('campaign_id',campaignId).eq('viewer_id',auth.data.user.id),
      service.from('locations').select('*').eq('campaign_id',campaignId),
      service.from('campaign_memories').select('*').eq('campaign_id',campaignId).order('importance',{ascending:false}).limit(200),
      service.from('plot_threads').select('*').eq('campaign_id',campaignId).order('updated_at',{ascending:false}).limit(100),
      service.from('engine_campaign_secrets').select('*').eq('campaign_id',campaignId),
      service.from('engine_secret_evidence').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:false}).limit(100),
      service.from('campaign_character_titles').select('*').eq('campaign_id',campaignId),
      service.from('campaign_turns').select('id,player_text,narration,state_changes').eq('campaign_id',campaignId).order('created_at',{ascending:false}).limit(30),
    ]);
    const failed=[characters,entities,knowledge,locations,memories,threads,secrets,evidence,titles,recent].find(x=>x.error); if(failed?.error) throw failed.error;
    const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'low'},max_output_tokens:3000,instructions:'Audit a persistent role-playing campaign ledger. Campaign narration is authoritative. Identify only clear stale or contradictory player-belief records. A dead person cannot still be described as dying or active. Goals and possible futures are not achieved titles or declarations. Do not reveal secrets without evidence available to the player. Return only corrections supported by supplied records.',input:JSON.stringify({characters:characters.data,entities:entities.data,playerKnowledge:knowledge.data,locations:locations.data,memories:memories.data,threads:threads.data,secrets:secrets.data,secretEvidence:evidence.data,politicalStatuses:titles.data,recentTurns:[...(recent.data||[])].reverse()}),text:{format:{type:'json_schema',name:'ledger_audit',strict:true,schema:{type:'object',additionalProperties:false,required:['knowledgeCorrections','memoryFacts','politicalStatusCorrections','summary'],properties:{knowledgeCorrections:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,required:['entityName','status','sourceSummary','believedLocationName','reason'],properties:{entityName:{type:'string'},status:{type:'string'},sourceSummary:{type:'string'},believedLocationName:{type:['string','null']},reason:{type:'string'}}}},memoryFacts:{type:'array',maxItems:20,items:{type:'string'}},politicalStatusCorrections:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['entityName','title','kind','status','reason'],properties:{entityName:{type:'string'},title:{type:'string'},kind:{type:'string',enum:['held','claim']},status:{type:'string',enum:['held','rumoured','contemplated','intended','declared','recognized','abandoned','lost']},reason:{type:'string'}}}},summary:{type:'string'}}}}})});
    if(!ai.ok) throw new Error(`Ledger audit provider failed (${ai.status}).`);
    const payload=await ai.json(); const cost=costOf(payload);
    const referenceId=req.headers.get('x-background-job-id')||crypto.randomUUID();
    const costWrite=await service.from('ai_cost_ledger').upsert({owner_id:auth.data.user.id,operation:'ledger_audit',model:MODEL,cost_usd:Number(cost.toFixed(6)),reference_id:referenceId,campaign_id:campaignId},{onConflict:'operation,reference_id'});if(costWrite.error)console.error(costWrite.error);
    if(cost>0.02) throw new Error(`Ledger audit exceeded its $0.02 budget.`);
    const result=JSON.parse(responseText(payload));
    for(const correction of result.knowledgeCorrections||[]){
      const entity=(entities.data||[]).find((item:any)=>String(item.canonical_name).toLowerCase()===String(correction.entityName).toLowerCase()); if(!entity) continue;
      const location=correction.believedLocationName?(locations.data||[]).find((item:any)=>String(item.name).toLowerCase()===String(correction.believedLocationName).toLowerCase()):null;
      const current=(knowledge.data||[]).find((item:any)=>item.entity_id===entity.id); if(!current) continue;
      const update=await service.from('player_knowledge').update({known_status:{...(current.known_status||{}),label:correction.status},believed_location_id:location?.id||current.believed_location_id,source_summary:String(correction.sourceSummary).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',current.id); if(update.error) throw update.error;
    }
    if(result.memoryFacts?.length){const write=await service.from('campaign_memories').upsert(result.memoryFacts.map((fact:string)=>({campaign_id:campaignId,memory_type:'ledger_audit',fact,importance:7,tags:['audit']})),{onConflict:'campaign_id,fact',ignoreDuplicates:true});if(write.error)throw write.error;}
    for(const correction of result.politicalStatusCorrections||[]){const entity=(entities.data||[]).find((item:any)=>String(item.canonical_name).toLowerCase()===String(correction.entityName).toLowerCase());if(!entity)continue;const write=await service.from('campaign_character_titles').upsert({campaign_id:campaignId,entity_id:entity.id,title:String(correction.title).slice(0,160),kind:correction.kind,status:correction.status,reason:String(correction.reason).slice(0,1000),updated_at:new Date().toISOString()},{onConflict:'campaign_id,entity_id,title'});if(write.error)throw write.error;}
    return Response.json({summary:result.summary,corrections:(result.knowledgeCorrections||[]).length+(result.politicalStatusCorrections||[]).length,apiCostUsd:Number(cost.toFixed(6))},{headers:corsHeaders});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Ledger audit failed.'},{status:400,headers:corsHeaders});}
});
