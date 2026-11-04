import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
test('verify stages cover every local test exactly once with explicit container boundary', () => {
 const groups = ['local','integration'].map(stage => {
  const result=spawnSync(process.execPath,['scripts/test-stage.mjs',stage,'--list'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); return JSON.parse(result.stdout);
 });
 const actual=groups.flat().sort();
 const files=directory=>readdirSync(new URL(`../${directory}/`,import.meta.url)).filter(name=>name.endsWith('.test.mjs')).map(name=>`${directory}/${name}`);
 const expected=files('test');
 assert.deepEqual(actual,expected.sort());assert.equal(new Set(actual).size,actual.length);
 const workflow=readFileSync(new URL('../.github/workflows/verify.yaml',import.meta.url),'utf8');
 assert.match(workflow,/^  verify:$/m);
 const names=[...workflow.matchAll(/^      - name: (.+)$/gm)].map(match=>match[1]);
 assert.deepEqual(names,['Check source syntax','Build and verify current package','Run local tests','Verify native host and protocol integration','Verify container persistence','Verify installable package','Verify unconfirmed native execution boundary']);
 assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
 assert.match(workflow,/candidate-artifact\.mjs prepare "\$PWD" "\$RUNNER_TEMP\/antigravity-candidate" --require-clean/);
 const runner=readFileSync(new URL('../scripts/test-stage.mjs',import.meta.url),'utf8');
 assert.match(runner,/createTestProjection/);assert.match(runner,/verifyTestProjection/);assert.match(runner,/cwd:projection/);
 assert.match(workflow,/run-actual\.sh "\$PWD" baseline/);
 assert.match(workflow,/run-actual\.sh "\$PWD" permission-boundary/);
 assert.doesNotMatch(workflow,/continue-on-error|allow-failure/);
});
