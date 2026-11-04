// Test-only. Must run in a Docker --network none container, never on a user host.
import {prepareActualPluginFixture} from './actual-plugin-fixture.mjs';
import {actualCompactContinuity,actualRootRotation,matchingIdleStop} from './actual-compact-state.mjs';
import {presenceProviderStep} from './presence-provider-step.mjs';
import {pendingNativeCommandPermission,exactWaiterPermission,nativePermissionBoundaryVerified} from './permission-state.mjs';
import {setupProviderStep} from './setup-provider-step.mjs';
import {waiterAuthorizationPlan,expectedWaiterPhase} from './waiter-authorization.mjs';
import {stoppedNativeWaiter,completedNativeDelivery} from './waiter-boundary.mjs';
import {waiterProviderStep} from './waiter-provider-step.mjs';
import {messageProviderStep,MESSAGE_TOOLS} from './message-provider-step.mjs';
import {actualProviderStep} from './actual-provider-step.mjs';
import {composerState} from './composer-state.mjs';
import {trustState} from './trust-state.mjs';
import {TerminalScreen} from './xterm-screen.mjs';
import {consentState,postConsentState,consentNavigation,navigationRenderState} from './consent-state-navigation.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyArtifactPackage} from './candidate-artifact.mjs';
import {DatabaseSync} from 'node:sqlite';
import {networkInterfaces} from 'node:os';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
// Fail before native binary startup if the required isolation is absent.
assert.deepEqual(Object.keys(networkInterfaces()).filter(name=>name!=='lo'),[],'non-loopback network interface');
for(const line of readFileSync('/proc/net/route','utf8').trim().split('\n').slice(1))assert.equal(line.trim().split(/\s+/)[0],'lo','external IPv4 route');
for(const line of readFileSync('/proc/net/ipv6_route','utf8').trim().split('\n').filter(Boolean))assert.equal(line.trim().split(/\s+/).at(-1),'lo','external IPv6 route');
assert.equal(process.env.HOME,'/tmp/proof-home');
const artifactEvidence=JSON.parse(readFileSync('/candidate.json','utf8'));
const expectedRuntime=verifyArtifactPackage({packageRoot:'/plugin',evidence:artifactEvidence});
const {CONNECTOR_RUNTIME}=await import('/plugin/src/runtime-info.mjs');
assert.deepEqual(CONNECTOR_RUNTIME,expectedRuntime,'loaded connector package metadata mismatch');
const {processIdentity}=await import('/plugin/src/native-binding.mjs');
const {readPrivateJson}=await import('/plugin/src/native-plugin.mjs');
const mode=process.argv[2]??'root';assert(['root','compact','new','presence','messages','idle','setup','busy'].includes(mode));
const interactive=['compact','new','idle','setup','busy'].includes(mode);
const home='/tmp/proof-home',root='/tmp/proof';mkdirSync(root,{mode:0o700});mkdirSync(home+'/.gemini/antigravity-cli',{recursive:true,mode:0o700});mkdirSync(home+'/.gemini/config',{recursive:true,mode:0o700});
assert(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink()&&realpathSync(root)==='/tmp/proof','fresh_fixture_workspace_required');
const fixture=await prepareActualPluginFixture({root,home,pluginRoot:'/plugin',brokerRoot:'/psst',tlsDirectory:'/fixture-tls',presence:mode==='presence',messages:['messages','idle','setup','busy'].includes(mode),wakeup:['idle','setup','busy'].includes(mode),approvalSetup:mode==='setup'});
const events=fixture.eventsFile;
writeFileSync(home+'/.gemini/config/hooks.json',JSON.stringify(fixture.hooks));
writeFileSync(home+'/.gemini/config/mcp_config.json',JSON.stringify(fixture.mcp));
let turn={sent:0,completed:0},presenceState={sent:0,completed:0},presenceProof=null,messageState={sent:0,completed:0},messageProof=null,messageBoundaries=[],providerFailure=null,providerDiagnostics=null;const requests=[],identities=[],snapshots=[];
const confirmationPlan=waiterAuthorizationPlan(mode,process.argv[3]);
const expectPermissionBoundary=process.argv[3]==='--expect-permission-boundary';
let boundaryObservation=null,permissionOwner=null,boundaryStopSignalSent=false;
const setupFirstDeliveryOnly=mode==='setup'&&process.argv[3]==='--confirm-remaining-setup';
let firstDeliveryStopped=false;
const oneShotAuthorized=confirmationPlan.length>0;
const confirmedCommands={approval:null,inbox:null,rearm:null},confirmedDigests=[];
let permissionHookCount=0;
let permissionConfirmations=0,permissionVersion=-1,permissionSentAt=0,permissionDismissed=false,permissionDiagnostics=null;
let nativePermissionBlocked=false,fixtureShutdownRequested=false;
let busyInjection=false,providerActive=0,providerMaxActive=0;
let setupState={sent:0,completed:0},approvalWaiterState={sent:0,completed:0},approvalGranted=false;
let waiterState={sent:0,completed:0},rearmState={sent:0,completed:0},idleSeeded=false,idleStopped=false,rearmStopped=false,waiterProcesses=[];
function snapshot(identity){
 const base=home+'/.config/psst/antigravity/native';
 const owners=readdirSync(base).map(name=>base+'/'+name).filter(path=>existsSync(path+'/owner.json'));
 assert.equal(owners.length,1,'one actual native MCP owner required');
 const owner=JSON.parse(readFileSync(owners[0]+'/owner.json','utf8'));
 const session=JSON.parse(readFileSync(owners[0]+'/session.json','utf8'));
 assert.equal(session.conversationId,identity.conversation_id);assert.equal(session.clientId,identity.client_id);assert.equal(session.connected,true);
 assert(session.inboxPath.startsWith(mode==='setup'?fixture.installationDirectory+'/approvals/':root+'/actual-plugin/enrollment/state/'),'journal outside fixture enrollment state');
 assert(lstatSync(session.inboxPath).isFile()&&!lstatSync(session.inboxPath).isSymbolicLink());
 const bindingDb=new DatabaseSync(owners[0]+'/binding.sqlite',{readOnly:true});let admittedRoot,rootGeneration;
 try{admittedRoot=bindingDb.prepare('SELECT conversation FROM binding WHERE id=1').get()?.conversation;const state=bindingDb.prepare('SELECT generation,strict_admission_required FROM root_state WHERE id=1').get();assert.equal(admittedRoot,identity.conversation_id);assert.equal(state.strict_admission_required,1);rootGeneration=state.generation;}finally{bindingDb.close();}
 return {admittedRoot,rootGeneration,host:owner.host,connectorProcess:owner.connectorProcess,ownerEpoch:owner.ownerEpoch,conversationId:session.conversationId,clientId:session.clientId,inboxPath:session.inboxPath};
}
function messageRow(){
 const db=new DatabaseSync(snapshots[0].inboxPath,{readOnly:true});
 try{return db.prepare('SELECT i.state,i.native_receipt,r.acknowledged_at FROM inbox i LEFT JOIN cooperative_receipts r ON r.message_id=i.message_id WHERE i.message_id=?').get(messageProof.messageId);}finally{db.close();}
}
async function waitForInbound(){
 const until=Date.now()+5000;
 while(Date.now()<until){const row=messageRow();if(row){assert.equal(row.state,'pending');assert.equal(row.native_receipt,null);assert.equal(row.acknowledged_at,null);return;}await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('native inbound durable receipt timeout');
}
function recordMessageBoundary(){
 const row=messageRow(),consumed=messageState.completed>=4;
 assert(row,'native inbox row missing');assert.equal(row.state,consumed?'consumed':'pending');assert.equal(row.native_receipt,null,'explicit read must not fabricate native consumption');
 assert.equal(row.acknowledged_at!==null,consumed,'only explicit ACK may consume');
 if(messageState.outgoingId)fixture.verifyMessages(messageProof,messageState.outgoingId);
 messageBoundaries.push({completed:messageState.completed,pending:!consumed,acknowledged:consumed,nativeReceipt:false});
}
function diagnosticNativeState(){
 try{
  const base=home+'/.config/psst/antigravity/native';
  const owners=readdirSync(base).map(name=>base+'/'+name).filter(path=>existsSync(path+'/owner.json'));
  if(owners.length!==1)return {ownerCount:owners.length};
  const session=JSON.parse(readFileSync(owners[0]+'/session.json','utf8'));
  const db=new DatabaseSync(owners[0]+'/binding.sqlite',{readOnly:true});
  try{const bound=db.prepare('SELECT conversation FROM binding WHERE id=1').get();const state=db.prepare('SELECT generation,strict_admission_required FROM root_state WHERE id=1').get();return {ownerCount:1,connected:session.connected===true,disabled:session.disabled===true,nativeBound:typeof bound?.conversation==='string',generation:state?.generation,strictAdmission:state?.strict_admission_required===1,selectionExists:existsSync(fixture.installationDirectory+'/selected.json')};}finally{db.close();}
 }catch{return {stateReadable:false};}
}
const provider=createServer(async(req,res)=>{if(requests.length>=20){res.writeHead(429);res.end();return;}let b='';for await(const c of req){b+=c;if(b.length>2097152){res.writeHead(413);res.end();return;}}const input=JSON.parse(b||'{}'),tracked=Array.isArray(input.tools);if(tracked){providerActive++;providerMaxActive=Math.max(providerMaxActive,providerActive);}requests.push({path:req.url,hasTools:Array.isArray(input.tools)});let response;
 if(req.url.toLowerCase().includes('counttokens'))response={totalTokens:1};
 else {let parts;
 try {
  let step;
  if(mode==='setup'&&setupState.completed<2){step=setupProviderStep(input,setupState,fixture.brokerUrl,expectedRuntime);setupState=step.state;if(setupState.completed===2){assert.equal(fixture.enrollmentPostCount,1);assert(!existsSync(fixture.installationDirectory+'/selected.json'),'pending setup must not select credentials');step=waiterProviderStep(input,approvalWaiterState,setupState.waiterCommand,{confirmedCommand:confirmedCommands.approval});approvalWaiterState=step.state;}}
  else if(mode==='setup'&&approvalWaiterState.completed===0){step=waiterProviderStep(input,approvalWaiterState,setupState.waiterCommand,{confirmedCommand:confirmedCommands.approval});approvalWaiterState=step.state;}
  else if(['idle','setup','busy'].includes(mode)&&turn.completed===2){
   if(waiterState.completed===0){step=waiterProviderStep(input,waiterState,turn.waiterCommand,{confirmedCommand:confirmedCommands.inbox});waiterState=step.state;if(mode==='busy'&&waiterState.completed===1){assert.equal(activeWaiters(),1);messageProof=fixture.seedMessages(identities[0].client_id);idleSeeded=true;busyInjection=true;await waitForInbound();await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(messageRow().state,'pending');assert.equal(providerMaxActive,1,'native must not overlap model turns on a busy arrival');}}
   else if(messageState.completed<MESSAGE_TOOLS.length){assert(idleSeeded&&messageProof,'unsolicited wake must follow actual stopped-turn waiter and durable arrival');step=messageProviderStep(input,messageState,messageProof);const advanced=step.state.completed>messageState.completed;messageState=step.state;if(advanced)recordMessageBoundary();if(messageState.completed===MESSAGE_TOOLS.length&&!setupFirstDeliveryOnly){step=waiterProviderStep(input,rearmState,turn.waiterCommand,{confirmedCommand:confirmedCommands.rearm});rearmState=step.state;}}
   else if(setupFirstDeliveryOnly){step={parts:[{text:'OFFLINE_NATIVE_MESSAGE_CONTEXT_VERIFIED'}]};}
   else {step=waiterProviderStep(input,rearmState,turn.waiterCommand,{confirmedCommand:confirmedCommands.rearm});rearmState=step.state;}
  }
  else if(mode==='messages'&&turn.completed===2){step=messageProviderStep(input,messageState,messageProof);const advanced=step.state.completed>messageState.completed;messageState=step.state;if(advanced)recordMessageBoundary();}
  else if(mode==='presence'&&turn.completed===2){step=presenceProviderStep(input,presenceState,presenceProof);presenceState=step.state;}
  else {if(mode==='setup')assert(approvalGranted,'setup continuation must follow native background approval notice');step=actualProviderStep(input,turn,expectedRuntime);turn=step.state;}
  parts=step.parts;
  if(step.identity){
   identities.push(step.identity);snapshots.push(snapshot(step.identity));
   if(mode==='presence'){presenceProof=fixture.seedPresence(step.identity.client_id);const next=presenceProviderStep(input,presenceState,presenceProof);presenceState=next.state;parts=next.parts;}
   if(['idle','setup','busy'].includes(mode)){const next=waiterProviderStep(input,waiterState,turn.waiterCommand,{confirmedCommand:confirmedCommands.inbox});waiterState=next.state;parts=next.parts;}
   if(mode==='messages'){messageProof=fixture.seedMessages(step.identity.client_id);await waitForInbound();const next=messageProviderStep(input,messageState,messageProof);messageState=next.state;parts=next.parts;}
  }
 } catch(error){providerFailure=['native background command schema required','exact disposable native waiter command required','missing native waiter command response','native waiter response failed','actual setup status not connected','native setup wrapper missing','unsupported_native_response_envelope'].includes(error.message)?error.message:'native_fixture_assertion_failed';providerDiagnostics={response:error.proofDiagnostics??null,nativeState:diagnosticNativeState()};parts=[{text:'OFFLINE_ACTUAL_PROOF_FAILED'}];}
 requests.at(-1).tool=parts[0]?.functionCall?.args?.ToolName;
 response={candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1,totalTokenCount:2}};}
 if(tracked)providerActive--;const sse=req.url.includes('alt=sse');res.writeHead(200,{'content-type':sse?'text/event-stream':'application/json'});res.end(sse?'data: '+JSON.stringify(response)+'\n\n':JSON.stringify(req.url.toLowerCase().includes('streamgenerate')?[response]:response));});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${provider.address().port}`;
writeFileSync(home+'/.gemini/antigravity-cli/settings.json',JSON.stringify({permissions:fixture.permissions,colorScheme:'terminal',modelProvider:'gemini',model:'fixture',customModelsConfig:{customModels:{fixture:{modelName:'gemini-api://offline-fixture/models/fixture',label:'fixture',apiProvider:'API_PROVIDER_GOOGLE_GEMINI',toolFormatterType:'TOOL_FORMATTER_TYPE_NONE'}}}}));
const setupPrompt=`Set up Psst using only ${fixture.brokerUrl}. Arm the approval waiter and end the turn. Continue only on native completion, then identify, arm inbox waiter and handle the disposable incoming message fixture.`;
const idlePrompt='Read broker_setup_status then broker_identity, arm its waiter_command with run_command WaitMsBeforeAsync=500 and end the turn. For an automatic Psst notice, run the exact disposable message fixture and re-arm. Do not run other commands.';
const messagePrompt='Use call_mcp_tool for broker_setup_status and broker_identity, then the exact disposable message fixture: broker_send once, broker_receive twice, broker_acknowledge twice for that received ID, and broker_receive to verify empty. Do not run commands or other tools.';
const columns=oneShotAuthorized||expectPermissionBoundary?360:120,rows=oneShotAuthorized||expectPermissionBoundary?60:40;
const nativeArgs=['--model','fixture','--print',mode==='messages'?messagePrompt:'Read broker_setup_status then broker_identity using call_mcp_tool, then stop. Do not run commands or other tools.','--output-format','json','--print-timeout','20s'];const child=spawn(interactive?'script':'/native/antigravity',interactive?['-q','-e','-c',`stty cols ${columns} rows ${rows}; /native/antigravity --model fixture --prompt-interactive '${mode==='setup'?setupPrompt:['idle','busy'].includes(mode)?idlePrompt:'Read broker_setup_status then broker_identity using call_mcp_tool, then stop. Do not run commands or other tools.'}'`,'/dev/null']:nativeArgs,{cwd:root,env:{HOME:home,PATH:'/usr/local/bin:/usr/bin:/bin',TMPDIR:'/tmp',GEMINI_API_KEY:'offline-fixture-only',GOOGLE_GEMINI_BASE_URL:url,TERM:'xterm-256color'},stdio:[interactive?'pipe':'ignore','pipe','pipe']});const screen=new TerminalScreen(columns,rows);let lastScreenChange=Date.now(),previousScreen='';let outBytes=0,err='',overflow=false,timedOut=false,parserFailed=false;child.stdout.on('data',b=>{lastScreenChange=Date.now();outBytes+=b.length;if(outBytes>(['idle','setup','busy'].includes(mode)?262144:65536)){overflow=true;child.kill('SIGKILL');return;}try{screen.write(b).catch(error=>{parserFailed=true;err+='terminal_parser_failed:'+error.message;child.kill('SIGKILL');});}catch(error){parserFailed=true;err+='terminal_parser_failed:'+error.message;child.kill('SIGKILL');return;}const current=screen.text();if(current!==previousScreen)previousScreen=current;});child.stderr.on('data',b=>{lastScreenChange=Date.now();err+=b;if(err.length>65536){overflow=true;child.kill('SIGKILL');}});let collectionToggleSent=false,collectionUnchecked=false,termsAccepted=false,termsAcceptanceSent=false,consentBlocked=false,acceptScreenVersion=0;const consentEvidence=[];let trustConfirmationSent=false,trustPromptDismissed=false,trustScreenVersion=-1,trustSentAt=0;let navigationSteps=0,navigationFocus=null,navigationVersion=-1,navigationSentAt=0;let themeSelected=false,compactIssued=false,probeIssued=false,stoppedAfterCompact=false;let commandVersion=-1,probeHookStart=-1;const compactTimers=[];
function activeWaiters(subcommand='wait'){let count=0;for(const pid of readdirSync('/proc').filter(n=>/^[0-9]+$/.test(n))){try{const args=readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0');if(args[1]==='/plugin/bin/psst-antigravity-native.mjs'&&args[2]===subcommand)count++;}catch{}}return count;}
// Reconstruct only the exact command issued by the real native PreToolUse hook.
// Tokens remain in memory and the existing private binding DB, never proof logs.
function verifiedPermissionCommand({observationOnly=false}={}){
 assert(!observationOnly||expectPermissionBoundary,'observation_mode_required');
 const plan=observationOnly?(mode==='setup'?['approval']:['inbox']):confirmationPlan;
 const phase=expectedWaiterPhase(plan,permissionConfirmations,{mode,setup:setupState,approval:approvalWaiterState,approvalGranted,turn,inbox:waiterState,messages:messageState,messageTools:MESSAGE_TOOLS.length,rearm:rearmState,idleSeeded,busyInjection});
 assert(phase,'native_waiter_phase_not_authorized');
 const history=fixture.readEvents().filter(h=>h.event==='PreToolUse'&&h.toolName==='run_command');
 assert.equal(history.length,permissionConfirmations+1);
 for(let i=0;i<confirmedDigests.length;i++)assert.equal(history[i].commandDigest,confirmedDigests[i]);
 const observed=history.at(-1);assert.equal(observed.denied,false);
 const base=home+'/.config/psst/antigravity/native';
 const owners=readdirSync(base).map(name=>base+'/'+name).filter(path=>existsSync(path+'/owner.json'));
 assert.equal(owners.length,1);const owner=readPrivateJson(owners[0]+'/owner.json');
 assert.deepEqual(processIdentity(owner.host.pid),owner.host);
 assert.deepEqual(processIdentity(owner.connectorProcess.pid),owner.connectorProcess);
 assert.equal(owner.host.executable,'/native/antigravity');
 assert.equal(owner.server,'psst-native_psst');
 const directory=`${base}/${owner.host.pid}-${owner.host.start}-${owner.host.boot}`;
 assert.equal(owners[0],directory);assert.equal(realpathSync(directory),directory);
 assert.equal(observed.hostPid,owner.host.pid);assert.equal(observed.hostStart,owner.host.start);
 assert.equal(observed.environmentConversationId,observed.conversationId);
 const tool=phase==='approval'?'broker_wait_approval':'broker_wait';
 const original=`'/usr/local/bin/node' '/plugin/bin/psst-antigravity-native.mjs' ${phase==='approval'?'wait-approval':'wait'} '${directory}'`;
 assert.equal(phase==='approval'?setupState.waiterCommand:turn.waiterCommand,original);
 if(phase==='approval'){
  assert(!existsSync(fixture.installationDirectory+'/selected.json'));assert.equal(fixture.enrollmentPostCount,1);
 }else{
  assert.equal(identities.length,1);assert.equal(snapshots.length,1);
  const snap=snapshot(identities[0]);assert.deepEqual(snap,snapshots[0]);
  assert.equal(observed.conversationId,snap.conversationId);
  assert.deepEqual(owner.host,snap.host);assert.deepEqual(owner.connectorProcess,snap.connectorProcess);
 }
 const db=new DatabaseSync(directory+'/binding.sqlite',{readOnly:true});let permits,bound;
 try{permits=db.prepare('SELECT * FROM permits').all();bound=db.prepare('SELECT * FROM binding WHERE id=1').get();}finally{db.close();}
 assert.equal(bound.closed,0);assert.equal(bound.owner_epoch,owner.ownerEpoch);assert.equal(bound.conversation,observed.conversationId);
 assert.deepEqual(JSON.parse(bound.host),owner.host);
 assert.equal(permits.length,1);const permit=permits[0];
 assert.equal(permit.tool,tool);assert.equal(permit.conversation,bound.conversation);
 assert.equal(permit.digest,createHash('sha256').update('{}').digest('hex'));
 assert(permit.expires>Date.now()+1000);assert(/^[0-9a-f-]{36}$/.test(permit.token));
 const command=original+` '${permit.token}'`;
 const digest=createHash('sha256').update(command).digest('hex');assert.equal(digest,observed.commandDigest);
 assert.equal(activeWaiters()+activeWaiters('wait-approval'),0);
 permissionOwner={host:owner.host,connectorProcess:owner.connectorProcess};
 return {command,phase,digest,hookCount:history.length};
}

function progressAutomaticFixture(){
 if(!['idle','setup','busy'].includes(mode)||providerFailure||!termsAccepted||!trustConfirmationSent||fixtureShutdownRequested)return;
 const observed=fixture.readEvents(),command=observed.findLast(h=>h.event==='PreToolUse'&&h.toolName==='run_command');
 if(setupFirstDeliveryOnly&&messageState.completed===MESSAGE_TOOLS.length&&identities.length===1&&command&&completedNativeDelivery(observed,command)){
  const snap=snapshot(identities[0]);assert.deepEqual(snap,snapshots[0]);
  assert.deepEqual(processIdentity(snap.host.pid),snap.host);assert.deepEqual(processIdentity(snap.connectorProcess.pid),snap.connectorProcess);
  assert.equal(command.conversationId,snap.conversationId);assert.equal(command.hostPid,snap.host.pid);assert.equal(command.hostStart,snap.host.start);
  assert.equal(activeWaiters()+activeWaiters('wait-approval'),0);assert.equal(rearmState.sent,0);assert.equal(permissionConfirmations,2);
  firstDeliveryStopped=true;fixtureShutdownRequested=true;child.kill('SIGTERM');return;
 }
 if(!command||!stoppedNativeWaiter(observed,command))return;
 const liveHost=processIdentity(command.hostPid);assert.equal(liveHost.start,command.hostStart);assert.equal(liveHost.executable,'/native/antigravity');
 if(mode==='setup'&&!approvalGranted&&approvalWaiterState.completed===1){
  assert.equal(activeWaiters('wait-approval'),1,'approval waiter must be alive before admin approves');
  trustPromptDismissed=true;approvalGranted=true;
  fixture.approveSetup(setupState.requestId).catch(()=>{providerFailure='fixture_admin_approval_failed';child.kill('SIGTERM');});return;
 }
 if(identities.length!==1||command.conversationId!==identities[0].conversation_id)return;
 const snap=snapshot(identities[0]);assert.deepEqual(snap,snapshots[0]);
 assert.deepEqual(processIdentity(snap.host.pid),snap.host);
 assert.deepEqual(processIdentity(snap.connectorProcess.pid),snap.connectorProcess);
 assert.equal(command.hostPid,snap.host.pid);assert.equal(command.hostStart,snap.host.start);
 if(!idleSeeded&&waiterState.completed===1){
  assert.equal(activeWaiters(),1,'one native waiter must be alive before peer arrival');
  trustPromptDismissed=true;idleStopped=true;waiterProcesses.push(1);
  messageProof=fixture.seedMessages(identities[0].client_id);idleSeeded=true;
 }else if(idleSeeded&&rearmState.completed===1&&!rearmStopped){
  assert.equal(activeWaiters(),1,'exactly one native waiter re-armed after ACK');
  trustPromptDismissed=true;rearmStopped=true;waiterProcesses.push(1);
  // Terminate only our disposable native process after the full proof. Never
  // type /exit through a background-task UI or an unrecognized permission UI.
  fixtureShutdownRequested=true;child.kill('SIGTERM');
 }
}
const compactPoll=interactive?setInterval(()=>{
 if(!parserFailed&&!overflow&&!timedOut){try{progressAutomaticFixture();}catch{providerFailure='native_waiter_boundary_failed';child.kill('SIGTERM');}}
 const current=screen.text();if(parserFailed||overflow||timedOut||!screen.complete||Date.now()-Math.max(lastScreenChange,screen.lastParsedAt)<250)return;
 if(['idle','setup','busy'].includes(mode)&&pendingNativeCommandPermission(current,{trustSent:trustConfirmationSent,commandObserved:fixture.readEvents().some(h=>h.event==='PreToolUse'&&h.toolName==='run_command')})){
  const commandCount=fixture.readEvents().filter(h=>h.event==='PreToolUse'&&h.toolName==='run_command').length;
  if(permissionConfirmations>0&&!permissionDismissed&&commandCount===permissionHookCount&&Date.now()-permissionSentAt<1000)return;
  if(expectPermissionBoundary){
   try{
    const verified=verifiedPermissionCommand({observationOnly:true});permissionDiagnostics=exactWaiterPermission(current,{expectedCommand:verified.command});
    boundaryObservation={provenanceVerified:true,commandCount:verified.hookCount,promptRecognized:permissionDiagnostics.recognized};
   }catch{boundaryObservation={provenanceVerified:false};}
  }
  if(oneShotAuthorized&&permissionConfirmations<confirmationPlan.length){
   try{
    const verified=verifiedPermissionCommand();permissionDiagnostics=exactWaiterPermission(current,{expectedCommand:verified.command});
    if(permissionDiagnostics.recognized){
     // Spend this phase before input. Never retry an unchanged/uncertain prompt.
     confirmedCommands[verified.phase]=verified.command;confirmedDigests.push(verified.digest);
     permissionConfirmations++;permissionHookCount=verified.hookCount;permissionVersion=screen.version;permissionSentAt=Date.now();permissionDismissed=false;
     consentEvidence.push({action:'confirm_exact_fixture_waiter_once',phase:verified.phase,screen:current});child.stdin.write('\r');return;
    }
   }catch{permissionDiagnostics={provenanceVerified:false};}
  }
  nativePermissionBlocked=true;timeoutWaiters={inbox:activeWaiters(),approval:activeWaiters('wait-approval')};consentEvidence.push({action:'stop_pending_native_command_permission',screen:current});clearInterval(compactPoll);const stopSignalSent=child.kill('SIGTERM');if(expectPermissionBoundary)boundaryStopSignalSent=stopSignalSent;return;
 }
 if(permissionConfirmations>0&&screen.version>permissionVersion)permissionDismissed=true;
 if(!themeSelected&&current.includes('Choose your color scheme:')&&/^\s*> terminal(?:\s|$)/m.test(current)){themeSelected=true;child.stdin.write('\r');return;}
 const consent=consentState(current);
 if(termsAcceptanceSent&&!termsAccepted){if(screen.version>acceptScreenVersion&&!consent.terms)termsAccepted=true;else return;}
 if(termsAccepted&&!trustPromptDismissed){
  if(trustConfirmationSent){
   if(screen.version===trustScreenVersion&&Date.now()-trustSentAt<1000)return;
   if(screen.version>trustScreenVersion&&composerState(current).ready){trustPromptDismissed=true;consentEvidence.push({action:'verified_post_trust_idle_composer',screen:current});}
   else if(['idle','setup','busy'].includes(mode)){return;} // A real background command can start before the first idle frame. Never type through it.
   else {consentBlocked=true;consentEvidence.push({action:'stop_post_trust_composer_unverified',screen:current});clearInterval(compactPoll);child.kill('SIGTERM');return;}
  } else {
   const trust=trustState(current,{authorizedFixtureWorkspaceTrust:true});
   if(trust.mayAccept&&collectionUnchecked&&lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink()&&realpathSync(root)==='/tmp/proof'){
    trustConfirmationSent=true;trustScreenVersion=screen.version;trustSentAt=Date.now();consentEvidence.push({action:'trust_exact_isolated_fixture_workspace',workspace:'/tmp/proof',screen:current});child.stdin.write('\r');return;
   }
   consentBlocked=true;consentEvidence.push(postConsentState(current));clearInterval(compactPoll);child.kill('SIGTERM');return;
  }
 }
 if(consent.terms&&!termsAccepted){
  if(!collectionToggleSent&&consent.mayUncheck){collectionToggleSent=true;consentEvidence.push({action:'uncheck_optional_collection',screen:current});child.stdin.write(' ');return;}
  if(collectionToggleSent&&consent.unchecked&&!consent.checked){
   collectionUnchecked=true;
   if(navigationVersion===screen.version){if(navigationRenderState(navigationVersion,screen.version,Date.now()-navigationSentAt)==='wait')return;consentBlocked=true;consentEvidence.push({action:'stop_navigation_unchanged',focus:navigationFocus,screen:current});clearInterval(compactPoll);child.kill('SIGTERM');return;}
   const navigation=consentNavigation(consent,navigationFocus,navigationSteps);
   if(['down','right'].includes(navigation.action)){navigationSteps++;navigationFocus=navigation.focus;navigationVersion=screen.version;navigationSentAt=Date.now();consentEvidence.push({action:'navigate_'+navigation.action,focus:navigationFocus,step:navigationSteps,screen:current});child.stdin.write(navigation.action==='down'?'\x1b[B':'\x1b[C');return;}
   if(navigation.action==='accept'){termsAcceptanceSent=true;acceptScreenVersion=screen.version;consentEvidence.push({action:'accept_terms_collection_unchecked',screen:current});child.stdin.write('\r');return;}
   // Full modal is now readable, but no focused accept control has been proved.
   consentBlocked=true;consentEvidence.push({action:'stop_accept_control_unverified',screen:current});child.kill('SIGTERM');clearInterval(compactPoll);return;
  }
  return;
 }
 if(!termsAccepted||screen.version<=acceptScreenVersion||consent.terms)return;
 if(!['compact','new'].includes(mode))return;
 if(!trustPromptDismissed||!composerState(current).ready)return;
 const observed=fixture.readEvents();
 const stops=observed.filter(h=>h.event==='Stop'&&h.fullyIdle===true&&['model_stop','NO_TOOL_CALL'].includes(h.terminationReason));
 if(!compactIssued&&identities.length===1&&snapshots.length===1&&snapshots[0].admittedRoot===identities[0].conversation_id&&observed.some(h=>h.event==='PreToolUse'&&h.tool==='broker_identity'&&h.conversationId===identities[0].conversation_id&&h.environmentConversationId===h.conversationId&&h.hostPid===snapshots[0].host.pid&&h.hostStart===snapshots[0].host.start)&&stops.some(h=>h.conversationId===identities[0].conversation_id&&h.environmentConversationId===h.conversationId&&h.hostPid===snapshots[0].host.pid&&h.hostStart===snapshots[0].host.start)){compactIssued=true;commandVersion=screen.version;child.stdin.write(mode==='new'?'/new\r':'/compact\r');}
 else if(compactIssued&&!probeIssued&&(mode==='compact'?current.includes('Conversation compacted'):screen.version>commandVersion)){probeIssued=true;probeHookStart=observed.length;turn={sent:0,completed:0};child.stdin.write('Read broker_setup_status then broker_identity after the native command, then stop. No other tools.\r');}
 else if(probeIssued&&identities.length===2&&snapshots.length===2&&probeHookStart>=0&&observed.slice(probeHookStart).some(h=>matchingIdleStop(h,snapshots[1]))&&!stoppedAfterCompact){stoppedAfterCompact=true;child.stdin.write('/exit\r');}
},100):null;
let timeoutWaiters=null;const timer=setTimeout(()=>{timeoutWaiters={inbox:activeWaiters(),approval:activeWaiters('wait-approval')};timedOut=true;child.kill('SIGKILL');},30000);const {code,signal:nativeSignal}=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
const expectedExit=[0,130].includes(code)||fixtureShutdownRequested&&nativeSignal==='SIGTERM';clearTimeout(timer);clearInterval(compactPoll);for(const t of compactTimers)clearTimeout(t);provider.close();
let shutdownVerified=true;
if(['idle','setup','busy'].includes(mode)){
 const until=Date.now()+3000;
 const observedProcesses=[...snapshots,...(permissionOwner?[permissionOwner]:[])].flatMap(s=>[s.host,s.connectorProcess]);
 const connectorAlive=()=>observedProcesses.some(p=>{try{const raw=readFileSync('/proc/'+p.pid+'/stat','utf8'),stat=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);return stat[0]!=='Z'&&stat[19]===p.start;}catch{return false;}});
 while(Date.now()<until&&(activeWaiters()+activeWaiters('wait-approval')>0||connectorAlive()))await new Promise(resolve=>setTimeout(resolve,20));
 shutdownVerified=activeWaiters()+activeWaiters('wait-approval')===0&&!connectorAlive();
}
const hook=fixture.readEvents();
if(mode==='presence'&&!providerFailure&&presenceState.completed===2)fixture.verifyPresenceAck(presenceProof);
await fixture.close();
const expected=['compact','new'].includes(mode)?2:1;
const presenceVerified=mode!=='presence'||presenceState.completed===2;
const messagesVerified=!['messages','idle','setup','busy'].includes(mode)||messageState.completed===MESSAGE_TOOLS.length&&messageBoundaries.length===MESSAGE_TOOLS.length;
const actualVerified=messagesVerified&&presenceVerified&&!providerFailure&&identities.length===expected&&snapshots.length===expected&&hook.every(h=>!h.denied)&&identities.every(id=>hook.some(h=>h.event==='PreToolUse'&&h.tool==='broker_identity'&&h.conversationId===id.conversation_id&&h.environmentConversationId===id.conversation_id));
const compactVerified=!['compact','new'].includes(mode)||compactIssued&&probeIssued&&stoppedAfterCompact&&(mode==='new'?actualRootRotation(identities,snapshots):actualCompactContinuity(identities,snapshots));
const wakeupVerified=!['idle','setup','busy'].includes(mode)||idleSeeded&&(mode==='busy'?busyInjection&&providerMaxActive===1:idleStopped)&&rearmStopped&&waiterState.completed===1&&rearmState.completed===1&&waiterProcesses.length===(mode==='busy'?1:2)&&waiterProcesses.every(n=>n===1);
const firstDeliveryVerified=setupFirstDeliveryOnly&&firstDeliveryStopped&&idleSeeded&&idleStopped&&waiterState.completed===1&&rearmState.sent===0&&waiterProcesses.length===1&&waiterProcesses[0]===1;
const expectedWakeupVerified=setupFirstDeliveryOnly?firstDeliveryVerified:wakeupVerified;
const setupVerified=mode!=='setup'||approvalGranted&&setupState.completed===2&&approvalWaiterState.completed===1&&fixture.enrollmentPostCount===1;
const uiWords=new Set('Do you want to run execute this command Command Run Execute Allow allow Deny deny Yes yes No no always Always once Once session Session workspace Workspace permission Permission approve Approve approval required Required modified hook Hook arguments Arguments changed Changed Continue continue Cancel cancel Escape Esc enter Enter confirm Confirm accept Accept reject Reject Remember remember for the this and or to from in of by with is a an commands that start Persist settings json conversation Navigate ctrl esc edit please Please press Press choose Choose select Select trust Trust background Background running Running tool Tool Native Psst fixture waiter wait psst native psst-antigravity-native'.split(' '));
const projectedUi=value=>value.split('\n').map(line=>(line.match(/[A-Za-z][A-Za-z-]*|[^A-Za-z]+/g)??[]).map(token=>uiWords.has(token)?token:/^\s+$/.test(token)?' ':/^[>\[\]().:?]+$/.test(token)?token:'?').join('').replace(/ +/g,' ').trim()).filter(Boolean).slice(-18);
const safeScreen=value=>({rows:value.split('\n').length,composerReady:composerState(value).ready,permissionPrompt:/Allow this|permission required|Approve|command denied|not allowed|Run this command\?/i.test(value),fixtureFailure:value.includes('OFFLINE_ACTUAL_PROOF_FAILED'),waiterMention:value.includes('psst-antigravity-native'),proofComplete:value.includes('OFFLINE_NATIVE_MESSAGE_CONTEXT_VERIFIED'),ui:projectedUi(value)});
const permissionsUnchanged=JSON.stringify(JSON.parse(readFileSync(home+'/.gemini/antigravity-cli/settings.json','utf8')).permissions)===JSON.stringify(fixture.permissions);
const runtimeMetadataVerified=turn.completed>0||setupState.completed>0;
const permissionBoundaryVerified=expectPermissionBoundary&&runtimeMetadataVerified&&nativePermissionBoundaryVerified({mode,confirmationBudget:confirmationPlan.length,permissionConfirmations,nativePermissionBlocked,...boundaryObservation,inboxProcesses:timeoutWaiters?.inbox,approvalProcesses:timeoutWaiters?.approval,waiterCompleted:waiterState.completed,approvalWaiterCompleted:approvalWaiterState.completed,rearmCompleted:rearmState.completed,messagesCompleted:messageState.completed,idleSeeded,approvalGranted,permissionsUnchanged,shutdownVerified,boundaryStopSignalSent,nativeExit:code,nativeSignal,providerFailure,parserFailed,timedOut,overflow,collectionUnchecked,termsAccepted,trustConfirmationSent,consentBlocked});
const qualified=permissionsUnchanged&&actualVerified&&compactVerified&&setupVerified&&expectedWakeupVerified&&shutdownVerified&&!nativePermissionBlocked&&!parserFailed&&!timedOut&&!overflow&&expectedExit&&(!interactive||collectionUnchecked&&termsAccepted&&!consentBlocked);
console.log(JSON.stringify({mode,artifact:{source_commit:artifactEvidence.source.commit,source_tree:artifactEvidence.source.tree,source_dirty:artifactEvidence.source.dirty,working_tree_digest:artifactEvidence.source.digest,package:expectedRuntime.name,version:expectedRuntime.version,sha256:artifactEvidence.tarball.sha256},runtimeMetadataVerified,expectPermissionBoundary,boundaryObservation,boundaryStopSignalSent,permissionBoundaryVerified,permissionBoundaryAcceptance:permissionBoundaryVerified?'native_permission_boundary_verified':null,setupFirstDeliveryOnly,firstDeliveryVerified,confirmationBudget:confirmationPlan.length,fixtureShutdownRequested,nativeSignal,waiterCompleted:waiterState.completed,approvalWaiterCompleted:approvalWaiterState.completed,rearmCompleted:rearmState.completed,permissionConfirmations,permissionsUnchanged,permissionDiagnostics,nativePermissionBlocked,blockedAction:nativePermissionBlocked?(mode==='setup'?'execute_disposable_approval_waiter_once':'execute_disposable_inbox_waiter_once'):null,timeoutWaiters,shutdownVerified,busyInjection,providerMaxActive,setupVerified,enrollmentPostCount:fixture.enrollmentPostCount,wakeupVerified,idleSeeded,idleStopped,rearmStopped,waiterProcesses,messagesVerified,messageBoundaries,presenceVerified,actualVerified,compactVerified,providerFailure,providerDiagnostics,themeSelected,collectionUnchecked,termsAccepted,trustConfirmationSent,trustPromptDismissed,consentBlocked,consentEvidence:consentEvidence.map(event=>({...event,...(event.screen?{screen:safeScreen(event.screen)}:{})})),terminalScreen:safeScreen(screen.text()),timedOut,overflow,compactIssued,probeIssued,isolation:'loopback-only',nativeExit:code,requests,hook,identities,snapshots,error:{bytes:Buffer.byteLength(err),parserFailure:err.includes('terminal_parser_failed'),permissionDenied:/permission|denied/i.test(err)},acceptance:qualified?(setupFirstDeliveryOnly?'actual_plugin_native_setup_first_delivery_verified':mode==='setup'?'actual_plugin_native_setup_wakeup_verified':mode==='busy'?'actual_plugin_native_busy_wakeup_verified':mode==='idle'?'actual_plugin_native_idle_wakeup_verified':mode==='messages'?'actual_plugin_native_message_context_verified':'actual_plugin_native_identity_verified'):'actual_plugin_native_qualification_unverified'}));
if(expectPermissionBoundary){assert(permissionBoundaryVerified,'native permission boundary not verified; no delivery acceptance claimed');}
else {
assert(permissionsUnchanged,'native fixture permission settings changed');
assert(!nativePermissionBlocked,'native_permission_confirmation_required: no additional approval or policy override was applied');
assert(!parserFailed&&!timedOut&&!overflow,'native fixture diagnostics failed');
assert(expectedExit,'native fixture exit');
assert(actualVerified,'actual plugin native identity unverified; no permission bypass');
if(interactive)assert(collectionUnchecked&&termsAccepted&&!consentBlocked,'terms/trust unverified');
assert(shutdownVerified,'native host exit must release MCP owner and background waiters');
assert(setupVerified,'actual native URL-only setup and exact admin approval unverified');
assert(expectedWakeupVerified,setupFirstDeliveryOnly?'actual native setup first delivery unverified':'actual native idle arrival and re-arm unverified');
assert(compactVerified,'actual native command continuity or rotation unverified');

}
