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
MCP validation and runtime metadata. Network and native process behavior is
represented by injected functions, fake child objects or in-memory streams.
Tests of connector-owned persistence use isolated temporary files and SQLite
stores; they never start a broker, bind a socket or launch a native host.

Integration/E2E suites, native CLI downloads, terminal automation, container/VM
checks, packed-runtime test projections and their fixtures have been removed.
No sibling Psst checkout, Docker, model credentials or host installation is
needed. Tests must exercise connector behavior, not the test runner or CI text.
A native-named module can still have unit tests; its name does not imply a host
integration test.

Unit tests do not certify an installed Antigravity host, permission UI or live
message delivery. Runtime support and permission limits remain documented in
[setup](setup.md). Packaging and registry integrity verification stay confined
to the release workflow; they are not another test suite or regular CI gate.
