// Real native setup tool responses, never a fixture-written selected installation.
import assert from 'node:assert/strict';
import {ACTUAL_SERVER} from './actual-plugin-fixture.mjs';
import {correlateNativeResponse,decodeNativeToolResponse} from './actual-provider-step.mjs';
const tools=['broker_setup_status','broker_setup'];
export function setupProviderStep(input,state,brokerUrl,expectedRuntime){
 assert(expectedRuntime&&typeof expectedRuntime.name==='string'&&typeof expectedRuntime.version==='string','expected connector runtime required');
 const next={...state};
 if(next.sent>next.completed){
  const value=decodeNativeToolResponse(correlateNativeResponse(input,tools[next.completed]));
  if(next.completed===0){assert.deepEqual(value.connector_runtime,expectedRuntime,'native connector runtime mismatch');assert.equal(value.connected,false);assert.equal(value.state,'setup_needed');}
  else {assert.equal(value.state,'pending');assert.match(value.requestId,/^[0-9a-f-]{36}$/);assert.equal(typeof value.waiter_command,'string');next.requestId=value.requestId;next.waiterCommand=value.waiter_command;}
  next.completed++;
 }
 if(next.sent<2){
  const declarations=input.tools?.flatMap(t=>t.functionDeclarations??[])??[];
  if(!declarations.length&&next.sent===0)return {state:next,parts:[{text:'OFFLINE_SETUP_READY'}]};
  assert(declarations.some(d=>d.name==='call_mcp_tool'),'native setup wrapper missing');
  const tool=tools[next.sent++];
  return {state:next,parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:ACTUAL_SERVER,ToolName:tool,Arguments:tool==='broker_setup'?{broker_url:brokerUrl}:{}}}}]};
 }
 return {state:next,parts:[{text:'OFFLINE_APPROVAL_PENDING'}]};
}
