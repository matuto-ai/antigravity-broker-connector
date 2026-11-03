import test from 'node:test';import assert from 'node:assert/strict';import {consentState,postConsentState} from './consent-state.mjs';
const base='Terms of Service & Data Use\nhttps://antigravity.google/terms\n';const option='Yes, I agree to help improve Antigravity CLI by allowing';
test('checked focused collection permits only toggle never acceptance',()=>{const s=consentState(base+'> [x] '+option+'\n  Accept');assert(s.mayUncheck);assert(!s.mayAccept);});
test('unchecked collection requires positively selected acceptance control',()=>{assert(!consentState(base+'> [ ] '+option+'\nAccept').mayAccept);assert(consentState(base+'  [ ] '+option+'\n> Accept and continue').mayAccept);});
test('ambiguous or stale conflicting state does not permit acceptance',()=>{assert(!consentState(base+'[ ] '+option+'\n[x] '+option+'\n> Accept').mayAccept);assert(!consentState('Terms\n[ ] '+option+'\n> Accept').mayAccept);assert(!consentState(base+'[ ] different collection\n> Accept').mayAccept);});

test('terms disappearing into trust login or unknown composer never permits commands',()=>{for(const screen of ['Trust this folder?\n> Yes','Sign in to continue','Enter API key:','> ']){const result=postConsentState(screen);assert.equal(result.maySendCommand,false);assert.equal(result.action,'stop_post_consent_composer_unverified');}});

test('multiple focus lines never authorize checkbox or acceptance input',()=>{assert(!consentState(base+'> [ ] '+option+'\n> Accept').mayAccept);assert(!consentState(base+'> [x] '+option+'\n> Accept').mayUncheck);});
