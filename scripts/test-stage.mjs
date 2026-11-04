import { readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCandidate, verifyCandidate, createTestProjection, verifyTestProjection } from './candidate-artifact.mjs';
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
const groups = { local: all.filter(path => !integrationNames.has(path)), integration: all.filter(path => integrationNames.has(path)), all };
if (!Object.hasOwn(groups, stage) || groups[stage].length === 0) throw new Error(`Unknown or empty test stage: ${stage}`);
if (process.argv[3] === '--list') { console.log(JSON.stringify(groups[stage])); process.exit(0); }
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const temporary=process.env.PSST_CANDIDATE_DIR?null:mkdtempSync(join(tmpdir(),'ag-candidate-tests-'));
const artifactRoot=process.env.PSST_CANDIDATE_DIR??join(temporary,'candidate');
let status=1;
try {
 const candidate=temporary?prepareCandidate({sourceRoot,artifactRoot}):verifyCandidate({sourceRoot,artifactRoot});
 const fixtureRoots=stage==='local'?{}:Object.fromEntries(['ai-agent-msg-broker','psst-approval'].map(name=>[name,resolve(sourceRoot,'..',name)]).filter(([,path])=>existsSync(path)));
 const projection=createTestProjection({sourceRoot,artifactRoot,fixtureRoots});
 console.log(JSON.stringify({stage,source:candidate.evidence.source.commit,source_tree:candidate.evidence.source.tree,source_dirty:candidate.evidence.source.dirty,working_tree_digest:candidate.evidence.source.digest,package:candidate.evidence.package.name,version:candidate.evidence.package.version,artifact_sha256:candidate.evidence.tarball.sha256,execution:'packed_runtime_test_projection'}));
 try {
  const result=spawnSync(process.execPath,['--test',...groups[stage]],{cwd:projection,stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  status=result.status??1;
 } finally {verifyTestProjection({sourceRoot,artifactRoot,fixtureRoots});verifyCandidate({sourceRoot,artifactRoot});}
} finally {if(temporary)rmSync(temporary,{recursive:true,force:true});}
process.exit(status);
