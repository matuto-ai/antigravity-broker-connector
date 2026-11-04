# Setup once from Antigravity

Install the packaged native plugin once with the ordinary native plugin manager.
Its directory now includes `plugin.json`, hooks, MCP configuration and skills;
no generated pairing file or per-window operator script is the primary path.
Node 24.19+ within major 24 must already be available inside the same sandbox. Do not run
the old cooperative MCP configuration alongside the native plugin: each would
otherwise own a separate address. Legacy cooperative integrations are diagnostic/test-only, not a production fallback; switching integrations does not erase their unread journals.

After publication of **0.6.0 is verified** (this is currently an unreleased candidate), one-time package bootstrap:

```sh
npm install --prefix "$HOME/.local/share/psst-antigravity" --ignore-scripts \
  @matuto-ai/antigravity-psst-connector@0.6.0
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
aligned version, runtime range and bundled reference bytes. It is not a native
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

After the supported restart, `broker_setup_status` reports
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
Unknown/network outcomes retain the same local request/token. Denial, expiry,
revocation or corrupt state needs explicit attention, never automatic replacement.
Explicit setup again requests replacement while keeping the old working selection
until the candidate attaches and the selection compare-and-swap commits.

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
containers. The reviewed sandbox archive a7f63e8 (`agents/agy/config.sh`) mounts
`projects/<project>/agy/<identity>/gemini` at `/home/node/.gemini` and uses an
`agy-shell-gemini` volume for shell state. The default installation root is
therefore persistent per project/identity in that archived layout. To share one
Psst installation across projects, bootstrap can mount only a dedicated private
`$CONFIG_DIR/psst/antigravity/installation` at `/home/node/.config/psst-installation`
and set `PSST_ANTIGRAVITY_INSTALLATION_DIR` to that path. Do NOT share entire
`.gemini` conversation databases or the provider keyring. That archived native
policy rejected plugin/MCP imports; this historical source is not a diagnosis of
the current host. The owner subsequently installed the native plugin successfully.
Any current policy denial needs separately reviewed administrator integration,
never an adapter bypass. No bootstrap file was
changed by this connector. Actual user mounts have not been inspected; these paths are the
connector contract, not a claim about an existing deployment.

`broker_disconnect` stops this host's transport and locally cancels pending setup
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
routing. No reliable ConversationClosed/SessionEnd event was established; deleting
a conversation alone remains a cleanup acceptance gate. Real authenticated
`/compact` continuity is not certified by the connector unit tests.

The background command waiter uses supported native completion notifications;
it does not scrape terminals, simulate keys, force permission approval or run a
model polling loop. The model arms the approval/inbox waiter under normal native
permissions, then reads and explicitly acknowledges received AGENT data. Writing
a notice or recording broker delivery does NOT establish model processing or
successful task execution. Real authenticated interactive idle wakeup remains
unverified; previous headless permission denial was not bypassed. The native
route remains experimental, not a certified production automatic-receive claim.

Sources: https://www.antigravity.google/docs/plugins and
https://www.antigravity.google/docs/hooks (checked2026-10-26).

### Historical sandbox-specific bootstrap review (conditional, not applied)

The following applies only if a deployment is positively identified as using the
archived sandbox policy above. It is not a prerequisite for the official CLI or
a requirement to build a new wrapper/status API. Preserve that deployment's
`agy-policy.py` rejection of arbitrary project/global integrations. The
narrow addition would allow exactly the reviewed `psst-native` plugin under the
native manager's installation directory, with a pinned package/digest and its
known `plugin.json`, `hooks.json`, `mcp_config.json`, two skills and runtime files.
Validate every plugin path as a regular, non-symlink image-managed file; reject
additional plugins, servers, hook commands, custom providers and unknown registry
entries. Permit only the plugin's Node executable/serve command and exact native
hook entrypoints; do not enable all MCP servers or add permission-skip options.
The native manager's own registry/import-manifest formats must be inspected and
allowlisted narrowly as part of that separate bootstrap review. Mount only the
private installation directory described above; keep native host bindings and
provider auth separate. Test both the permitted exact plugin and malicious
extra/symlink/modified-command cases against the real archived policy before a
user deploys the revised sandbox. This is an integration specification, not a
claim that the existing archived security policy already permits the connector.


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
Restarting only MCP does not reset this bound. The pinned CLI 1.4.7 isolated
qualification below now verifies actual `/compact` continuity and `/new` root
rotation; authenticated user-environment wakeup acceptance remains separate.

Creating a strict binding handle or observing native hooks does not by itself
disable the legacy loader. Only a verified strict transport admission commits
`strict_admission_required`; subsequent legacy operations, including already-open
handles, then fail closed. Waiter consumption cannot activate this marker.
