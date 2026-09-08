import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--preview')) {
  console.error('Usage: npm run deploy:backend [-- --preview]');
  process.exit(1);
}
const installedCli = spawnSync('supabase --version', {
  cwd: projectRoot, stdio: 'ignore', shell: true, timeout: 10000,
});
const cli = installedCli.status === 0 ? 'supabase' : 'npx --yes supabase@2';
const commands = [`${cli} db push --linked`, `${cli} functions deploy`];
if (args.includes('--preview')) {
  console.log('Deployment plan (no changes made):\n' + commands.join('\n'));
  process.exit(0);
}

if (installedCli.status !== 0) {
  console.log('Supabase CLI is not on PATH. Using npx (downloads the CLI if needed).');
}

try {
  const projectRef = readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim();
  if (!projectRef) throw new Error('Empty project reference');
  console.log(`Deploying backend to linked Supabase project: ${projectRef}`);
} catch {
  console.error(`Link the intended project first: ${cli} login, then ${cli} link --project-ref YOUR_PROJECT_REF`);
  process.exit(1);
}

// Only fixed commands enter the shell, supporting Windows CLI wrappers too.
for (const [index, command] of commands.entries()) {
  console.log(`Running: ${command}`);
  const result = spawnSync(command, { cwd: projectRoot, stdio: 'inherit', shell: true });
  if (result.error || result.status !== 0) {
    console.error(index === 0
      ? 'Database push failed. Functions were not deployed. Check that Supabase CLI is installed and logged in.'
      : 'Function deployment failed. Migrations have already been applied and some functions may have deployed. Fix the reported error and rerun.');
    process.exit(result.status || 1);
  }
}
console.log('Backend deployment complete.');
