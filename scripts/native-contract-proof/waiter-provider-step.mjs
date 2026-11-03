// Test-only: issue a real native background command; final proof requires native
// Stop plus a live waiter, subsequent unsolicited model invocation and explicit ACK.
import assert from 'node:assert/strict';
const commandPattern=/^'\/usr\/local\/bin\/node' '\/plugin\/bin\/psst-antigravity-native\.mjs' wait '\/tmp\/proof-home\/\.config\/psst\/antigravity\/native\/[0-9]+-[0-9]+-[0-9a-f-]+'$/;
export function waiterProviderStep(input,state,command){
 assert(typeof command==='string'&&commandPattern.test(command),'exact disposable native waiter command required');
 const next={...state};
 if(next.sent>next.completed){
  const parts=(input.contents??[]).flatMap(c=>(c.parts??[]).map(p=>({...p,role:c.role})));
  const index=parts.findLastIndex(p=>p.functionResponse?.name==='run_command');
  assert(index>=0,'missing native waiter command response');
  const response=parts[index].functionResponse,call=parts.slice(0,index).findLast(p=>p.functionCall);
  assert.equal(call?.role,'model');assert.equal(call?.functionCall.name,'run_command');
  assert.equal(call.functionCall.args.CommandLine,command);assert.equal(call.functionCall.args.Cwd,'/tmp/proof');assert.equal(call.functionCall.args.WaitMsBeforeAsync,500);
  if(call.functionCall.id!==undefined||response.id!==undefined)assert.equal(call.functionCall.id,response.id);
  assert(response.response&&typeof response.response==='object'&&!response.response.error,'native waiter response failed');
  next.completed++;
 }
 if(next.sent===0){
  const declarations=input.tools?.flatMap(t=>t.functionDeclarations??[])??[];
  const def=declarations.find(f=>f.name==='run_command'),schema=def?.parametersJsonSchema??def?.parameters;
  assert(['CommandLine','Cwd','WaitMsBeforeAsync'].every(k=>schema?.properties?.[k]),'native background command schema required');
  next.sent++;
  return {state:next,parts:[{functionCall:{name:'run_command',args:{CommandLine:command,Cwd:'/tmp/proof',WaitMsBeforeAsync:500}}}]};
 }
 return {state:next,parts:[{text:'OFFLINE_WAITER_ARMED'}]};
}
