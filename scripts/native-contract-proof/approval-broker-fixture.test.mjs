import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import https from 'node:https';
import {prepareApprovalBrokerFixture} from './approval-broker-fixture.mjs';

// Opt in to a pinned, source-only broker directory; no production configuration.
const brokerRoot=process.env.PSST_APPROVAL_FIXTURE_BROKER_ROOT;
test('real TLS approval starts empty, counts enrollments and gates exact request credentials', {skip:!brokerRoot}, async t=>{
  const root=mkdtempSync(join(tmpdir(),'native-approval-helper-'));
  let fixture;
  t.after(async()=>{try{await fixture?.close();await fixture?.close();}finally{rmSync(root,{recursive:true,force:true});}});
  const tlsDirectory=join(root,'tls');mkdirSync(tlsDirectory,{mode:0o700});
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tlsDirectory,'key.pem'),'-out',join(tlsDirectory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore',timeout:10000});
  fixture=await prepareApprovalBrokerFixture({root,home:join(root,'home'),brokerRoot,tlsDirectory});
  const ca=readFileSync(join(tlsDirectory,'cert.pem'));
  function request(path,{token,method='GET',body}={}) {return new Promise((resolve,reject)=>{
    const req=https.request(new URL(path,fixture.brokerUrl),{ca,method,agent:false,headers:{...(token?{Authorization:`Enrollment ${token}`} : {}),'Content-Type':'application/json'}},res=>{
      let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));res.on('error',reject);
    });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });}
  assert.deepEqual(readdirSync(fixture.installationDirectory),[]);
  assert.equal(fixture.auth.entries.length,0);
  assert.equal(fixture.enrollmentPostCount,0);
  const requestId=randomUUID(),token=randomBytes(32).toString('base64url');
  const body={request_id:requestId,client_type:'antigravity-cli',label:'Synthetic native qualification'};
  assert.equal((await request('/v1/enrollment-requests',{method:'POST',token,body})).status,201);
  assert.equal(fixture.enrollmentPostCount,1);
  assert.throws(()=>fixture.approvedEntry(requestId),/not_approved/);
  assert.equal((await request(`/v1/enrollment-requests/${requestId}`,{token})).body.state,'pending');
  assert.equal(fixture.enrollmentPostCount,1,'status reads must not enroll again');
  await assert.rejects(fixture.decide('../bad'),/exact_request_uuid/);
  await assert.rejects(fixture.decide(randomUUID()),/decision_failed/);
  await fixture.decide(requestId);
  const approved=await request(`/v1/enrollment-requests/${requestId}`,{token});
  assert.equal(approved.body.state,'approved');
  const entry=fixture.approvedEntry(requestId);
  assert.equal(entry.credential_id,approved.body.credential.credential_id);
  assert.equal(fixture.auth.authenticate(`Bearer ${token}`).credential_id,entry.credential_id);
  assert.equal(fixture.enrollmentPostCount,1);
  assert.deepEqual(readdirSync(fixture.installationDirectory),[],'helper must not manufacture an installation');
  const secondId=randomUUID(),secondToken=randomBytes(32).toString('base64url');
  assert.equal((await request('/v1/enrollment-requests',{method:'POST',token:secondToken,body:{...body,request_id:secondId}})).status,201);
  await fixture.decide(secondId,'deny');
  assert.equal((await request(`/v1/enrollment-requests/${secondId}`,{token:secondToken})).body.state,'denied');
  assert.throws(()=>fixture.approvedEntry(secondId),/not_approved/);
  assert.equal(fixture.enrollmentPostCount,2);
  await fixture.decide(requestId,'revoke');
  assert.throws(()=>fixture.approvedEntry(requestId),/not_approved/);
  assert.throws(()=>fixture.auth.authenticate(`Bearer ${token}`),{status:401});
  await assert.rejects(prepareApprovalBrokerFixture({root,home:join(root,'home'),brokerRoot,tlsDirectory}),/must_be_fresh/);
});

// Exercise the unmodified approved helper bundle and real registration, not an
// injected config/session factory. Safe synthetic CA trust is process-scoped.
for(const enforce of [false,true])test(`real URL-only approval activates v1 only when broker policy permits it (enforced=${enforce})`, {skip:!brokerRoot,timeout:20000}, async t=>{
 const root=mkdtempSync(join(tmpdir(),'native-approval-activation-')),tlsDirectory=join(root,'tls');mkdirSync(tlsDirectory,{mode:0o700});let fixture;
 t.after(async()=>{try{await fixture?.close();}finally{rmSync(root,{recursive:true,force:true});}});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tlsDirectory,'key.pem'),'-out',join(tlsDirectory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore',timeout:10000});
 fixture=await prepareApprovalBrokerFixture({root,home:join(root,'home'),brokerRoot,tlsDirectory,...(enforce?{requireRegistrationV2:true}:{})});
 const repo=process.env.PSST_APPROVAL_FIXTURE_CONNECTOR_ROOT??fileURLToPath(new URL('../../',import.meta.url));
 const module=path=>JSON.stringify(pathToFileURL(join(repo,path)).href);
 const options={directory:fixture.installationDirectory,brokerUrl:fixture.brokerUrl,clientType:'antigravity-cli'};
 const run=async source=>JSON.parse((await promisify(execFile)(process.execPath,['--input-type=module','-e',source,JSON.stringify(options)],{env:{...process.env,NODE_EXTRA_CA_CERTS:join(tlsDirectory,'cert.pem')},timeout:12000,maxBuffer:65536})).stdout);
 const pending=await run(`import {beginApproval} from ${module('vendor/psst/approval.mjs')};const r=await beginApproval(JSON.parse(process.argv[1]));console.log(JSON.stringify({state:r.state,requestId:r.requestId}));`);
 assert.equal(pending.state,'pending');await fixture.decide(pending.requestId);
 const result=await run(`import {pollApproval} from ${module('vendor/psst/approval.mjs')};import {readConnectorConfig} from ${module('src/connector-config.mjs')};import {startNativeSession} from ${module('src/native-session.mjs')};import {readFileSync} from 'node:fs';const r=await pollApproval(JSON.parse(process.argv[1]));const config=readConnectorConfig(r.connectionFile,{}),bundle=JSON.parse(readFileSync(r.connectionFile,'utf8'));let session;const result={state:r.state,registrationVersion:config.registrationVersion,bundleHasVersion:Object.hasOwn(bundle,'registration_version')};try{session=await startNativeSession({config,conversationId:'fixture-activation',isAlive:()=>true});result.connected=true;result.clientId=session.identity.client_id;}catch(error){result.connected=false;result.error=error.code;}finally{await session?.close({closeSession:true});}console.log(JSON.stringify(result));`);
 assert.equal(result.state,'approved');assert.equal(result.registrationVersion,1);assert.equal(result.bundleHasVersion,false);
 assert.equal(result.connected,!enforce);assert.equal(fixture.enrollmentPostCount,1);
 if(enforce){assert.equal(result.error,'registration_upgrade_required');assert.equal(fixture.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);}
 else assert.equal(fixture.store.db.prepare('SELECT registration_version FROM sessions WHERE id=?').get(result.clientId).registration_version,1);
 assert.equal(readdirSync(fixture.installationDirectory).includes('selected.json'),false,'helper and direct registration must never fabricate installation selection');
});
