"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_vm_1 = require("node:vm");
const typescript_1 = __importDefault(require("typescript"));
function harness(savedPacks) {
    const source = (0, node_fs_1.readFileSync)('app/index.tsx', 'utf8');
    const start = source.indexOf('  const refreshJobs = async () => {', source.indexOf('function Packs('));
    const end = source.indexOf('  useEffect(', start);
    strict_1.default.ok(start > 0 && end > start);
    const api = {};
    const pack = { id: 'deleted-world', version: 1, databaseVersionId: 'version-id' };
    let refreshes = 0, badge = '', error = '';
    const context = {
        exports: api, isSupabaseConfigured: true,
        jobsRefreshInFlight: { current: false }, deleteInFlight: { current: false }, libraryRevision: { current: 0 },
        refreshedWorldJobs: { current: new Set() }, newWorldVersionIdRef: { current: '' },
        listRemoteBackgroundJobs: async () => [{ id: 'job-id', job_type: 'generate_world', status: 'completed',
                completed_at: new Date().toISOString(), result: { pack, creditsRemaining: 999 } }],
        worldGenerated: async (isCurrent) => {
            strict_1.default.equal(typeof isCurrent, 'function');
            strict_1.default.equal(isCurrent(), true);
            refreshes++;
            return savedPacks;
        },
        setNewWorldVersionId: (value) => { badge = value; }, setPage: () => { }, setBackgroundJobs: () => { },
        setJobsError: (value) => { error = value; },
    };
    (0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule(source.slice(start, end) + '\nexport { refreshJobs };', {
        compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
    }).outputText, context);
    return { api, pack, context, inspect: () => ({ refreshes, badge, error }) };
}
(0, node_test_1.default)('deleted world receipts never restore a pack or its old balance on repeated polls', async () => {
    const h = harness([]);
    await h.api.refreshJobs();
    await h.api.refreshJobs();
    strict_1.default.deepEqual(h.inspect(), { refreshes: 1, badge: '', error: '' });
});
(0, node_test_1.default)('newly saved worlds are highlighted only after the database confirms them', async () => {
    const h = harness([{ id: 'deleted-world', version: 1, databaseVersionId: 'version-id' }]);
    await h.api.refreshJobs();
    strict_1.default.equal(h.inspect().badge, 'version-id');
});
(0, node_test_1.default)('a deletion during refresh invalidates the response and leaves completion retryable', async () => {
    const h = harness([]);
    h.context.worldGenerated = async (isCurrent) => {
        h.context.libraryRevision.current++;
        strict_1.default.equal(isCurrent(), false);
        return [h.pack];
    };
    await h.api.refreshJobs();
    strict_1.default.equal(h.inspect().badge, '');
    strict_1.default.equal(h.context.refreshedWorldJobs.current.size, 0);
});
