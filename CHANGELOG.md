# 0.8.0 — Unreleased

- Package `/psst-connect` and `/psst-disconnect` skills in both native installation paths. Bare connect reuses saved authorization without enrollment, is a no-op when connected, and explicitly resumes a disconnected conversation; disconnect preserves credentials and unread journals across reload. Legacy private-file connect remains supported.

- Remove the release CI post-publication registry gate. Keep exact-artifact preparation, syntax/unit checks, version guards and npm publish; the owner confirms publication manually.
- Prepare matching package and native plugin versions for 0.8.0. No release or publication is performed by this change.

# 0.7.0

- Version-only preparation for the owner-selected 0.7.0 delivery. Package and native plugin metadata agree; publication remains a separate action.
- Include the merged explicit `/psst-reauthorize` workflow and approval/attachment status distinction from #29.

## Unreleased native lifecycle fixes (issue #8)

- Reconcile uncertain setup POSTs from the saved candidate with GET-only recovery.
- Retry transient saved-installation startup failures with cooldown and the same
  authorization/conversation; notify through the existing native status waiter.
- Keep replacement approval observable while the previous connection works.
- Reject incomplete runtime files and altered hook/MCP manifests in doctor.
- Fence late startup results only after a valid explicit intent is saved; invalid
  setup leaves working startup and explicit disconnect unchanged.
- Commit per-conversation disconnect/setup suppression so they survive restart.
- Validate through focused unit tests; owner-machine integration is deferred.

- Admit verified native root transitions only through setup-status/connect after the first root, with a fail-closed 256-retirement bound, transport root/self IDs and exact hook permits; drain old work and preserve old journals without replay into the new mailbox. Child IDs and retired roots cannot select the owner.
- Preserve same-root retention recovery, explicit setup recovery and native permissions. Authenticated `/compact` acceptance remains separate from local fixtures.

- Rename the npm distribution and GitHub repository to `antigravity-psst-connector`.
- Preserve native plugin identity, commands, private installation state and message journals.
- Existing installations require an explicit package/source update; see `docs/migration-0.6.0.md`.

# 0.3.1 (prepared, not yet published)

- Restore the pinned Psst approval TLS fixture checkout in the npm release workflow; no test is skipped.
- Add regression coverage for release/CI fixture parity and package/native manifest version alignment.
- Preserve the failed v0.3.0 GitHub tag; npm publication was skipped before upload. A new release is an explicit owner action.
- No runtime behavior, permissions or native acceptance claims change; authenticated native wakeup remains experimental.

# 0.3.0 (GitHub release; npm publication failed)

- URL-only native setup with broker-admin approval and durable same-request retry.
- GET-only pending restart recovery; approved configuration loads on normal startup.
- Credential/conversation-separated persistent inboxes with exclusive native ownership.
- Packaged native plugin and documented bootstrap-sharing paths; legacy MCP preserved.
- Native automatic wakeup remains experimental; no permission bypass or production claim.

# Changelog

## 0.5.1 (unreleased)

- Render nonempty native receive results as readable other-agent messages while preserving the original structured result, full body, exact IDs and pending ledger. Native receive-only responses are bounded to1MiB for dual representations; other/configured limits stay unchanged. Host UI controls folding; no new hook or assistant turn.

## 0.2.0

- Add explicit private-file installation pairing without initial environment variables. Pairing alone does not connect a native conversation.
- Add an experimental native plugin generator and connect/disconnect tools, first-conversation host binding, single-use invocation permits, and a bounded background waiter.
- Preserve the existing cooperative stdio MCP path as the default. The native pilot is **opt-in and disabled by default** (`--experimental-native`).
- Fence concurrent MCP owners and stale permits; preserve the conversation fence on same-host MCP restart. Explicit reconnect creates a fresh mailbox.
- Keep notification distinct from model read/acknowledgment. No automatic permission approval or model-polling loop is introduced.

### Native acceptance gates

Real interactive idle wakeup, hook argument overwrite reaching an executed native MCP tool, and immediate cleanup when a conversation alone is deleted remain unverified. The headless native permission denial was not bypassed; onboarding terms were not accepted. This release does **not** certify production automatic delivery. See [native capability limits](docs/setup.md#native-capability-and-acceptance-limits).

The release includes source, deterministic tests, and package-install validation. It does not deploy a broker, enroll credentials, install into a user's client, or change native permission policy.


### 0.6.0 native pilot corrections (unreleased)

- Correct unrelated PreToolUse pass-through with explicit normal-policy delegation,
  preserving all Psst binding/permit checks and without permission overrides.
- Use English readable message headings and Details with exact IDs, project and
  model when present; raw provider/correlation fields and receipts remain intact.
- Observe native model and project labels after verified hook context; preserve
  configured/env precedence, durable mailbox paths and send retry snapshots.
- Same-host conversation replacement after `/compact` remains a separate native
  lifecycle limitation; this patch does not weaken the fence or migrate mailboxes.
