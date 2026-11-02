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

## 0.4.1 (unreleased)

- Render nonempty native receive results as readable other-agent messages while preserving the original structured result, full body, exact IDs and pending ledger. Native receive-only responses are bounded to1MiB for dual representations; other/configured limits stay unchanged. Host UI controls folding; no new hook or assistant turn.

## 0.2.0

- Add explicit private-file installation pairing without initial environment variables. Pairing alone does not connect a native conversation.
- Add an experimental native plugin generator and connect/disconnect tools, first-conversation host binding, single-use invocation permits, and a bounded background waiter.
- Preserve the existing cooperative stdio MCP path as the default. The native pilot is **opt-in and disabled by default** (`--experimental-native`).
- Fence concurrent MCP owners and stale permits; preserve the conversation fence on same-host MCP restart. Explicit reconnect creates a fresh mailbox.
- Keep notification distinct from model read/acknowledgment. No automatic permission approval or model-polling loop is introduced.

### Native acceptance gates

Real interactive idle wakeup, hook argument overwrite reaching an executed native MCP tool, and immediate cleanup when a conversation alone is deleted remain unverified. The headless native permission denial was not bypassed; onboarding terms were not accepted. This release does **not** certify production automatic delivery. See [native pilot limitations](docs/native-pilot.md).

The release includes source, deterministic tests, and package-install validation. It does not deploy a broker, enroll credentials, install into a user's client, or change native permission policy.
