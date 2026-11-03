import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {continuityEvidence} from './continuity-evidence.mjs';
const observed=JSON.parse(readFileSync(new URL('./recorded-compact-observations.json',import.meta.url)));
test('recorded native compact preserves root and has two separately completed probes',()=>{
 assert.equal(continuityEvidence('compact',observed.mcp,observed.hook),true);
 assert.equal(continuityEvidence('new',observed.mcp,observed.hook),false);
});
test('continuity rejects missing completion, child provenance and host replacement',()=>{
 assert.equal(continuityEvidence('compact',observed.mcp,observed.hook.slice(0,-1)),false);
 const mcp=structuredClone(observed.mcp);mcp[1].meta['antigravity.google/conversation_id']='00000000-0000-4000-8000-000000000001';
 assert.equal(continuityEvidence('compact',mcp,observed.hook),false);
 const hook=structuredClone(observed.hook);hook.at(-1).hostStart='different';
 assert.equal(continuityEvidence('compact',observed.mcp,hook),false);
});
