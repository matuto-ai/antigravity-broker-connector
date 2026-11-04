# Issue 8 completion checklist

This checklist follows the original issue, including its installation and native
runtime clarifications. It is not a new release or production-deployment gate.
Issue 8 remains open until the remaining observations are established.

| Original requirement | Established evidence | Remaining work |
| --- | --- | --- |
| Explicit URL-only setup, exact admin approval, durable request/key, no automatic replacement | Real TLS approval tests and native setup/manager tests | Run the complete sequence through the official native CLI; the new `setup` qualification is not yet observed passing |
| Pending, denied, expired, revoked, cancelled and late results remain safe | Exact-request fencing, staged activation rollback, terminal-state restart tests | Official native cancellation/denial/restart observation |
| Ordinary startup reuses authorization; distinct conversations remain independent | Existing 30-journal Docker recreation and native root/compact/new tests | Native-manager and supported-launcher recreation with retained installation/history paths |
| Full message read followed by explicit exact-ID ACK | Merged official CLI 1.4.7 send/read/repeat-read/ACK/repeat-ACK/empty qualification | Authenticated owner-environment automatic arrival |
| Automatic idle and busy receive without manual prompting | Official CLI 1.4.7 isolated idle and busy arrival, full read/ACK, single re-arm and clean shutdown passed at `0734995` | Setup first-delivery remainder pending; authenticated human-input/denial matrix remains |
| Supported installation/upgrade through actual `agy` wrapper | Official manager install/reinstall, read-only launcher and managed-package doctor | Current owner wrapper/import policy/active-owner outcome and version after restart |
| Preserve old authorization, unread messages and identity across upgrade | Existing journal/installation persistence and compatibility tests | Supported native-manager upgrade/restart with those retained paths |
| Clean up conversation lifetime without acting on stale identity | Native host/MCP shutdown, disconnect, root transition and process/epoch fencing | No supported conversation-deletion hook has been established; `Stop` is not deletion |

## Candidate changes under validation

The doctor now reports executable `agy` discovery and the observed CLI 1.4.7
managed registration/package/version separately. It neither invokes a nested
host nor reads credentials, permission settings or owner locks. It does not
claim that import is permitted, the plugin is enabled, or the running host has
loaded the inspected package.

Terminal setup outcomes are retained with their exact request ID. A reopened
manager reports denied, expired or revoked without another enrollment or poll.
A stale terminal response cannot cancel a newer pending request. Local
conversation cancellation remains separate from shared installation authority.

The native qualification candidate uses only an isolated disposable broker,
private synthetic credentials, verified TLS and a synthetic model provider.
It must observe real native background commands and a stopped turn before
administrative approval or idle peer delivery. A subsequent unsolicited native
model invocation must receive the complete message, explicitly ACK it, drain and
re-arm exactly one waiter. Failed or incomplete runs cannot emit a verified
acceptance label. Diagnostic output does not include raw command/UI text or
one-use permits.

No authenticated host is accessible in the current test environment. That is an
unexecuted original acceptance check, not a request to provision credentials or
deploy a new service. Existing owner-reported successful installation and
bidirectional messages are retained as evidence for that tested pair, without
turning them into proof of every later version, restart or wakeup race.

## Observed native permission blocker

At candidate `e48fc203`, [CI run 41740931945](https://github.com/matuto-ai/antigravity-psst-connector/actions/runs/41740931945) passed all existing native modes, then all three extended modes reached the normal `Run this command?` prompt for the exact production waiter. No waiter process executed and no command approval was submitted. A quoted and unquoted narrow fixture prefix both required this prompt in CLI 1.4.7. This is a pending native permission, not a transport failure or a missing model credential.

Normal qualification stops immediately at that boundary and never approves a command. Automatic-arrival qualification remains a mandatory failing CI stage; container persistence and package checks run before it so unrelated evidence remains available.

### One authorized execution, 2026-11-04

At candidate `07bc2babe382a670db8014ae689b8a54dbead303`, [isolated run 41793006282](https://github.com/matuto-ai/antigravity-psst-connector/actions/runs/41793006282) verified the full rendered command against the real native hook, current host/MCP identity and unconsumed permit, then selected exactly one **Yes, run command**. It observed one live production inbox waiter and a real native `Stop` with `fullyIdle=false` and `NO_TOOL_CALL`. Permission settings remained unchanged, and owned processes were gone after cleanup. No Always Allow or other permission choice was selected.

That run did **not** prove arrival: the harness incorrectly waited for a fully idle composer before injecting the broker message. A background waiter keeps that renderer active. The fixture now gates external broker stimulus on the actual stopped native turn, current owner and live waiter, independently of screen settling. Terminal input still requires its separate strict UI guards. Focused positive and stale/foreign/resumed-turn regressions pass; the corrected idle and busy native delivery runs passed in the later matrix below.

That initial one-use grant was consumed. It was not reused. A later bounded matrix received separate authorization for seven total executions; the ledger below accounts for that grant. Normal CI never confirms a command.

### Authorized isolated matrix, 2026-11-04

At `073499521c0dc2493bd1f240abb4a5d0eea18e17`, [run 41795315755](https://github.com/matuto-ai/antigravity-psst-connector/actions/runs/41795315755) used five of seven authorized one-time executions:

- **Idle: passed, 2/2 executions.** Real stopped native turn, automatic broker arrival, full provider-context message twice, exact-ID ACK twice, empty inbox, exactly one re-arm and owned-process shutdown.
- **Busy: passed, 2/2 executions.** Arrival during a busy model request, no overlapping model invocation, then the same full message/ACK/re-arm and shutdown checks.
- **Setup: failed, 1/3 executions.** The real approval waiter and native notification ran. The subsequent connection failed because the test broker forced v2 while the unmodified approval helper intentionally issues the documented v1-default bundle. A cheap real TLS helper/config/native-session regression reproduced `registration_upgrade_required`. The approval fixture now uses the broker's supported v1/v2 default; separate enforced-v2 rejection and strict-v2 message fixtures remain.

Permissions were unchanged in all three cases. The failed setup run is not passing setup evidence. Two setup executions remain. The next workflow is fenced to one exact branch transition and first attempt, and runs only approval plus first inbox delivery, never idle/busy again or a third setup command. It stops before requesting re-arm and reports a distinct first-delivery-only label. Full setup-plus-re-arm and authenticated owner-host acceptance remain separate.
