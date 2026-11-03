// Pure fake-provider state machine: normal native lazy wrapper, only two granted tools.
import assert from 'node:assert/strict';
import {ACTUAL_SERVER,ACTUAL_TOOLS} from './actual-plugin-fixture.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function objects(value,depth=0){
 if(depth>12)return [];
 if(typeof value==='string'){try{return objects(JSON.parse(value),depth+1);}catch{return [];}}
 if(!value||typeof value!=='object')return [];
 return [value,...Object.values(value).flatMap(v=>objects(v,depth+1))];
}
export function actualProviderStep(input,state){
 const next={...state};let identity;
 const responses=(input.contents??[]).flatMap(c=>c.parts??[]).filter(p=>p.functionResponse?.name==='call_mcp_tool').map(p=>p.functionResponse.response);
 if(next.sent>next.completed){
  assert(responses.length,'missing native tool response');
  const found=objects(responses.at(-1));
  if(next.completed===0)assert(found.some(v=>v.connected===true&&v.mode==='automatic_required'),'actual setup status not connected');
  else {const value=found.find(v=>v.native_session_binding===true&&v.endpoint_scope==='experimental_native_conversation'&&uuid.test(v.conversation_id??'')&&typeof v.client_id==='string');
   assert(value,'actual identity response missing');identity={conversation_id:value.conversation_id,client_id:value.client_id,native_session_binding:true,endpoint_scope:value.endpoint_scope};}
  next.completed++;
 }
 if(next.sent<ACTUAL_TOOLS.length){
  const declarations=input.tools?.flatMap(t=>t.functionDeclarations??[])??[];
  // Native title/warmup requests have no tools. Never advance the proof on these.
  if(declarations.length===0&&state.sent===state.completed)return {state:next,identity,parts:[{text:'OFFLINE_ACTUAL_PROBE_READY'}]};
  const def=declarations.find(f=>f.name==='call_mcp_tool');
  const schema=def?.parametersJsonSchema??def?.parameters;
  assert(['ServerName','ToolName','Arguments'].every(k=>schema?.properties?.[k])&&(!schema.properties.Arguments.type||schema.properties.Arguments.type==='object'),'unsupported actual lazy schema');
  const tool=ACTUAL_TOOLS[next.sent++];
  return {state:next,identity,parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:ACTUAL_SERVER,ToolName:tool,Arguments:{}}}}]};
 }
 return {state:next,identity,parts:[{text:'OFFLINE_ACTUAL_PROBE_FINISHED'}]};
}
