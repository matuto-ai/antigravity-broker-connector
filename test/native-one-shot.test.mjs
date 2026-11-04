import test from 'node:test';
import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';
test('one-shot run cannot repeat through normal CI, PR duplicates, later pushes or reruns',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/native-waiter-once.yaml',import.meta.url),'utf8');
 assert.match(workflow,/github\.event_name == 'push'/);
 assert.match(workflow,/github\.event\.before == 'e6e0d522a031251a8c84ec39633a8c67e4b9ef52'/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/feat\/complete-native-qualification'/);
 assert.match(workflow,/github\.run_attempt == 1/);
 assert.doesNotMatch(workflow,/pull_request:|workflow_dispatch:|schedule:|continue-on-error/);
 const normal=readFileSync(new URL('../.github/workflows/verify.yaml',import.meta.url),'utf8');
 assert.doesNotMatch(normal,/authorized-once|confirm-waiter-once/);
 const runner=readFileSync(new URL('../scripts/native-contract-proof/run-actual.sh',import.meta.url),'utf8');
 assert.match(runner,/authorized-once\) modes=\(idle\); extra_args=\(--confirm-waiter-once\);;/);
 const fixture=readFileSync(new URL('../scripts/native-contract-proof/actual-plugin-fixture.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(fixture,/command\('/);
});

test('automatic broker stimulus cannot fall through to interactive compact commands',()=>{
 const worker=readFileSync(new URL('../scripts/native-contract-proof/actual-worker.mjs',import.meta.url),'utf8');
 const compact=worker.indexOf(" const stops=observed.filter");
 assert(compact>0);
 const gate=worker.lastIndexOf("if(!['compact','new'].includes(mode))return;",compact);
 assert(gate>worker.indexOf('const compactPoll='));
 assert(gate<compact&&compact<worker.indexOf("child.stdin.write(mode==='new'",compact));
 assert.match(worker,/processIdentity\(snap\.connectorProcess\.pid\)/);
});
