#!/usr/bin/env bash
# Qualification only: pull pinned artifacts, then execute native CLI with NO network.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
name="psst-agy-offline-$(date +%s)-$$"
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
for file in continuity-evidence.mjs continuity-evidence.test.mjs recorded-compact-observations.json recorded-new-observations.json composer-state.mjs composer-state.test.mjs recorded-composer-screen.json worker.mjs trust-state.mjs trust-state.test.mjs recorded-trust-screen.json consent-state-navigation.mjs consent-navigation.test.mjs recorded-consent-screens.json recorded-navigation-screens.json xterm-screen.mjs consent-state.mjs xterm-screen.test.mjs consent-state.test.mjs recorded-terminal.json xterm-integrity.json; do cp "$root/$file" "$fixture/$file"; done
curl --fail --location --max-time 120 https://registry.npmjs.org/@xterm/headless/-/headless-6.0.0.tgz -o "$tmp/xterm.tgz"
node --input-type=module - "$tmp/xterm.tgz" <<'NODE'
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
if(createHash('sha512').update(readFileSync(process.argv[2])).digest('base64')!=='5Yj1QINYCyzrZtf8OFIHi47iQtI+0qYFPHmouEfG8dHNxbZ9Tb9YGSuLcsEwj9Z+OL75GJqPyJbyoFer80a2Hw==')throw Error('xterm_integrity_mismatch');
NODE
tar -xzf "$tmp/xterm.tgz" -C "$fixture/xterm-pinned"
chmod -R a+rX "$fixture"
node --test "$fixture/continuity-evidence.test.mjs" "$fixture/xterm-screen.test.mjs" "$fixture/consent-state.test.mjs" "$fixture/consent-navigation.test.mjs" "$fixture/trust-state.test.mjs" "$fixture/composer-state.test.mjs"
status=0
for mode in root child lazy compact new; do
timeout --kill-after=5s 50s docker run --rm --name "$name" --network none --user 1000:1000 --read-only --memory 2g --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=512m --mount "type=bind,src=$tmp/antigravity,dst=/native/antigravity,readonly" --mount "type=bind,src=$fixture/continuity-evidence.mjs,dst=/fixture/continuity-evidence.mjs,readonly" --mount "type=bind,src=$fixture/worker.mjs,dst=/fixture/worker.mjs,readonly" --mount "type=bind,src=$fixture/composer-state.mjs,dst=/fixture/composer-state.mjs,readonly" --mount "type=bind,src=$fixture/trust-state.mjs,dst=/fixture/trust-state.mjs,readonly" --mount "type=bind,src=$fixture/xterm-screen.mjs,dst=/fixture/xterm-screen.mjs,readonly" --mount "type=bind,src=$fixture/consent-state-navigation.mjs,dst=/fixture/consent-state-navigation.mjs,readonly" --mount "type=bind,src=$fixture/xterm-pinned/package,dst=/fixture/xterm-pinned/package,readonly" -e HOME=/tmp/proof-home "$image" node /fixture/worker.mjs "$mode" || status=1
docker rm -f "$name" >/dev/null 2>&1 || true
done
exit "$status"
