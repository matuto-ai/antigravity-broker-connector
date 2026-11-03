import { validateUuid } from '../vendor/psst/src/protocol.mjs';

export const PRESENCE_NOTICE = 'Psst transport notice available: a recipient has prolonged offline pending delivery. Read broker_presence_events, then explicitly acknowledge only the event_id you read with broker_acknowledge_presence_event. This is not an agent message or a reply timeout; do not automatically resend, cancel or close anything. Re-arm the native waiter after handling the notice.';
export function presenceEvent(value) {
  if(value?.type!=='recipient_offline'||value.presence_state!=='disconnected'||!Array.isArray(value.messages)||value.messages.length>100||typeof value.has_more_messages!=='boolean')throw Error('invalid_presence_event');
  const result={event_id:validateUuid(value.event_id),recipient_id:validateUuid(value.recipient_id),type:'recipient_offline',presence_state:'disconnected'};
  for(const key of ['last_heartbeat_at','created_at','observed_at']) {
    if(typeof value[key]!=='string'||value[key].length>40||!Number.isFinite(Date.parse(value[key])))throw Error('invalid_presence_event');
    result[key]=new Date(value[key]).toISOString();
  }
  result.messages=value.messages.map(message=>{
    if(!['queued','claimed'].includes(message?.delivery_state)||typeof message.delivery_uncertain!=='boolean')throw Error('invalid_presence_event');
    return {message_id:validateUuid(message.message_id),delivery_state:message.delivery_state,delivery_uncertain:message.delivery_uncertain};
  });
  result.has_more_messages=value.has_more_messages;
  return result;
}
export function readablePresence(result) {
  if(result?.error||!Array.isArray(result?.events)||!result.events.length)return null;
  const events=result.events.map(presenceEvent);
  return {content:[{type:'text',text:'Psst · transport notice\nA recipient remains disconnected with pending delivery. This is not an agent instruction, reply timeout, or proof that a message was not received. No automatic resend, cancel or close was performed.\n'+events.map(event=>JSON.stringify(event)).join('\n')+'\nRead these event IDs before explicitly acknowledging them. Message read receipts are unchanged.'}],structuredContent:result,isError:false};
}

/** A separate transport journal. Explicit ACK intent, never stdout, retires notices. */
export class PresenceNotices {
  constructor({client,inbox,isAlive,diagnostic=()=>{}}) {
    Object.assign(this,{client,inbox,isAlive,diagnostic});this.stopped=false;this.running=null;this.controller=new AbortController();
    inbox.transaction(()=>inbox.db.exec(`CREATE TABLE IF NOT EXISTS native_presence_events(event_id TEXT PRIMARY KEY,content TEXT NOT NULL,state TEXT NOT NULL,exposed INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL)`));
  }
  active(){return !this.stopped&&this.isAlive();}
  async stop(){this.stopped=true;this.controller.abort();await this.running?.catch(()=>{});}
  tick(){return this.refresh().catch(()=>{if(!this.stopped)this.diagnostic({code:'presence_notice_pending'});});}
  refresh(){
    if(this.running)return this.running;
    if(!this.active()||this.client.policy.presence_events!==true)return Promise.resolve();
    this.running=this.poll().finally(()=>{this.running=null;});return this.running;
  }
  async poll(){
    const signal=AbortSignal.any([this.controller.signal,AbortSignal.timeout(5000)]);
    for(const row of this.inbox.db.prepare("SELECT event_id FROM native_presence_events WHERE state='ack_requested'").all()){
      if(!this.active())return;
      try{await this.client.acknowledgePresenceEvent(row.event_id,{signal});}
      catch(error){if(!(error.status===404&&error.code==='message_not_found'))throw error;}
      if(!this.active())return;
      this.inbox.transaction(()=>this.inbox.db.prepare("UPDATE native_presence_events SET state='acked' WHERE event_id=?").run(row.event_id));
    }
    let cursor,limited=false;const seen=new Set(),events=[];
    do {
      if(!this.active()||signal.aborted)return;
      if(seen.size>=26){limited=true;break;}
      const page=await this.client.presenceEvents({limit:10,...cursor?{cursor}:{}},{signal});
      if(!this.active())return;
      if(!Array.isArray(page.events)||page.events.length>10||page.next_cursor!=null&&typeof page.next_cursor!=='string')throw Error('invalid_presence_page');
      events.push(...page.events.map(presenceEvent));limited ||= page.capacity_limited===true;
      cursor=page.next_cursor;
      if(cursor){if(cursor.length>1024||seen.has(cursor))throw Error('invalid_presence_cursor');seen.add(cursor);}
    }while(cursor);
    if(!this.active())return;
    this.inbox.transaction(()=>{
      if(!limited){const current=new Set(events.map(e=>e.event_id));for(const row of this.inbox.db.prepare("SELECT event_id FROM native_presence_events WHERE state='pending'").all())if(!current.has(row.event_id))this.inbox.db.prepare('DELETE FROM native_presence_events WHERE event_id=?').run(row.event_id);}
      for(const event of events){
        const old=this.inbox.db.prepare('SELECT state FROM native_presence_events WHERE event_id=?').get(event.event_id);
        if(old?.state==='pending')this.inbox.db.prepare('UPDATE native_presence_events SET content=? WHERE event_id=?').run(JSON.stringify(event),event.event_id);
        else if(!old){
          this.inbox.db.prepare("DELETE FROM native_presence_events WHERE event_id IN (SELECT event_id FROM native_presence_events WHERE state='acked' ORDER BY created LIMIT MAX(0,(SELECT COUNT(*) FROM native_presence_events)-255))").run();
          if(this.inbox.db.prepare('SELECT COUNT(*) n FROM native_presence_events').get().n>=256){limited=true;continue;}
          this.inbox.db.prepare("INSERT INTO native_presence_events(event_id,content,state,created) VALUES(?,?,'pending',?)").run(event.event_id,JSON.stringify(event),Date.now());
        }
      }
    },{growth:events.reduce((n,e)=>n+Buffer.byteLength(JSON.stringify(e))+512,4096)});
    this.limited=limited;
  }
  async read(){
    await this.refresh();if(!this.active())throw Error('native_host_unavailable');
    const rows=this.inbox.db.prepare("SELECT event_id,content FROM native_presence_events WHERE state='pending' ORDER BY created,event_id LIMIT 11").all();
    const selected=rows.slice(0,10);
    this.inbox.transaction(()=>{for(const row of selected)this.inbox.db.prepare('UPDATE native_presence_events SET exposed=1 WHERE event_id=?').run(row.event_id);});
    return {events:selected.map(row=>JSON.parse(row.content)),has_more:rows.length>10,capacity_limited:this.limited===true,supported:this.client.policy.presence_events===true,native_acceptance_recorded:false};
  }
  async acknowledge(eventId){
    validateUuid(eventId);if(!this.active())throw Error('native_host_unavailable');
    // Serialize against snapshots before recording durable, explicit user/model intent.
    await this.running;if(!this.active())throw Error('native_host_unavailable');
    const row=this.inbox.db.prepare('SELECT state,exposed FROM native_presence_events WHERE event_id=?').get(eventId);
    if(!row||!row.exposed)throw Error('presence_event_not_read');
    if(row.state==='acked')return {event_id:eventId,acknowledged:true};
    this.inbox.transaction(()=>this.inbox.db.prepare("UPDATE native_presence_events SET state='ack_requested' WHERE event_id=?").run(eventId));
    await this.refresh();
    if(!this.active())throw Error('native_host_unavailable');
    return {event_id:eventId,acknowledged:this.inbox.db.prepare('SELECT state FROM native_presence_events WHERE event_id=?').get(eventId)?.state==='acked'};
  }
}
