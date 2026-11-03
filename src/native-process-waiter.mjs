import { PRESENCE_NOTICE } from './presence-notices.mjs';
import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, fstatSync, constants, watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { NativeBinding, processIdentity } from './native-binding.mjs';
import { readPrivateJson } from './native-plugin.mjs';
import { PENDING_NOTICE } from './native-waiter.mjs';

/** Finite native background task; local safety checks never invoke a model. */
export async function waitNativeProcess({directory,permit,signal}) {
  const owner=readPrivateJson(join(directory,'owner.json'));
  const binding=new NativeBinding({path:join(directory,'binding.sqlite'),host:owner.host,ownerEpoch:owner.ownerEpoch,strictRoot:true});
  let lock,db,watcher,timer,onAbort;
  try {
    const {conversationId}=binding.consumeWaiter({tool:'broker_wait',args:{__psst_permit:permit}});
    const initial=readPrivateJson(join(directory,'session.json'));
    if(!initial.connected||initial.conversationId!==conversationId)throw Error('native_not_connected');
    const lockPath=join(directory,'waiter-owner.sqlite');
    const fd=openSync(lockPath,constants.O_CREAT|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    try{const stat=fstatSync(fd);if(!stat.isFile()||(stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))throw Error('native_waiter_unavailable');}finally{closeSync(fd);}
    lock=new DatabaseSync(lockPath);
    lock.exec('PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(id INTEGER);');
    db=new DatabaseSync(initial.inboxPath,{readOnly:true});
    return await new Promise((resolve,reject)=>{
      let finished=false;
      const finish=value=>{if(!finished){finished=true;resolve(value);}};
      const check=()=>{
        if(finished)return;
        try {
          const current=readPrivateJson(join(directory,'session.json'));
          if(signal?.aborted||!current.connected||current.epoch!==initial.epoch||!binding.isBound(conversationId)
            ||readPrivateJson(join(directory,'owner.json')).ownerEpoch!==owner.ownerEpoch
            ||JSON.stringify(processIdentity(owner.host.pid))!==JSON.stringify(owner.host)
            ||JSON.stringify(processIdentity(owner.connectorProcess.pid))!==JSON.stringify(owner.connectorProcess))return finish('Psst native waiter disconnected. Do not re-arm without a new explicit connect.');
          const head=db.prepare("SELECT state,message_id FROM inbox WHERE state!='consumed' ORDER BY sequence LIMIT 1").get();
          if(head?.state==='pending') {
            const notice=binding.notice({conversationId,clientId:initial.clientId,messageId:head.message_id});
            if(notice==='pending')finish(PENDING_NOTICE);
            else if(notice==='attention')finish('Psst attention required: this pending head already generated two notices without being acknowledged. Do not automatically re-arm or retry. The message remains pending; explicit intervention is required.');
            // Exhausted heads stay silent in the background; no model wake loop.
          }
          else if(head)throw Error();
          if(!finished&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='native_presence_events'").get()) {
            for(const event of db.prepare("SELECT event_id FROM native_presence_events WHERE state='pending' ORDER BY created,event_id LIMIT 256").all()) {
              const notice=binding.presenceNotice({conversationId,clientId:initial.clientId,eventId:event.event_id});
              if(notice==='pending'){finish(PRESENCE_NOTICE);break;}
              if(notice==='attention'){finish('Psst transport notice requires attention: repeated notification was not explicitly acknowledged. Do not automatically re-arm. Agent messages and their read receipts are unchanged.');break;}
            }
          }
        }catch{finished=true;reject(Error('native_waiter_unavailable'));}
      };
      // fs.watch is an optimization. Bounded local checks cover lost FS events
      // and owner death without creating model-token polling or native notices.
      watcher=watch(dirname(initial.inboxPath),check);
      timer=setInterval(check,1000);
      onAbort=()=>finish('Psst native waiter cancelled. Do not re-arm automatically.');
      signal?.addEventListener('abort',onAbort,{once:true});check();
    });
  } finally {
    clearInterval(timer);watcher?.close();signal?.removeEventListener('abort',onAbort);
    db?.close();lock?.close();binding.dispose();
  }
}
