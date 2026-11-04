// Qualification-only setup. Call inside the isolated native fixture after its network guard.
import assert from 'node:assert/strict';
import {prepareApprovalBrokerFixture} from './approval-broker-fixture.mjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTUAL_SERVER = 'psst-native_psst';
export const ACTUAL_TOOLS = Object.freeze(['broker_setup_status', 'broker_identity']);
export const PSST_FIXTURE_COMMIT = 'f32ddc79ec7b812062ed3f6de7b9a0c12a7128f3';
export const PSST_FIXTURE_FILES = Object.freeze(['src/server.mjs','src/store.mjs','src/auth.mjs','src/presence.mjs','src/protocol.mjs','scripts/backup.mjs']);
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
function privateDirectory(path) {
  mkdirSync(path, { recursive:true, mode:0o700 });
  const s=lstatSync(path);
  assert(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&realpathSync(path)===resolve(path),'fixture_private_directory');
}
function json(path,value) { writeFileSync(path,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'}); }
function moduleAt(root,path) { return import(pathToFileURL(join(root,path)).href); }

/** A normal approved installation, not an alternate configReader or a TLS bypass.
 * All credentials belong exclusively to a fresh disposable broker and are never returned.
 */
export async function prepareActualPluginFixture({root,home,pluginRoot,brokerRoot,tlsDirectory,presence=false,messages=false,wakeup=false,approvalSetup=false}) {
  for(const path of [root,home,pluginRoot,brokerRoot,tlsDirectory])assert(typeof path==='string'&&resolve(path)===path,'absolute_fixture_path_required');
  privateDirectory(root);privateDirectory(home);
  const data=join(root,'actual-plugin');privateDirectory(data);
  const certFile=join(tlsDirectory,'cert.pem'),keyFile=join(tlsDirectory,'key.pem');
  for(const path of [certFile,keyFile])assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'fixture_tls_file_required');
  const [{BrokerStore},{CredentialStore},{createBrokerServer}]=await Promise.all([
    moduleAt(brokerRoot,'src/store.mjs'),moduleAt(brokerRoot,'src/auth.mjs'),moduleAt(brokerRoot,'src/server.mjs')]);
  let clockOffset=0;
  let store,app,auth,brokerUrl,token,connectionFile,installationDirectory,approvalFixture,approvedRequest;
  try {
    if(approvalSetup){
      approvalFixture=await prepareApprovalBrokerFixture({root,home,brokerRoot,tlsDirectory});
      ({store,auth,brokerUrl,installationDirectory}=approvalFixture);
    }else{
    store=await BrokerStore.open({path:join(data,'broker.sqlite'),requireRegistrationV2:true,clock:()=>Date.now()+clockOffset});
    token=randomBytes(32).toString('base64url');const credentialId='enrolled-'+randomUUID(),adapterId='installation-'+randomUUID();
    const expiresAt=new Date(Date.now()+3600000).toISOString(),scope='native-proof';
    const credentialsFile=join(data,'credentials.json');
    json(credentialsFile,{credentials:[{credential_id:credentialId,token_sha256:hash(token),principal_id:'offline-fixture-owner',adapter_id:adapterId,client_types:['antigravity-cli'],scopes:[scope],expires_at:expiresAt}]});
    auth=new CredentialStore({path:credentialsFile,onRevoke:ids=>store.revoke(ids),onPolicyChange:entries=>store.applyAuthorizationPolicies(entries)});
    app=createBrokerServer({store,auth,host:'127.0.0.1',port:0,tls:{certFile,keyFile}});
    const address=await app.listen();brokerUrl=`https://127.0.0.1:${address.port}`;
    const bundleDirectory=join(data,'enrollment');privateDirectory(bundleDirectory);
    connectionFile=join(bundleDirectory,'connection.json');
    writeFileSync(join(bundleDirectory,'token'),token+'\n',{mode:0o600,flag:'wx'});
    json(join(bundleDirectory,'enrollment.json'),{format:'psst-enrollment-receipt-v1',protocol_version:'1',broker_url:brokerUrl,client_type:'antigravity-cli',credential_id:credentialId,adapter_id:adapterId,scopes:[scope],expires_at:expiresAt,token_sha256:hash(token)});
    json(connectionFile,{format:'broker-client-bundle-v1',protocol_version:'1',broker_url:brokerUrl,token_file:'token',enrollment_receipt_file:'enrollment.json',file_paths_relative_to:'connection_file_directory',authorization_header:'Authorization',authorization_scheme:'Bearer',insecure_development:false,allowed_client_types:['antigravity-cli'],scope,ca_file:certFile,registration_version:2});
    installationDirectory=join(home,'.gemini','antigravity-cli','psst','installation');privateDirectory(installationDirectory);
    json(join(installationDirectory,'selected.json'),{format:'psst-selected-v1',revision:randomUUID(),connectionFile,credentialId,requestId:randomUUID(),brokerUrl});
    }
    // This hook runs directly under the native shell, keeping real parent provenance.
    // It records only fixture-native identifiers; the original result, including permits,
    // goes directly back to the native CLI and is not persisted in the proof log.
    const hookFile=join(data,'hook-observer.mjs'),eventsFile=join(data,'native-events.jsonl');
    const pluginModule=pathToFileURL(join(pluginRoot,'src/native-plugin.mjs')).href;
    writeFileSync(hookFile,`import {handleNativeHook} from ${JSON.stringify(pluginModule)};\nimport {appendFileSync,readFileSync,realpathSync} from 'node:fs';\nimport {createHash} from 'node:crypto';\nlet text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>131072)throw Error('oversize_hook');}\nconst input=JSON.parse(text),event=process.argv[2];\nconst parent=readFileSync('/proc/'+process.ppid+'/stat','utf8');const hostPid=Number(parent.slice(parent.lastIndexOf(')')+2).trim().split(/\\s+/)[1]);\nif(realpathSync('/proc/'+hostPid+'/exe')!=='/native/antigravity')throw Error('unexpected_native_ancestor');\nconst stat=readFileSync('/proc/'+hostPid+'/stat','utf8');const hostStart=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\\s+/)[19];\nconst result=event==='Stop'?{decision:'stop'}:handleNativeHook(input,{observe:event==='SessionStart'||event==='PreInvocation'});\nappendFileSync(${JSON.stringify(eventsFile)},JSON.stringify({event,hostPid,hostStart,conversationId:input.conversationId,environmentConversationId:process.env.ANTIGRAVITY_CONVERSATION_ID,toolName:input.toolCall?.name,tool:input.toolCall?.args?.ToolName,fullyIdle:input.fullyIdle,terminationReason:input.terminationReason,denied:result.decision==='deny',...(input.toolCall?.name==='run_command'?{commandDigest:typeof result.overwrite?.CommandLine==='string'?createHash('sha256').update(result.overwrite.CommandLine).digest('hex'):null}: {})})+'\\n',{mode:0o600});\nprocess.stdout.write(JSON.stringify(result)+'\\n');\n`,{mode:0o600,flag:'wx'});
    const hooks={};
    for(const event of ['SessionStart','PreInvocation','Stop'])hooks[event]=[{type:'command',command:`node ${quote(hookFile)} ${event}`,timeout:5}];
    hooks.PreToolUse=[{matcher:'^(call_mcp_tool|run_command)$',hooks:[{type:'command',command:`node ${quote(hookFile)} PreToolUse`,timeout:5}]}];
    const mcp={mcpServers:{[ACTUAL_SERVER]:{command:'node',args:[join(pluginRoot,'bin/psst-antigravity-native.mjs'),'serve','--experimental-native'],env:{NODE_EXTRA_CA_CERTS:certFile}}}};
    let closed=false;
    return {
      brokerUrl,connectionFile,installationDirectory,eventsFile,mcp,hooks:{'offline-actual-psst':hooks},
      approveSetup:async requestId=>{assert(approvalFixture,'approval mode required');await approvalFixture.decide(requestId);approvedRequest=requestId;},
      get enrollmentPostCount(){return approvalFixture?.enrollmentPostCount??0;},
      permissions:{allow:[...ACTUAL_TOOLS,...(approvalSetup?['broker_setup']:[]),...(presence?['broker_presence_events','broker_acknowledge_presence_event']:[]),...(messages?['broker_send','broker_receive','broker_acknowledge']:[])].map(tool=>`mcp(${ACTUAL_SERVER}/${tool})`)},
      readEvents:()=>{try{return readFileSync(eventsFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}},
      seedMessages(nativeId){
        assert(messages&&!presence,'message fixture mode required');
        const entry=approvalFixture?approvalFixture.approvedEntry(approvedRequest):auth.authenticate('Bearer '+token),peerId=randomUUID();
        store.own(entry,nativeId);
        const peer=store.register(entry,{protocol_version:'1',registration_version:2,requested_at:Date.now(),client_id:peerId,client_type:'antigravity-cli',session_instance_id:randomUUID(),connection_id:randomUUID(),previous_epoch:0,metadata:{name:'Offline message peer',model:{provider:null,id:null,source:'unknown'},project:null},capabilities:{protocol_version:'1',adapter_version:'fixture',client_type:'antigravity-cli',receive_enabled:true,durable_inbox:true}});
        const incomingText='OFFLINE_NATIVE_MESSAGE_BEGIN\n# Literal peer data: olá, 世界\nOFFLINE_NATIVE_MESSAGE_FULL_TAIL';
        const outgoingText='OFFLINE_NATIVE_OUTBOUND_MESSAGE';
        const sent=store.send(entry,peerId,peer.lease_epoch,randomUUID(),{recipient_id:nativeId,content:{type:'text/plain',text:incomingText}});
        return {nativeId,peerId,messageId:sent.message_id,incomingText,outgoingText};
      },
      verifyMessages(proof,outgoingId){
        assert(messages,'message fixture mode required');
        const rows=store.db.prepare('SELECT id,sender,recipient,envelope,state FROM messages ORDER BY accepted,id').all();
        assert.equal(rows.length,2,'exactly one inbound and one outbound send required');
        const inbound=rows.find(row=>row.id===proof.messageId),outbound=rows.find(row=>row.id===outgoingId);
        assert(inbound&&outbound&&inbound!==outbound,'exact native message IDs required');
        assert.equal(inbound.sender,proof.peerId);assert.equal(inbound.recipient,proof.nativeId);
        assert.equal(inbound.state,'delivered','transport must persist inbound independently from read ACK');
        assert.equal(outbound.sender,proof.nativeId);assert.equal(outbound.recipient,proof.peerId);
        assert.equal(outbound.state,'queued','no recipient read is fabricated');
        assert.equal(JSON.parse(outbound.envelope).content.text,proof.outgoingText);
      },
      seedPresence(senderId){
        assert(presence,'presence fixture mode required');
        const entry=auth.authenticate('Bearer '+token),sender=store.own(entry,senderId),recipient=randomUUID();
        const registered=store.register(entry,{protocol_version:'1',registration_version:2,requested_at:Date.now()+clockOffset,client_id:recipient,client_type:'antigravity-cli',session_instance_id:randomUUID(),connection_id:randomUUID(),previous_epoch:0,metadata:{name:'Offline fixture',model:{provider:null,id:null,source:'unknown'},project:null},capabilities:{protocol_version:'1',adapter_version:'fixture',client_type:'antigravity-cli',receive_enabled:true,durable_inbox:true}});
        const sent=store.send(entry,senderId,sender.epoch,randomUUID(),{recipient_id:recipient,content:{type:'text/plain',text:'PRIVATE_OFFLINE_FIXTURE_BODY'}});
        store.disconnect(entry,recipient,registered.lease_epoch);clockOffset+=600001;
        return {recipientId:recipient,messageId:sent.message_id,senderId};
      },
      verifyPresenceAck(proof){
        const entry=auth.authenticate('Bearer '+token);
        assert.equal(store.receipt(entry,proof.senderId,proof.messageId).delivery_state,'queued');
        assert.equal(store.db.prepare('SELECT COUNT(*) n FROM presence_events WHERE sender=? AND acknowledged=0').get(proof.senderId).n,0);
      },
      async close(){if(closed)return;closed=true;if(approvalFixture)return approvalFixture.close();try{await app.close();}finally{store.close();}},
    };
  } catch(error) {if(approvalFixture)await approvalFixture.close();else try{if(app?.server.listening)await app.close();}finally{store?.close();}throw error;}
}
