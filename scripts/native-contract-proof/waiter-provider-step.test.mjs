import test from 'node:test';
import assert from 'node:assert/strict';
import {waiterProviderStep} from './waiter-provider-step.mjs';
const command="'/usr/local/bin/node' '/plugin/bin/psst-antigravity-native.mjs' wait '/tmp/proof-home/.config/psst/antigravity/native/12-12345-01234567-89ab-4abc-8123-123456789abc'";
const tools=[{functionDeclarations:[{name:'run_command',parameters:{properties:{CommandLine:{type:'string'},toolSummary:{type:'string'},WaitMsBeforeAsync:{type:'integer'}}}}]}];
const response=(call,id='one')=>({contents:[{role:'model',parts:[{functionCall:{...call,id:'one'}}]},{role:'user',parts:[{functionResponse:{name:'run_command',id,response:{output:'fixture asynchronous result, not itself acceptance'}}}]}]});
test('native waiter command is exact and correlated; response alone does not claim wake acceptance',()=>{
 const step=waiterProviderStep({tools},{sent:0,completed:0},command);
 assert.deepEqual(step.parts[0].functionCall.args,{CommandLine:command,toolSummary:'Native Psst fixture waiter',WaitMsBeforeAsync:500});
 const done=waiterProviderStep(response(step.parts[0].functionCall),step.state,command);
 assert.equal(done.state.completed,1);assert.equal(done.parts[0].text,'OFFLINE_WAITER_ARMED');
 assert.equal(done.wakeupVerified,undefined);
});
test('fixture rejects another executable, path, subcommand, shell suffix or prefilled permit',()=>{
 for(const value of [command.replace('/usr/local/bin/node','/usr/bin/node'),command.replace('/tmp/proof-home','/home/user'),command.replace(' wait ',' serve '),command+'; echo unsafe',command+" '12345678-1234-4123-8123-123456789abc'"])assert.throws(()=>waiterProviderStep({tools},{sent:0,completed:0},value),/exact disposable/);
 assert.throws(()=>waiterProviderStep({}, {sent:0,completed:0},command),/schema/);
});
test('fixture rejects forged response identity and command target or missing response',()=>{
 const step=waiterProviderStep({tools},{sent:0,completed:0},command),call=step.parts[0].functionCall;
 assert.throws(()=>waiterProviderStep(response(call,'wrong'),step.state,command));
 for(const key of ['CommandLine','toolSummary','WaitMsBeforeAsync'])assert.throws(()=>waiterProviderStep(response({...call,args:{...call.args,[key]:'other'}}),step.state,command));
 assert.throws(()=>waiterProviderStep({},step.state,command),/missing/);
 const failed=response(call);failed.contents[1].parts[0].functionResponse.response={error:'denied'};
 assert.throws(()=>waiterProviderStep(failed,step.state,command),/failed/);
});
