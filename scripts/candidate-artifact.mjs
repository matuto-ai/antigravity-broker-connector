// Release assembly only. Never downloads a connector or runs package scripts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const NAME = '@matuto-ai/antigravity-psst-connector';
const FORMAT = 'antigravity-candidate-v1';
const REQUIRED = ['package.json', 'plugin.json', 'mcp_config.json', 'hooks.json', 'bin/psst-antigravity.mjs', 'bin/psst-antigravity-native.mjs', 'scripts/prepare-native-plugin.mjs'];
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const digest = value => hash(JSON.stringify(value));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const same = (actual, expected, message) => assert.deepEqual(actual, expected, message);
function validPath(path) {
  assert(typeof path === 'string' && path.length > 0 && path.length <= 4096 && path.split('/').length <= 64 && !isAbsolute(path) && !/[\\\x00-\x1f]/.test(path)
    && path.split('/').every(segment => segment && segment !== '.' && segment !== '..'), 'candidate_invalid_relative_path');
  return path;
}
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert(!result.error && result.status === 0, `candidate_command_failed: ${command}: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
function fileRecord(root, path, source = false) {
  validPath(path);
  let parent = root;
  for (const segment of path.split('/').slice(0, -1)) {
    parent = join(parent, segment);
    const stat = lstatSync(parent);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'candidate_symlink_or_invalid_parent');
  }
  const stat = lstatSync(join(root, path));
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 * 1024, 'candidate_regular_bounded_file_required');
  return { path, size: stat.size, sha256: hash(readFileSync(join(root, path))), ...(source ? { executable: Boolean(stat.mode & 0o111) } : {}) };
}
function inventory(root) {
  const top = lstatSync(root);
  assert(top.isDirectory() && !top.isSymbolicLink(), 'candidate_regular_directory_required');
  const paths = []; let entries = 0;
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert(++entries <= 8192, 'candidate_inventory_too_large');
      const path = validPath(prefix + entry.name);
      assert(!entry.isSymbolicLink(), 'candidate_symlink_forbidden');
      if (entry.isDirectory()) visit(join(directory, entry.name), path + '/');
      else { assert(entry.isFile(), 'candidate_regular_file_required'); paths.push(path); }
      assert(paths.length <= 4096, 'candidate_inventory_too_large');
    }
  }
  visit(root);
  const files = paths.sort().map(path => fileRecord(root, path));
  assert(files.reduce((total, file) => total + file.size, 0) <= 128 * 1024 * 1024, 'candidate_inventory_too_large');
  return files;
}
function sourceSnapshot(sourceRoot, requireClean) {
  const commit = run('git', ['rev-parse', 'HEAD'], sourceRoot);
  const tree = run('git', ['rev-parse', 'HEAD^{tree}'], sourceRoot);
  assert(/^[a-f0-9]{40}$/.test(commit) && /^[a-f0-9]{40}$/.test(tree), 'candidate_git_identity_required');
  const dirty = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], sourceRoot) !== '';
  assert(!requireClean || !dirty, 'candidate_clean_checkout_required');
  const listing = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], sourceRoot);
  const paths = [...new Set(listing.split('\0').filter(Boolean))].sort();
  assert(paths.length <= 4096, 'candidate_source_too_large');
  const files = paths.map(path => {
    try { return fileRecord(sourceRoot, path, true); }
    catch (error) { if (error.code === 'ENOENT') return { path: validPath(path), missing: true }; throw error; }
  });
  return { commit, tree, dirty, digest: digest(files), files };
}
function roots(sourceRoot, artifactRoot) {
  sourceRoot = realpathSync(resolve(sourceRoot));
  artifactRoot = resolve(artifactRoot);
  artifactRoot = join(realpathSync(dirname(artifactRoot)), basename(artifactRoot));
  const within = relative(sourceRoot, artifactRoot);
  assert(within === '..' || within.startsWith('..' + sep) || isAbsolute(within), 'candidate_output_must_be_outside_source');
  return { sourceRoot, artifactRoot, packageRoot: join(artifactRoot, 'install', 'node_modules', '@matuto-ai', 'antigravity-psst-connector') };
}
function packageMetadata(packageRoot) {
  const pkg = json(join(packageRoot, 'package.json')), plugin = json(join(packageRoot, 'plugin.json'));
  assert(pkg.name === NAME && typeof pkg.version === 'string' && pkg.version.length <= 128
    && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(pkg.version), 'candidate_package_metadata_invalid');
  assert(plugin.name === 'psst-native' && plugin.version === pkg.version, 'candidate_plugin_version_mismatch');
  return { name: pkg.name, version: pkg.version, pluginName: plugin.name, pluginVersion: plugin.version };
}
function verifySourceFiles(sourceRoot, source, files) {
  const included = new Map(files.map(file => [file.path, file]));
  const tracked = new Map(source.files.filter(file => !file.missing).map(file => [file.path, file]));
  const pkg = json(join(sourceRoot, 'package.json'));
  const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {});
  const declaredFiles = (pkg.files ?? []).filter(path => typeof path === 'string' && !/[*?\[{]/.test(path) && tracked.has(path));
  for (const path of [...REQUIRED, ...bins, ...declaredFiles, ...tracked.keys()].filter(path => REQUIRED.includes(path) || bins.includes(path) || declaredFiles.includes(path) || /^(src|vendor|skills)\//.test(path))) {
    assert(included.has(validPath(path)), `candidate_required_package_file_missing: ${path}`);
  }
  for (const file of files) {
    assert(!/(^|\/)(?:node_modules|test|\.git|\.github)(?:\/|$)|\.sqlite|(^|\/)(?:connection\.json|token|\.env[^/]*)$/.test(file.path), 'candidate_forbidden_package_file');
    const original = tracked.get(file.path);
    assert(original, `candidate_package_file_outside_source_snapshot: ${file.path}`);
    same(file, { path: original.path, size: original.size, sha256: original.sha256 }, `candidate_package_source_mismatch: ${file.path}`);
  }
}
function readEvidence(artifactRoot) {
  const path = join(artifactRoot, 'candidate.json'), stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 8 * 1024 * 1024, 'candidate_evidence_invalid');
  const evidence = json(path);
  assert(evidence.format === FORMAT, 'candidate_evidence_format_invalid');
  return evidence;
}

/** Verify installed release bytes without subprocesses or a source checkout. */
export function verifyArtifactPackage({ packageRoot, evidence }) {
  assert(evidence?.format === FORMAT && Array.isArray(evidence.package?.files), 'candidate_evidence_invalid');
  const files = inventory(packageRoot);
  same(files, evidence.package.files, 'candidate_installed_package_changed');
  assert(digest(files) === evidence.package.digest, 'candidate_package_digest_mismatch');
  const metadata = packageMetadata(packageRoot);
  for (const [key, value] of Object.entries(metadata)) assert(value === evidence.package[key], 'candidate_runtime_metadata_mismatch');
  return { name: metadata.name, version: metadata.version };
}

export function prepareCandidate({ sourceRoot, artifactRoot, requireClean = false }) {
  const paths = roots(sourceRoot, artifactRoot);
  ({ sourceRoot, artifactRoot } = paths);
  const source = sourceSnapshot(sourceRoot, requireClean), metadata = packageMetadata(sourceRoot);
  mkdirSync(artifactRoot, { mode: 0o700 }); // A stale or existing candidate must be verified, never overwritten.
  try {
    const env = { ...process.env, npm_config_cache: join(artifactRoot, 'npm-cache') };
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', artifactRoot], sourceRoot, env));
    assert(packed.length === 1 && packed[0].name === metadata.name && packed[0].version === metadata.version, 'candidate_pack_metadata_mismatch');
    const { filename, integrity } = packed[0];
    assert(typeof filename === 'string' && basename(filename) === filename && filename.endsWith('.tgz'), 'candidate_tarball_name_invalid');
    const tarballPath = join(artifactRoot, filename), bytes = readFileSync(tarballPath);
    assert(integrity === 'sha512-' + hash(bytes, 'sha512', 'base64'), 'candidate_tarball_integrity_mismatch');
    run('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--package-lock=false', '--prefix', join(artifactRoot, 'install'), tarballPath], artifactRoot, env);
    const files = inventory(paths.packageRoot);
    same(files.map(file => file.path), packed[0].files.map(file => validPath(file.path)).sort(), 'candidate_pack_inventory_mismatch');
    verifySourceFiles(sourceRoot, source, files);
    same(sourceSnapshot(sourceRoot, requireClean), source, 'candidate_source_changed_during_preparation');
    const evidence = { format: FORMAT, source, package: { ...metadata, digest: digest(files), files }, tarball: { filename, size: bytes.length, sha256: hash(bytes), integrity } };
    verifyArtifactPackage({ packageRoot: paths.packageRoot, evidence });
    // Public source/artifact hashes only; the private staging parent remains mode 0700.
    writeFileSync(join(artifactRoot, 'candidate.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    return { ...paths, tarballPath, evidence };
  } catch (error) { rmSync(artifactRoot, { recursive: true, force: true }); throw error; }
}

export function verifyCandidate({ sourceRoot, artifactRoot, requireClean = false }) {
  const paths = roots(sourceRoot, artifactRoot), evidence = readEvidence(paths.artifactRoot);
  same(sourceSnapshot(paths.sourceRoot, requireClean), evidence.source, 'candidate_source_changed');
  const filename = validPath(evidence.tarball.filename);
  assert(basename(filename) === filename, 'candidate_tarball_name_invalid');
  const tarballPath = join(paths.artifactRoot, filename), stat = lstatSync(tarballPath);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size === evidence.tarball.size && stat.size <= 128 * 1024 * 1024, 'candidate_tarball_invalid');
  const bytes = readFileSync(tarballPath);
  assert(hash(bytes) === evidence.tarball.sha256 && 'sha512-' + hash(bytes, 'sha512', 'base64') === evidence.tarball.integrity, 'candidate_tarball_integrity_mismatch');
  verifyArtifactPackage({ packageRoot: paths.packageRoot, evidence });
  verifySourceFiles(paths.sourceRoot, evidence.source, evidence.package.files);
  return { ...paths, tarballPath, evidence };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, sourceRoot, artifactRoot, ...flags] = process.argv.slice(2);
    assert(sourceRoot && artifactRoot && flags.every(flag => flag === '--require-clean'), 'usage: candidate-artifact.mjs prepare|verify|package-root|tarball-path SOURCE ARTIFACT [--require-clean]');
    const options = { sourceRoot, artifactRoot, requireClean: flags.includes('--require-clean') };
    assert(['prepare', 'verify', 'package-root', 'tarball-path'].includes(command), 'candidate_unknown_command');
    const candidate = command === 'prepare' ? prepareCandidate(options) : verifyCandidate(options);
    console.log(command === 'package-root' ? candidate.packageRoot : command === 'tarball-path' ? candidate.tarballPath : JSON.stringify({ packageRoot: candidate.packageRoot, tarballPath: candidate.tarballPath,
      commit: candidate.evidence.source.commit, tree: candidate.evidence.source.tree, sourceDigest: candidate.evidence.source.digest,
      dirty: candidate.evidence.source.dirty, package: { name: candidate.evidence.package.name, version: candidate.evidence.package.version, digest: candidate.evidence.package.digest }, tarball: candidate.evidence.tarball }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
