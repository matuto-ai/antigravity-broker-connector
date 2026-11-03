// Disposable qualification authority only. The native caller must first enforce
// Docker --network none and a temporary HOME. No production account is consulted.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import https from 'node:https';

export const APPROVAL_BROKER_FILES = Object.freeze([
  'src/approval.mjs', 'src/admin.mjs', 'src/admin-client.mjs',
  'src/admin-data.mjs', 'src/admin-pages.mjs', 'src/admin-styles.mjs',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function privateDirectory(path) {
  mkdirSync(path, {recursive:true, mode:0o700});
  const stat=lstatSync(path);
  assert(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&realpathSync(path)===resolve(path),'fixture_private_directory');
}
function csrf(page) {
  assert.equal(page.status,200,'fixture_admin_page_failed');
  const match=/name="csrf" value="([^"]+)"/.exec(page.text);
  assert(match,'fixture_admin_csrf_missing');
  return match[1];
}
function sessionCookie(response) {
  const cookie=response.headers['set-cookie']?.find(value=>value.startsWith('psst_admin='))?.split(';')[0];
  assert(cookie,'fixture_admin_cookie_missing');
  return cookie;
}

/** Real URL-only approval path, with no token bundle or selected installation.
 * approvedEntry is an internal peer-fixture capability, never proof-log output.
 */
export async function prepareApprovalBrokerFixture({root,home,brokerRoot,tlsDirectory}) {
  for(const path of [root,home,brokerRoot,tlsDirectory])assert(typeof path==='string'&&resolve(path)===path,'absolute_fixture_path_required');
  privateDirectory(root);privateDirectory(home);
  const data=join(root,'approval-broker');
  assert(!existsSync(data),'fixture_authority_must_be_fresh');
  privateDirectory(data);
  const installationDirectory=join(home,'.gemini','antigravity-cli','psst','installation');
  assert(!existsSync(installationDirectory),'fixture_installation_must_be_fresh');
  privateDirectory(installationDirectory);
  const certFile=join(tlsDirectory,'cert.pem'),keyFile=join(tlsDirectory,'key.pem');
  for(const path of [certFile,keyFile])assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'fixture_tls_file_required');
  const ca=readFileSync(certFile);
  const load=path=>import(pathToFileURL(join(brokerRoot,path)).href);
  const [{BrokerStore},{ApprovalService},{AdminUI},{CredentialStore},{createBrokerServer}]=await Promise.all([
    load('src/store.mjs'),load('src/approval.mjs'),load('src/admin.mjs'),load('src/auth.mjs'),load('src/server.mjs'),
  ]);
  let store,app,closed=false,enrollmentPostCount=0;
  async function close() {
    if(closed)return;closed=true;
    try{if(app?.server.listening)await app.close();}finally{store?.close();}
  }
  try {
    store=await BrokerStore.open({path:join(data,'broker.sqlite'),requireRegistrationV2:true});
    const approval=await ApprovalService.create({store,scope:'native-proof',principal:'offline-fixture-owner'});
    const credentialFile=join(data,'credentials.json');
    writeFileSync(credentialFile,'{"credentials":[]}\n',{mode:0o600,flag:'wx'});
    const auth=new CredentialStore({path:credentialFile,additionalCredentials:()=>approval.credentials(),onRevoke:ids=>store.revoke(ids),onPolicyChange:entries=>store.applyAuthorizationPolicies(entries)});
    const password=randomBytes(32).toString('base64url');
    const admin=await AdminUI.create({approval,auth,password});
    app=createBrokerServer({store,auth,approval,admin,host:'127.0.0.1',port:0,tls:{certFile,keyFile},pollIntervalMs:5});
    // Observe metadata only: never retain headers, request bodies, cookies or keys.
    app.server.prependListener('request',req=>{
      if(req.method==='POST'&&req.url?.split('?')[0]==='/v1/enrollment-requests')enrollmentPostCount++;
    });
    const address=await app.listen(),brokerUrl=`https://127.0.0.1:${address.port}`;
    const request=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
      const req=https.request(new URL(path,brokerUrl),{method,ca,headers,agent:false},res=>{
        const parts=[];let bytes=0;
        res.on('data',part=>{bytes+=part.length;if(bytes>1048576){res.destroy(new Error('fixture_admin_response_oversize'));return;}parts.push(part);});
        res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString()}));res.on('error',reject);
      });
      req.setTimeout(10000,()=>req.destroy(new Error('fixture_admin_timeout')));
      req.on('error',reject);req.end(body);
    });
    const page=await request('/admin');
    const login=await request('/admin/login',{method:'POST',headers:{cookie:sessionCookie(page),origin:brokerUrl,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:csrf(page),password}).toString()});
    assert.equal(login.status,303,'fixture_admin_login_failed');
    const cookie=sessionCookie(login);
    async function decide(id,action='approve') {
      assert(uuid.test(id),'fixture_exact_request_uuid_required');
      assert(['approve','deny','revoke'].includes(action),'fixture_invalid_decision');
      const page=await request('/admin',{headers:{cookie}});
      const result=await request(`/admin/requests/${id}/${action}`,{method:'POST',headers:{cookie,origin:brokerUrl,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:csrf(page)}).toString()});
      assert.equal(result.status,303,'fixture_admin_decision_failed');
    }
    function approvedEntry(id) {
      assert(uuid.test(id),'fixture_exact_request_uuid_required');
      auth.reload();
      const row=store.db.prepare("SELECT entry FROM approval_requests WHERE id=? AND state='approved' AND expires>?").get(id,store.clock());
      assert(row,'fixture_request_not_approved');
      const credentialId=JSON.parse(row.entry).credential_id;
      const entry=auth.entries.find(entry=>entry.credential_id===credentialId);
      assert(entry,'fixture_approved_credential_missing');
      return entry;
    }
    return {brokerUrl,store,auth,installationDirectory,decide,approvedEntry,get enrollmentPostCount(){return enrollmentPostCount;},close};
  } catch(error) {await close();throw error;}
}
