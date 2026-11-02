import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {consentState,consentNavigation,postConsentState} from './consent-state-navigation.mjs';
const captured=JSON.parse(readFileSync(new URL('./recorded-consent-screens.json',import.meta.url),'utf8'));
const unchecked=captured[1].screen;
const previous=unchecked.replace('> [ ]','  [ ]').replace('[Previous]','> [Previous]');
const done=unchecked.replace('> [ ]','  [ ]').replace('[Done]','> [Done]');
test('recorded checked screen cannot navigate or accept; actual unchecked screen permits only one down',()=>{
 assert.equal(consentNavigation(consentState(captured[0].screen)).action,'stop');
 assert.deepEqual(consentNavigation(consentState(unchecked)),{action:'down',focus:'checkbox'});
 assert.equal(consentNavigation(consentState(unchecked),'checkbox',1).action,'stop');
});
test('bounded observed checkbox to Previous to Done permits enter only on uniquely focused Done',()=>{
 assert.deepEqual(consentNavigation(consentState(previous),'checkbox',1),{action:'down',focus:'previous'});
 assert.equal(consentNavigation(consentState(done),'previous',2).action,'accept');
 assert.equal(consentNavigation(consentState(previous),'previous',2).action,'stop');
});
test('unfocused Done, multiple markers, checked collection, changed controls and missing footer never accept',()=>{
 for(const value of [unchecked,done.replace('[ ]','[x]'),done.replace('  [ ]','> [ ]'),done.replace('[Done]','[Allow all]')])assert(!consentState(value).mayAccept);
 assert.equal(consentNavigation(consentState(unchecked.replace('↑/↓ Navigate',''))).action,'stop');
 assert.equal(consentNavigation(consentState(unchecked.replace('[Previous]','[Other]'))).action,'stop');
});
test('terms disappearance still cannot send a command into a trust or login modal',()=>{
 for(const value of ['Trust this folder?','Log in','> '])assert.equal(postConsentState(value).maySendCommand,false);
});

test('actual focused Previous renders without brackets and still allows only Down',()=>{const screens=JSON.parse(readFileSync(new URL('./recorded-navigation-screens.json',import.meta.url),'utf8'));const state=consentState(screens.at(-1).screen);assert(state.selectedPrevious);assert(state.unchecked);assert.equal(consentNavigation(state,'checkbox',1).action,'down');assert.equal(state.mayAccept,false);const done=screens.at(-1).screen.replace('>  Previous       [Done]','   [Previous]    > Done');assert.equal(consentNavigation(consentState(done),'previous',2).action,'accept');});
