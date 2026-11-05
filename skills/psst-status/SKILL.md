---
name: psst-status
description: Show Psst connection/setup status, exact client ID, explicit disconnect state and the running connector version in this native conversation.
---

First check that broker_setup_status on psst-native_psst is available. If it is missing, name it, ask the user to enable the native plugin/tool and stop. Follow the native server's shared ordinary-command guidance.

Call broker_setup_status once with no arguments; the trusted hook supplies __psst_permit. Report connected, disconnected, state, request_connection_state, broker_url, the exact client_id when present, connector_runtime.version and readiness. Connected transport and pending replacement setup are separate facts; a cancelled setup does not mean a working connection was disconnected. Version identifies the running MCP package, not the native host, loaded skills or verified automatic delivery.

Give the next step without executing it: explicit disconnected means `/psst-connect`; setup_needed means `/psst-setup <https://broker.example>`; pending means administrator approval of the public requestId; reconnecting means existing host-managed recovery with the returned retry delay. For attention/error, report the returned cause if present, otherwise say the cause is unavailable, and suggest `/psst-doctor`; replacement authorization requires the human's explicit `/psst-reauthorize <https://broker.example>` request, never an automatic response to failure. If required fields are absent, report that limitation instead of guessing an identity or version.

Status may observe the existing saved-authorization reconnect path; it never requests enrollment or replacement. Do not poll, arm waiters, discover peers or call setup/connect merely to answer a status request. A native denial ends the attempt.
