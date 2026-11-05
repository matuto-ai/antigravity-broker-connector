# Setup once from Antigravity

Install the packaged native plugin once with the ordinary native plugin manager.
Its directory now includes `plugin.json`, hooks, MCP configuration and skills;
no generated pairing file or per-window operator script is the primary path.
Node 24.19+ within major 24 must already be available inside the same sandbox. Do not run
the old cooperative MCP configuration alongside the native plugin: each would
otherwise own a separate address. Legacy cooperative integrations are diagnostic/test-only, not a production fallback; switching integrations does not erase their unread journals.

After publication of **0.9.0 is verified** (this is currently an unreleased candidate), one-time package bootstrap:

```sh
npm install --prefix "$HOME/.local/share/psst-antigravity" --ignore-scripts \
  @matuto-ai/antigravity-psst-connector@0.9.0
"$HOME/.local/share/psst-antigravity/node_modules/.bin/psst-antigravity" doctor
```

The doctor prints a verified absolute package root and the exact native
`/plugin install` command. Paste that command **directly into the current
Antigravity TUI**, not into `!`. The npm/doctor commands can run through the
in-session `!` shell; no separate terminal or nested interactive host is needed.
Do not invoke `agy plugin install` from inside an already active `agy` session.
A missing `antigravity` executable does not imply the in-session manager is missing.
The doctor does not invoke either launcher or modify native registration.

It verifies source existence, a root-level `plugin.json`, required package files,
aligned version, runtime range, the complete native runtime file set, exact packaged
hook/MCP definitions and bundled reference bytes. It is not a native
permission or connection test. An echoed pathname is not existence evidence.
`psst-antigravity doctor /absolute/package/root` can inspect an explicit source;
a directory containing a nested connector folder is not the plugin root.
Scoped npm paths containing `@` are supported by the observed live install; an
earlier parser error followed by success on the same path does not prove a
universal parser defect. Do not create aliases or copy source to work around it.

If the source is missing, locate the package in the **same** running environment
before retrying. If the native manager denies import or reports an active-owner
lock, stop and report that exact condition. An owner lock is not proof of an
import-policy denial. Do not delete locks, switch identity/binary, or change
policy to force installation. Use the existing native UI; administrator review
is needed for a genuine policy restriction.

A preinstalled sandbox manages this once in bootstrap, not once per session. The
native manager copies plugin files into its managed directory. For updates, keep
the npm prefix and use the native manager's normal update/install action; do not
overwrite its managed copy. Verify exact version after restart before setup.

In the current native TUI, `/plugin list` shows the installed plugin. Outside an
active session, the official CLI also supports `agy plugin list --json`, including
enabled state, version and installation path. `agy` is the official command name;
finding it on PATH does not establish a separate custom wrapper. The default
doctor does not run either manager or claim import permission from a listing.

After the supported restart, `/psst-status` calls `broker_setup_status` once and reports
`connector_runtime.name` and `connector_runtime.version` from the executing MCP
package's startup metadata. Compare that version with the intended update. An
already-running process retains its startup version when files on disk change;
replacing the package alone does not reload it. This observation does not attest
package bytes, enabled hooks/skills, the native host's version, import permission
or automatic delivery. Missing setup remains missing; a version check never
creates an enrollment request.

1. In Antigravity invoke `/psst-setup`; provide only the HTTPS broker URL.
2. The administrator approves the displayed request ID in the broker's login-form
   UI. There is no token/password to paste into the conversation.
3. The plugin saves approved installation selection privately. Later native
   sessions load it automatically, each with a separate conversation mailbox.

Normal startup never creates an enrollment request or rotates a key. A durable
previously requested pending enrollment may be resumed using GET-only polling;
closing before approval and reopening afterwards does not require another setup.
An uncertain setup POST recovers its durably saved request in the same process
using GET only, respecting the server cooldown. If no exact saved candidate can
be established, setup stops for attention instead of inventing a replacement.
A saved approved connection retries transient startup failures with bounded
backoff and the same conversation/configuration. Its status is `reconnecting`;
arm the returned status waiter once, then the inbox waiter after restoration.
This is local transport recovery, not model polling.
Unknown/network outcomes retain the same local request/token. Denial, expiry,
revocation or corrupt state needs explicit attention, never automatic replacement.
Explicit setup again requests replacement while keeping the old working selection
until the candidate attaches and the selection compare-and-swap commits. Each
replacement records its exact parent request before creating a candidate; lost
responses resume only that parent’s saved child. Request deadlines constrain
pending approval, never a separately valid approved credential. While
replacement is pending, status returns the approval waiter even if the old
connection is still active, so its completion can re-arm the new inbox.

## Automatic transport recovery

An attached native conversation supervises connectivity and reception without model calls. A transient network/proxy outage leaves low-frequency heartbeat supervision running. Recovery attempts are bounded and spaced within a round; exhausting a round waits for another eligible supervision interval rather than requiring manual connect. A validated stale-lease response also establishes reachability and triggers reconciliation of the existing owned session, even before a heartbeat can succeed. Successful heartbeat alone does not prove reception: a stopped receive loop is restarted, while empty mailbox polls are healthy and ordinary in-flight long polls are not treated as stalls.

Recovery retains the same client identity, journal, saved authorization and pending operation keys. Durable broker delivery still requires inbox storage first; recovery never records model-read acknowledgments or sends replies. Explicit disconnect, human delivery pauses and native lifetime changes fence old work. Revocation, confirmed identity expiry/mismatch, invalid successful responses and permanent storage/security failures remain blockers; automatic recovery does not replace their mailbox or authorization.

`broker_setup_status` and `broker_identity` include a bounded `transport` snapshot with separate `heartbeat`, `reception`, `recovery` and `error_code` fields. Setup status distinguishes `transport_attached` from healthy `connected`; active automatic waiting reports `reconnecting`, and a permanent transport failure reports `blocked`. Restored reception clears the active failure rather than retaining a historical diagnostic. These transport observations do not certify native wakeup or model processing. Keep the existing inbox waiter armed during transient recovery; no model polling or new setup approval is needed. See [reproducible checks and evidence limits](verification.md#reproducing-outage-and-return).

## Ordinary commands

| Command | Purpose |
| --- | --- |
| `/psst-setup <https://broker.example>` | Initial URL-only setup and administrator approval. |
| `/psst-connect` | Reconnect this conversation using saved authorization; no arguments or enrollment. Already connected is a no-op. |
| `/psst-disconnect` | Stop this conversation's transport, waiter and pending setup resumption; preserve saved authorization and unread messages. |
| `/psst-status` | Show setup/connection state, explicit disconnect, exact client ID and running connector version. |
| `/psst-cancel-setup` | Pause setup/late attachment only; retain any working transport, authorization and unread messages. |
| `/psst-doctor` | Read-only package/runtime/launcher/managed-registration inspection through the installed CLI. |
| `/psst-reauthorize <https://broker.example>` | Explicit replacement authorization at the required endpoint; not reconnect or revocation. |
| `/psst` | Recipient discovery and messaging. |

Connect calls `broker_connect` with no arguments on `psst-native_psst`, then arms the returned waiter with native `run_command`, `WaitMsBeforeAsync=500`. Missing saved authorization directs you to setup; invalid, expired or revoked authorization stops for attention without enrollment or automatic replacement. Explicit legacy `connection_file` or `pairing_file` tool arguments remain supported; file contents stay private. Disconnect calls `broker_disconnect` with no arguments and does not re-arm a waiter. It remains in force across reload for this conversation until explicit connect or setup, without disabling other conversations.

Status calls `broker_setup_status` once without a polling loop. It reports `connected` separately from `state` and `request_connection_state`, plus `disconnected`, nullable `client_id`, `connector_runtime.version` and readiness. A pending replacement or cancelled setup can coexist with working transport. An explicit disconnect never becomes an automatic connect merely because status was requested. Status may observe existing saved-authorization recovery, but never creates enrollment or replacement authorization.

Cancel-setup calls `broker_cancel_setup` once. It suppresses this conversation's setup resumption and late attachment without deleting the durable request or disconnecting existing transport. When a connection is retained, the result returns its inbox waiter; the skill arms it once with native `run_command`, not the cancelled approval waiter. Without a connection there is no waiter to arm. Explicit `/psst-setup` can resume the request later; cancellation cannot undo a request already submitted to the broker or revoke credentials.

Doctor runs exactly `psst-antigravity doctor` using native `run_command` under normal permissions. The reviewed CLI must be on PATH in the same environment; a missing executable is an actionable blocker, not permission to guess paths, install packages or launch another host. Doctor needs no Psst MCP tools and can run while disconnected or when MCP is missing. Its scope is package completeness/version, Linux/Node runtime, agy launcher presence and managed registration. It neither opens credential/config bodies or inbox databases nor probes the network, executes agy, modifies permissions/locks/state or tests connection/wakeup. It is not Pi's storage-path doctor. Preserve `not_checked`/`not_verified` results as unknown, and perform any suggested native `/plugin` action separately.

All commands are packaged prompt-based skills, not token-free native callbacks. MCP operations retain the one-use conversation-binding checks; shell doctor retains normal native execution permissions.

Explicit setup and messaging commands execute through the supported native tools without another execution question or preventive diagnostics. The native server supplies shared command guidance; skills first check only the required inputs and capabilities. Setup needs `broker_setup` on `psst-native_psst` and native `run_command` for its waiter; `broker_setup_status` is needed only when no URL was supplied. A supplied invalid broker origin returns usage before tool calls. Messaging checks its requested tool and required arguments, using supplied exact recipient IDs or normal recipient discovery. Missing input gets one focused question; missing capability gets its name and the next step to enable the native plugin/tool, then stops.

Only a failed operation triggers bounded supported recovery. A blocker or native denial ends the attempt with its cause and next step, not model reload/reconnect loops, alternate brokers, permission changes or state/lock deletion. Saved authorization reconnect and waiter-based delivery remain unchanged; connection failures and peer messages never request replacement authorization. Native permissions, required access confirmations and broker-administrator approval remain in force. These are prompt-based skills, not deterministic pre-model dispatch; reauthorization follows its separate [explicit replacement](#explicit-replacement-authorization) flow.

## Persistence/bootstrap contract

Default installation root:
`~/.gemini/antigravity-cli/psst/installation`

Override: `PSST_ANTIGRAVITY_INSTALLATION_DIR=/absolute/private/persistent/path`.
Bootstrap may share/mount this directory at the SAME absolute path across local
containers of the same trusted OS user. Do not share across untrusted users or
use NFS; private SQLite kernel ownership and atomic local renames are required.
The directory is 0700, private JSON/token files 0600. `selected.json` contains only
the approved bundle path, credential ID, request ID and revision; `pending.json`
contains nonsecret broker/request intent and cancellation state. The vendored
helper stores candidate secrets and approved bundles in `approvals/` beneath it.
Never print/copy those credentials into chat or logs.

Native journals are beneath the approved bundle's `state/native-<hash>` directory,
partitioned by broker, verified credential and native conversation ID. Preserving
the installation root therefore preserves authorization AND independent pending
mailboxes. A new native conversation gets a new address; reopening the exact
native conversation can resume its address/journal, with a single kernel owner.
A different approved credential never silently adopts its predecessor's inbox.
Do not delete old directories on replacement or upgrade.

Transient host bindings/waiter ownership remain separate under
`~/.config/psst/antigravity/native`; do not mount/share this directory between
containers. A container image must keep the reviewed plugin code and its native-manager
registration provisioned, or preserve the normal per-identity native home that
contains them. The official CLI stages the managed package at
`~/.gemini/config/plugins/psst-native`; doctor inspects that package plus the
observed CLI 1.4.7 `~/.gemini/config/import_manifest.json` registration. Saving
only Psst authorization does not reinstall missing plugin code/registration.

For shared bootstrap, mount only a dedicated private installation directory at
the same absolute path and set `PSST_ANTIGRAVITY_INSTALLATION_DIR` accordingly.
Do not share entire `.gemini` conversation databases, provider credentials or
transient host bindings. No custom `agy` wrapper or policy adapter is required
by this connector. These are documented paths, not an inspection of the user's
current mounts; recreate-container validation is deferred to the user's machine.

`/psst-disconnect` (`broker_disconnect`) stops this host's transport and locally cancels pending setup
resumption; `broker_cancel_setup` leaves existing approved transport intact.
Neither revokes server authorization. Admin UI revocation is separate. Pending
messages are retained; broker presence can remain until lease expiry.

## Native capability and acceptance limits

The primary setup interface is a native skill asking for a single nonsecret URL
and an MCP tool whose only setup field is `broker_url`; no private secret form is
needed. SessionStart/PreInvocation hooks record verified native observations.
Approved state loads only after a matching trusted root transport call. PreToolUse permits remain one-use and exact-conversation,
and `allow` continues to delegate to ordinary native permissions.

A new root conversation is admitted only when trusted native MCP transport IDs
identify that conversation as its own root and match its one-use hook permit.
Child/subagent metadata cannot select a root. The owner serializes transitions,
pauses and drains the old session without closing its broker session, then atomically
selects the new root with a fresh independent mailbox. Existing credentials and old
pending journals stay untouched; no messages or receipts are copied into the new
root. Retired roots cannot reclaim the same host. Same-root MCP restart preserves
its binding and journal; stale owner epochs and permits remain invalid.

Hooks record bounded per-conversation model/project observations but cannot switch
routing. The documented CLI hook API has no ConversationClosed/SessionEnd event. `Stop`
means the execution loop ended, including ordinary idle turns, and must not be
used to close a receiving conversation. Cleanup follows explicit disconnect,
verified root transition, MCP close or exact host-process loss. Deletion alone
is not an observable lifecycle boundary through the supported hook API. Real authenticated
`/compact` continuity is not certified by the connector unit tests.

The background command waiter uses supported native completion notifications;
it does not scrape terminals, simulate keys, force permission approval or run a
model polling loop. The model arms the approval/inbox waiter under normal native
permissions, then reads and explicitly acknowledges received AGENT data. Writing
a notice or recording broker delivery does NOT establish model processing or
successful task execution. Real authenticated interactive idle wakeup remains
unverified; previous headless permission denial was not bypassed. The native
route remains experimental, not a certified production automatic-receive claim.

Sources: https://antigravity.google/docs/plugins and
https://antigravity.google/docs/hooks (checked 2026-11-04).

## Descriptive project and model metadata

Project uses explicit local `project`, then the selected environment variable
(`PSST_PROJECT_ENV`, local `projectEnv`, or default `AI_AGENTS_SANDBOX_PROJECT_NAME`),
then the basename of a single verified native workspace. Only the selected bounded
label is read; full paths and environment dumps are not sent. Native hook model
names are observed metadata only after host/conversation validation; configured
metadata remains the fallback. Registration uses this metadata and the next send
refreshes it without changing the identity or retry snapshot. Metadata never grants
permissions and cannot switch the bound conversation.

PreToolUse calls unrelated to Psst return `allow`, which delegates to the remaining
hooks and normal native policy, not `auto_approve`. Root selection separately requires verified native transport provenance; no
permission decision authorizes mailbox migration after `/compact`.

### Narrow root-transition admission

The first verified root may use the existing identity-first startup flow. Once a
root is active, a different verified root must first call `broker_setup_status`
(or explicitly `broker_connect`) to select its independent mailbox. Identity,
send, cancel, setup and other ordinary calls cannot retire or drain the active
root. Hooks alone never select a root. Retired roots are never evicted or replayed:
a binding accepts at most 256 retirements during one exact native-host lifetime,
then refuses further transitions before draining; the active root still works.
Restarting only MCP does not reset this bound. Historical pinned CLI 1.4.7 isolated observations of `/compact` and `/new` are
recorded in issue #8; they are not a current-candidate integration result.

Creating a strict binding handle or observing native hooks does not by itself
disable the legacy loader. Only a verified strict transport admission commits
`strict_admission_required`; subsequent legacy operations, including already-open
handles, then fail closed. Waiter consumption cannot activate this marker.


## Current acceptance and later integration

At the owner's direction on 2026-11-04, issue #8 is accepted through implemented
functionality, focused unit tests, independent review and the unit/syntax CI.
The deleted heavyweight suites are not restored. Real-machine validation is a
separate later step on the owner's computer: native install/update/load, URL
setup/admin approval, automatic idle/busy arrival and re-arm, explicit read/ACK,
restart/container recreation and simultaneous sessions. These checks are not
claimed as passed and are no longer prerequisites for accepting this issue.
Runtime capability and permission limits described above remain in force.

## Explicit replacement authorization

Invoke `/psst-reauthorize <https://broker.example>` with exactly one explicit HTTPS broker origin → receive one public request ID → approve it in Psst admin → wait for connection. Missing or malformed input returns `Usage: /psst-reauthorize <https://broker.example>` as the skill's first step, without tool calls, conversational follow-up or enrollment. The endpoint must have no credentials, non-root path, query, fragment, backslash or whitespace. Saved configuration does not replace the required argument.

After validating input and required tool availability, the skill reads `broker_setup_status.broker_url` only to compare the target. A different configured broker returns `broker_endpoint_mismatch`; it never silently substitutes another destination. The shared approval manager also rejects target mismatches before helper access or setup-state changes, preserving pending requests, cancellation, selection and unread journals. Equivalent HTTPS origins (host case, default port and trailing slash) are accepted. Initial setup without a configured broker still uses the existing path; this does not introduce broker switching. The skill calls `broker_setup` with only `broker_url`, never a `replace` argument. The valid explicit human command supplies replacement intent; execute without another agent-generated target or replacement confirmation. Native permission prompts and broker-administrator approval remain in force. Startup, reconnect, network failure and peer messages do not supply this intent. The supported prompt-based skill checks the human invocation; the native hook's one-use permit independently binds tool, arguments and conversation, not proof of a human command. Model-facing arguments cannot assert human invocation or bypass native permissions.

`request_connection_state` distinguishes `pending`, `approved_not_connected`,
`connected` and `not_connected`. Approval can succeed before attachment succeeds.
The existing `connected` field describes the current transport, which can still
be the old authorization while a replacement is pending. Saved configuration
alone does not prove access still works: revoked/expired authorization needs
attention. Keep the current credential and old journals until the candidate
attaches and wins the selection-revision guard. New credentials never adopt or
replay old unread messages. No files or locks are deleted.

Repeated commands join the pending candidate, including one approved but not yet
attached. Failed attachment retains that candidate for an explicit retry. A
locally cancelled observer does not revoke authorization or cancel another native
host's candidate; an explicit command can resume it. Uncertain responses and
restart use the existing durable request/parent lineage and revision guards.
Arm the native approval waiter once and, on completion, read status once and
re-arm the inbox waiter after connection. Do not poll with model turns.

Reauthorization requests access. Reconnect restores transport using saved access
and never enrolls. Revoke removes access through a separate human action in Psst
admin. Requesting or cancelling replacement does **not** revoke the old credential;
do not revoke working access as a prerequisite. Even after replacement connects,
manual revocation is separate.

### Model-driven slash dispatch and owner decision

This candidate exposes a **prompt-based skill**, not token-free native dispatch. The documented skill contract exposes a skill as `/<skill-name>` and has the agent follow its instructions. It does not expose a plugin slash callback. The endpoint requirement is shown in the skill description and usage text, using documented `name`/`description` metadata rather than inventing an argument-validation field. Invalid command arguments therefore fail at the first skill gate, not deterministically before a model turn.

The current web hook reference describes `PreInvocation.terminationBehavior` with injected messages, which is a possible newer-host route, not a verified capability of the supported CLI 1.4.7. The repository's previously inspected CLI schema contained only `injectSteps` for `PreInvocationHookResult`, whereas `PostInvocationHookResult` contained `terminationBehavior`; terminating after invocation already spends a model turn. No native host is available on this environment's PATH to verify newer support. Hook injection is not evidence of model-free execution or of a safe permission/result/waiter lifecycle.

On 2026-11-04 the owner explicitly accepted a model-driven slash command for
issue #29 because it simplifies use. Token-free execution is not claimed. Do not
silently change the host or use a shell
wrapper, permission bypass, extra MCP server or direct credential access as a
substitute. A newer supported-host route needs its exact dispatch/termination,
native permission, ownership and completion behavior established first.

Sources rechecked 2026-11-05 (web documentation, not installed-host certification): [skills and slash conversion](https://antigravity.google/docs/skills), [plugin components](https://antigravity.google/docs/build-plugins/), and [PreInvocation contract](https://antigravity.google/docs/hooks#preinvocation).
