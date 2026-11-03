// Test-only: issue a real native background command; final proof requires native
// Stop plus a live waiter, subsequent unsolicited model invocation and explicit ACK.
import assert from 'node:assert/strict';
const commandPattern=/^'\/usr\/local\/bin\/node' '\/plugin\/bin\/psst-antigravity-native\.mjs' (?:wait|wait-approval) '\/tmp\/proof-home\/\.config\/psst\/antigravity\/native\/[0-9]+-[0-9]+-[0-9a-f-]+'$/;
export function waiterProviderStep(input,state,command){
 assert(typeof command==='string'&&commandPattern.test(command),'exact disposable native waiter command required');
 const next={...state};let diagnostic={stage:'command_response'};
 try{
 if(next.sent>next.completed){
  const parts=(input.contents??[]).flatMap(c=>(c.parts??[]).map(p=>({...p,role:c.role})));
  const index=parts.findLastIndex(p=>p.functionResponse?.name==='run_command');
  assert(index>=0,'missing native waiter command response');
  const response=parts[index].functionResponse,call=parts.slice(0,index).findLast(p=>p.functionCall);
  diagnostic={stage:'command_response',modelCall:call?.role==='model',runCommand:call?.functionCall?.name==='run_command',originalCommand:call?.functionCall?.args?.CommandLine===command,appendedPermit:typeof call?.functionCall?.args?.CommandLine==='string'&&call.functionCall.args.CommandLine.startsWith(command+" '")&&/ '[0-9a-f-]{36}'$/.test(call.functionCall.args.CommandLine),summaryMatches:call?.functionCall?.args?.toolSummary==='Native Psst fixture waiter',asyncMatches:call?.functionCall?.args?.WaitMsBeforeAsync===500};
  assert.equal(call?.role,'model');assert.equal(call?.functionCall.name,'run_command');
  assert.equal(call.functionCall.args.CommandLine,command);assert.equal(call.functionCall.args.toolSummary,'Native Psst fixture waiter');assert.equal(call.functionCall.args.WaitMsBeforeAsync,500);
  if(call.functionCall.id!==undefined||response.id!==undefined)assert.equal(call.functionCall.id,response.id);
  assert(response.response&&typeof response.response==='object'&&!response.response.error,'native waiter response failed');
  next.completed++;
 }
 if(next.sent===0){
  const declarations=input.tools?.flatMap(t=>t.functionDeclarations??[])??[];
  const def=declarations.find(f=>f.name==='run_command'),schema=def?.parametersJsonSchema??def?.parameters;
  diagnostic={stage:'command_schema',declared:Boolean(def),properties:Object.fromEntries(['CommandLine','toolSummary','WaitMsBeforeAsync','Cwd','IsDaemon'].map(key=>[key,Boolean(schema?.properties?.[key])]))};
  assert(['CommandLine','toolSummary','WaitMsBeforeAsync'].every(k=>schema?.properties?.[k]),'native background command schema required');
  next.sent++;
  return {state:next,parts:[{functionCall:{name:'run_command',args:{CommandLine:command,toolSummary:'Native Psst fixture waiter',WaitMsBeforeAsync:500}}}]};
 }
 return {state:next,parts:[{text:'OFFLINE_WAITER_ARMED'}]};
 }catch(error){error.proofDiagnostics=diagnostic;throw error;}
}
