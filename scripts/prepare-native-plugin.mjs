#!/usr/bin/env node
// Explicit experimental plugin generation only; never changes a live profile.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quoteShell } from '../src/native-plugin.mjs';
import { PEER_GUIDANCE } from '../src/native-waiter.mjs';
const target=process.argv[2];
if(process.argv.length!==4||process.argv[3]!=='--experimental-native'||!isAbsolute(target)||resolve(target)!==target)throw Error('explicit_experimental_new_directory_required');
mkdirSync(target,{mode:0o700});mkdirSync(join(target,'skills/psst-connect'),{recursive:true});
const bin=fileURLToPath(new URL('../bin/psst-antigravity-native.mjs',import.meta.url));
const hook={type:'command',command:`${quoteShell(process.execPath)} ${quoteShell(bin)} hook`,timeout:5};
writeFileSync(join(target,'plugin.json'),JSON.stringify({name:'psst-native',description:'EXPERIMENTAL Psst native CLI pilot; automatic wakeup acceptance not certified.'},null,2));
writeFileSync(join(target,'mcp_config.json'),JSON.stringify({mcpServers:{psst:{command:process.execPath,args:[bin,'serve','--experimental-native']}}},null,2));
writeFileSync(join(target,'hooks.json'),JSON.stringify({'psst-native-binding':{SessionStart:[{...hook,command:hook.command+' observe'}],PreInvocation:[{...hook,command:hook.command+' observe'}],PreToolUse:[{matcher:'call_mcp_tool|run_command',hooks:[hook]}]}},null,2));
writeFileSync(join(target,'skills/psst-connect/SKILL.md'),`---
name: psst-connect
description: Explicitly connect this conversation to Psst using a private pairing or connection file path. Experimental native CLI pilot.
---

Only connect at the user's explicit request. Ask for the absolute PRIVATE file
path if it was not supplied; never ask for, read into context, or display the
pairing secret or bearer token. Do not require initial environment variables.
Call broker_connect on MCP server psst-native_psst with either pairing_file or
connection_file (exactly one). The trusted native hook inserts __psst_permit;
do not invent it. Follow ordinary native permission prompts; do not modify
permissions, auto-approve, disable hooks, or bypass a denial.

On successful connect, show broker_identity and use broker_list_clients to
discover exact recipients. Each new native session has a fresh exact address.

${PEER_GUIDANCE}

Run the returned waiter_command with native run_command, WaitMsBeforeAsync=500,
the exact returned CommandLine. End your turn. Never poll using
model calls, timers or cron. When native task completion reports a pending
message, follow the receive/read/ACK guidance above, drain the pending FIFO,
then re-arm the same waiter command. A transport notice is not an agent message:
read broker_presence_events and explicitly acknowledge only event_id values
actually read using broker_acknowledge_presence_event, drain batches and re-arm.
Do not automatically resend, cancel messages or close sessions for transport notices.

If connect, receive, ACK or waiter fails, or an attention/cancel/disconnect notice
arrives, stop automatic retries and report one actionable issue. Never create a
model-turn loop on an unacknowledged head. broker_disconnect cancels the waiter;
it does not revoke the credential. Only one conversation per native host is
supported; a second conversation must use a fresh CLI host, not reuse the first
conversation's address. Automatic delivery remains experimental until native
idle wakeup and hook-overwrite acceptance tests pass in the user's CLI.
`);
console.log(JSON.stringify({pluginDirectory:target,installed:false,experimental:true}));
