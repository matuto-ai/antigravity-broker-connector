import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composerState} from './composer-state.mjs';
const screen=JSON.parse(readFileSync(new URL('./recorded-composer-screen.json',import.meta.url),'utf8'));
test('observed fixture idle composer is recognized',()=>assert.equal(composerState(screen).ready,true));
test('unknown or active prompt and permission overlays never receive input',()=>{
 for(const value of ['',null,screen.replace('\n>\n','\n> in progress\n'),screen.replace('? for shortcuts','enter Confirm'),screen+'\nAllow this tool?',screen.replace('/tmp/proof','/home/user'),screen.replace('1.4.7','1.4.8'),screen+'\u001b'])assert.equal(composerState(value).ready,false);
});
