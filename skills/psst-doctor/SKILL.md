---
name: psst-doctor
description: Run the existing read-only Antigravity Psst package/runtime/launcher/managed-registration doctor without needing a broker connection or reading credentials.
---

First check that native run_command is available. If it is missing, name it, ask the user to enable the native tool and stop. Follow the native server's shared ordinary-command guidance.

At the human's explicit `/psst-doctor` request, run exactly `psst-antigravity doctor` through native run_command with CommandLine set to that command and WaitMsBeforeAsync=500. The installed CLI must be on PATH in the same environment as Antigravity. If it is missing, report the missing executable and ask the user to make this connector's reviewed CLI available there; stop instead of guessing installation paths, installing packages or launching another host. If execution is asynchronous, read that task's completion through the normal native route rather than launch another doctor. Respect normal permission prompts; a denial ends the attempt.

Summarize the actual result: package shape/version, Linux/Node runtime, agy launcher presence, managed registration/version and the returned next action. That version describes the CLI's package, not necessarily the running MCP; `/psst-status` is the separate running-version check. This is local inspection, not Pi's storage-path doctor: it does not open credential/config bodies or inbox databases, probe the broker, test native ownership/import permissions, or certify live connection/wakeup. Preserve not_checked and not_verified results as unknown, not success.

Report a failed check with its returned cause and remedy, then stop. Any suggested `/plugin` action belongs in the current native UI and is not executed by doctor. Do not repair permissions, delete state/locks, read secrets, invoke agy, reconnect, enroll or request replacement authorization. Psst MCP tools are not required and must not be called as a diagnostic preflight.
