# Explicit installation pairing

> Legacy diagnostic/test reference only. Production requires the native automatic-delivery plugin described in [Setup once](setup.md). Do not configure manual pull as a production fallback. In the unreleased 0.4.0 candidate, the old stdio CLI requires the explicit `diagnostic` argument; prior released versions differ.

This additive command prepares a credential bundle. It **does not connect a
running Antigravity conversation or enable automatic delivery**. Existing
`--config` and `PSST_CONFIG_FILE` cooperative MCP configuration remain unchanged.
The broker must support the reviewed `/v1/enrollments` pairing API; a prepared
broker change is not evidence that the operator deployed it.

The operator provides a short-lived, single-use private pairing file. Place it
inside the intended sandbox with mode `0600` and a private parent directory.
Never paste its contents into a model prompt, command argument, URL or log.

```sh
psst-antigravity pair --pairing-file /absolute/private/pairing.json
```

No initial environment variables are required. The default installation directory
is `~/.config/psst/antigravity`; optionally use `--directory /absolute/private/dir`.
All paths must be absolute. The helper validates HTTPS origin, client type and
private file ownership/modes; it creates private retry state before HTTP.
It generates this installation's bearer token locally and transmits only its
SHA-256 verifier. The pairing secret is sent only in the HTTPS Authorization
header. Existing credentials and legacy bundles are not overwritten.

Success prints nonsecret JSON including `connectionFile`, `credentialId`,
`expiresAt` and `connected:false`. Use the returned `connectionFile` as the
existing MCP entry's `--config` argument. Keep the installation directory: it
contains the private token and recovery state. A restarted cooperative connector
still has a fresh process address; pairing does not change that scope.

New bundles are explicitly marked with `enrollment_receipt_file:"enrollment.json"`.
The connector verifies the private sibling receipt against the bundle's origin,
client type and token hash; missing, corrupt, mismatched or expired receipts fail
closed. An older connector may reject this new marker: upgrade the connector
before pairing. Unmarked legacy administrator-generated bundles remain supported.

For an uncertain network/storage result, keep the same pairing file and directory
for an explicit retry: the persisted enrollment ID and token are reused. A new
pairing grant is required after credential expiry or revocation. An error is not
proof that the broker failed to store the enrollment. Never delete retry state to
make an uncertain result look new.

The vendored single-file helper is shared with the Psst broker implementation;
it is separate from the older pinned reference runtime. Its local integrity and
compatibility are checked by the pairing tests; it makes no native-delivery claim.
It is pinned to [Psst commit 3e908e7](https://github.com/matuto-ai/psst/blob/3e908e79966d886a02d372c103e31dec6e900c1a/reference/enrollment.mjs)
from [upstream pairing PR #18](https://github.com/matuto-ai/psst/pull/18).
That source reference does not imply the upstream PR is merged or deployed.
