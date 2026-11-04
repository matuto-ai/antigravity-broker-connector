#!/usr/bin/env bash
# Qualification only: pull pinned artifacts, then execute native CLI with NO network.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${1:-$root/../..}" && pwd)"
broker="$(cd "$repo/../ai-agent-msg-broker" && pwd)"
pin='f32ddc79ec7b812062ed3f6de7b9a0c12a7128f3'
[[ "$(git -C "$broker" rev-parse HEAD)" == "$pin" ]] || { echo 'wrong disposable Psst checkout'; exit 1; }
tmp="$(mktemp -d)"
name="psst-agy-actual-$(date +%s)-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
image='node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df'
docker version >/dev/null
docker pull "$image" >/dev/null
curl --fail --location --max-time 120 https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.7-5900205422411776/linux-x64/cli_linux_x64.tar.gz -o "$tmp/cli.tgz"
printf '%s  %s\n' 'beda760587589f5827b0b516c3ec2c5bd5cd2e91eb0e2533807ba1e990a27dcd63aef0191e0b76fb60feab0d16eaa8210fb79842c34dd4809e257e1712edd152' "$tmp/cli.tgz" | sha512sum --check --status
tar -xzf "$tmp/cli.tgz" -C "$tmp" antigravity
chmod 755 "$tmp" "$tmp/antigravity"
fixture="$tmp/fixture"
mkdir -p "$fixture/xterm-pinned"
for file in actual-worker.mjs actual-plugin-fixture.mjs approval-broker-fixture.mjs setup-provider-step.mjs setup-provider-step.test.mjs permission-state.mjs permission-state.test.mjs waiter-provider-step.mjs waiter-provider-step.test.mjs approval-broker-fixture.test.mjs message-provider-step.mjs actual-provider-step.mjs presence-provider-step.mjs presence-provider-step.test.mjs message-provider-step.test.mjs actual-provider-step.test.mjs recorded-actual-envelope.json actual-compact-state.mjs actual-compact-state.test.mjs composer-state.mjs composer-state.test.mjs recorded-composer-screen.json trust-state.mjs trust-state.test.mjs recorded-trust-screen.json consent-state-navigation.mjs consent-navigation.test.mjs recorded-consent-screens.json recorded-navigation-screens.json xterm-screen.mjs consent-state.mjs xterm-screen.test.mjs consent-state.test.mjs recorded-terminal.json xterm-integrity.json; do cp "$root/$file" "$fixture/$file"; done
curl --fail --location --max-time 120 https://registry.npmjs.org/@xterm/headless/-/headless-6.0.0.tgz -o "$tmp/xterm.tgz"
node --input-type=module - "$tmp/xterm.tgz" <<'NODE'
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
if(createHash('sha512').update(readFileSync(process.argv[2])).digest('base64')!=='5Yj1QINYCyzrZtf8OFIHi47iQtI+0qYFPHmouEfG8dHNxbZ9Tb9YGSuLcsEwj9Z+OL75GJqPyJbyoFer80a2Hw==')throw Error('xterm_integrity_mismatch');
NODE
tar -xzf "$tmp/xterm.tgz" -C "$fixture/xterm-pinned"
chmod -R a+rX "$fixture"
node --test "$fixture/xterm-screen.test.mjs" "$fixture/consent-state.test.mjs" "$fixture/consent-navigation.test.mjs" "$fixture/trust-state.test.mjs" "$fixture/composer-state.test.mjs"
# Only the verified source dependencies, never the broker checkout or account files.
mkdir -p "$tmp/psst/src" "$tmp/psst/scripts" "$tmp/tls"
for file in src/server.mjs src/store.mjs src/auth.mjs src/presence.mjs src/protocol.mjs src/approval.mjs src/admin.mjs src/admin-client.mjs src/admin-data.mjs src/admin-pages.mjs src/admin-styles.mjs scripts/backup.mjs; do
  [[ -f "$broker/$file" && ! -L "$broker/$file" ]] || exit 1
  git -C "$broker" show "$pin:$file" > "$tmp/psst/$file"
  cmp --silent "$broker/$file" "$tmp/psst/$file" || { echo "modified pinned source: $file"; exit 1; }
done
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 -subj /CN=offline-psst-fixture -addext 'subjectAltName=IP:127.0.0.1' -addext 'basicConstraints=critical,CA:TRUE' -keyout "$tmp/tls/key.pem" -out "$tmp/tls/cert.pem" >/dev/null 2>&1
# Publicly readable only within this disposable fixture staging directory; never user keys.
chmod 755 "$tmp/tls" "$tmp/psst" "$tmp/psst/src" "$tmp/psst/scripts"
chmod 644 "$tmp/tls/key.pem" "$tmp/tls/cert.pem"
PSST_APPROVAL_FIXTURE_BROKER_ROOT="$tmp/psst" node --test "$fixture/approval-broker-fixture.test.mjs" "$fixture/permission-state.test.mjs" "$fixture/setup-provider-step.test.mjs" "$fixture/waiter-provider-step.test.mjs" "$fixture/presence-provider-step.test.mjs" "$fixture/message-provider-step.test.mjs" "$fixture/actual-provider-step.test.mjs" "$fixture/actual-compact-state.test.mjs"
mounts=(--mount "type=bind,src=$tmp/antigravity,dst=/native/antigravity,readonly")
for dir in src bin vendor; do
  [[ -d "$repo/$dir" && ! -L "$repo/$dir" ]] || exit 1
  mounts+=(--mount "type=bind,src=$repo/$dir,dst=/plugin/$dir,readonly")
done
for file in actual-worker.mjs actual-plugin-fixture.mjs approval-broker-fixture.mjs setup-provider-step.mjs permission-state.mjs waiter-provider-step.mjs message-provider-step.mjs actual-provider-step.mjs presence-provider-step.mjs actual-compact-state.mjs composer-state.mjs trust-state.mjs xterm-screen.mjs consent-state-navigation.mjs; do
 mounts+=(--mount "type=bind,src=$fixture/$file,dst=/fixture/$file,readonly")
done
mounts+=(--mount "type=bind,src=$fixture/xterm-pinned/package,dst=/fixture/xterm-pinned/package,readonly" --mount "type=bind,src=$tmp/psst,dst=/psst,readonly" --mount "type=bind,src=$tmp/tls,dst=/fixture-tls,readonly")
status=0
extra_args=()
case "${2:-all}" in
 all) modes=(root compact new presence messages idle setup busy);;
 baseline) modes=(root compact new presence messages);;
 automatic) modes=(idle setup busy);;
 authorized-once) modes=(idle); extra_args=(--confirm-waiter-once);;
 *) echo 'expected all, baseline, automatic or explicitly authorized-once native qualification group' >&2; exit 2;;
esac
for mode in "${modes[@]}"; do
 timeout --kill-after=5s 50s docker run --rm --name "$name" --network none --user 1000:1000 --read-only --memory 2g --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=512m "${mounts[@]}" -e HOME=/tmp/proof-home "$image" node /fixture/actual-worker.mjs "$mode" "${extra_args[@]}" || status=1
 docker rm -f "$name" >/dev/null 2>&1 || true
 if [[ "$mode" == root && "$status" != 0 ]]; then break; fi
done
exit "$status"
