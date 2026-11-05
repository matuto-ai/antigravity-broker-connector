import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { startNativeSession } from '../src/native-session.mjs';

async function until(predicate) {
  for(let i=0;i<300;i++){if(predicate())return;await delay(2);}
  assert.fail('native transport did not reach the expected state');
}

function clock() {
  let now=Date.now();const waiting=new Set();
  return {now:()=>now,sleep(ms,_,{signal}={}){
    return new Promise((resolve,reject)=>{
      const entry={at:now+ms,finish:()=>{waiting.delete(entry);signal?.removeEventListener('abort',abort);resolve();}};
      const abort=()=>{waiting.delete(entry);reject(Object.assign(Error('aborted'),{code:'request_aborted'}));};
      if(signal?.aborted)return abort();
      waiting.add(entry);signal?.addEventListener('abort',abort,{once:true});
    });
  },advance(ms){now+=ms;for(const entry of [...waiting])if(entry.at<=now)entry.finish();}};
}

async function fixture(t) {
  const directory=mkdtempSync(join(tmpdir(),'antigravity-recovery-'));
  const time=clock(),requests=[],diagnostics=[],unavailable=[];
  let session,state,poll,mode='up',connected=true,queued,completed=false,loseCompletion=false,emptyPolls=1;
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
    requests.push({method:req.method,path:req.url,key:req.headers['idempotency-key'],body});
    const json=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    const error=(status,code)=>json(status,{error:{code,effect:'not_applied',retryable:false}});
    if(mode==='down'){res.writeHead(503,{'content-type':'text/html'});res.end('<h1>proxy unavailable</h1>');return;}
    if(mode==='revoked')return error(403,'forbidden');
    if(mode==='invalid'){res.writeHead(200,{'content-type':'text/html'});res.end('invalid successful response');return;}
    if(req.method==='POST'&&req.url==='/v1/sessions'){
      const epoch=(state?.lease_epoch??0)+1;
      state={...body,lease_epoch:epoch,metadata_revision:epoch,policy:{heartbeat_seconds:1,retention_seconds:7*86400},
        connected:true,closed:false,lease_expires_at:new Date(time.now()+120000).toISOString(),server_time:new Date(time.now()).toISOString()};
      connected=true;return json(200,state);
    }
    if(req.method==='GET'&&req.url===`/v1/sessions/${state.client_id}`){
      if(mode==='expired')return error(404,'recipient_not_found');
      return json(200,{...state,connected});
    }
    if(req.url.endsWith('/heartbeat')){
      if(!connected||mode==='expired')return error(mode==='expired'?404:409,mode==='expired'?'recipient_not_found':'stale_lease_epoch');
      return json(200,{client_id:state.client_id,lease_epoch:state.lease_epoch,
        lease_expires_at:new Date(time.now()+120000).toISOString(),server_time:new Date(time.now()).toISOString()});
    }
    if(req.url==='/v1/mailbox/claim'){
      if(!connected)return error(409,'stale_lease_epoch');
      if(queued&&!completed)return json(200,{claim_id:queued.claim_id,lease_epoch:state.lease_epoch,attempt:1,
        claim_expires_at:new Date(time.now()+60000).toISOString(),envelope:queued.envelope});
      if(emptyPolls-->0){res.writeHead(204);res.end();return;}
      poll={req,res};res.on('close',()=>{if(poll?.req===req)poll=null;});return;
    }
    if(req.url.endsWith('/complete')){
      assert.equal(body.outcome,'delivered');
      assert.equal(session.inbox.head().message_id,queued.envelope.message_id,'delivery ACK follows durable storage');
      if(loseCompletion){loseCompletion=false;res.destroy();return;}
      completed=true;return json(200,{});
    }
    if(req.url.endsWith('/close')||req.url.endsWith('/disconnect'))return json(200,{});
    assert.fail(`unexpected native transport route: ${req.url}`);
  });
  server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await session?.close({closeSession:false});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});});
  const tokenFile=join(directory,'token');writeFileSync(tokenFile,randomBytes(48).toString('base64url'),{mode:0o600});
  session=await startNativeSession({config:{brokerUrl:`http://127.0.0.1:${server.address().port}`,tokenFile,
    stateRoot:join(directory,'state'),insecureDevelopment:true,registrationVersion:2,
    metadata:{name:'recovery fixture',project:null,model:{provider:null,id:null,source:'unknown'}}},
    conversationId:randomUUID(),isAlive:()=>true,onDiagnostic:value=>diagnostics.push(value),onUnavailable:value=>unavailable.push(value),
    clientOptions:{maxAttempts:1,now:time.now,sleep:time.sleep,random:()=>0.5}});
  await until(()=>poll&&session.transportStatus().reception==='healthy');
  return {session,requests,diagnostics,unavailable,time,get state(){return state;},get completed(){return completed;},
    outage(){mode='down';connected=false;poll.res.destroy();},returnBroker(){mode='up';},
    failReceiver(){poll.res.destroy();},
    block(value){mode=value;poll.res.destroy();},
    queue(){const now=time.now();queued={claim_id:randomUUID(),envelope:{protocol_version:'1',message_id:randomUUID(),
      recipient_id:session.identity.client_id,recipient_sequence:1,
      sender:{client_id:randomUUID(),client_type:'pi',name:'fixture peer',project:null,model:{provider:null,id:null,source:'unknown'},metadata_revision:1},
      origin:'broker_agent',authority:'untrusted_agent_input',content:{type:'text/plain',text:'queued during outage'},
      accepted_at:new Date(now).toISOString(),expires_at:new Date(now+86400000).toISOString(),correlation_id:null,reply_to_message_id:null}};
      loseCompletion=true;return queued.envelope;
    },async advance(ms=60000){time.advance(ms);await delay(10);},
    noReplacement(){assert.equal(existsSync(join(session.inbox.directory,'current-incarnation.json')),false);}};
}

test('native lifetime survives outage, stale heartbeat and ambiguous completion without manual reconnect or read ACK',async t=>{
  const f=await fixture(t),identity={...f.session.identity},directory=f.session.inbox.directory;
  const registrationCount=()=>f.requests.filter(r=>r.path==='/v1/sessions').length;
  const originalClaim=f.session.inbox.getState('claim_pending');
  const sendKey=f.session.inbox.prepareSend({recipient_id:randomUUID(),content:{type:'text/plain',text:'pending original intent'}});
  f.session.inbox.markOutgoingAttempt(sendKey);
  const originalSend=f.session.inbox.outgoing(sendKey);
  f.outage();await until(()=>f.session.transportStatus().recovery==='retry_waiting');
  for(let i=0;i<10;i++)await f.advance();
  assert.equal(registrationCount(),1,'unreachable broker never causes registration churn');
  assert.deepEqual(f.session.inbox.getState('claim_pending'),originalClaim,'ambiguous claim keeps its original retry key');
  assert(f.requests.length<50,'outage work stays bounded and spaced');
  assert.equal(f.unavailable.length,0);assert.deepEqual(f.session.identity,identity);
  const envelope=f.queue();f.returnBroker();
  for(let i=0;i<20&&!f.completed;i++)await f.advance();
  await until(()=>f.completed);
  assert.equal(registrationCount(),2,'stale heartbeat reconciles the owned session exactly once');
  assert.equal(f.session.inbox.directory,directory);assert.deepEqual(f.session.identity,identity);
  assert.deepEqual(f.session.inbox.outgoing(sendKey),originalSend,'reception recovery preserves uncertain outgoing intent and key');
  assert(f.requests.filter(r=>r.path==='/v1/sessions').every(r=>r.body.client_id===identity.client_id));
  assert.equal(f.session.inbox.db.prepare('SELECT count(*) AS n FROM inbox').get().n,1);
  const row=f.session.inbox.db.prepare('SELECT state,native_receipt FROM inbox').get();
  assert.equal(row.state,'pending');assert.equal(row.native_receipt,null);
  assert.equal(f.session.inbox.head().message_id,envelope.message_id);
  assert.equal(f.requests.filter(r=>r.path==='/v1/messages').length,0);
  const restored=f.session.transportStatus();assert.equal(restored.reception,'healthy');assert.equal(restored.error_code,null);
  assert.equal(f.unavailable.length,0);f.noReplacement();
});

test('a receive-only interruption recovers in the same native lifetime while heartbeat stays available',async t=>{
  const f=await fixture(t);f.queue();f.failReceiver();
  for(let i=0;i<12&&!f.completed;i++)await f.advance();
  await until(()=>f.completed);
  assert.equal(f.requests.filter(r=>r.path==='/v1/sessions').length,1);
  assert.equal(f.session.transportStatus().reception,'healthy');assert.equal(f.unavailable.length,0);
});

test('security, identity and successful-protocol failures stop the native lifetime without a replacement mailbox',async t=>{
  for(const [mode,code] of [['revoked','forbidden'],['expired','session_expired'],['invalid','invalid_response']]){
    const f=await fixture(t),identity={...f.session.identity};f.block(mode);
    for(let i=0;i<12&&!f.unavailable.length;i++)await f.advance();
    await until(()=>f.unavailable.length===1);
    assert.equal(f.unavailable[0].code,code);assert.equal(f.unavailable[0].transport.recovery,'blocked');
    const count=f.requests.length;await f.advance(600000);assert.equal(f.requests.length,count);
    assert.deepEqual(f.session.identity,identity);assert.equal(f.requests.filter(r=>r.path==='/v1/sessions').length,1);
    f.noReplacement();
  }
});

test('explicit native shutdown fences pending automatic recovery',async t=>{
  const f=await fixture(t);f.outage();
  await until(()=>f.session.transportStatus().recovery==='retry_waiting');
  await f.session.close({closeSession:false});
  const count=f.requests.length;f.returnBroker();
  for(let i=0;i<5;i++)await f.advance();
  assert.equal(f.requests.length,count);assert.equal(f.session.transportStatus().recovery,'stopped');
});
