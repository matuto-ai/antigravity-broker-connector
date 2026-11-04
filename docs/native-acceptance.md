# Native automatic-arrival evidence — 2026-10-26

## Supported mechanism

The official [hook/tool contract](https://www.antigravity.google/docs/hooks)
exposes `run_command` background tasks and native conversation IDs. Hooks occur
at existing execution boundaries; they are not themselves an idle wake API.
The [schedule documentation](https://www.antigravity.google/docs/commands/schedule)
explicitly explains that a matching background-task completion message wakes
its conversation. Psst uses that event-driven completion route, NOT recurring
model calls or schedule polling. One permitted native waiter waits for local
inbox state and exits with a fixed notice; the native host owns notification
insertion and subsequent model invocation. The agent then receives and explicitly
acknowledges the FIFO message. A completion notice alone is neither model-read
nor task success.

## Reproduced here

`bash scripts/validate-official-native.sh` downloads the pinned official Google
1.4.7 binary, checks SHA512, uses an isolated HOME, validates the complete plugin
with `--strict`, installs it and lists it. Current result: one MCP server, one
hook group, two skills, zero findings. The actual validator identified that
hooks do not receive PLUGIN_ROOT; packaged hooks now use its documented plugin
working directory. No permission override is installed.

The native waiter tests prove one owner, one-use permits, request/conversation
fencing, bounded per-head notices and unchanged pending journals. Real HTTPS
approval tests exercise the actual broker/admin UI and frozen helper. They use
synthetic native identities and do NOT establish authenticated vendor wakeup.

An earlier actual interactive CLI launch stopped at its Google OAuth / Google Cloud
project sign-in chooser. No sign-in choice, account, Terms acceptance or model
call was made. Earlier headless MCP permission denial remains a failure gate,
not an invitation to use skip-permission flags. The earlier local environment denied
Unix socket binding; those tests remained enabled and now pass in Linux CI.

## Reproducible authenticated acceptance (still required)

In an already authenticated, authorized native CLI, install this reviewed plugin
and complete URL setup/admin approval once. Allow only the plugin's exact MCP
and waiter operations if the native host asks. End the turn with its native
waiter armed. From a second session send two distinct benign messages, serially.
Without typing another prompt, verify each genuine native completion event,
`broker_receive`, correct message content and explicit `broker_acknowledge`, then
re-arming. Repeat while busy, reject a permission prompt, disconnect, close the
native host and restart with the installation directory retained. Verify no
human-permission inference from message text and no duplicate model processing.
Stop on a native denial; do not alter authorization to force this test through.

Trusted root/self MCP transport IDs now permit serialized new-root transitions
within a host. Each new root receives a fresh mailbox; old journals and installation
authorization remain intact. Child calls, stale permits and retired roots cannot
select an owner. Local tests cover real HTTP pending-message retention and synthetic
native transport context, not authenticated `/compact` or idle-wakeup acceptance.
A documented conversation-only close event remains unestablished. Do not advertise
all native acceptance gates as complete until those observations are recorded.

The native task arguments are taken from the installed host's schema. The plugin
asks only for `CommandLine` and `WaitMsBeforeAsync=500`; it does not invent an
`IsDaemon` argument or request persistent/background permission overrides.

## Owner-reported live test — 2026-11-01

The owner installed `psst-native` using the original scoped npm path and reported
successful bidirectional Pi ↔ Antigravity messaging with model read receipts.
This is meaningful native connectivity evidence for that tested pair, not an
independent recording by this test suite or proof of all idle-wake/restart gates.
Earlier missing-path/parser/owner-lock failures remain installation usability
findings; the later same-path success means a universal `@` parser limitation
must not be inferred. The read-only installation doctor now checks the actual
root and gives the in-session slash command without source copying or policy changes.

### Narrow root-transition admission

The first verified root may use the existing identity-first startup flow. Once a
root is active, a different verified root must first call `broker_setup_status`
(or explicitly `broker_connect`) to select its independent mailbox. Identity,
send, cancel, setup and other ordinary calls cannot retire or drain the active
root. Hooks alone never select a root. Retired roots are never evicted or replayed:
a binding accepts at most 256 retirements during one exact native-host lifetime,
then refuses further transitions before draining; the active root still works.
Restarting only MCP does not reset this bound. The pinned CLI 1.4.7 isolated
qualification below now verifies actual `/compact` continuity and `/new` root
rotation; authenticated user-environment wakeup acceptance remains separate.


## Isolated native qualification — 2026-11-03

[Verify run 41557793494](https://github.com/matuto-ai/antigravity-broker-connector/actions/runs/41557793494)
passed at `ee81b5b383fae84f9faf943ccbd8979cb61f2bc1`, including container
persistence and the installable package. The pinned official CLI **1.4.7** ran
with a fresh HOME, no external network, a synthetic loopback model provider and
no user account or files. Optional collection stayed unchecked; only the exact
disposable `/tmp/proof` workspace was trusted.

Two separate suites establish different facts:

- Native hook/transport metadata: actual root, child and lazy MCP calls; actual
  interactive `/compact` and `/new`, with matching idle Stop events and clean
  `/exit`. No synthetic root replacement was used for these observations.
- Actual production connector plus an ephemeral TLS Psst: only
  `broker_setup_status` and `broker_identity`, through native `call_mcp_tool`.
  Responses are strictly correlated to the requested tool and decoded from the
  observed native hook-notice envelope. `/compact` preserves the conversation,
  client, journal and generation in this pinned CLI. `/new` changes conversation,
  client and journal and increments generation once, retaining the same host and
  MCP owner. Read-only database assertions supplement—not replace—tool responses.

Reproduce with `bash scripts/native-contract-proof/run.sh` and
`bash scripts/native-contract-proof/run-actual.sh`; the latter requires the
workflow's exact disposable Psst checkout. Recorded sanitized observations are
in `scripts/native-contract-proof/recorded-native-acceptance.json`.

This is **not** proof of authenticated vendor-model behavior, the user's installed
version, or unattended message wakeup. Actual send/receive/ACK, idle/busy wakeup,
permission rejection, disconnect/restart and conversation-only cleanup remain
separate live acceptance gates. No release or 1.0 readiness is implied.

## Isolated native message-path qualification

`run-actual.sh` also runs a `messages` mode against the same pinned official CLI
1.4.7, current production plugin and disposable TLS Psst, with external networking
removed. It grants only setup-status, identity, send, receive and explicit ACK to
that fixture. Its provider script sends one benign message to a separately
registered fixture peer, reads an inbound multiline Unicode message twice,
acknowledges the exact observed message ID twice, and finally requires an empty
inbox. A truncated body, wrong sender/message, uncorrelated tool response or
fabricated action-success/native-consumption receipt fails the proof.

Passing this mode establishes that native tool output reached the synthetic
provider context, not just that MCP returned exit code zero. Read-only journal
checks additionally require the message to remain pending through both reads and
to become consumed only after explicit ACK. The broker must retain exactly one
outbound send, still queued for the fixture peer. Transport delivery and explicit
model-read acknowledgment are checked as different boundaries.

The inexpensive `test/native-message-qualification.test.mjs` first checks the
same message sequence using real TLS and production session tools; its native
wrapper is synthetic and does not substitute for the Docker/official-CLI result.
Neither test establishes vendor-model authentication, URL/admin enrollment,
unattended idle/busy wakeup, actual owner installation or conversation-only
cleanup. Those remaining acceptance gates keep issue #8 open.

## Complete issue-8 candidate

See [the original acceptance checklist](issue-8-acceptance.md) for remaining
scope and the exact run ledger. The isolated official CLI 1.4.7 `idle` and `busy`
cases passed at `0734995`: automatic arrival, full message read, exact-ID ACK,
one re-arm, unchanged permissions and owned-process cleanup. Their provider was
synthetic; they do not prove authenticated owner-host behavior.

The same matrix's setup failed after approval because its broker fixture forced
v2 while the real URL-only helper writes a documented v1-default bundle. The
fixture now uses the broker's supported default. Real TLS regression covers both
successful default activation and rejection under explicit v2 enforcement.

The corrected setup first-delivery run passed at `6e64c71`, consuming the two
remaining executions. All seven are now used. It proves real URL-only approval,
automatic first delivery and full read/ACK with a distinct first-delivery-only
result, not a setup re-arm. Full setup/re-arm acceptance,
the actual supported owner launcher/upgrade and authenticated host checks remain
open. No conversation-deletion hook, release or 1.0 readiness is implied.

Default CI deliberately checks the exact unconfirmed native permission boundary
with zero executions. Full automatic cases remain an explicit opt-in acceptance
gate, documented with commands and historical authorized runs in the
[CI scope](issue-8-acceptance.md#ci-scope-and-remaining-manual-acceptance-gate).
Green default CI must not be described as complete authenticated native acceptance.
