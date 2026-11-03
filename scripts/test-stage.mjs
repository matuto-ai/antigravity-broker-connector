import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const stage = process.argv[2];
const files = directory => readdirSync(new URL(`../${directory}/`, import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort().map(name => `${directory}/${name}`);
// Real broker HTTP/TLS, native runtime and MCP/process boundaries. These are
// local fixtures, not authenticated Antigravity model acceptance.
const integrationNames = new Set([
  'adapter', 'approval-tls', 'connector', 'launcher', 'lifecycle-drain',
  'lifecycle-stdio', 'native-mcp', 'native-persistence', 'native-plugin',
  'native-message-qualification', 'presence-native', 'native-root-owner', 'native-transport-metadata', 'native-owner-retention', 'native-retention', 'native-retention-boundaries', 'native-proof', 'native-setup', 'native-metadata', 'receive-presentation',
].map(name => `test/${name}.test.mjs`));
const all = files('test');
for (const path of integrationNames) if (!all.includes(path)) throw new Error(`Missing integration test: ${path}`);
const groups = { local: all.filter(path => !integrationNames.has(path)), integration: all.filter(path => integrationNames.has(path)) };
if (!Object.hasOwn(groups, stage) || groups[stage].length === 0) throw new Error(`Unknown or empty test stage: ${stage}`);
if (process.argv[3] === '--list') { console.log(JSON.stringify(groups[stage])); process.exit(0); }
const result = spawnSync(process.execPath, ['--test', ...groups[stage]], { cwd: new URL('../', import.meta.url), stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
