import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, symlinkSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareCandidate, verifyCandidate, verifyArtifactPackage, createTestProjection, verifyTestProjection } from '../scripts/candidate-artifact.mjs';

const name = '@matuto-ai/antigravity-psst-connector';
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function put(root, path, contents) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ag-candidate-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'source'), artifactRoot = join(root, 'candidate');
  mkdirSync(sourceRoot);
  const pkg = { name, version: '1.2.3', type: 'module', bin: { 'psst-antigravity': 'bin/psst-antigravity.mjs', 'psst-antigravity-native-plugin': 'scripts/prepare-native-plugin.mjs' },
    files: ['src/', 'vendor/', 'skills/', 'bin/psst-antigravity.mjs', 'bin/psst-antigravity-native.mjs', 'scripts/prepare-native-plugin.mjs', 'plugin.json', 'mcp_config.json', 'hooks.json'],
    scripts: { prepack: 'node -e "throw Error(\'scripts must not execute\')"' } };
  put(sourceRoot, 'package.json', JSON.stringify(pkg, null, 2) + '\n');
  put(sourceRoot, 'plugin.json', JSON.stringify({ name: 'psst-native', version: pkg.version }));
  put(sourceRoot, 'mcp_config.json', '{}'); put(sourceRoot, 'hooks.json', '{}');
  put(sourceRoot, 'src/runtime-info.mjs', "import pkg from '../package.json' with { type: 'json' }; export const runtime = {name:pkg.name,version:pkg.version};\n");
  put(sourceRoot, 'src/current.mjs', "export const current = 'packed-current-source';\n");
  put(sourceRoot, 'vendor/psst/pinned.mjs', "export const pin = 'immutable';\n");
  put(sourceRoot, 'skills/psst/SKILL.md', 'Synthetic fixture.');
  put(sourceRoot, 'bin/psst-antigravity.mjs', "#!/usr/bin/env node\nimport { runtime } from '../src/runtime-info.mjs'; console.log(JSON.stringify(runtime));\n");
  put(sourceRoot, 'bin/psst-antigravity-native.mjs', '// Synthetic entrypoint; no native execution.\n');
  put(sourceRoot, 'scripts/prepare-native-plugin.mjs', '// Published generator fixture.\n');
  for (const bin of ['launch', 'mcp-proxy', 'native-hook']) put(sourceRoot, `bin/${bin}.mjs`, '// Explicit unpublished legacy test support.\n');
  put(sourceRoot, 'scripts/test-stage.mjs', '// Explicit test-stage support fixture.\n');
  put(sourceRoot, 'scripts/container-persistence-worker.mjs', '// Explicit Docker projection worker fixture.\n');
  put(sourceRoot, 'scripts/unlisted-test-helper.mjs', '// Not explicitly reviewed support.\n');
  put(sourceRoot, 'test/probe.test.mjs', "import {current} from '../src/current.mjs'; import {runtime} from '../src/runtime-info.mjs'; console.log(JSON.stringify({current,runtime,url:import.meta.url}));\n");
  put(sourceRoot, '.github/workflows/verify.yaml', 'name: Synthetic fixture\n');
  put(sourceRoot, 'docs/test-only.md', 'Test-only documentation.\n');
  put(sourceRoot, 'README.md', 'Synthetic connector fixture.\n');
  run('git', ['init', '--initial-branch=main'], sourceRoot);
  const commit = () => { run('git', ['add', '.'], sourceRoot); run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--no-gpg-sign', '-m', 'Synthetic fixture'], sourceRoot); };
  commit();
  return { root, sourceRoot, artifactRoot, pkg, commit };
}

test('one current checkout tarball is installed offline and has independently checked byte/version evidence', t => {
  const f = fixture(t), candidate = prepareCandidate({ ...f, requireClean: true });
  assert.equal(candidate.evidence.package.name, name);
  assert.equal(candidate.evidence.package.version, '1.2.3');
  assert.equal(candidate.evidence.source.dirty, false);
  assert.equal(candidate.evidence.source.commit, run('git', ['rev-parse', 'HEAD'], f.sourceRoot));
  assert.equal(candidate.evidence.source.tree, run('git', ['rev-parse', 'HEAD^{tree}'], f.sourceRoot));
  assert.match(candidate.evidence.source.digest, /^[0-9a-f]{64}$/);
  assert.match(candidate.evidence.tarball.integrity, /^sha512-/);
  assert.match(candidate.evidence.tarball.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(verifyCandidate({ ...f, requireClean: true }).evidence, candidate.evidence);
  assert.deepEqual(verifyArtifactPackage(candidate), { name, version: '1.2.3' });
  assert.deepEqual(JSON.parse(run(process.execPath, [join(candidate.packageRoot, 'bin/psst-antigravity.mjs')], f.root)), { name, version: '1.2.3' });
  const helper = fileURLToPath(new URL('../scripts/candidate-artifact.mjs', import.meta.url));
  assert.equal(run(process.execPath, [helper, 'tarball-path', f.sourceRoot, f.artifactRoot, '--require-clean'], f.root), candidate.tarballPath);
  assert.equal(run(process.execPath, [helper, 'package-root', f.sourceRoot, f.artifactRoot, '--require-clean'], f.root), candidate.packageRoot);
  assert.throws(() => prepareCandidate(f), /EEXIST/);
});

test('local dirty candidates are explicit and a CI clean requirement rejects them', t => {
  const f = fixture(t);
  put(f.sourceRoot, 'src/current.mjs', "export const current = 'uncommitted-current-source';\n");
  assert.throws(() => prepareCandidate({ ...f, requireClean: true }), /candidate_clean_checkout_required/);
  const c = prepareCandidate(f);
  assert.equal(c.evidence.source.dirty, true);
  assert.equal(readFileSync(join(c.packageRoot, 'src/current.mjs'), 'utf8'), readFileSync(join(f.sourceRoot, 'src/current.mjs'), 'utf8'));
  assert.throws(() => verifyCandidate({ ...f, requireClean: true }), /candidate_clean_checkout_required/);
});

test('version mismatch and an omitted current runtime module fail before tests can borrow repository code', t => {
  const f = fixture(t);
  put(f.sourceRoot, 'plugin.json', JSON.stringify({ name: 'psst-native', version: '0.5.1' }));
  assert.throws(() => prepareCandidate(f), /candidate_plugin_version_mismatch/);
  put(f.sourceRoot, 'plugin.json', JSON.stringify({ name: 'psst-native', version: f.pkg.version }));
  f.pkg.files = f.pkg.files.map(path => path === 'src/' ? 'src/runtime-info.mjs' : path);
  put(f.sourceRoot, 'package.json', JSON.stringify(f.pkg));
  assert.throws(() => prepareCandidate(f), /candidate_required_package_file_missing: src\/current.mjs/);
});

test('candidate reuse fails for source edits, changed commit, altered tarball and installed file tampering', t => {
  const f = fixture(t), c = prepareCandidate(f), sourcePath = join(f.sourceRoot, 'src/current.mjs');
  const original = readFileSync(sourcePath);
  writeFileSync(sourcePath, "export const current = 'different-source-same-version';\n");
  assert.throws(() => verifyCandidate(f), /candidate_source_changed/);
  writeFileSync(sourcePath, original);
  run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'Different commit, same tree'], f.sourceRoot);
  assert.throws(() => verifyCandidate(f), /candidate_source_changed/);
  // Restore only this private fixture's ref so the remaining independent guards can be checked.
  run('git', ['update-ref', 'HEAD', c.evidence.source.commit], f.sourceRoot);
  const tarball = readFileSync(c.tarballPath), changed = Buffer.from(tarball); changed[changed.length - 1] ^= 1;
  writeFileSync(c.tarballPath, changed);
  assert.throws(() => verifyCandidate(f), /candidate_tarball_integrity_mismatch/);
  writeFileSync(c.tarballPath, tarball);
  writeFileSync(join(c.packageRoot, 'src/current.mjs'), "export const current = 'tampered';\n");
  assert.throws(() => verifyCandidate(f), /candidate_installed_package_changed/);
});

test('artifact-only verifier rejects missing, extra, symlinked and mismatched metadata files without git', t => {
  const f = fixture(t), c = prepareCandidate(f), path = join(c.packageRoot, 'package.json'), bytes = readFileSync(path);
  rmSync(path);
  assert.throws(() => verifyArtifactPackage(c), /candidate_installed_package_changed/);
  writeFileSync(path, bytes);
  put(c.packageRoot, 'src/unexpected.mjs', '// Unexpected code.\n');
  assert.throws(() => verifyArtifactPackage(c), /candidate_installed_package_changed/);
  rmSync(join(c.packageRoot, 'src/unexpected.mjs'));
  rmSync(path); symlinkSync(join(f.sourceRoot, 'package.json'), path);
  assert.throws(() => verifyArtifactPackage(c), /candidate_symlink_forbidden/);
  rmSync(path); writeFileSync(path, bytes);
  const changed = structuredClone(c.evidence); changed.package.version = '0.5.1';
  assert.throws(() => verifyArtifactPackage({ ...c, evidence: changed }), /candidate_runtime_metadata_mismatch/);
});

test('test projection copies artifact modules, permits only explicit support, and detects later drift', t => {
  const f = fixture(t);
  put(f.sourceRoot, 'bin/unpublished-other.mjs', '// Not authorized test support.\n');
  const c = prepareCandidate(f), projection = createTestProjection(f);
  const result = JSON.parse(run(process.execPath, ['test/probe.test.mjs'], projection));
  assert.equal(result.current, 'packed-current-source');
  assert.deepEqual(result.runtime, { name, version: '1.2.3' });
  assert(result.url.startsWith('file://' + projection + '/test/'));
  assert.equal(readFileSync(join(projection, 'src/current.mjs'), 'utf8'), readFileSync(join(c.packageRoot, 'src/current.mjs'), 'utf8'));
  for (const path of ['.github/workflows/verify.yaml', 'scripts/test-stage.mjs', 'bin/launch.mjs', 'bin/mcp-proxy.mjs', 'bin/native-hook.mjs']) assert(readFileSync(join(projection, path)).length > 0);
  assert.equal(existsSync(join(c.packageRoot, 'scripts/container-persistence-worker.mjs')), false);
  assert.equal(readFileSync(join(projection, 'scripts/container-persistence-worker.mjs'), 'utf8'), readFileSync(join(f.sourceRoot, 'scripts/container-persistence-worker.mjs'), 'utf8'),
    'the Docker persistence gate executes this exact explicitly allowed worker from the test projection');
  for (const path of ['bin/unpublished-other.mjs', 'scripts/unlisted-test-helper.mjs', 'docs/test-only.md']) assert.equal(existsSync(join(projection, path)), false);
  // Removing access to the source checkout cannot change module resolution.
  const hidden = join(f.root, 'source-hidden'); renameSync(f.sourceRoot, hidden);
  try { assert.deepEqual(JSON.parse(run(process.execPath, ['test/probe.test.mjs'], projection)), result); }
  finally { renameSync(hidden, f.sourceRoot); }
  assert.equal(verifyTestProjection(f), projection);
  writeFileSync(join(projection, 'src/current.mjs'), '// Altered test runtime.\n');
  assert.throws(() => verifyTestProjection(f), /candidate_test_projection_changed/);
  // An intact pristine installation is not a substitute for validating the test copy.
  assert.doesNotThrow(() => verifyCandidate(f));
  rmSync(projection, { recursive: true });
  assert.throws(() => verifyTestProjection(f), /candidate_test_projection_missing/);
});

test('test projection never fills an omitted published generator and refuses arbitrary fixture links', t => {
  const f = fixture(t), c = prepareCandidate(f);
  rmSync(join(c.packageRoot, 'scripts/prepare-native-plugin.mjs'));
  assert.throws(() => createTestProjection(f), /candidate_installed_package_changed/);
  copyFileSync(join(f.sourceRoot, 'scripts/prepare-native-plugin.mjs'), join(c.packageRoot, 'scripts/prepare-native-plugin.mjs'));
  assert.throws(() => createTestProjection({ ...f, fixtureRoots: { source: f.sourceRoot } }), /candidate_fixture_not_allowed/);
  assert.throws(() => createTestProjection({ ...f, fixtureRoots: { 'ai-agent-msg-broker': f.sourceRoot } }), /candidate_fixture_pin_mismatch/);
});

test('output must be outside checkout and source symlinks cannot import unrecorded bytes', t => {
  const f = fixture(t);
  assert.throws(() => prepareCandidate({ ...f, artifactRoot: join(f.sourceRoot, 'output') }), /candidate_output_must_be_outside_source/);
  symlinkSync(join(f.sourceRoot, 'src/current.mjs'), join(f.sourceRoot, 'src/link.mjs'));
  assert.throws(() => prepareCandidate(f), /candidate_regular_bounded_file_required/);
});

for (const directory of ['scripts', 'docs']) test(`a clean package missing a ${directory}/ runtime dependency fails identically in installed and projected execution`, t => {
  const f = fixture(t), dependency = `${directory}/runtime-support.mjs`;
  put(f.sourceRoot, dependency, "export const current = 'source-only-dependency';\n");
  put(f.sourceRoot, 'src/current.mjs', `export { current } from '../${dependency}';\n`);
  f.commit();
  // The source checkout is healthy. Packaging has accidentally omitted its dependency.
  assert.equal(JSON.parse(run(process.execPath, ['test/probe.test.mjs'], f.sourceRoot)).current, 'source-only-dependency');
  const c = prepareCandidate({ ...f, requireClean: true });
  assert.equal(c.evidence.source.dirty, false);
  assert.equal(existsSync(join(c.packageRoot, dependency)), false);
  const installed = spawnSync(process.execPath, ['--input-type=module', '-e', `import './src/current.mjs';`], { cwd: c.packageRoot, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(installed.status, 0);
  assert.match(installed.stderr, /ERR_MODULE_NOT_FOUND/);
  const projection = createTestProjection({ ...f, requireClean: true });
  assert.equal(existsSync(join(projection, dependency)), false, 'test assembly must never restore this omitted runtime dependency');
  const projected = spawnSync(process.execPath, ['test/probe.test.mjs'], { cwd: projection, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(projected.status, 0);
  assert.match(projected.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.equal(verifyTestProjection({ ...f, requireClean: true }), projection);
});
