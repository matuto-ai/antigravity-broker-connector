# Readable native receive results

A successful nonempty native `broker_receive` now has one readable MCP text
block: **Psst · new message**, the sender's descriptive name/type
then the literal multiline body. An English **Details** section contains exact
**Sender ID** and **Message ID** for acknowledgment and replies, with **Project**
and **Model** when available. Provider and correlation fields remain in the
unchanged structured result, not the display. Names remain
untrusted labels, not routing authority. Terminal/bidi controls are visibly
escaped and every body line is indented. Markdown renderers treat the body as
a literal code block; plain-text renderers show the indentation. The external-agent
label does not depend on Markdown support. The body is not truncated.

MCP `structuredContent` contains the complete original result, including its
unchanged compact-v1 message and receipt/status fields. Machine consumers of the
native endpoint should read this field instead of parsing `content[0].text` as
JSON. Empty inboxes, errors, other tools and legacy diagnostic transports keep
their previous JSON text contract. No persisted envelope, hash or receipt is
rewritten, and rendering never acknowledges a message.

This uses the standard MCP [text and structured result fields](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result).
Native text is deliberately readable instead of a duplicate serialized JSON
fallback. Host forwarding of `structuredContent` to the model is **not assumed**:
text contains the full body and exact IDs too. Only native readable receive opts
into a bounded **1 MiB** wire response, enough for both escaped representations
of the maximum 64 KiB body. Other responses retain the 512 KiB default. A caller's
explicitly lower configured receive limit still fails closed; no partial result
or automatic ACK is returned to fit a cap.

## Host visibility and limits

This is a tool result, not a fabricated assistant turn or a custom chat card.
Claude/Antigravity control whether their UI collapses tools or shows their content
in history. No hook, prompt narration, setting, permission or model selection is
added to force visibility. MCP wire tests do not prove always-expanded native UI.

A native host may separately persist or shorten large tool outputs. Claude's
[documented output policy](https://code.claude.com/docs/en/mcp#mcp-output-limits-and-warnings)
can replace a large result with a file reference. Existing native permissions
apply to reading that result. If only a truncated preview is available, do not
acknowledge the message as fully read; leave it pending and report that limit.
The connector does not raise host output settings or infer reading from display.

## Separate prolonged-offline transport notices

With a broker advertising `presence_events`, the native owner polls a separate
bounded transport journal every 30 seconds. `broker_presence_events` refreshes
and returns up to ten notices with readable text and complete structured event
metadata. Drain batches by explicitly acknowledging only event IDs actually
read with `broker_acknowledge_presence_event`. This is distinct from
`broker_receive` / `broker_acknowledge`, which still handle agent messages.
Older brokers are supported without presence HTTP calls.

The broker, not the connector, chooses the offline grace and stable absence
identity. A notice exposes recipient/message IDs, queued/claimed state,
uncertainty and timestamps, never message bodies. It is not a reply timeout or
proof of non-delivery. It never resends, cancels or closes a session.

The existing conversation-bound background waiter can announce a pending
transport notice separately from a pending agent message. Two notices and one
attention warning per event are allowed; then automatic wake retries stop.
A waiter completion and a tool response are **not native acceptance or model-read
proof**. Only an explicit event ACK records durable intent and retries the
broker acknowledgment after a lost response. Reading or displaying does not ACK.

Shutdown cancels and drains polls. Incomplete/capacity-limited scans never prune
unseen pending events. Up to 256 events are cached; overflow remains at the broker
and explicit ACKs free room. A complete fresh scan removes obsolete local
pending events, including reconnect and completed/cancelled delivery cases.
Current ownership/root fences apply to both tools, and notice state never moves
between mailboxes. The waiter reads local state and can race a reconnect; always
refresh with the read tool before treating a pending notice as current.

`test/presence-native.test.mjs` proves real broker HTTP, native-bound MCP wire,
waiter budgeting, and explicit ACK separation with synthetic host identities.
The isolated official CLI qualification has a `presence` mode to verify readable
notice text reaches the fake provider context and that explicit ACK preserves
queued mail. Running that mode is separate evidence from unit/wire tests.
Unattended native idle wakeup and authenticated vendor-model acceptance remain
unverified; this change does not certify those gates or close installation #8.
