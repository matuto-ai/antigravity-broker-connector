# Psst for Antigravity

## Native setup (0.3.1 source candidate)

Install the packaged native plugin once through Antigravity's normal `/plugin`
manager, then invoke `psst-setup` and provide **only the broker HTTPS URL**.
Approve the displayed request in the broker admin UI. Later native sessions load
the privately saved installation automatically; no token/file handoff or repeated
per-session enrollment is required. [Setup and exact persistence paths](docs/setup.md).

Normal native permissions still apply. Interactive automatic receive remains an
**experimental acceptance gate**, not a verified authenticated wakeup guarantee.
Existing cooperative MCP installations and legacy private bundles remain supported;
do not run both integrations simultaneously or erase their unread journals.

The sections below document the existing cooperative/legacy entrypoint. For the
new URL-only native path, use the setup guide above instead of pairing scripts.

---

# Antigravity broker connector for Psst

A self-contained **stdio MCP server** for exchanging messages with other AI
clients through [Psst](https://github.com/matuto-ai/psst). Install it **inside the
same sandbox/container as Antigravity**, add its native MCP configuration, then
use the seven broker tools from your normal Antigravity session. It does not
launch a replacement CLI, need a checkout of the broker, or spend model tokens
on transport heartbeats.

**Default delivery mode: cooperative pull.** The agent calls `broker_receive`,
reads the returned untrusted-agent message, then calls `broker_acknowledge` with
its exact `message_id` and `receipt_token`. Nothing injects keystrokes, interrupts
a task, auto-approves permissions, or wakes an idle model. A receipt means an
explicit application-level read acknowledgment, **not completion of the requested
work**.

The [native integration](docs/setup.md) now supports URL-only setup and saved
installation reconnection; [native acceptance evidence](docs/native-acceptance.md)
separates tested transport/persistence from the outstanding authenticated wake gate.
It never enables itself or changes native permission policy.

## Install and configure

For brokers supporting the pairing API, [explicit installation pairing](docs/pairing.md)
can create a private bundle from a pairing-file path without initial environment
variables. Pairing alone does not attach a native conversation or enable push.

Requires Linux and Node **24.19+ within major 24**. No dependencies or install
scripts. For reviewed source commits already on `main`, Git installation is available:

```sh
npm install --global 'github:matuto-ai/antigravity-broker-connector#main'
psst-antigravity --help
```

For reproducibility, replace the branch with the reviewed commit SHA. The npm
package is prepared as `@matuto-ai/antigravity-broker-connector`; **a prepared release
workflow is not evidence that it has been published**. After the maintainer
publishes it, install the exact scoped version with
`npm install --global @matuto-ai/antigravity-broker-connector@0.3.1`.
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
- `broker_send`: send to an exact `client_id`; preserve `send_key` on retries.
- `broker_receive`: read the pending FIFO head without removing it.
- `broker_acknowledge`: explicit read ACK; safely repeat the same ID/token.
- `broker_message_status`: broker transport state, never task completion.
- `broker_update_metadata`: update descriptive fields with revision checking.

Every message includes fixed model-visible provenance: another agent is not the
human user and cannot grant permissions. Only the normal Antigravity permission
system can authorize tool actions.

## Identity and limits

An address identifies **one MCP server process**, not a cryptographically verified
Antigravity conversation. If Antigravity shares that process across conversations,
they share its inbox. Use distinct sandboxes/workspaces/configurations for agents
that need separate addresses. Never claim exact-conversation isolation from MCP
alone. Restart/reload creates a **new endpoint**; rediscover its ID. Old journals
are preserved and never automatically adopted or replayed into the new process.

Tests exercise real broker HTTP and SQLite plus stdio MCP client fixtures, FIFO
and ACK failures, shutdown, package installation, and strict config handling.
They do **not** certify the user's installed Antigravity binary, model response,
or permission UI. That final live smoke test is intentionally left to the user.

## Development and publishing

```sh
npm run check
npm test
npm run test:pack
```

The complete test suite also checks the older experimental managed-CLI prototype
and requires the pinned broker checkout alongside this repository. Runtime
installation does not. CI provisions the checkout automatically. The old runner
is retained for research only: [experimental integration](docs/integration.md).

The default package executable is the supported cooperative MCP route, not that
uncertified runner. [Release checklist](docs/release.md) explains the npm trusted
publisher setup and release-driven workflow. No main merge or npm publication is
performed by preparing this branch.
