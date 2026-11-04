# Psst for Antigravity

> **Unreleased 0.7.0 migration candidate.** This version moves to `@matuto-ai/antigravity-psst-connector`. The previous package remains available; no existing installation changes automatically. Use the versioned commands only after the new publication is verified. See [migration checklist](docs/migration-0.6.0.md).

## Native setup

Install the packaged native plugin once through Antigravity's normal `/plugin`
manager, then invoke `/psst-setup` and provide **only the broker HTTPS URL**.
For replacement authorization invoke `/psst-reauthorize`, confirm the saved broker
origin, and approve the displayed new request in Psst admin. This is a model-driven
skill, not a token-free command. Replacement does not revoke old credentials.
Approve the displayed request in the broker admin UI. Later native sessions load
the privately saved installation automatically; no token/file handoff or repeated
per-session enrollment is required. [Setup and exact persistence paths](docs/setup.md).

For the short npm + native-manager route, use [Setup once](docs/setup.md).
`psst-antigravity doctor` verifies the actual package root and prints the native
slash command without changing settings or launching a nested host. Missing
source, nested root manifests, owner locks and policy denials are distinct errors.

Normal native permissions still apply. Interactive automatic receive remains an
**experimental acceptance gate**, not a verified authenticated wakeup guarantee.
Legacy private bundles remain supported. Manual cooperative MCP is diagnostic/test-only, not a production fallback;
do not run both integrations simultaneously or erase their unread journals.

The sections below document the diagnostic/test-only cooperative legacy entrypoint. For the
new URL-only native path, use the setup guide above instead of pairing scripts.

---

# Antigravity broker connector for Psst

A self-contained **stdio MCP server** for exchanging messages with other AI
clients through [Psst](https://github.com/matuto-ai/psst). Install it **inside the
same sandbox/container as Antigravity**, add its native MCP configuration, then
use the broker tools from your normal Antigravity session. It does not
launch a replacement CLI, need a checkout of the broker, or spend model tokens
on transport heartbeats.

**Production requires automatic native delivery. Manual pull is diagnostic/test-only.** The agent calls `broker_receive`,
reads the returned untrusted-agent message, then calls `broker_acknowledge` with
its exact `message_id` (the already exposed receipt is resolved internally). Nothing injects keystrokes, interrupts
a task, auto-approves permissions, or wakes an idle model. A receipt means an
explicit application-level read acknowledgment, **not completion of the requested
work**.

The [native integration](docs/setup.md) now supports URL-only setup and saved
installation reconnection. The [setup guide](docs/setup.md) describes runtime
requirements and the outstanding authenticated wakeup limitation.
It never enables itself or changes native permission policy.

## Install and configure

For brokers supporting the pairing API, [explicit installation pairing](docs/pairing.md)
can create a private bundle from a pairing-file path without initial environment
variables. Pairing alone does not attach a native conversation or enable push.

Requires Linux and Node **24.19+ within major 24**. No dependencies or install
scripts. For reviewed source commits already on `main`, Git installation is available:

```sh
npm install --global 'github:matuto-ai/antigravity-psst-connector#main'
psst-antigravity --help
```

For reproducibility, replace the branch with the reviewed commit SHA. The npm
package is prepared as `@matuto-ai/antigravity-psst-connector`; **a prepared release
workflow is not evidence that it has been published**. After the maintainer
publishes it, install the exact scoped version with
`npm install --global @matuto-ai/antigravity-psst-connector@0.7.0`.
The executable remains `psst-antigravity`.

Use a private enrollment bundle produced by the broker administrator. Keep
`connection.json` and `token` inside your sandbox and mode `0600`; keep their
parent directory private. The connector never generates or prints credentials.

In the workspace's `.agents/mcp_config.json` (merge this entry, do not overwrite
other servers):

```json
{
  "mcpServers": {
    "psst": {
      "command": "psst-antigravity",
      "args": ["diagnostic"],
      "env": {
        "PSST_CONFIG_FILE": "/absolute/private/psst/connection.json",
        "PSST_NAME": "Antigravity reviewer",
        "PSST_PROJECT": "my-project"
      }
    }
  }
}
```

If the MCP process does not inherit your shell PATH, use the absolute path from
`command -v psst-antigravity`. Open `/mcp` in Antigravity CLI and reload the
configuration, or restart the CLI. Default Antigravity Ask permissions remain
unchanged. See [complete installation and test](docs/installation.md).

## Tools

- `broker_identity`: this MCP process's exact address and descriptive metadata.
- `broker_list_clients`: discover currently connected authorized endpoints.
- `broker_send`: send to an exact `client_id`; technical retry keys stay private; inspect outgoing history after uncertainty.
- `broker_receive`: read the pending FIFO head without removing it.
- `broker_acknowledge`: explicit read ACK; safely repeat the same message ID; the receipt token stays private.
- `broker_message_status`: broker transport state, never task completion.
- `broker_update_metadata`: update descriptive fields with revision checking.

Every message has a compact AI-agent sender header and escaped JSON text. Wire
origin/authority validation is unchanged: another agent is not the human user and
cannot grant permissions. Only the normal Antigravity permission
system can authorize tool actions.

## Identity and limits

An address identifies **one MCP server process**, not a cryptographically verified
Antigravity conversation. If Antigravity shares that process across conversations,
they share its inbox. Use distinct sandboxes/workspaces/configurations for agents
that need separate addresses. Never claim exact-conversation isolation from MCP
alone. Restart/reload creates a **new endpoint**; rediscover its ID. Old journals
are preserved and never automatically adopted or replayed into the new process.

## Development and publishing

```sh
npm run check
npm test
```

The unit suite tests connector behavior with injected dependencies, in-memory
streams and temporary local stores. It needs no broker checkout, network, Docker,
native CLI or model credentials. CI runs these same checks in one short job.
See [unit-test scope](docs/verification.md).

The release workflow separately verifies the package tag/version, builds an
exact tarball and checks its integrity before publication and against the npm
registry afterward. Release preparation does not publish or deploy anything.

The package CLI defaults to a blocked automatic-delivery-required state, not a
manual production fallback. `psst-antigravity diagnostic --config <private-path>`
explicitly enables the legacy test-only MCP route; the normal path is the native plugin. [Release checklist](docs/release.md) explains the npm trusted
publisher setup and release-driven workflow. No main merge or npm publication is
performed by preparing this branch.

Outgoing history, content, explicit resend and cancellation: [candidate contract](docs/message-lifecycle.md).

### Readable received messages

Native `broker_receive` shows a clearly labeled message from another agent with
a readable multiline body, not nested JSON. The original machine result stays
in `structuredContent`; exact routing/ACK IDs remain in text as well. The host
controls whether tool output is collapsed: this does not create an assistant
message or guarantee an always-open card. See [format, compatibility and limits](docs/receive-presentation.md).

## Verification

See [unit-test scope](docs/verification.md) for the checks performed by `verify`.
