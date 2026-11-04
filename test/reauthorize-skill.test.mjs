import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NATIVE_DEFINITIONS } from '../src/native-plugin.mjs';

test('packaged slash skill dispatches through existing setup schema without invented replacement arguments', () => {
 const skill=readFileSync(new URL('../skills/psst-reauthorize/SKILL.md',import.meta.url),'utf8');
 assert.match(skill,/name: psst-reauthorize/);
 assert.match(skill,/broker_setup_status/);assert.match(skill,/broker_url/);
 assert.match(skill,/After confirmation call broker_setup with only broker_url/);
 assert.match(skill,/There is no replace argument/);assert.match(skill,/model turn, not a token-free/);
 assert.match(skill,/does NOT revoke/);assert.match(skill,/WaitMsBeforeAsync=500/);
 const setup=NATIVE_DEFINITIONS.find(tool=>tool.name==='broker_setup');
 assert.deepEqual(Object.keys(setup.inputSchema.properties).sort(),['__psst_permit','broker_url']);
 assert.deepEqual(setup.inputSchema.required,['broker_url']);
 assert.equal(setup.inputSchema.additionalProperties,false);
});
