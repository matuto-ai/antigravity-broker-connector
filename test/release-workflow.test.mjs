import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pin = '72f5d2d1b834e02cfb6b2f7dc11c6f1a55729344';
const release = read('../.github/workflows/npm-publish.yml');
const ci = read('../.github/workflows/verify.yaml');

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
  assert.match(release, /candidate-artifact\.mjs prepare "\$PWD" "\$RUNNER_TEMP\/antigravity-candidate" --require-clean/);
  assert.match(release, /candidate-artifact\.mjs tarball-path "\$PWD" "\$PSST_CANDIDATE_DIR" --require-clean/);
  assert.match(release, /npm publish "\$package_file" --access public --provenance --ignore-scripts/);
  assert.doesNotMatch(release, /npm publish --access/);
  assert.match(release, /verify-published-artifact\.mjs "\$PWD" "\$PSST_CANDIDATE_DIR"/);
});

test('release fixture guard rejects the previously missing checkout', () => {
  const block = '      - ' + approvalCheckout(release);
  assert.throws(() => approvalCheckout(release.replace(block, '')), /exactly one approval fixture checkout/);
});

test('release fixture guard rejects a drifting broker pin', () => {
  assert.throws(() => approvalCheckout(release.replace(pin, 'main')), /match/);
});

test('package and native plugin release versions stay aligned', () => {
  const pkg = JSON.parse(read('../package.json'));
  const plugin = JSON.parse(read('../plugin.json'));
  assert.equal(plugin.version, pkg.version);
  assert.match(pkg.version, /^[0-9]+[.][0-9]+[.][0-9]+$/);
  for (const path of ['../README.md', '../docs/setup.md']) {
    assert.ok(read(path).includes('@matuto-ai/antigravity-psst-connector@' + pkg.version), path + ' must document the prepared version');
  }
});

test('operator release guide names only the prepared release tag', () => {
  const pkg = JSON.parse(read('../package.json'));
  const tags = [...read('../docs/release.md').matchAll(/`(v\d+\.\d+\.\d+)`/g)].map(match => match[1]);
  assert.ok(tags.length > 0, 'release guide must name the exact prepared tag');
  for (const tag of tags) assert.equal(tag, `v${pkg.version}`);
});
