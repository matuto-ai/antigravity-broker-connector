import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {httpFixture,registration,sendBody} from '../../ai-agent-msg-broker/test/helpers.mjs';import {startNativeSession} from '../src/native-session.mjs';
test('30 independent native conversation journals share authorization, preserve pending on reopen, and reject duplicate ownership', {timeout:15000},async t=>{
 const broker=await httpFixture(t),root=mkdtempSync(join(tmpdir(),'agy-shared-install-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const tokenFile=join(root,'token');writeFileSync(tokenFile,broker.b.token,{mode:0o600});
 const config={brokerUrl:broker.base,tokenFile,stateRoot:join(root,'state'),insecureDevelopment:true,metadata:{name:'shared authorization fixture',project:null,model:{provider:null,id:null,source:'unknown'}}};
 const ids=Array.from({length:30},()=>randomUUID());const sessions=[];t.after(async()=>{for(const s of sessions)await s.close();});
 for(const conversationId of ids)sessions.push(await startNativeSession({config,conversationId,isAlive:()=>true}));
 assert.equal(new Set(sessions.map(s=>s.identity.client_id)).size,30);
 await assert.rejects(startNativeSession({config,conversationId:ids[0],isAlive:()=>true}),error=>error.code==='owner_conflict');
 const sender=registration('pi');await broker.request('/v1/sessions',{method:'POST',body:sender});
 const sent=await broker.request('/v1/messages',{method:'POST',session:sender.client_id,key:randomUUID(),body:sendBody(sessions[0].identity.client_id,'durable original conversation data')});assert.equal(sent.status,202);
 let received;for(let i=0;i<100;i++){received=await sessions[0].tools.broker_receive({});if(received.message)break;await delay(20);}assert.equal(received.message_id,sent.body.message_id);
 for(const s of sessions.slice(1))assert.equal((await s.tools.broker_receive({})).message,null);
 const identity=sessions[0].identity;await sessions[0].close();sessions[0]=await startNativeSession({config,conversationId:ids[0],isAlive:()=>true});assert.deepEqual(sessions[0].identity,identity);assert.equal((await sessions[0].tools.broker_receive({})).message_id,received.message_id);
 const alternate={...config,enrollment:{credentialId:'enrolled-'+randomUUID(),expiresAt:new Date(Date.now()+60000).toISOString()}};const replacement=await startNativeSession({config:alternate,conversationId:ids[0],isAlive:()=>true});sessions.push(replacement);assert.notEqual(replacement.identity.client_id,identity.client_id);assert.equal((await replacement.tools.broker_receive({})).message,null);
});
