// Fixture-only renderer. npm @xterm/headless 6.0.0, verified SHA512 in xterm-integrity.json.
// No terminal replies are connected to native stdin; this is read-only screen observation.
import {createRequire} from 'node:module';
import {StringDecoder} from 'node:string_decoder';
const require=createRequire(import.meta.url);
const {Terminal}=require('./xterm-pinned/package/lib-headless/xterm-headless.js');
const pkg=require('./xterm-pinned/package/package.json');
export class TerminalScreen {
 constructor(columns=120,rows=40){
  if(pkg.version!=='6.0.0')throw Error('unreviewed_terminal_version');
  this.rows=rows;this.version=0;this.pendingWrites=0;this.invalid=false;this.lastParsedAt=0;
  this.decoder=new StringDecoder('utf8');this.terminal=new Terminal({cols:columns,rows,scrollback:0,allowProposedApi:true});
  // Public write callback reports write completion, NOT completion of split CSI/OSC.
  // Pinned, read-only parser-state inspection is mandatory; unknown ABI fails closed.
  if(this.terminal._core?._inputHandler?._parser?.initialState!==0)throw Error('unreviewed_terminal_parser');
 }
 write(bytes){
  if(this.invalid)throw Error('terminal_failed');
  const value=this.decoder.write(typeof bytes==='string'?Buffer.from(bytes):bytes);
  this.pendingWrites++;
  return new Promise((resolve,reject)=>{
   try{this.terminal.write(value,()=>{this.pendingWrites--;this.version++;this.lastParsedAt=Date.now();resolve();});}
   catch(error){this.invalid=true;this.pendingWrites--;reject(error);}
  });
 }
 get complete(){
  const parser=this.terminal._core?._inputHandler?._parser;
  return !this.invalid&&this.pendingWrites===0&&this.decoder.lastNeed===0&&parser?.initialState===0&&parser?.currentState===0;
 }
 text(){
  if(!this.complete)return '';
  const buffer=this.terminal.buffer.active;
  return Array.from({length:this.rows},(_,row)=>buffer.getLine(buffer.viewportY+row)?.translateToString(true)??'').join('\n');
 }
 dispose(){this.invalid=true;this.terminal.dispose();}
}
