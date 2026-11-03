// Test-only. Must run in a Docker --network none container, never on a user host.
import {prepareActualPluginFixture} from './actual-plugin-fixture.mjs';
import {actualCompactContinuity,actualRootRotation,matchingIdleStop} from './actual-compact-state.mjs';
import {actualProviderStep} from './actual-provider-step.mjs';
import {composerState} from './composer-state.mjs';
import {trustState} from './trust-state.mjs';
import {TerminalScreen} from './xterm-screen.mjs';
import {consentState,postConsentState,consentNavigation,navigationRenderState} from './consent-state-navigation.mjs';
import assert from 'node:assert/strict';
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
const mode=process.argv[2]??'root';assert(['root','compact','new'].includes(mode));
const interactive=['compact','new'].includes(mode);
const home='/tmp/proof-home',root='/tmp/proof';mkdirSync(root,{mode:0o700});mkdirSync(home+'/.gemini/antigravity-cli',{recursive:true,mode:0o700});mkdirSync(home+'/.gemini/config',{recursive:true,mode:0o700});
assert(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink()&&realpathSync(root)==='/tmp/proof','fresh_fixture_workspace_required');
const fixture=await prepareActualPluginFixture({root,home,pluginRoot:'/plugin',brokerRoot:'/psst',tlsDirectory:'/fixture-tls'});
const events=fixture.eventsFile;
writeFileSync(home+'/.gemini/config/hooks.json',JSON.stringify(fixture.hooks));
writeFileSync(home+'/.gemini/config/mcp_config.json',JSON.stringify(fixture.mcp));
let turn={sent:0,completed:0},providerFailure=null,providerDiagnostics=null;const requests=[],identities=[],snapshots=[];
function snapshot(identity){
 const base=home+'/.config/psst/antigravity/native';
 const owners=readdirSync(base).map(name=>base+'/'+name).filter(path=>existsSync(path+'/owner.json'));
 assert.equal(owners.length,1,'one actual native MCP owner required');
 const owner=JSON.parse(readFileSync(owners[0]+'/owner.json','utf8'));
 const session=JSON.parse(readFileSync(owners[0]+'/session.json','utf8'));
 assert.equal(session.conversationId,identity.conversation_id);assert.equal(session.clientId,identity.client_id);assert.equal(session.connected,true);
 assert(session.inboxPath.startsWith(root+'/actual-plugin/enrollment/state/'),'journal outside fixture enrollment state');
 assert(lstatSync(session.inboxPath).isFile()&&!lstatSync(session.inboxPath).isSymbolicLink());
 const bindingDb=new DatabaseSync(owners[0]+'/binding.sqlite',{readOnly:true});let admittedRoot,rootGeneration;
 try{admittedRoot=bindingDb.prepare('SELECT conversation FROM binding WHERE id=1').get()?.conversation;const state=bindingDb.prepare('SELECT generation,strict_admission_required FROM root_state WHERE id=1').get();assert.equal(admittedRoot,identity.conversation_id);assert.equal(state.strict_admission_required,1);rootGeneration=state.generation;}finally{bindingDb.close();}
 return {admittedRoot,rootGeneration,host:owner.host,connectorProcess:owner.connectorProcess,ownerEpoch:owner.ownerEpoch,conversationId:session.conversationId,clientId:session.clientId,inboxPath:session.inboxPath};
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
const provider=createServer(async(req,res)=>{if(requests.length>=20){res.writeHead(429);res.end();return;}let b='';for await(const c of req){b+=c;if(b.length>2097152){res.writeHead(413);res.end();return;}}const input=JSON.parse(b||'{}');requests.push({path:req.url,hasTools:Array.isArray(input.tools)});let response;
 if(req.url.toLowerCase().includes('counttokens'))response={totalTokens:1};
 else {let parts;
 try {const step=actualProviderStep(input,turn);turn=step.state;parts=step.parts;
  if(step.identity){identities.push(step.identity);snapshots.push(snapshot(step.identity));}
 } catch(error){providerFailure=error.message;providerDiagnostics={response:error.proofDiagnostics??null,nativeState:diagnosticNativeState()};parts=[{text:'OFFLINE_ACTUAL_PROOF_FAILED'}];}
 requests.at(-1).tool=parts[0]?.functionCall?.args?.ToolName;
 response={candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1,totalTokenCount:2}};}
 const sse=req.url.includes('alt=sse');res.writeHead(200,{'content-type':sse?'text/event-stream':'application/json'});res.end(sse?'data: '+JSON.stringify(response)+'\n\n':JSON.stringify(req.url.toLowerCase().includes('streamgenerate')?[response]:response));});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${provider.address().port}`;
writeFileSync(home+'/.gemini/antigravity-cli/settings.json',JSON.stringify({permissions:fixture.permissions,colorScheme:'terminal',modelProvider:'gemini',model:'fixture',customModelsConfig:{customModels:{fixture:{modelName:'gemini-api://offline-fixture/models/fixture',label:'fixture',apiProvider:'API_PROVIDER_GOOGLE_GEMINI',toolFormatterType:'TOOL_FORMATTER_TYPE_NONE'}}}}));
const nativeArgs=['--model','fixture','--print','Read broker_setup_status then broker_identity using call_mcp_tool, then stop. Do not run commands or other tools.','--output-format','json','--print-timeout','20s'];const child=spawn(interactive?'script':'/native/antigravity',interactive?['-q','-e','-c',"stty cols 120 rows 40; /native/antigravity --model fixture --prompt-interactive 'Read broker_setup_status then broker_identity using call_mcp_tool, then stop. Do not run commands or other tools.'",'/dev/null']:nativeArgs,{cwd:root,env:{HOME:home,PATH:'/usr/local/bin:/usr/bin:/bin',TMPDIR:'/tmp',GEMINI_API_KEY:'offline-fixture-only',GOOGLE_GEMINI_BASE_URL:url,TERM:'xterm-256color'},stdio:[interactive?'pipe':'ignore','pipe','pipe']});const screen=new TerminalScreen(120,40);let lastScreenChange=Date.now(),previousScreen='';let out='',err='',overflow=false,timedOut=false,parserFailed=false;child.stdout.on('data',b=>{lastScreenChange=Date.now();out+=b;if(out.length>65536){overflow=true;child.kill('SIGKILL');return;}try{screen.write(b).catch(error=>{parserFailed=true;err+='terminal_parser_failed:'+error.message;child.kill('SIGKILL');});}catch(error){parserFailed=true;err+='terminal_parser_failed:'+error.message;child.kill('SIGKILL');return;}const current=screen.text();if(current!==previousScreen)previousScreen=current;});child.stderr.on('data',b=>{lastScreenChange=Date.now();err+=b;if(err.length>65536){overflow=true;child.kill('SIGKILL');}});let collectionToggleSent=false,collectionUnchecked=false,termsAccepted=false,termsAcceptanceSent=false,consentBlocked=false,acceptScreenVersion=0;const consentEvidence=[];let trustConfirmationSent=false,trustPromptDismissed=false,trustScreenVersion=-1,trustSentAt=0;let navigationSteps=0,navigationFocus=null,navigationVersion=-1,navigationSentAt=0;let themeSelected=false,compactIssued=false,probeIssued=false,stoppedAfterCompact=false;let commandVersion=-1,probeHookStart=-1;const compactTimers=[];
const compactPoll=interactive?setInterval(()=>{
 const current=screen.text();if(parserFailed||overflow||timedOut||!screen.complete||Date.now()-Math.max(lastScreenChange,screen.lastParsedAt)<250)return;
 if(!themeSelected&&current.includes('Choose your color scheme:')&&/^\s*> terminal(?:\s|$)/m.test(current)){themeSelected=true;child.stdin.write('\r');return;}
 const consent=consentState(current);
 if(termsAcceptanceSent&&!termsAccepted){if(screen.version>acceptScreenVersion&&!consent.terms)termsAccepted=true;else return;}
 if(termsAccepted&&!trustPromptDismissed){
  if(trustConfirmationSent){
   if(screen.version===trustScreenVersion&&Date.now()-trustSentAt<1000)return;
   if(screen.version>trustScreenVersion&&composerState(current).ready){trustPromptDismissed=true;consentEvidence.push({action:'verified_post_trust_idle_composer',screen:current});}
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
 if(!trustPromptDismissed||!composerState(current).ready)return;
 const observed=fixture.readEvents();
 const stops=observed.filter(h=>h.event==='Stop'&&h.fullyIdle===true&&['model_stop','NO_TOOL_CALL'].includes(h.terminationReason));
 if(!compactIssued&&identities.length===1&&snapshots.length===1&&snapshots[0].admittedRoot===identities[0].conversation_id&&observed.some(h=>h.event==='PreToolUse'&&h.tool==='broker_identity'&&h.conversationId===identities[0].conversation_id&&h.environmentConversationId===h.conversationId&&h.hostPid===snapshots[0].host.pid&&h.hostStart===snapshots[0].host.start)&&stops.some(h=>h.conversationId===identities[0].conversation_id&&h.environmentConversationId===h.conversationId&&h.hostPid===snapshots[0].host.pid&&h.hostStart===snapshots[0].host.start)){compactIssued=true;commandVersion=screen.version;child.stdin.write(mode==='new'?'/new\r':'/compact\r');}
 else if(compactIssued&&!probeIssued&&(mode==='compact'?current.includes('Conversation compacted'):screen.version>commandVersion)){probeIssued=true;probeHookStart=observed.length;turn={sent:0,completed:0};child.stdin.write('Read broker_setup_status then broker_identity after the native command, then stop. No other tools.\r');}
 else if(probeIssued&&identities.length===2&&snapshots.length===2&&probeHookStart>=0&&observed.slice(probeHookStart).some(h=>matchingIdleStop(h,snapshots[1]))&&!stoppedAfterCompact){stoppedAfterCompact=true;child.stdin.write('/exit\r');}
},100):null;
const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},30000);const code=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer);clearInterval(compactPoll);for(const t of compactTimers)clearTimeout(t);provider.close();
const hook=fixture.readEvents();
await fixture.close();
const expected=interactive?2:1;
const actualVerified=!providerFailure&&identities.length===expected&&snapshots.length===expected&&hook.every(h=>!h.denied)&&identities.every(id=>hook.some(h=>h.event==='PreToolUse'&&h.tool==='broker_identity'&&h.conversationId===id.conversation_id&&h.environmentConversationId===id.conversation_id));
const compactVerified=!interactive||compactIssued&&probeIssued&&stoppedAfterCompact&&(mode==='new'?actualRootRotation(identities,snapshots):actualCompactContinuity(identities,snapshots));
console.log(JSON.stringify({mode,actualVerified,compactVerified,providerFailure,providerDiagnostics,themeSelected,collectionUnchecked,termsAccepted,trustConfirmationSent,trustPromptDismissed,consentBlocked,consentEvidence,terminalScreen:screen.text(),timedOut,overflow,compactIssued,probeIssued,isolation:'loopback-only',nativeExit:code,requests,hook,identities,snapshots,error:err.slice(-2000),acceptance:actualVerified&&compactVerified?'actual_plugin_native_identity_verified':'actual_plugin_native_identity_unverified'}));
assert(!parserFailed&&!timedOut&&!overflow,'native fixture diagnostics failed');
assert([0,130].includes(code),'native fixture exit');
assert(actualVerified,'actual plugin native identity unverified; no permission bypass');
if(interactive)assert(collectionUnchecked&&termsAccepted&&!consentBlocked,'terms/trust unverified');
assert(compactVerified,'actual native command continuity or rotation unverified');
