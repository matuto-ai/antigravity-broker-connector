import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { verifyReference } from './reference-pin.mjs';

export function supportedNativeRuntime(platform = process.platform, version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  return platform === 'linux' && major === 24 && Number.isInteger(patch) && minor >= 19;
}

function regularFile(root, path) {
  const stat = lstatSync(join(root, path));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error('plugin_file_invalid');
}

/** Read-only: no copying, native launcher, registry, credentials or lock changes. */
export function inspectNativeInstallation(path, { platform = process.platform, version = process.versions.node } = {}) {
  if (!supportedNativeRuntime(platform, version)) throw Error('linux_node_24_19_through_24_x_required');
  if (typeof path !== 'string' || !isAbsolute(path)) throw Error('absolute_plugin_directory_required');
  let root;
  try { root = realpathSync(path); if (!lstatSync(root).isDirectory()) throw Error(); }
  catch { throw Error('plugin_source_directory_not_found'); }
  try { regularFile(root, 'plugin.json'); } catch { throw Error('plugin_root_manifest_missing'); }
  try {
    for (const file of ['package.json','mcp_config.json','hooks.json','bin/psst-antigravity-native.mjs','skills/psst-setup/SKILL.md','skills/psst/SKILL.md']) regularFile(root, file);
    const manifest = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const mcp = JSON.parse(readFileSync(join(root, 'mcp_config.json'), 'utf8'));
    if (manifest.name !== 'psst-native' || pkg.name !== '@matuto-ai/antigravity-broker-connector' || manifest.version !== pkg.version || typeof pkg.version !== 'string') throw Error();
    if (mcp?.mcpServers?.psst?.command !== 'node' || JSON.stringify(mcp.mcpServers.psst.args) !== JSON.stringify(['./bin/psst-antigravity-native.mjs','serve','--experimental-native'])) throw Error();
    JSON.parse(readFileSync(join(root, 'hooks.json'), 'utf8'));
    verifyReference(join(root, 'vendor', 'psst'));
    return {
      package_version: pkg.version, plugin_name: manifest.name, plugin_directory: root,
      package_shape: 'verified', native_installation: 'not_checked', native_connection: 'not_checked',
      next_action: /^[A-Za-z0-9_./@+-]+$/.test(root) ? `/plugin install ${root}` : 'Open the native /plugin manager and enter plugin_directory exactly; this path needs native UI input, not guessed shell escaping.',
      instructions: 'Paste this slash command directly into the current Antigravity TUI, not into ! or a nested agy/antigravity process. The native manager still enforces normal permissions. If it denies import or reports an owner lock, stop; do not delete locks or switch executable/identity.',
    };
  } catch { throw Error('native_plugin_package_invalid'); }
}

export const nativeInstallationError = code => ({
  linux_node_24_19_through_24_x_required: 'Use the supported Linux Node 24.19+ within major 24 in this same sandbox; no runtime was changed.',
  absolute_plugin_directory_required: 'Pass the absolute directory containing plugin.json, or omit the path to check this installed package.',
  plugin_source_directory_not_found: 'The package directory is absent in this shell/environment. Locate the actual installed package before installing; printing a path does not verify it exists.',
  plugin_root_manifest_missing: 'The selected directory must contain plugin.json at its root, not inside a nested connector folder. No files were copied or overwritten.',
  native_plugin_package_invalid: 'The native package is incomplete, mismatched or modified. Use a reviewed complete package; do not copy individual files into a managed plugin.',
}[code] ?? 'Local plugin inspection failed; no native installation or settings change was attempted.');
