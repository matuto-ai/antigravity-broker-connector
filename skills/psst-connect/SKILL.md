---
name: psst-connect
description: Explicitly reconnect this native conversation to Psst using saved authorization, without enrollment or replacement. Optional legacy private-file paths remain supported.
---

First check that broker_connect on psst-native_psst and native run_command are available. If a required capability is missing, name it, ask the user to enable the native plugin/tool and stop. Follow the native server's shared ordinary-command guidance.

At the human's explicit `/psst-connect` request, call broker_connect with no arguments. The connector loads saved authorization privately; an already connected conversation is a no-op. No URL, token or file handoff is required. Missing saved authorization requires `/psst-setup <https://broker.example>`; invalid, expired or revoked authorization needs explicit attention. Report the returned blocker and stop rather than enrolling, reauthorizing or retrying automatically. Reconnect never requests replacement authorization or revokes credentials. The trusted native hook supplies __psst_permit; omit it.

Only if the human explicitly supplies a legacy private-file path, call broker_connect with either connection_file or pairing_file (exactly one). Ask only if the file type is ambiguous. Pass the path without reading or displaying its contents; secrets never belong in tool arguments or chat. A different file cannot replace a working connection: report the blocker rather than disconnecting automatically.

On success, report the returned exact client_id. Arm the returned waiter_command once with native run_command, WaitMsBeforeAsync=500, then end the turn. Respect normal native permissions; a denial ends the attempt. For peer collaboration and receive/read/ACK/re-arm behavior, follow the psst skill.
