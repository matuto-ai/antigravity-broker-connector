# Verification stages

`.github/workflows/verify.yaml` runs one `verify` job with seven ordered stages:

1. **Check source syntax**: parse source and test files without executing them.
2. **Build and verify current package**: require a clean checkout of the workflow's exact commit, pack it once with scripts disabled, install the tarball offline, and compare every packaged file with the source snapshot. Log commit/tree, package/plugin version, source digest and tarball SHA-256/SHA-512.
3. **Run local tests**: deterministic component and metadata checks (`npm run test:local`) against a test directory assembled from that installed artifact, not repository runtime symlinks.
4. **Verify native host and protocol integration**: local broker, HTTP/TLS and MCP/runtime fixtures (`npm run test:integration`) against the same artifact. This stage also validates and installs it using the pinned official Antigravity CLI in a disposable home, without login.
5. **Verify container persistence**: destroy and recreate real Docker containers running the verified artifact while retaining only the approved installation volume.
6. **Verify installable package**: reuse the same tarball installation and check distributed entry points and running MCP metadata (`npm run test:pack`).
7. **Verify unconfirmed native execution boundary**: mount the complete artifact read-only, verify its bytes inside the isolated container, and require matching runtime metadata. Ordinary CI submits zero waiter confirmations and does not claim full automatic-delivery acceptance.

The local, integration and package test selections are disjoint where applicable;
`test/verify-stages.test.mjs` guards complete coverage and stable stage names.
`npm test` runs all unit/integration tests through the same automatic artifact
assembly. Developer runs can test explicitly recorded uncommitted changes; CI
requires a clean checkout. Existing candidates fail verification if source HEAD,
source content, package bytes, tarball bytes or runtime versions diverge. Missing
published files cannot be silently supplied by the repository. Only test/support
files and the three existing diagnostic-only launcher bins are copied alongside
the artifact. Broker fixtures remain separately pinned and verified. Docker runs
separately from local tests. The connector-specific implementation inside each stage is not
interchangeable with another host's API.

The release workflow publishes the exact tested tarball, then automatically
checks its registry name, version, integrity and `latest` tag. It does not repack
the checkout after testing. Current source, public npm release and installed user
runtime are separate observations; no mutable npm tag selects code for CI.

Passing these checks does not prove authenticated native-model receipt or the
user's actual UI. Real-client acceptance remains a separate pilot. No VM,
production broker, real credentials or deployment is used by these checks.

## Existing detailed verification reference

# Verification and remaining gates

2026-10-23 Ubuntu 24.04 GitHub Actions; Node 24.19.0, SQLite 3.53.3. `npm run check` and
**24/24 tests passed**, including the private Unix-socket fixtures. The pinned reference is broker commit
`ba2219cd87a1feac23e01b23d2c2b3d3bdd65359`.

Tests exercise real HTTP broker registration, metadata, durable delivery and
SQLite inbox journal. The native process is synthetic and implements only the
documented stream shapes. Tests establish serial scheduling, provenance, zero
model activity from heartbeat, safe draft/approval/abort gates, independent
transport ACK, write-versus-result distinction, process-loss uncertainty, malformed
frames/UTF-8, fixed permission-preserving launch arguments and default-disabled
experimental final hop. No real CLI, TUI, model/provider, permissions dialog,
Podman or two-host LAN was exercised.

Before claiming a native implementation is ready:

1. Pin an installed official CLI build and verify init/model/permission fields,
   every normal event shape and cumulative `num_turns` semantics.
2. Exercise real request-review/Ask soft denial; a successful result must never
   be advertised as tool/action success. Verify no prompts are answered by `yes`
   inside an AGENT message.
3. Confirm human input, long tools, cancellation, transport outage and crash
   timing with a disposable project/model fixture; do not steer or abort for mail.
4. Certify the opt-in native MCP bootstrap and exact-conversation hook coverage
   on a real owned CLI process, preserving normal Ask/Deny permissions.
5. Package/test independent rootless Podman containers and TLS across two hosts.

This PR advances the adapter foundation; it does not close all acceptance gates
of broker issue #8.


The additional outbound MCP patch adds four fixture scenarios (24 total):
private workspace/config/hook creation and cleanup; real stdio proxy with unbound,
wrong-session, disabled-receive and second-connection gates; full synthetic
owned CLI → native hook → MCP → real broker; and rejection of recognized existing
project policy rather than silent omission. Cloud sandbox Unix-listen restrictions
prevented the socket tests locally; they then ran successfully in the authorized
isolated GitHub Actions fixture environment. Exact code commit
`be4a2bf6674996e06072d68d6243687c7532bc56` passed all 24 tests in both
[push CI](https://github.com/brunoorsolon/antigravity-review-pair/actions/runs/39978357231)
and [PR CI](https://github.com/brunoorsolon/antigravity-review-pair/actions/runs/39978369161).
This is real stdio/socket execution with a synthetic CLI, not vendor certification.
