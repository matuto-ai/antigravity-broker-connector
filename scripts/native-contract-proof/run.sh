#!/usr/bin/env bash
# Qualification only: pull pinned artifacts, then execute native CLI with NO network.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
node --test "$root/terminal-screen.test.mjs" "$root/consent-state.test.mjs"
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
status=0
for mode in root child lazy compact; do
timeout --kill-after=5s 50s docker run --rm --name "$name" --network none --user 1000:1000 --read-only --memory 2g --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=512m --mount "type=bind,src=$tmp/antigravity,dst=/native/antigravity,readonly" --mount "type=bind,src=$root/worker.mjs,dst=/fixture/worker.mjs,readonly" --mount "type=bind,src=$root/terminal-screen.mjs,dst=/fixture/terminal-screen.mjs,readonly" --mount "type=bind,src=$root/consent-state.mjs,dst=/fixture/consent-state.mjs,readonly" -e HOME=/tmp/proof-home "$image" node /fixture/worker.mjs "$mode" || status=1
docker rm -f "$name" >/dev/null 2>&1 || true
done
exit "$status"
