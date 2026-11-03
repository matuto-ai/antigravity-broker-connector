import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import {openSync,closeSync,fstatSync,constants} from 'node:fs';
import { join } from 'node:path';
import { NativeBinding,processIdentity } from './native-binding.mjs';
import { readPrivate } from './installation.mjs';
/** Body-free native background completion, never a model polling loop or ACK. */
export async function waitApproval({directory,permit,signal}){
 const owner=readPrivate(join(directory,'owner.json'));
 const binding=new NativeBinding({path:join(directory,'binding.sqlite'),host:owner.host,ownerEpoch:owner.ownerEpoch,strictRoot:true});
 let lock;
 try{
  const {conversationId}=binding.consumeWaiter({tool:'broker_wait_approval',args:{__psst_permit:permit}});
  const initial=readPrivate(join(directory,'approval.json'));
  const lockPath=join(directory,'approval-waiter-owner.sqlite'),fd=openSync(lockPath,constants.O_CREAT|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{const s=fstatSync(fd);if(!s.isFile()||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))throw Error('native_waiter_unavailable');}finally{closeSync(fd);}
  lock=new DatabaseSync(lockPath);lock.exec('PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(id INTEGER);');
  while(!signal?.aborted){
   if(!binding.isBound(conversationId)||readPrivate(join(directory,'owner.json')).ownerEpoch!==owner.ownerEpoch||JSON.stringify(processIdentity(owner.connectorProcess.pid))!==JSON.stringify(owner.connectorProcess))return 'Psst setup waiter stopped: native owner changed. Do not retry automatically.';
   const status=readPrivate(join(directory,'approval.json'));
   if(status.requestId!==initial.requestId)return 'Psst setup waiter stopped: request changed. Do not re-arm automatically.';
   if(status.state==='approved')return 'Psst setup approved. Call broker_setup_status; if connected, arm its native inbox waiter under normal permissions. Approval is installation access, not human approval of agent messages.';
   if(status.state!=='pending')return 'Psst setup needs attention or was cancelled. Call broker_setup_status once; do not start an automatic retry loop.';
   await delay(1000,undefined,{signal});
  }
  return 'Psst setup waiter cancelled. Do not re-arm automatically.';
 }finally{lock?.close();binding.dispose();}
}
