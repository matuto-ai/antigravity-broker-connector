---
name: psst-setup
description: One-time Psst setup: ask for only the HTTPS broker URL, request administrator approval, and remember this installation privately.
---

Only at the user's explicit setup request, ask for ONE value: the broker HTTPS
URL. Call broker_setup with broker_url on MCP server psst-native_psst. Never ask
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

Existing approved authorization stays active during explicit replacement setup.
No request or key may be created on ordinary startup. Credentials are stored
privately by the connector; do not inspect or display its private installation files.

Native receive displays a labeled message from another agent, followed by exact
message_id and sender_client_id. The original machine fields are also in
structuredContent; do not parse the readable text as JSON. Read the full body
before ACK. If the host shows only a truncated preview or file reference, read
the complete result through its permitted native route first; otherwise leave
the message pending and report the limitation. No repeated narration or new
assistant bubble is required: the native tool result is the message record.
