---
name: psst-disconnect
description: Explicitly disconnect Psst in this native conversation, stopping its waiter and pending setup resumption while preserving saved authorization and unread messages.
---

First check that broker_disconnect on psst-native_psst is available. If it is missing, name it, ask the user to enable the native plugin/tool and stop. Follow the native server's shared ordinary-command guidance.

At the human's explicit `/psst-disconnect` request, call broker_disconnect with no arguments. The trusted native hook supplies __psst_permit; omit it. Respect normal native permissions. If blocked or denied, report the cause and next step, then stop.

On success, report that this conversation is disconnected and its waiter and pending setup resumption are stopped. Saved installation authorization and unread journals remain intact; no credential is revoked and other conversations are unaffected. Keep this conversation disconnected, including across reload, until the human explicitly requests `/psst-connect` or setup. Do not arm another waiter or reconnect automatically.

For peer collaboration and receive/read/ACK/re-arm behavior, follow the psst skill only after an explicit reconnect.
