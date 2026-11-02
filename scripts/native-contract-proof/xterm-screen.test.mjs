import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TerminalScreen} from './xterm-screen.mjs';
import {consentState} from './consent-state.mjs';
const consent='Terms of Service & Data Use\r\nhttps://antigravity.google/terms\r\n[ ] Yes, I agree to help improve Antigravity CLI by allowing\r\n> Accept';
test('recorded native byte replay shows checked collection, never permission to accept',async t=>{
 const s=new TerminalScreen();t.after(()=>s.dispose());await s.write(JSON.parse(readFileSync(new URL('./recorded-terminal.json',import.meta.url),'utf8')));assert(s.complete);assert(s.text().includes('Terms of Service & Data Use'));assert(s.text().includes('[x] Yes, I agree'));assert(!consentState(s.text()).mayAccept);
});
test('pending queue, CSI, OSC and UTF8 all suppress old unchecked acceptance evidence',async t=>{
 for(const [begin,end] of [['\x1b[','2J'],['\x1b]title','\x07'],[Buffer.from([0xe2]),Buffer.from([0x9c,0x93])]]){
  const s=new TerminalScreen();t.after(()=>s.dispose());await s.write(consent);assert(consentState(s.text()).mayAccept);
  const writing=s.write(begin);assert(!s.complete);assert.equal(s.text(),'');await writing;assert(!s.complete);assert.equal(s.text(),'');await s.write(end);assert(s.complete);
 }
});
test('real erase, delete-lines and scroll correctly remove stale acceptance',async t=>{
 for(const sequence of ['\x1b[2J','\x1b[H\x1b[40M','\x1b[40S']){const s=new TerminalScreen();t.after(()=>s.dispose());await s.write(consent);assert(consentState(s.text()).mayAccept);await s.write(sequence);assert(s.complete);assert(!consentState(s.text()).mayAccept);}
});
test('ABI changes fail closed rather than relying on write completion',async t=>{
 const s=new TerminalScreen();t.after(()=>s.dispose());await s.write(consent);s.terminal._core._inputHandler._parser.currentState=undefined;assert(!s.complete);assert.equal(s.text(),'');
});
