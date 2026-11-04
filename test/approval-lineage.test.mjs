import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readApprovalParent, savePrivate } from '../src/installation.mjs';

test('private candidate lineage reads only the exact request parent, never its secret state', t => {
 const directory=mkdtempSync(join(tmpdir(),'approval-lineage-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const brokerUrl='https://broker.example',requestId=randomUUID(),parentRequestId=randomUUID();
 const key=createHash('sha256').update(brokerUrl+'\0antigravity-cli').digest('hex');
 const dir=join(directory,'approvals',key,requestId);mkdirSync(dir,{recursive:true,mode:0o700});
 const path=join(dir,'attempt.json'),options={directory,brokerUrl,requestId};
 const attempt={brokerUrl,requestId,parentRequestId,clientType:'antigravity-cli',token:'must-never-be-returned'};
 savePrivate(path,attempt);assert.equal(readApprovalParent(options),parentRequestId);
 savePrivate(path,{...attempt,parentRequestId:null});assert.equal(readApprovalParent(options),null);
 for(const changed of [{...attempt,requestId:randomUUID()},{...attempt,brokerUrl:'https://other.example'},
  {...attempt,clientType:'other'},{...attempt,parentRequestId:'invalid'}]){
  savePrivate(path,changed);assert.throws(()=>readApprovalParent(options),/approval_request_mismatch/);
 }
 assert.throws(()=>readApprovalParent({...options,requestId:'../../outside'}),/approval_request_mismatch/);
 savePrivate(path,attempt);const linked=join(directory,'linked');renameSync(join(directory,'approvals'),linked);
 symlinkSync(linked,join(directory,'approvals'));
 assert.throws(()=>readApprovalParent(options),/private_installation_required/);
});
