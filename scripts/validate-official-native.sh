#!/usr/bin/env bash
# Pinned official parser/install gate only. No sign-in, model, policy bypass or real credentials.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
candidate="${PSST_CANDIDATE_DIR:-$tmp/candidate}"
if [[ -z "${PSST_CANDIDATE_DIR:-}" ]]; then node "$root/scripts/candidate-artifact.mjs" prepare "$root" "$candidate"; fi
package="$(node "$root/scripts/candidate-artifact.mjs" package-root "$root" "$candidate")"
url='https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.7-5900205422411776/linux-x64/cli_linux_x64.tar.gz'
curl --fail --location --max-time 120 "$url" -o "$tmp/cli.tgz"
printf '%s  %s\n' 'beda760587589f5827b0b516c3ec2c5bd5cd2e91eb0e2533807ba1e990a27dcd63aef0191e0b76fb60feab0d16eaa8210fb79842c34dd4809e257e1712edd152' "$tmp/cli.tgz" | sha512sum --check --status
tar -xzf "$tmp/cli.tgz" -C "$tmp"
mkdir -m 700 "$tmp/home"
export HOME="$tmp/home"
# Invoke only the manager in a fresh environment, without inherited provider or
# authentication variables. This does not launch a native conversation.
native() { env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 "$tmp/antigravity" "$@"; }
test "$(native --version)" = '1.4.7'
native plugin validate "$package" --strict --json
native plugin install "$package"
native plugin list --json
# Reinstall the same reviewed package with the supported manager, never by
# deleting its registry/locks or writing a replacement config ourselves.
native plugin install "$package"
native plugin list --json > "$tmp/plugins.json"
node --input-type=module - "$package" "$tmp/plugins.json" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const [root, listPath] = process.argv.slice(2);
const { inspectNativeInstallation } = await import(pathToFileURL(join(root, 'src/native-installation.mjs')));
const result = inspectNativeInstallation(root);
assert.equal(result.native_installation, 'registered_package_verified');
const list = JSON.parse(readFileSync(listPath, 'utf8'));
assert.equal(list.length, 1);
assert.equal(list[0].name, 'psst-native');
assert.equal(list[0].enabled, true);
assert.equal(list[0].version, result.package_version);
assert.equal(list[0].path, result.managed_registration.plugin_directory);
assert.equal(result.import_permission, 'not_checked');
assert.equal(result.owner_lock, 'not_checked');
console.log(JSON.stringify({ official_cli: '1.4.7', manager_install_reinstall: 'passed',
  registered_version: result.package_version, wrapper_import_policy: 'not_checked',
  authenticated_native_host: 'not_checked' }));
JS
node "$root/scripts/candidate-artifact.mjs" verify "$root" "$candidate"
