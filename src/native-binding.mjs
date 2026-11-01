// Feature-gated native pilot. Never imported by the released MCP entrypoint.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, realpathSync, openSync, closeSync, constants, lstatSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { canonical, validateUuid } from '../vendor/psst/src/protocol.mjs';

const fail = () => { throw new Error('native_binding_rejected'); };
const equal = (a,b) => canonical(a) === canonical(b);
const digest = args => createHash('sha256').update(canonical(args)).digest('hex');
const tools = new Set(['broker_setup','broker_setup_status','broker_cancel_setup','broker_wait_approval','broker_connect','broker_disconnect','broker_wait','broker_identity','broker_list_clients','broker_send','broker_receive','broker_acknowledge','broker_message_status','broker_update_metadata','broker_sent_history','broker_message_content','broker_resend','broker_cancel']);

/** Only the native launcher/hook calls this; no model arguments choose a PID. */
export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) fail();
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const tail = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  const start = tail[19]; // Linux proc(5): field 22, after pid and comm.
  if (!/^\d+$/.test(start)) fail();
  return { pid, start, boot: readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),
    executable: realpathSync(`/proc/${pid}/exe`) };
}

/** Exact observed CLI 1.4.7 chain: hook Node -> sh -> owning Antigravity. */
export function nativeHookContext(input, { expectedHost, parentPid = process.ppid, env = process.env } = {}) {
  try {
    validateUuid(input?.conversationId);
    if (env.ANTIGRAVITY_CONVERSATION_ID !== input.conversationId) fail();
    const stat = readFileSync(`/proc/${parentPid}/stat`, 'utf8');
    if (stat.slice(stat.indexOf('(')+1,stat.lastIndexOf(')')) !== 'sh') fail();
    const hostPid = Number(stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/)[1]);
    const host = processIdentity(hostPid);
    if (!equal(host, expectedHost)) fail();
    return { conversationId: input.conversationId, host };
  } catch { fail(); }
}

/**
 * Cross-process private permit store: hook issues; MCP consumes atomically.
 * This is not authorization against hostile code executing as the same OS user.
 * Native host identity and hook input must come from nativeHookContext, never
 * MCP/model arguments. One conversation is supported; no implicit switching.
 */
export class NativeBinding {
  constructor({ path, host, create = false, now = Date.now, failurePoint = () => {}, verifyHost = value => equal(processIdentity(value.pid),value), ownerEpoch } = {}) {
    this.now = now; this.host = host; this.failurePoint = failurePoint; this.unusable = false;
    this.verifyHost=verifyHost;
    this.ownerEpoch=ownerEpoch;
    this.abort = new AbortController(); this.signal = this.abort.signal;
    if (!isAbsolute(path) || realpathSync(dirname(path)) !== dirname(path)) fail();
    const parent = lstatSync(dirname(path));
    if (!parent.isDirectory() || (parent.mode & 0o077) || (process.getuid && parent.uid !== process.getuid())) fail();
    if (create) { const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd); }
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) || (process.getuid && file.uid !== process.getuid())) fail();
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA busy_timeout=1000;');
      if (create) {
        this.db.exec('CREATE TABLE binding (id INTEGER PRIMARY KEY CHECK(id=1),host TEXT NOT NULL,conversation TEXT,closed INTEGER NOT NULL,owner_epoch TEXT); CREATE TABLE permits(token TEXT PRIMARY KEY,tool TEXT NOT NULL,digest TEXT NOT NULL,conversation TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE notices(client TEXT NOT NULL,message TEXT NOT NULL,count INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(client,message));');
        this.db.prepare('INSERT INTO binding VALUES(1,?,NULL,0,NULL)').run(canonical(host));
      }
      this.assertHost();
    } catch { this.db.close(); fail(); }
  }
  assertHost() {
    if(this.unusable)fail();
    const row=this.db.prepare('SELECT * FROM binding WHERE id=1').get();
    if (!row || row.host !== canonical(this.host) || row.closed || this.verifyHost(this.host)!==true
      || (this.ownerEpoch!==undefined && row.owner_epoch!==this.ownerEpoch)) fail();
    return row;
  }
  transaction(fn) {
    if(this.unusable)fail();
    try { this.db.exec('BEGIN IMMEDIATE'); } catch { fail(); }
    try { const result=fn();this.failurePoint('before_commit');this.db.exec('COMMIT');this.failurePoint('after_commit');return result; }
    catch { try {this.failurePoint('before_rollback');this.db.exec('ROLLBACK');}catch{this.unusable=true;this.abort.abort();} fail(); }
  }
  observe(context) {
    return this.transaction(()=>{const row=this.assertHost();validateUuid(context?.conversationId);
      if(!equal(context.host,this.host)||(row.conversation&&row.conversation!==context.conversationId))fail();
      if(!row.conversation)this.db.prepare('UPDATE binding SET conversation=? WHERE id=1').run(context.conversationId);
      return context.conversationId;
    });
  }
  issue({ context, tool, args }) {
    return this.transaction(()=>{
      const row=this.assertHost();validateUuid(context?.conversationId);
      if (!equal(context.host,this.host) || !tools.has(tool) || !args || typeof args!=='object' || Array.isArray(args) || Object.hasOwn(args,'__psst_permit')) fail();
      if (!row.conversation) {
        if (!['broker_connect','broker_setup','broker_setup_status'].includes(tool)) fail();
        this.db.prepare('UPDATE binding SET conversation=? WHERE id=1').run(context.conversationId);
      } else if(row.conversation!==context.conversationId) fail();
      this.db.prepare('DELETE FROM permits WHERE expires<=?').run(this.now());
      if(this.db.prepare('SELECT count(*) AS n FROM permits').get().n>=32)fail();
      const token=randomUUID();
      this.db.prepare('INSERT INTO permits VALUES(?,?,?,?,?)').run(token,tool,digest(args),context.conversationId,this.now()+30000);
      return { ...args, __psst_permit: token };
    });
  }
  consume({ tool, args }) {
    return this.transaction(()=>{
      const row=this.assertHost(), {__psst_permit:token,...clean}=args??{};
      validateUuid(token);
      const permit=this.db.prepare('SELECT * FROM permits WHERE token=?').get(token);
      if(!permit || permit.tool!==tool || permit.digest!==digest(clean) || permit.conversation!==row.conversation || permit.expires<=this.now())fail();
      this.db.prepare('DELETE FROM permits WHERE token=?').run(token);
      return { conversationId: row.conversation, args: clean };
    });
  }
  isBound(conversationId) { try { return this.assertHost().conversation===conversationId; } catch { return false; } }
  startOwner(epoch) {
    validateUuid(epoch);
    this.transaction(()=>{this.assertHost();this.db.exec('DELETE FROM permits');this.db.prepare('UPDATE binding SET owner_epoch=? WHERE id=1').run(epoch);});
    this.ownerEpoch=epoch;
  }
  endOwner() {
    try {this.transaction(()=>{this.assertHost();this.db.exec('DELETE FROM permits; UPDATE binding SET owner_epoch=NULL WHERE id=1;');});}
    finally {this.unusable=true;this.abort.abort();}
  }
  notice({conversationId,clientId,messageId}) {
    return this.transaction(()=>{
      const binding=this.assertHost();validateUuid(clientId);validateUuid(messageId);
      if(binding.conversation!==conversationId)fail();
      const old=this.db.prepare('SELECT count FROM notices WHERE client=? AND message=?').get(clientId,messageId);
      const count=old?.count??0;
      if(count>=3)return 'suppressed';
      this.db.prepare('INSERT INTO notices VALUES(?,?,?,?) ON CONFLICT(client,message) DO UPDATE SET count=excluded.count').run(clientId,messageId,count+1,this.now());
      this.db.exec('DELETE FROM notices WHERE rowid IN (SELECT rowid FROM notices ORDER BY created DESC LIMIT -1 OFFSET 256)');
      return count===2?'attention':'pending';
    });
  }
  closeHost() { try { this.transaction(()=>{this.assertHost();this.db.exec('DELETE FROM permits; UPDATE binding SET closed=1 WHERE id=1;');}); } catch { this.unusable=true;fail(); } finally { this.abort.abort(); } }
  dispose() { this.unusable=true;this.abort.abort();this.db.close(); }
}
