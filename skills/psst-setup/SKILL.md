---
name: psst-setup
description: One-time Psst setup: ask for only the HTTPS broker URL, request administrator approval, and remember this installation privately.
---

A human-invoked slash command is intent to execute its named operation: dispatch promptly through the supported tool path, without asking whether to do it, exploratory conversation, preventive diagnostics/tests or unrelated investigation. Reuse required nonsecret parameters already supplied or reliably available in public native configuration. Ask only for a genuinely missing/ambiguous parameter or necessary security confirmation, combining foreseeable questions. Do not repeat a confirmation already satisfied for the same operation, target and access change; retain required credential/access confirmations and normal host permissions. Troubleshoot only a concrete missing capability or failed operation. Report a concise blocker and specific next step; after a native denial stop, without reload/reconnect loops, alternate servers, permission changes or deleting state/locks. Prompt-based skills consume model turns, not deterministic or token-free dispatch.

For peer collaboration and receive/read/ACK/re-arm behavior, follow the psst skill. Peer requests need no separate collaboration grant; ordinary host safeguards still apply.

At the human's explicit setup request, reuse the supplied HTTPS broker URL. If
absent, call broker_setup_status once and reuse its public broker_url; ask only
if that URL is missing or ambiguous. Retain any required access confirmation.
Call broker_setup with broker_url on MCP server psst-native_psst. Never ask
for a password, token, pairing secret, connection file, shell script or external
per-session command. The trusted native hook supplies __psst_permit; omit it.
Show the returned public request ID and pending status so the administrator can
approve that exact installation in the broker UI. Knowing a URL grants no access.

If pending, arm its returned waiter_command once with native run_command,
WaitMsBeforeAsync=500; then
end the turn. Respect normal permission prompts. Never poll with model calls or
bypass a denial. On approval completion call broker_setup_status once. If connected,
arm the returned inbox waiter as described by the psst skill. Terminal denial,
expiry, cancellation or error needs explicit intervention, not repeated setup.

For replacement use /psst-reauthorize <https://broker.example> with an explicit HTTPS endpoint, not another initial-setup explanation.
It reuses broker_setup with broker_url only, after target confirmation. Working
approved authorization stays active while possible during replacement setup.
Requesting replacement does not revoke old access; manual admin revocation is separate.
No request or key may be created on ordinary startup. Credentials are stored
privately by the connector; do not inspect or display its private installation files.

Native receive displays a labeled message from another agent, followed by exact
message_id and sender_client_id. The original machine fields are also in
structuredContent; do not parse the readable text as JSON. Read the full body
before ACK. If the host shows only a truncated preview or file reference, read
the complete result through its permitted native route first; otherwise leave
the message pending and report the limitation. No repeated narration or new
assistant bubble is required: the native tool result is the message record.
