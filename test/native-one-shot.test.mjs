import test from 'node:test';
import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';
test('one-shot run cannot repeat through normal CI, PR duplicates, later pushes or reruns',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/native-waiter-once.yaml',import.meta.url),'utf8');
 assert.match(workflow,/github\.event_name == 'push'/);
 assert.match(workflow,/github\.event\.before == '073499521c0dc2493bd1f240abb4a5d0eea18e17'/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/feat\/complete-native-qualification'/);
 assert.match(workflow,/github\.run_attempt == 1/);
 assert.doesNotMatch(workflow,/pull_request:|workflow_dispatch:|schedule:|continue-on-error/);
 const normal=readFileSync(new URL('../.github/workflows/verify.yaml',import.meta.url),'utf8');
 assert.doesNotMatch(normal,/authorized-once|authorized-matrix|confirm-waiter-once|confirm-authorized-matrix|authorized-setup-remainder|confirm-remaining-setup/);
 const runner=readFileSync(new URL('../scripts/native-contract-proof/run-actual.sh',import.meta.url),'utf8');
 assert.match(runner,/authorized-once\) modes=\(idle\); extra_args=\(--confirm-waiter-once\);;/);
 assert.match(runner,/authorized-matrix\) modes=\(idle setup busy\); extra_args=\(--confirm-authorized-matrix\);;/);
 assert.match(workflow,/\"\$PWD\" authorized-setup-remainder/);
 assert.match(runner,/authorized-setup-remainder\) modes=\(setup\); extra_args=\(--confirm-remaining-setup\);;/);
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

test('normal CI checks only the unconfirmed boundary; full native arrival remains an explicit gate',()=>{
 const normal=readFileSync(new URL('../.github/workflows/verify.yaml',import.meta.url),'utf8');
 assert.match(normal,/Verify unconfirmed native execution boundary/);assert.match(normal,/"\$PWD" permission-boundary/);
 const runner=readFileSync(new URL('../scripts/native-contract-proof/run-actual.sh',import.meta.url),'utf8');
 assert.match(runner,/automatic\) modes=\(idle setup busy\);;/);
 assert.match(runner,/permission-boundary\) modes=\(idle setup busy\); extra_args=\(--expect-permission-boundary\);;/);
 const worker=readFileSync(new URL('../scripts/native-contract-proof/actual-worker.mjs',import.meta.url),'utf8');
 assert.match(worker,/if\(expectPermissionBoundary\)\{assert\(permissionBoundaryVerified/);
 assert.match(worker,/assert\(expectedWakeupVerified/);
});
