import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectNativeInstallation, supportedNativeRuntime, nativeInstallationError } from '../src/native-installation.mjs';
const source = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agy-installation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = join(root, 'node_modules', '@matuto-ai', 'antigravity-psst-connector');
  cpSync(source, pkg, { recursive: true, filter: path => !path.includes('/.git') });
  return { root, pkg };
}
test('read-only packaged source check supports scoped paths and prints native, not nested-shell action', t => {
  const f = fixture(t), before = readdirSync(f.pkg, { recursive: true }).sort();
  const result = inspectNativeInstallation(f.pkg, { home: f.root, env: { PATH: '/not-a-path' } });
  assert.equal(result.plugin_name, 'psst-native');
  assert.equal(result.package_version, JSON.parse(readFileSync(join(f.pkg, 'package.json'))).version);
  assert.equal(result.package_shape, 'verified');
  assert.equal(result.native_installation, 'registration_or_package_absent');
  assert.equal(result.launcher.status, 'not_found_on_path');
  assert.equal(result.owner_lock, 'not_checked');
  assert.equal(result.import_permission, 'not_checked');
  assert.equal(result.native_connection, 'not_checked');
  assert.equal(result.next_action, `/plugin install ${f.pkg}`);
  assert.match(result.instructions, /not into ! or a nested/);
  assert.deepEqual(readdirSync(f.pkg, { recursive: true }).sort(), before);
});
test('absent source, nested root and modified/incomplete package produce distinct safe errors', t => {
  const f = fixture(t);
  assert.throws(() => inspectNativeInstallation(join(f.root, 'absent')), /plugin_source_directory_not_found/);
  assert.throws(() => inspectNativeInstallation(f.root), /plugin_root_manifest_missing/);
  assert.throws(() => inspectNativeInstallation('relative'), /absolute_plugin_directory_required/);
  writeFileSync(join(f.pkg, 'plugin.json'), '{');
  assert.throws(() => inspectNativeInstallation(f.pkg), /native_plugin_package_invalid/);
  writeFileSync(join(f.pkg, 'plugin.json'), JSON.stringify({ name: 'psst-native', version: '0.0.0' }));
  assert.throws(() => inspectNativeInstallation(f.pkg), /native_plugin_package_invalid/);
  assert.doesNotMatch(nativeInstallationError('sensitive raw error'), /sensitive raw error/);
});
test('runtime check enforces exact documented family and minimum', () => {
  for (const version of ['22.0.0','24.18.9','25.0.0','unknown']) assert.equal(supportedNativeRuntime('linux',version),false);
  assert.equal(supportedNativeRuntime('linux','24.19.0'),true);
  assert.equal(supportedNativeRuntime('darwin','24.22.2'),false);
});
test('CLI doctor needs no broker configuration and does not start MCP', () => {
  const cli = join(source, 'bin/psst-antigravity.mjs');
  const good = spawnSync(process.execPath,[cli,'doctor'],{encoding:'utf8',timeout:2000,env:{...process.env,PSST_CONFIG_FILE:'/missing/private/config'}});
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).native_connection,'not_checked');
  const missing = spawnSync(process.execPath,[cli,'doctor','/not-a-real-plugin-package'],{encoding:'utf8',timeout:2000});
  assert.equal(missing.status,1);assert.match(missing.stderr,/plugin_source_directory_not_found/);
  assert.doesNotMatch(missing.stderr,/not-a-real-plugin-package/);
});

test('ordinary CLI startup refuses silent manual fallback before loading SQLite/runtime',()=>{
 const cli=join(source,'bin/psst-antigravity.mjs');
 const result=spawnSync(process.execPath,[cli],{encoding:'utf8',timeout:2000,env:{...process.env,PSST_CONFIG_FILE:'/missing/private/config'}});
 assert.equal(result.status,2);assert.match(result.stderr,/automatic_delivery_required/);
 assert.doesNotMatch(result.stderr,/ExperimentalWarning|node:sqlite|connector_start_failed/);
 const text=readFileSync(cli,'utf8');assert.doesNotMatch(text,/^import .*connector\.mjs/m);
});

test('non-simple paths are sent to native UI input rather than guessed shell quoting',t=>{
 const f=fixture(t),spaced=join(f.root,'package with space');cpSync(f.pkg,spaced,{recursive:true});
 const result=inspectNativeInstallation(spaced);assert.equal(result.plugin_directory,spaced);assert.match(result.next_action,/native UI input/);
 assert.doesNotMatch(result.next_action,/^\/plugin install /);
});

function managedFixture(t) {
  const f = fixture(t), config = join(f.root, '.gemini', 'config');
  const installed = join(config, 'plugins', 'psst-native');
  cpSync(f.pkg, installed, { recursive: true });
  const registry = join(config, 'import_manifest.json');
  writeFileSync(registry, JSON.stringify({ imports: [{ name: 'psst-native', source: 'antigravity', components: ['skills','mcpServers','hooks'] }] }));
  return { ...f, config, installed, registry };
}
test('doctor inspects official manager registration and version without reading settings or invoking agy', t => {
  const f = managedFixture(t), bin = join(f.root, 'bin'), marker = join(f.root, 'executed');
  mkdirSync(bin);writeFileSync(join(bin, 'agy'), `#!/bin/sh\ntouch '${marker}'\n`);chmodSync(join(bin,'agy'),0o700);
  // The settings path is deliberately unreadable as JSON; doctor must not inspect it.
  mkdirSync(join(f.config, 'config.json'));
  const result = inspectNativeInstallation(f.pkg, { home: f.root, env: { PATH: bin } });
  assert.equal(result.native_installation, 'registered_package_verified');
  assert.equal(result.managed_registration.package_version, result.package_version);
  assert.equal(result.managed_registration.enabled, 'not_checked');
  assert.equal(result.launcher.status, 'executable_found');
  assert.equal(result.launcher.execution, 'not_attempted');
  assert.equal(result.runtime.process.native_host, 'not_verified');
  assert.equal(existsSync(marker), false);
  const manifest = JSON.parse(readFileSync(join(f.installed,'plugin.json')));
  const pkg = JSON.parse(readFileSync(join(f.installed,'package.json')));
  manifest.version = pkg.version = '0.0.1';
  writeFileSync(join(f.installed,'plugin.json'),JSON.stringify(manifest));
  writeFileSync(join(f.installed,'package.json'),JSON.stringify(pkg));
  assert.equal(inspectNativeInstallation(f.pkg,{home:f.root}).native_installation,'registered_version_mismatch');
});
test('doctor rejects corrupt, duplicate, incomplete and symlinked manager registrations', t => {
  const f = managedFixture(t), inspect = () => inspectNativeInstallation(f.pkg,{home:f.root}).native_installation;
  const entry = {name:'psst-native',source:'antigravity',components:['skills','mcpServers','hooks']};
  for (const imports of [[entry,entry],[{...entry,source:'unknown'}],[{...entry,components:['skills']}]]) {
    writeFileSync(f.registry,JSON.stringify({imports}));assert.equal(inspect(),'registration_or_package_invalid');
  }
  writeFileSync(f.registry,'{');assert.equal(inspect(),'registration_or_package_invalid');
  writeFileSync(f.registry,JSON.stringify({imports:[]}));assert.equal(inspect(),'not_registered');
  writeFileSync(f.registry,JSON.stringify({imports:[entry]}));
  rmSync(f.installed,{recursive:true});symlinkSync(f.pkg,f.installed,'dir');assert.equal(inspect(),'registration_or_package_invalid');
});
test('PATH lookup skips nonexecutables and resolves executable symlinks without execution', t => {
  const f=fixture(t), first=join(f.root,'first'), second=join(f.root,'second');mkdirSync(first);mkdirSync(second);
  writeFileSync(join(first,'agy'),'not executable',{mode:0o600});
  writeFileSync(join(second,'launcher'),'#!/bin/sh\nexit 99\n',{mode:0o700});symlinkSync(join(second,'launcher'),join(second,'agy'));
  const result=inspectNativeInstallation(f.pkg,{home:f.root,env:{PATH:`${first}:${second}`}});
  assert.equal(result.launcher.path,join(second,'agy'));assert.equal(result.launcher.resolved_path,join(second,'launcher'));
});
