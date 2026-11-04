import {nativePermissionBoundaryVerified} from './permission-state.mjs';
import test from 'node:test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {pendingNativeCommandPermission as pending} from './permission-state.mjs';
test('actual native command permission is a stop boundary, never implicit approval',()=>{
 const screen='Command\nRequesting permission for:\n[private fixture command]\nRun this command?\n> Yes, run command\n  No, cancel';
 assert.equal(pending(screen,{trustSent:true,commandObserved:true}),true);
 for(const context of [{},{trustSent:true},{commandObserved:true}])assert.equal(pending(screen,context),false);
 assert.equal(pending('The text says Run this command? but is not a prompt',{trustSent:true,commandObserved:true}),false);
 assert.equal(pending('Run this command?\n'+'x'.repeat(8192),{trustSent:true,commandObserved:true}),false);
});

import {exactWaiterPermission} from './permission-state.mjs';
const expected="'/usr/local/bin/node' '/plugin/bin/psst-antigravity-native.mjs' wait '/tmp/proof-home/.config/psst/antigravity/native/18-13757-5a9f1062-b0ab-4fb9-9a61-72f21db5ee2b' '1ae19951-b8c9-436b-9c05-f1d5a196d6f0'";
const label=expected.slice(0,78)+'...';
const modal=command=>`Command\nRequesting permission for:\n${command}\nRun this command?\n> 1. Yes, run command\n2. Yes, and always allow in this conversation for commands that start with '${label}'\n3. Yes, and always allow for commands that start with '${label}' (Persist to settings.json)\n4. No, cancel\n↑/↓ Navigate · tab Amend · ctrl+g edit/expand command\nesc to cancel fixture`;
test('only exact rendered disposable inbox waiter with one-shot control focused is recognized',()=>{
 assert.equal(exactWaiterPermission(modal(expected),{expectedCommand:expected}).recognized,true);
 assert.equal(exactWaiterPermission(modal(expected.replaceAll("'",'')),{expectedCommand:expected}).recognized,true);
 assert.equal(exactWaiterPermission(modal(expected.replace(" wait "," wait\n")),{expectedCommand:expected}).recognized,true);
 for(const changed of [expected+'; true',expected+' &',expected.replace(' wait ',' wait-approval '),expected.replace('/plugin/','/other/'),expected.replace('18-13757','19-13757'),expected.replace('1ae19951','2ae19951'),expected.slice(0,-10)+'...']) {
  assert.equal(exactWaiterPermission(modal(changed),{expectedCommand:expected}).recognized,false);
 }
 for(const changed of [modal(expected).replace('> 1. Yes, run command','1. Yes, run command').replace('2. Yes, and always allow in','> 2. Yes, and always allow in'),modal(expected).replace('4. No, cancel','> 4. No, cancel'),modal(expected)+'\nRun this command?',modal(expected)+'\nRemember this choice: [x]',modal(expected).replace('4. No, cancel','[x] Remember this choice\n4. No, cancel'),modal(expected).replace('Persist to settings.json','Persist to unknown.json'),modal(expected).replace('Requesting permission for:','Possible command:'),'\x1b[0m'+modal(expected),modal(expected)+'x'.repeat(16384)]) {
  assert.equal(exactWaiterPermission(changed,{expectedCommand:expected}).recognized,false);
 }
 assert.equal(exactWaiterPermission(modal(expected)).recognized,false);
 assert.equal(exactWaiterPermission(modal(expected+'; true'),{expectedCommand:expected+'; true'}).recognized,false);
});

test('footer diagnostics expose only bounded key hints, never an arbitrary footer',()=>{
 assert.deepEqual(exactWaiterPermission(modal(expected),{expectedCommand:expected}).footerDiagnostic,{key:'tab',label:'Amend'});
 for(const replacement of ['12345678-1234-4123-8123-123456789abc','aQp8q0Idmp5vbwW3utK8lH45nm9sPnQ','[x] Remember']){
  assert.equal(exactWaiterPermission(modal(expected).replace('tab Amend',replacement),{expectedCommand:expected}).footerDiagnostic,null);
 }
});

test('approval waiter uses the same exact one-time UI contract and cannot substitute its target',()=>{
 const approval=expected.replace(' wait ',' wait-approval ');
 const approvalModal=modal(approval).replaceAll(label,approval.slice(0,78)+'...');
 assert.equal(exactWaiterPermission(approvalModal,{expectedCommand:approval}).recognized,true);
 assert.equal(exactWaiterPermission(approvalModal,{expectedCommand:expected}).recognized,false);
 assert.equal(exactWaiterPermission(approvalModal.replace('18-13757','19-13757'),{expectedCommand:approval}).recognized,false);
 assert.equal(exactWaiterPermission(approvalModal.replace('1ae19951','2ae19951'),{expectedCommand:approval}).recognized,false);
 assert.equal(exactWaiterPermission(approvalModal.replace('> 1. Yes','1. Yes').replace('2. Yes','> 2. Yes'),{expectedCommand:approval}).recognized,false);
});

test('permission boundary cannot count prompt observation as execution or arrival acceptance',()=>{
 const valid={mode:'setup',confirmationBudget:0,permissionConfirmations:0,nativePermissionBlocked:true,provenanceVerified:true,commandCount:1,promptRecognized:true,inboxProcesses:0,approvalProcesses:0,waiterCompleted:0,approvalWaiterCompleted:0,rearmCompleted:0,messagesCompleted:0,idleSeeded:false,approvalGranted:false,permissionsUnchanged:true,shutdownVerified:true,boundaryStopSignalSent:true,nativeExit:null,nativeSignal:'SIGTERM',providerFailure:null,parserFailed:false,timedOut:false,overflow:false,collectionUnchecked:true,termsAccepted:true,trustConfirmationSent:true,consentBlocked:false};
 assert.equal(nativePermissionBoundaryVerified(valid),true);
 // The real util-linux PTY wrapper also exits 0 after handling our SIGTERM.
 assert.equal(nativePermissionBoundaryVerified({...valid,nativeSignal:null,nativeExit:0}),true);
 for(const nativeExit of [1,130,143,null])assert.equal(nativePermissionBoundaryVerified({...valid,nativeSignal:null,nativeExit}),false);
 assert.equal(nativePermissionBoundaryVerified({...valid,nativeSignal:null,nativeExit:0,boundaryStopSignalSent:false}),false);
 for(const mode of ['idle','busy'])assert.equal(nativePermissionBoundaryVerified({...valid,mode}),true);
 for(const [key,value] of Object.entries(valid)){
  const invalid=typeof value==='boolean'?!value:typeof value==='number'?value+1:value===null?'failure':'invalid';
  assert.equal(nativePermissionBoundaryVerified({...valid,[key]:invalid}),false,key);
 }
});

test('PTY wrapper termination is recorded separately from the requested stop signal', {timeout:5000}, async t=>{
 const source='process.on("SIGHUP",()=>process.exit(0));setTimeout(()=>process.exit(99),3500);console.log("WRAPPER_READY")';
 const child=spawn('script',['-q','-e','-c',`${process.execPath} -e '${source}'`,'/dev/null'],{stdio:['pipe','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 let stopSignalSent=false,output='';
 child.stdout.on('data',chunk=>{
  output+=chunk;
  if(!stopSignalSent&&output.includes('WRAPPER_READY'))stopSignalSent=child.kill('SIGTERM');
 });
 const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 assert.equal(stopSignalSent,true);
 assert((result.signal==='SIGTERM'&&result.code===null)||(result.signal===null&&result.code===0),JSON.stringify(result));
});
