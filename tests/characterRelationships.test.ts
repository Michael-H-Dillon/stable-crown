import { AI_MODELS } from '../supabase/functions/_shared/ai-config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { responseTokenCost } from '../supabase/functions/_shared/ai-cost';
import { responseText, responseFailure } from '../supabase/functions/_shared/world-response';
const api:any={};
runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/character-relationships.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports:api,require:(name:string)=>name.includes('ai-config') ? { AI_MODELS } : name.includes('ai-cost')?{responseTokenCost}:{responseText,responseFailure}});
const lover={sourceName:'Loras',targetName:'Renly',relationshipType:'partner',score:88,private:true,reason:'Established romantic relationship in the supplied era.'};

for (const configuredModel of ['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol']) test(`configured ${configuredModel} is used for both relationship generation and billing`,async()=>{
  const source=readFileSync('supabase/functions/_shared/character-relationships.ts','utf8');
  const parsed=ts.createSourceFile('relationships.ts',source,ts.ScriptTarget.Latest,true) as any;
  assert.equal(parsed.parseDiagnostics.length,0);
  let request:any,ledger:any;
  const local:any={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:local,AbortSignal,crypto:{randomUUID:()=> 'cost-reference'},Deno:{env:{get:()=> 'test'}},
    require:(name:string)=>name.includes('ai-config') ? { AI_MODELS: {...AI_MODELS,characterRelationships:configuredModel} } : name.includes('ai-cost')?{responseTokenCost}:{responseText,responseFailure},
    fetch:async(_url:string,init:any)=>{request=JSON.parse(init.body);return Response.json({status:'completed',usage:{output_tokens:1000},output_text:JSON.stringify({connections:[lover]})});},
  });
  const service={from:()=>({insert:async(row:any)=>{ledger=row;return {};}})};
  const result=await local.reviewCharacterRelationships(service,'owner','campaign',[{name:'Loras'}],[{name:'Renly'}],{era:'current',player:{name:'Renly'}});
  assert.equal(request.model,configuredModel);
  assert.equal(request.reasoning.effort,'medium');
  assert.equal(request.text.format.schema.properties.connections.items.properties.score.maximum,100);
  assert.equal(JSON.stringify(request.text.format.schema.properties.connections.items.properties.sourceName.enum),JSON.stringify(['Loras']));
  assert.equal(JSON.stringify(request.text.format.schema.properties.connections.items.properties.targetName.enum),JSON.stringify(['Renly','Loras']));
  assert.equal(ledger.operation,'character_relationships');
  assert.equal(ledger.model,configuredModel);
  assert.equal(ledger.cost_usd,responseTokenCost({usage:{output_tokens:1000}},configuredModel));
  assert.equal(result[0].score,88);
});

test('strong established affection and privacy survive relationship validation',()=>{
  const result=api.validateRelationships({connections:[lover]},[{name:'Loras'}],[{name:'Renly'}]);
  assert.equal(result[0].score,88);
  assert.equal(result[0].private,true);
});
test('sentiment is directional and may target another NPC',()=>{
  const result=api.validateRelationships({connections:[{...lover,sourceName:'Stannis',targetName:'Melisandre',relationshipType:'sentiment',score:-95,reason:'Campaign evidence establishes that he learned she killed his daughter.'}]},[{name:'Stannis'}],[{name:'Melisandre'},{name:'Shireen'}]);
  assert.equal(result[0].targetName,'Melisandre');
  assert.equal(result[0].score,-95);
  assert.equal(result.length,1,'no invented reciprocal feeling');
});
test('unknown is nullable, while invalid references and out-of-range scores are rejected',()=>{
  assert.equal(api.validateRelationships({connections:[{...lover,score:null}]},[{name:'Loras'}],[{name:'Renly'}])[0].score,null);
  for(const altered of [{...lover,score:101},{...lover,targetName:'Unknown'},{...lover,targetName:'Loras'}])
    assert.throws(()=>api.validateRelationships({connections:[altered]},[{name:'Loras'}],[{name:'Renly'}]));
});
test('AI validation discards malformed optional connections and supplies an unknown player assessment',()=>{
  const invalid={...lover,targetName:'A character outside the supplied cast'};
  const result=api.validateRelationships({connections:[invalid]},[{name:'Loras'}],[{name:'Renly'}],'Renly',true);
  assert.equal(JSON.stringify(result.map((connection:any)=>({source:connection.sourceName,target:connection.targetName,type:connection.relationshipType,score:connection.score}))),
    JSON.stringify([{source:'Loras',target:'Renly',type:'sentiment',score:null}]));
});
test('every candidate is assessed toward the player and the player is never assigned a feeling',()=>{
  assert.match(api.RELATIONSHIP_INSTRUCTIONS,/Family status alone never supports a positive score/);
  assert.match(api.RELATIONSHIP_INSTRUCTIONS,/Never return the player as sourceName/);
  const robert={sourceName:'Robert',targetName:'Renly',relationshipType:'elder brother',score:12,private:false,reason:'They are brothers, but their established conduct shows limited closeness.'};
  assert.equal(api.validateRelationships({connections:[robert]},[{name:'Robert'}],[{name:'Robert'},{name:'Renly'}],'Renly')[0].score,12);
  assert.throws(()=>api.validateRelationships({connections:[]},[{name:'Robert'}],[{name:'Robert'},{name:'Renly'}],'Renly'),/omitted/);
  assert.throws(()=>api.validateRelationships({connections:[{...robert,sourceName:'Renly',targetName:'Robert'}]},[{name:'Robert'}],[{name:'Robert'},{name:'Renly'}],'Renly'),/invalid/);
});
test('review saves the player score, private role and directed NPC connection without overwriting existing rows',async()=>{
  const writes:any[]=[];
  const service={from(table:string){const query:any={select(){return query;},eq(){return query;},then(resolve:any){return Promise.resolve({data:[{id:'l',canonical_name:'Loras'},{id:'r',canonical_name:'Renly'}]}).then(resolve);},
    upsert(row:any,options:any){writes.push({table,row,options});return Promise.resolve({});},insert(row:any){writes.push({table,row});return Promise.resolve({});}};return query;}};
  await api.saveReviewedRelationships(service,'campaign','Renly',['Loras'],[lover]);
  assert.equal(writes.find(w=>w.table==='campaign_relationships').row.score,88);
  assert.equal(writes.find(w=>w.table==='campaign_relationships').options.ignoreDuplicates,true);
  const graph=writes.find(w=>w.table==='campaign_character_connections').row;
  assert.equal(graph.sentiment_score,88);
  assert.equal(graph.source_entity_id,'l');
  assert.equal(graph.target_entity_id,'r');
  assert.equal(writes.find(w=>w.table==='campaign_relationship_roles').row.private,true);
});
