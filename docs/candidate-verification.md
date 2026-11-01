# Unreleased candidate verification — 2026-11-01

Related issue: #8; not closed by this partial delivery.

## Checked locally

Syntax passed; full suite 88/91 passed. Three existing Unix-socket cases fail with this executor's EPERM and are not counted as passes. Pack smoke passed.

Official Antigravity 1.4.7 validator and isolated native install/list passed with candidate 0.4.0, one MCP server, one hook group and two skills. Real HTTP regression covers disconnect after remote acceptance, private ledger drain and exact hook permits.

Runtime vendoring is exact Psst candidate `2de9cc3758b9fc593f5afca4fc501fd013d416ec`. Shared acceptance-journal
failure after a remote success reports an unknown effect, never known-not-applied.
Model retry/receipt keys remain private; message ID acknowledgment is still scoped
to a previously exposed exact inbox item. Native messaging calls abort and drain
before their journal closes; lifetime-control operations do not wait on themselves.

## Not established

The three socket cases need a permitted normal runner. Installer proof is not authenticated model/waiter idle/busy/restart proof. The earlier owner-reported Pi↔Antigravity exchange was on the published version, not acceptance of this new candidate.

New outgoing history/content/resend/cancel routes require the matching Psst broker.
Older broker send/receive compatibility does not imply availability of new APIs.
These are local candidate results, not published registry versions, deployed code,
remote CI, authenticated-provider acceptance or a release. No permissions, managed
policy, accounts or production host configuration were changed.
