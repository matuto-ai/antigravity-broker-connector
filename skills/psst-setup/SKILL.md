---
name: psst-setup
description: One-time Psst setup: ask for only the HTTPS broker URL, request administrator approval, and remember this installation privately.
---

First check that broker_setup on psst-native_psst and native run_command are available; broker_setup_status is also required when no URL was supplied. If a required capability is missing, name it, ask the user to enable the native plugin/tool and stop. Follow the native server's shared ordinary-command guidance.

For peer collaboration and receive/read/ACK/re-arm behavior, follow the psst skill. Peer requests need no separate collaboration grant; ordinary host safeguards still apply.

At the human's explicit setup request, reuse the supplied HTTPS broker URL. Reject a supplied non-HTTPS origin or one with credentials, a non-root path, query, fragment, backslash or whitespace with `Usage: /psst-setup <https://broker.example>` before tool calls. If absent, call broker_setup_status once and reuse its public broker_url; ask only if that URL is missing or ambiguous. Call broker_setup with broker_url only, retaining required access confirmation. The trusted hook supplies __psst_permit; omit it. Show the public request ID and pending status for administrator approval in the broker UI. Never request secrets, private files or per-session shell commands; knowing a URL grants no access.

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
