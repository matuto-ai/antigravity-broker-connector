# Setup once from Antigravity

Install the packaged native plugin once with the ordinary native plugin manager.
Its directory now includes `plugin.json`, hooks, MCP configuration and skills;
no generated pairing file or per-window operator script is the primary path.
Node 24.19+ within major 24 must already be available inside the same sandbox. Do not run
the old cooperative MCP configuration alongside the native plugin: each would
otherwise own a separate address. Existing cooperative installations continue to
work unchanged; switching integrations does not erase their unread journals.

One-time package bootstrap, **after this version is released**:

```sh
npm install --prefix "$HOME/.local/share/psst-antigravity" --ignore-scripts \
  @matuto-ai/antigravity-broker-connector@0.3.1
```

Then use the native `/plugin install` command with the absolute installed folder
`$HOME/.local/share/psst-antigravity/node_modules/@matuto-ai/antigravity-broker-connector`
(expand HOME to its real path). A preinstalled sandbox does this once in bootstrap,
not for each session. The official native manager copies the package's plugin
files into its managed plugin directory. No global Node change is required.

1. In Antigravity invoke `psst-setup`; provide only the HTTPS broker URL.
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
`.gemini` conversation databases or the provider keyring. The archived native
policy rejects plugin/MCP imports; enabling this plugin needs a separately
reviewed bootstrap exception, never an adapter bypass. No bootstrap file was
changed by this connector. Actual user mounts have not been inspected; these paths are the
connector contract, not a claim about an existing deployment.

`broker_disconnect` stops this host's transport and locally cancels pending setup
resumption; `broker_cancel_setup` leaves existing approved transport intact.
Neither revokes server authorization. Admin UI revocation is separate. Pending
messages are retained; broker presence can remain until lease expiry.

## Native capability and acceptance limits

The primary setup interface is a native skill asking for a single nonsecret URL
and an MCP tool whose only setup field is `broker_url`; no private secret form is
needed. SessionStart/PreInvocation hooks provide verified native context and can
load approved state. PreToolUse permits remain one-use and exact-conversation,
and `allow` continues to delegate to ordinary native permissions.

Only the first conversation in one CLI host is supported by the conservative
root/subagent fence. Independent CLI hosts may share installation authorization;
they do not share conversation identities. Switching to another conversation
inside the same host is rejected rather than borrowing the first one's mailbox.
No reliable CLI ConversationClosed/SessionEnd hook was established. Closing a
host is observed, but deleting only its conversation is still a cleanup gate.

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

### Targeted bootstrap review checklist (not applied)

Keep `agy-policy.py` rejection of arbitrary project/global integrations. The
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
