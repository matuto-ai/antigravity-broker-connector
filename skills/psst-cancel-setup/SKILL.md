---
name: psst-cancel-setup
description: Pause this native conversation's pending Psst setup and late attachment while retaining saved authorization, unread messages and an existing connection.
---

First check that broker_cancel_setup on psst-native_psst is available. If it is missing, name it, ask the user to enable the native plugin/tool and stop. Follow the native server's shared ordinary-command guidance.

At the human's explicit `/psst-cancel-setup` request, call broker_cancel_setup once with no arguments. The trusted hook supplies __psst_permit; omit it. Report that this conversation's setup polling and late attachment are paused. The durable request and saved authorization remain intact; a request already sent cannot be undone, credentials are not revoked, and other conversations are unaffected. A working connection and unread journals are retained. Use `/psst-disconnect` only when the human wants transport stopped too.

If the result says connected and includes waiter_command, check native run_command is available and arm that returned inbox waiter once with WaitMsBeforeAsync=500, then end the turn. This continues the retained connection, not setup polling. If run_command is missing or denied, report that setup was paused and transport retained but the inbox waiter could not be armed, then stop. Without a retained connection, stop after reporting cancellation. Never restart setup or re-arm its approval waiter automatically; explicit `/psst-setup` can resume the request later.

For peer collaboration and receive/read/ACK/re-arm behavior, follow the psst skill.
