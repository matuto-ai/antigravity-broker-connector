import test from 'node:test';import assert from 'node:assert/strict';
import {actualCompactContinuity,matchingIdleStop} from './actual-compact-state.mjs';
const id={conversation_id:'root',client_id:'client'},snap={admittedRoot:'root',clientId:'client',inboxPath:'/fixture/journal',rootGeneration:1,ownerEpoch:'epoch',host:{pid:10,start:'11'},connectorProcess:{pid:12,start:'13'}};
test('compact preserves actual identity and owner state',()=>assert(actualCompactContinuity([id,{...id}],[snap,structuredClone(snap)])));
test('compact rejects changed root, client, journal, generation or owner',()=>{
 for(const key of ['conversation_id','client_id'])assert(!actualCompactContinuity([id,{...id,[key]:'changed'}],[snap,snap]));
 for(const [key,value] of Object.entries({admittedRoot:'changed',inboxPath:'/other',rootGeneration:2,ownerEpoch:'other',host:{pid:14},connectorProcess:{pid:15}}))assert(!actualCompactContinuity([id,id],[snap,{...snap,[key]:value}]));
 assert(!actualCompactContinuity([id],[snap]));
});
test('idle Stop must bind actual root environment and native process',()=>{
 const hook={event:'Stop',fullyIdle:true,terminationReason:'model_stop',conversationId:'root',environmentConversationId:'root',hostPid:10,hostStart:'11'};
 assert(matchingIdleStop(hook,snap));for(const [key,value] of Object.entries({fullyIdle:false,conversationId:'child',environmentConversationId:'child',hostPid:99,hostStart:'22',terminationReason:'cancelled'}))assert(!matchingIdleStop({...hook,[key]:value},snap));
});
