import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
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
