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

A fresh actual interactive CLI launch stopped at its Google OAuth / Google Cloud
project sign-in chooser. No sign-in choice, account, Terms acceptance or model
call was made. Earlier headless MCP permission denial remains a failure gate,
not an invitation to use skip-permission flags. Current environment also denies
Unix socket binding; those three existing tests remain enabled for Linux CI.

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
Restarting only MCP does not reset this bound. No actual native `/compact`
acceptance is implied by these offline changes.
