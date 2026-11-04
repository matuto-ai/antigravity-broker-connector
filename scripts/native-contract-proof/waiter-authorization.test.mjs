import test from 'node:test';
import assert from 'node:assert/strict';
import {waiterAuthorizationPlan as plan,expectedWaiterPhase as phase} from './waiter-authorization.mjs';
const input=(mode='idle')=>({mode,setup:{completed:2},approval:{sent:1,completed:1},approvalGranted:true,turn:{completed:2},inbox:{sent:1,completed:0},messages:{completed:0},messageTools:6,rearm:{sent:0,completed:0},idleSeeded:false,busyInjection:false});
test('single matrix has only the authorized 2/3/2 phases and no arbitrary cap',()=>{
 assert.deepEqual(plan('idle','--confirm-authorized-matrix'),['inbox','rearm']);
 assert.deepEqual(plan('setup','--confirm-authorized-matrix'),['approval','inbox','rearm']);
 assert.deepEqual(plan('busy','--confirm-authorized-matrix'),['inbox','rearm']);
 assert.equal(['idle','setup','busy'].flatMap(mode=>plan(mode,'--confirm-authorized-matrix')).length,7);
 assert.deepEqual(plan('idle','--confirm-waiter-once'),['inbox']);
 assert.deepEqual(plan('setup',undefined),[]);
 for(const [mode,flag] of [['setup','--confirm-waiter-once'],['root','--confirm-authorized-matrix'],['idle','--confirm=99']])assert.throws(()=>plan(mode,flag));
});
test('each approval requires its exact current phase and cannot replay or exceed the cap',()=>{
 for(const mode of ['idle','busy','setup']){
  const p=plan(mode,'--confirm-authorized-matrix'),s=input(mode),start=mode==='setup'?1:0;
  assert.equal(phase(p,start,s),'inbox');
  assert.equal(phase(p,start+1,s),null,'same prompt cannot spend next phase');
  s.inbox.completed=1;s.messages.completed=6;s.rearm.sent=1;s.idleSeeded=true;s.busyInjection=mode==='busy';
  assert.equal(phase(p,start+1,s),'rearm');
  s.messages.completed=5;assert.equal(phase(p,start+1,s),null);s.messages.completed=6;
  s.rearm.completed=1;assert.equal(phase(p,start+1,s),null);
  assert.equal(phase(p,p.length,s),null);assert.equal(phase(p,-1,s),null);
 }
 const setup=input('setup');setup.approvalGranted=false;setup.approval.completed=0;setup.turn.completed=0;
 assert.equal(phase(plan('setup','--confirm-authorized-matrix'),0,setup),'approval');
 setup.approvalGranted=true;assert.equal(phase(plan('setup','--confirm-authorized-matrix'),0,setup),null);
});

test('remaining setup grant cannot repeat idle/busy or authorize a third setup command',()=>{
 const p=plan('setup','--confirm-remaining-setup');assert.deepEqual(p,['approval','inbox']);
 for(const mode of ['idle','busy','root'])assert.throws(()=>plan(mode,'--confirm-remaining-setup'));
 const s=input('setup');assert.equal(phase(p,1,s),'inbox');
 s.inbox.completed=1;s.messages.completed=6;s.rearm.sent=1;s.idleSeeded=true;assert.equal(phase(p,2,s),null);
});

test('permission-boundary observation grants no execution in any automatic mode',()=>{
 for(const mode of ['idle','setup','busy'])assert.deepEqual(plan(mode,'--expect-permission-boundary'),[]);
 assert.throws(()=>plan('root','--expect-permission-boundary'));
});
