import { readFileSync, lstatSync, realpathSync, accessSync, constants } from 'node:fs';
import { join, isAbsolute, resolve, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { verifyReference } from './reference-pin.mjs';


// Native entrypoint's complete local runtime closure. Keep this explicit so an
// incomplete installed package cannot define its own, smaller completeness check.
export const NATIVE_RUNTIME_FILES = Object.freeze([
  'bin/psst-antigravity-native.mjs',
  ...['approval-manager','approval-waiter','connector-config','cooperative-inbox',
    'installation','mcp-stdio','message-format','native-binding','native-incarnation',
    'native-metadata','native-plugin','native-process-waiter','native-root-context',
    'native-session','native-waiter','pairing','presence-notices','project-metadata',
    'receive-presentation','runtime-info','tool-scope'].map(name => `src/${name}.mjs`),
  'vendor/psst/approval.mjs', 'vendor/psst/enrollment.mjs',
]);
const EXPECTED_HOOKS = { 'psst-native-binding': {
  SessionStart: [{ type: 'command', command: 'node ./bin/psst-antigravity-native.mjs hook observe', timeout: 5 }],
  PreInvocation: [{ type: 'command', command: 'node ./bin/psst-antigravity-native.mjs hook observe', timeout: 5 }],
  PreToolUse: [{ matcher: 'call_mcp_tool|run_command', hooks: [{ type: 'command', command: 'node ./bin/psst-antigravity-native.mjs hook', timeout: 5 }] }],
} };

export function supportedNativeRuntime(platform = process.platform, version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  return platform === 'linux' && major === 24 && Number.isInteger(patch) && minor >= 19;
}

function regularFile(root, path) {
  let directory = root;
  for (const segment of path.split('/').slice(0, -1)) {
    directory = join(directory, segment);
    const parent = lstatSync(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw Error('plugin_file_invalid');
  }
  const stat = lstatSync(join(root, path));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error('plugin_file_invalid');
}

/** Read-only: no copying, native launcher, registry, credentials or lock changes. */
function inspectPackage(path, { platform = process.platform, version = process.versions.node } = {}) {
  if (!supportedNativeRuntime(platform, version)) throw Error('linux_node_24_19_through_24_x_required');
  if (typeof path !== 'string' || !isAbsolute(path)) throw Error('absolute_plugin_directory_required');
  let root;
  try { root = realpathSync(path); if (!lstatSync(root).isDirectory()) throw Error(); }
  catch { throw Error('plugin_source_directory_not_found'); }
  try { regularFile(root, 'plugin.json'); } catch { throw Error('plugin_root_manifest_missing'); }
  try {
    for (const file of ['package.json','mcp_config.json','hooks.json','skills/psst-setup/SKILL.md','skills/psst-reauthorize/SKILL.md','skills/psst/SKILL.md',...NATIVE_RUNTIME_FILES]) regularFile(root, file);
    const manifest = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const mcp = JSON.parse(readFileSync(join(root, 'mcp_config.json'), 'utf8'));
    if (manifest.name !== 'psst-native' || pkg.name !== '@matuto-ai/antigravity-psst-connector' || manifest.version !== pkg.version || typeof pkg.version !== 'string') throw Error();
    if (!isDeepStrictEqual(mcp, { mcpServers: { psst: { command: 'node', args: ['./bin/psst-antigravity-native.mjs','serve','--experimental-native'] } } })) throw Error();
    if (!isDeepStrictEqual(JSON.parse(readFileSync(join(root, 'hooks.json'), 'utf8')), EXPECTED_HOOKS)) throw Error();
    verifyReference(join(root, 'vendor', 'psst'));
    return {
      package_version: pkg.version, plugin_name: manifest.name, plugin_directory: root,
      package_shape: 'verified', native_installation: 'not_checked', native_connection: 'not_checked',
      next_action: /^[A-Za-z0-9_./@+-]+$/.test(root) ? `/plugin install ${root}` : 'Open the native /plugin manager and enter plugin_directory exactly; this path needs native UI input, not guessed shell escaping.',
      instructions: 'Paste this slash command directly into the current Antigravity TUI, not into ! or a nested agy/antigravity process. The native manager still enforces normal permissions. If it denies import or reports an owner lock, stop; do not delete locks or switch executable/identity.',
    };
  } catch { throw Error('native_plugin_package_invalid'); }
}

// Observed official CLI 1.4.7 manager layout. This is inspection, not permission
// or native-host certification. Never read config.json, credentials or locks.
function managedRegistration(home, expectedVersion, runtime) {
  try {
    if (!isAbsolute(home)) throw Error();
    const canonicalHome = realpathSync(home);
    let directory = canonicalHome;
    for (const segment of ['.gemini', 'config']) {
      directory = join(directory, segment);
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error();
    }
    regularFile(directory, 'import_manifest.json');
    const registry = JSON.parse(readFileSync(join(directory, 'import_manifest.json'), 'utf8'));
    if (!Array.isArray(registry.imports)) throw Error();
    const entries = registry.imports.filter(entry => entry?.name === 'psst-native');
    if (!entries.length) return { status: 'not_registered', enabled: 'not_checked' };
    if (entries.length !== 1 || entries[0].source !== 'antigravity'
      || !Array.isArray(entries[0].components)
      || !['skills', 'mcpServers', 'hooks'].every(value => entries[0].components.includes(value))) throw Error();
    for (const segment of ['plugins', 'psst-native']) {
      directory = join(directory, segment);
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error();
    }
    const installed = inspectPackage(directory, runtime);
    return { status: installed.package_version === expectedVersion ? 'registered_package_verified' : 'registered_version_mismatch',
      package_version: installed.package_version, plugin_directory: directory,
      enabled: 'not_checked', registry_format: 'official_cli_1.4.7' };
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 'registration_or_package_absent' : 'registration_or_package_invalid', enabled: 'not_checked' };
  }
}

function launcherOnPath(path) {
  for (const directory of (path ?? '').split(delimiter)) {
    const candidate = resolve(directory || '.', 'agy');
    try {
      const executable = realpathSync(candidate);
      if (!lstatSync(executable).isFile()) continue;
      accessSync(executable, constants.X_OK);
      return { status: 'executable_found', path: candidate, resolved_path: executable, execution: 'not_attempted', policy: 'not_checked' };
    } catch { /* Follow normal PATH search without executing or reading wrappers. */ }
  }
  return { status: 'not_found_on_path', execution: 'not_attempted', policy: 'not_checked' };
}

function doctorProcess() {
  try {
    // Linux proc(5) executable and start time describe this doctor process only.
    // Do not infer a verified Antigravity host from a name, environment or PID.
    const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
    const start = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
    if (!/^\d+$/.test(start)) throw Error();
    return { status: 'observed', pid: process.pid, executable: realpathSync(`/proc/${process.pid}/exe`), start_ticks: start,
      native_host: 'not_verified' };
  } catch { return { status: 'unavailable', native_host: 'not_verified' }; }
}

/** No subprocesses, writes, credential/config reads, lock probing or policy changes. */
export function inspectNativeInstallation(path, { platform = process.platform, version = process.versions.node,
  home = homedir(), env = process.env } = {}) {
  const result = inspectPackage(path, { platform, version });
  const registration = managedRegistration(home, result.package_version, { platform, version });
  return { ...result, native_installation: registration.status, managed_registration: registration,
    launcher: launcherOnPath(env.PATH), runtime: { platform, node: version, process: doctorProcess() },
    import_permission: 'not_checked', owner_lock: 'not_checked',
    instructions: result.instructions + ' Launcher presence and a registered package do not prove import permission, enabled status, host ownership, or automatic delivery. Settings and owner locks were not read.' };
}

export const nativeInstallationError = code => ({
  linux_node_24_19_through_24_x_required: 'Use the supported Linux Node 24.19+ within major 24 in this same sandbox; no runtime was changed.',
  absolute_plugin_directory_required: 'Pass the absolute directory containing plugin.json, or omit the path to check this installed package.',
  plugin_source_directory_not_found: 'The package directory is absent in this shell/environment. Locate the actual installed package before installing; printing a path does not verify it exists.',
  plugin_root_manifest_missing: 'The selected directory must contain plugin.json at its root, not inside a nested connector folder. No files were copied or overwritten.',
  native_plugin_package_invalid: 'The native package is incomplete, mismatched or modified. Use a reviewed complete package; do not copy individual files into a managed plugin.',
}[code] ?? 'Local plugin inspection failed; no native installation or settings change was attempted.');
