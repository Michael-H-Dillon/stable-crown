import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function harness(savedPacks: any[]) {
  const source = readFileSync('app/index.tsx','utf8');
  const start = source.indexOf('  const refreshJobs = async () => {',source.indexOf('function Packs('));
  const end = source.indexOf('  useEffect(',start);
  assert.ok(start > 0 && end > start);
  const api: any = {};
  const pack = {id:'deleted-world',version:1,databaseVersionId:'version-id'};
  let refreshes = 0, badge = '', error = '';
  const context = {
    exports: api, isSupabaseConfigured:true,
    jobsRefreshInFlight:{current:false},deleteInFlight:{current:false},libraryRevision:{current:0},
    refreshedWorldJobs:{current:new Set()},newWorldVersionIdRef:{current:''},
    listRemoteBackgroundJobs:async () => [{id:'job-id',job_type:'generate_world',status:'completed',
      completed_at:new Date().toISOString(),result:{pack,creditsRemaining:999}}],
    worldGenerated:async (isCurrent: () => boolean) => {
      assert.equal(typeof isCurrent,'function');
      assert.equal(isCurrent(),true);
      refreshes++;
      return savedPacks;
    },
    setNewWorldVersionId:(value:string) => {badge=value;},setPage:() => {},setBackgroundJobs:() => {},
    setJobsError:(value:string) => {error=value;},
  };
  runInNewContext(ts.transpileModule(source.slice(start,end)+'\nexport { refreshJobs };',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,context);
  return {api,pack,context,inspect:() => ({refreshes,badge,error})};
}

test('deleted world receipts never restore a pack or its old balance on repeated polls',async () => {
  const h=harness([]);
  await h.api.refreshJobs();
  await h.api.refreshJobs();
  assert.deepEqual(h.inspect(),{refreshes:1,badge:'',error:''});
});

test('newly saved worlds are highlighted only after the database confirms them',async () => {
  const h=harness([{id:'deleted-world',version:1,databaseVersionId:'version-id'}]);
  await h.api.refreshJobs();
  assert.equal(h.inspect().badge,'version-id');
});

test('a deletion during refresh invalidates the response and leaves completion retryable',async () => {
  const h=harness([]);
  h.context.worldGenerated=async isCurrent => {
    h.context.libraryRevision.current++;
    assert.equal(isCurrent(),false);
    return [h.pack];
  };
  await h.api.refreshJobs();
  assert.equal(h.inspect().badge,'');
  assert.equal(h.context.refreshedWorldJobs.current.size,0);
});
