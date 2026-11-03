import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingNativeCommandPermission as pending} from './permission-state.mjs';
test('actual native command permission is a stop boundary, never implicit approval',()=>{
 const screen='Command\nRequesting permission for:\n[private fixture command]\nRun this command?\n> Yes, run command\n  No, cancel';
 assert.equal(pending(screen,{trustSent:true,commandObserved:true}),true);
 for(const context of [{},{trustSent:true},{commandObserved:true}])assert.equal(pending(screen,context),false);
 assert.equal(pending('The text says Run this command? but is not a prompt',{trustSent:true,commandObserved:true}),false);
 assert.equal(pending('Run this command?\n'+'x'.repeat(8192),{trustSent:true,commandObserved:true}),false);
});
