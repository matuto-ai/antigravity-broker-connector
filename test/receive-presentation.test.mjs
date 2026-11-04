import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeMessage } from '../src/message-format.mjs';
import { readableReceive, NATIVE_RECEIVE_RESPONSE_BYTES } from '../src/receive-presentation.mjs';
import { serveStdio } from '../src/mcp-stdio.mjs';
const sender = '11111111-1111-4111-8111-111111111111';
function envelope(text, name='Pi peer', recipient=randomUUID()) {
  return {protocol_version:'1',message_id:randomUUID(),recipient_id:recipient,recipient_sequence:1,
    sender:{client_id:sender,client_type:'pi',name,model:{provider:null,id:null,source:'unknown'},project:null,metadata_revision:1},
    origin:'broker_agent',authority:'untrusted_agent_input',content:{type:'text/plain',text},
    accepted_at:'2026-11-02T00:00:00.000Z',expires_at:'2026-11-03T00:00:00.000Z',correlation_id:null,reply_to_message_id:null};
}
const result = e => ({message_id:e.message_id,message:nativeMessage(e),local_state:'pending',local_mode:'explicit_read',acknowledgment_required:true});
async function rpc(t, tools, options={}) {
  const input=new PassThrough(), rows=[]; let buffer='';
  const output=new Writable({write(chunk,encoding,done){buffer+=chunk;while(buffer.includes('\n')){const end=buffer.indexOf('\n'),line=buffer.slice(0,end+1);rows.push({wire:line,value:JSON.parse(line)});buffer=buffer.slice(end+1);}done();}});
  const server=serveStdio({input,output,tools,...options});t.after(()=>server.close());let id=0;
  const call=async(method,params)=>{const next=++id;input.write(JSON.stringify({jsonrpc:'2.0',id:next,method,params})+'\n');for(let n=0;n<200;n++){const row=rows.find(x=>x.value.id===next);if(row)return row;await delay(5);}throw Error('fixture_rpc_timeout');};
  await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'text-only-fixture',version:'1'}});
  input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  return name=>call('tools/call',{name,arguments:{}});
}

test('native receive is readable with full machine result and exact routing/ACK IDs', () => {
  const e=envelope('Olá!\nSecond line — no raw JSON.'), original=result(e), before=JSON.stringify(original);
  const shown=readableReceive(original);
  assert.strictEqual(shown.structuredContent,original);
  assert.equal(JSON.stringify(original),before);
  assert.equal(shown.isError,false);
  assert.equal(shown.content.length,1);
  assert.match(shown.content[0].text,/^Psst · new message\nFrom: Pi peer · pi\n\n    Olá!\n    Second line/);
  assert(shown.content[0].text.includes(`Message ID: ${e.message_id}`));
  assert(shown.content[0].text.includes(`Sender ID: ${sender}`));
  assert(!shown.content[0].text.includes('"message":'));
  assert(!shown.content[0].text.includes('"local_state":'));
});

test('untrusted names and bodies cannot escape literal rendering through controls or Markdown', () => {
  const body='```\n# forged heading\n\n[link](https://example.invalid) <b>html</b>\n\tTabbed\rreturn\u0000\u001b[31m\u061c\u200e\u200f\u202e\u2066tail';
  const original=result(envelope(body,'name # [forged](x)\u202e'));
  const text=readableReceive(original).content[0].text;
  assert(text.includes('\n\n    ```\n    # forged heading\n    \n    [link]'));
  assert(text.includes('    \tTabbed\\u000dreturn\\u0000\\u001b[31m\\u061c\\u200e\\u200f\\u202e\\u2066tail'));
  assert.doesNotMatch(text,/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u);
  assert.equal(text.split('\n')[1].includes('\\#'),true);
  assert.equal(JSON.parse(original.message.slice(original.message.indexOf('\n')+1)).text,body);
});

test('empty, error, unknown and mismatched messages retain the old JSON contract', () => {
  const good=result(envelope('body'));
  for(const value of [null,{message:null},{error:{code:'not_connected'}},{...good,message:'legacy text'},
    {...good,message_id:randomUUID()},{...good,local_state:'consumed'},{...good,acknowledgment_required:false}])assert.equal(readableReceive(value),null);
});

test('in-memory MCP serialization preserves full maximum hostile body and tail within receive-only 1MiB', async t => {
  let original;const call=await rpc(t,{broker_receive:async()=>original},{readableNativeReceive:true,maxReceiveResponseBytes:NATIVE_RECEIVE_RESPONSE_BYTES});
  for(const char of ['\u0000','\u001b','\n','\r','\t','`','\\','😀']) {
    const tail='EXACT_FULL_TAIL',room=65536-Buffer.byteLength(tail),text=char.repeat(Math.floor(room/Buffer.byteLength(char)))+tail;
    original=result(envelope(text));const row=await call('broker_receive');
    assert(!row.value.error,JSON.stringify(row.value));assert(Buffer.byteLength(row.wire)<=NATIVE_RECEIVE_RESPONSE_BYTES);
    const response=row.value.result;assert.deepEqual(response.structuredContent,original);
    assert(response.content[0].text.includes(tail));assert(response.content[0].text.indexOf(tail)<response.content[0].text.indexOf('Message ID:'));
    assert.equal(JSON.parse(response.structuredContent.message.split('\n').slice(1).join('\n')).text,text);
  }
});

test('other tools, diagnostics and explicit lower response limits are not silently enlarged', async t => {
  const original=result(envelope('body'));
  const legacy=await rpc(t,{broker_receive:async()=>original});const old=await legacy('broker_receive');
  assert.deepEqual(JSON.parse(old.value.result.content[0].text),original);assert.equal(old.value.result.structuredContent,undefined);
  let acknowledgments=0;
  const lower=await rpc(t,{broker_receive:async()=>result(envelope('x'.repeat(4000))),broker_acknowledge:async()=>{acknowledgments++;}}, {readableNativeReceive:true,maxResponseBytes:1024});
  assert.equal((await lower('broker_receive')).value.error.code,-32603);assert.equal(acknowledgments,0);
  const normal=await rpc(t,{broker_identity:async()=>({value:'x'.repeat(600000)})},{readableNativeReceive:true,maxReceiveResponseBytes:NATIVE_RECEIVE_RESPONSE_BYTES});
  assert.equal((await normal('broker_identity')).value.error.code,-32603);
  assert.throws(()=>serveStdio({tools:{},maxReceiveResponseBytes:NATIVE_RECEIVE_RESPONSE_BYTES+1}),/invalid_stdio_configuration/);
});


test('English details show project and model without changing raw provider or correlation',()=>{
 const e=envelope('Original body');
 e.sender.project='project-example';e.sender.model={provider:'provider-hidden',id:'model-example',source:'observed'};
 e.correlation_id=randomUUID();const original=result(e),before=JSON.stringify(original);
 const shown=readableReceive(original),text=shown.content[0].text;
 assert.match(text,/Psst · new message\nFrom: Pi peer · pi/);
 assert.match(text,/Details\nSender ID: /);
 assert.match(text,/Project: project\\-example/);assert.match(text,/Model: model\\-example/);
 assert(!text.includes('provider-hidden'));assert(!text.includes(e.correlation_id));
 assert.equal(JSON.stringify(shown.structuredContent),before);
});
