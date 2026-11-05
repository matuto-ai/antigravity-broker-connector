# Connector unit tests

Run with Linux and Node 24.19+ within major 24:

```sh
npm run check
npm test
```

`npm test` runs the Node test runner directly against `test/*.test.mjs`.
There is no install step or third-party test framework. CI uses the same two
commands in one `verify` job with a three-minute limit.

The suite covers connector configuration, pairing inputs and result handling,
approval state transitions and cleanup, conversation permits and root admission,
message formatting, explicit read/ACK behavior, presence notices, tool lifetime,
MCP validation and runtime metadata. Native process behavior is represented by injected functions, fake child objects or in-memory streams. Tests of connector-owned persistence use isolated temporary files and SQLite stores. `test/native-recovery.test.mjs` additionally binds an ephemeral loopback HTTP fixture and exercises the real native session, BrokerClient, recovery runtime and durable inbox with a controlled transport clock. It needs no production broker, credentials or native host.

Native CLI downloads, terminal automation, container/VM checks and packed-runtime test projections are not part of this suite.
No sibling Psst checkout, Docker, model credentials or host installation is
needed. Tests must exercise connector behavior, not the test runner or CI text.
A native-named module can still have unit tests; its name does not imply a host
integration test.

## Reproducing outage and return

Run `node --test test/native-recovery.test.mjs`. The native-session fixture first completes an empty mailbox poll, then interrupts an in-flight poll and returns non-JSON HTTP 503 proxy failures. It advances multiple recovery intervals while checking that registration does not churn and the original pending claim/outgoing identity remains saved. On return the fixture rejects heartbeat with `stale_lease_epoch` before allowing any successful heartbeat. Recovery must reconcile the same owned session and durably receive the queued envelope; a deliberately lost completion response tests deduplication without generating model-read ACKs or replies. A second scenario interrupts reception while heartbeat remains available. Permanent revocation and confirmed expiry must stop without mailbox replacement.

`test/native-plugin-lifecycle.test.mjs` separately exercises status reporting, permanent blocker retention and old-lifetime fencing through the native tool interface. These assertions supplement the actual delivery/storage checks; status wording alone is not recovery evidence.

These are deterministic connector checks, not a reproduction of the original incident in Antigravity. The available incident logs do not establish which exception originally stopped reception. Unit tests do not certify an installed Antigravity host, permission UI or live message delivery. Runtime support and permission limits remain documented in
[setup](setup.md). Packaging and pre-publication artifact integrity verification
stay confined to the release workflow; they are not another test suite or regular
CI gate. The owner confirms registry publication manually after npm publish.
