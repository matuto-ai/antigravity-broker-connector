import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pin = '72f5d2d1b834e02cfb6b2f7dc11c6f1a55729344';
const release = read('../.github/workflows/npm-publish.yml');
const ci = read('../.github/workflows/test.yml');

function approvalCheckout(workflow) {
  // Inspect existing step boundaries without adding a YAML/runtime dependency.
  const steps = workflow.split(/^      - /m).slice(1);
  const matches = steps.filter(step => /^          path: psst-approval\s*$/m.test(step));
  assert.equal(matches.length, 1, 'exactly one approval fixture checkout is required');
  const step = matches[0];
  assert.match(step, /^uses: actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\b/);
  assert.match(step, /^          repository: matuto-ai\/psst\s*$/m);
  assert.match(step, new RegExp('^          ref: ' + pin + '\\s*$', 'm'));
  assert.match(step, /^          persist-credentials: false\s*$/m);
  return step;
}

test('release provisions the same immutable approval TLS fixture as regular CI', () => {
  assert.equal(approvalCheckout(release), approvalCheckout(ci));
  assert.match(read('./approval-tls.test.mjs'), /\.\.\/\.\.\/psst-approval\/test\/approval-tls-fixture\.mjs/);
  assert.match(release, /npm run check && npm test && npm run test:pack/);
});

test('release fixture guard rejects the previously missing checkout', () => {
  const block = '      - ' + approvalCheckout(release);
  assert.throws(() => approvalCheckout(release.replace(block, '')), /exactly one approval fixture checkout/);
});

test('release fixture guard rejects a drifting broker pin', () => {
  assert.throws(() => approvalCheckout(release.replace(pin, 'main')), /match/);
});
