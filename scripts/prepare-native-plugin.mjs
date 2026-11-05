#!/usr/bin/env node
// Explicit experimental plugin generation only; never changes a live profile.
import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quoteShell } from '../src/native-plugin.mjs';
const target=process.argv[2];
if(process.argv.length!==4||process.argv[3]!=='--experimental-native'||!isAbsolute(target)||resolve(target)!==target)throw Error('explicit_experimental_new_directory_required');
mkdirSync(target,{mode:0o700});
cpSync(fileURLToPath(new URL('../skills',import.meta.url)),join(target,'skills'),{recursive:true});
const bin=fileURLToPath(new URL('../bin/psst-antigravity-native.mjs',import.meta.url));
const hook={type:'command',command:`${quoteShell(process.execPath)} ${quoteShell(bin)} hook`,timeout:5};
writeFileSync(join(target,'plugin.json'),JSON.stringify({name:'psst-native',description:'EXPERIMENTAL Psst native CLI pilot; automatic wakeup acceptance not certified.'},null,2));
writeFileSync(join(target,'mcp_config.json'),JSON.stringify({mcpServers:{psst:{command:process.execPath,args:[bin,'serve','--experimental-native']}}},null,2));
writeFileSync(join(target,'hooks.json'),JSON.stringify({'psst-native-binding':{SessionStart:[{...hook,command:hook.command+' observe'}],PreInvocation:[{...hook,command:hook.command+' observe'}],PreToolUse:[{matcher:'call_mcp_tool|run_command',hooks:[hook]}]}},null,2));
console.log(JSON.stringify({pluginDirectory:target,installed:false,experimental:true}));
