import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import packageInfo from '../package.json' with { type: 'json' };
import pluginInfo from '../plugin.json' with { type: 'json' };
import { CONNECTOR_RUNTIME } from '../src/runtime-info.mjs';

function fixture(t, manifest) {
  const root = mkdtempSync(join(tmpdir(), 'ag-runtime-info-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  copyFileSync(new URL('../src/runtime-info.mjs', import.meta.url), join(root, 'src/runtime-info.mjs'));
  if (manifest !== undefined) writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  return { root, url: pathToFileURL(join(root, 'src/runtime-info.mjs')).href };
}

test('runtime metadata matches the release manifests and exposes only name and version', () => {
  assert.deepEqual(CONNECTOR_RUNTIME, { name: packageInfo.name, version: packageInfo.version });
  assert.equal(CONNECTOR_RUNTIME.version, pluginInfo.version);
  assert(Object.isFrozen(CONNECTOR_RUNTIME));
});

test('loaded runtime metadata stays stable until a new process loads the updated package', async t => {
  const f = fixture(t, { ...packageInfo, version: '1.2.3', private_fixture: 'not_exposed' });
  const loaded = await import(f.url);
  assert.deepEqual(loaded.CONNECTOR_RUNTIME, { name: packageInfo.name, version: '1.2.3' });
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({ ...packageInfo, version: '1.2.4' }));
  assert.equal((await import(f.url)).CONNECTOR_RUNTIME.version, '1.2.3');
  const restarted = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { CONNECTOR_RUNTIME } from ${JSON.stringify(f.url)}; console.log(JSON.stringify(CONNECTOR_RUNTIME));`],
    { cwd: tmpdir(), encoding: 'utf8', timeout: 3000 });
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout), { name: packageInfo.name, version: '1.2.4' });
});

test('missing or invalid package metadata fails instead of reporting a fallback version', async t => {
  for (const manifest of [undefined, {}, { ...packageInfo, name: 'unrelated' },
    { ...packageInfo, version: null }, { ...packageInfo, version: 'not a version' },
    { ...packageInfo, version: '1.2.3-' + 'x'.repeat(128) }]) {
    const f = fixture(t, manifest);
    await assert.rejects(import(f.url), manifest === undefined ? /Cannot find/ : /invalid_connector_runtime_metadata/);
  }
  const f = fixture(t, packageInfo);
  writeFileSync(join(f.root, 'package.json'), '{invalid');
  await assert.rejects(import(f.url), SyntaxError);
});
