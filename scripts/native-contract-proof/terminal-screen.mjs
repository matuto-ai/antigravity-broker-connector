// Minimal bounded VT screen for reading the isolated fixture's current modal.
// No transcript substring is used as evidence of a checkbox's current state.
import {StringDecoder} from 'node:string_decoder';
export class TerminalScreen {
 constructor(columns=120,rows=40){this.columns=columns;this.rows=rows;this.decoder=new StringDecoder('utf8');this.pending='';this.row=0;this.col=0;this.saved=[0,0];this.grid=Array.from({length:rows},()=>Array(columns).fill(' '));this.version=0;this.invalid=false;}
 fail(){this.invalid=true;this.grid=Array.from({length:this.rows},()=>Array(this.columns).fill(' '));throw Error('unsupported_terminal_sequence');}
 write(bytes){if(this.invalid)this.fail();this.pending+=typeof bytes==='string'?bytes:this.decoder.write(bytes);let i=0;
  const scroll=()=>{if(this.row>=this.rows){this.grid.shift();this.grid.push(Array(this.columns).fill(' '));this.row=this.rows-1;}};
  while(i<this.pending.length){let c=this.pending[i];
   if(c==='\x1b'){
    if(i+1>=this.pending.length)break;
    const next=this.pending[i+1];
    if(next==='['){const rest=this.pending.slice(i+2),match=/^([0-?]*)([ -/]*)([@-~])/.exec(rest);if(!match)break;if(match[2] && !(match[2]===' '&&match[3]==='q') && !(match[2]==='$'&&match[3]==='p'&&/^\?202[67]$/.test(match[1])))this.fail();const params=match[1],final=match[3],n=params.replace(/^\?/,'').split(';').map(x=>Number(x)||0),v=n[0]||1;i+=2+match[0].length;
     // Exact observed non-rendering queries/input modes; documented by xterm and kitty.
     // https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
     // https://sw.kovidgoyal.net/kitty/keyboard-protocol/
     if((final==='q'&&params==='>'&&!match[2]) || (final==='p'&&match[2]==='$'&&/^\?202[67]$/.test(params)) || (final==='u'&&['>1','?'].includes(params)) || (final==='m'&&['>4','>4;2'].includes(params)))continue;
     // DECST8C resets to columns 9,17,...; these are already the only supported
     // tab stops. Any command changing them to another configuration is rejected.
     if(final==='W'&&params==='?5'&&!match[2])continue;
     if(/[<=>?]/.test(params)&&!((final==='h'||final==='l')&&['?25','?1049','?2004','?1004'].includes(params)))this.fail();
     if(final==='A')this.row=Math.max(0,this.row-v);else if(final==='B')this.row=Math.min(this.rows-1,this.row+v);else if(final==='C')this.col=Math.min(this.columns-1,this.col+v);else if(final==='D')this.col=Math.max(0,this.col-v);
     else if(final==='E'){this.row=Math.min(this.rows-1,this.row+v);this.col=0;}else if(final==='F'){this.row=Math.max(0,this.row-v);this.col=0;}
     else if(final==='G')this.col=Math.min(this.columns-1,v-1);else if(final==='d')this.row=Math.min(this.rows-1,v-1);
     else if(final==='H'||final==='f'){this.row=Math.min(this.rows-1,(n[0]||1)-1);this.col=Math.min(this.columns-1,(n[1]||1)-1);}
     else if(final==='K'){const start=n[0]===1||n[0]===2?0:this.col,end=n[0]===1?this.col+1:this.columns;this.grid[this.row].fill(' ',start,end);}
     else if(final==='J'){if(n[0]===2||n[0]===3)this.grid=Array.from({length:this.rows},()=>Array(this.columns).fill(' '));else if(n[0]===1){for(let r=0;r<this.row;r++)this.grid[r].fill(' ');this.grid[this.row].fill(' ',0,this.col+1);}else{this.grid[this.row].fill(' ',this.col);for(let r=this.row+1;r<this.rows;r++)this.grid[r].fill(' ');}}
     else if(final==='X')this.grid[this.row].fill(' ',this.col,Math.min(this.columns,this.col+v));
     else if(final==='P'){this.grid[this.row].splice(this.col,v);while(this.grid[this.row].length<this.columns)this.grid[this.row].push(' ');}
     else if(final==='@'){this.grid[this.row].splice(this.col,0,...Array(Math.min(v,this.columns)).fill(' '));this.grid[this.row].length=this.columns;}
     else if(final==='s')this.saved=[this.row,this.col];else if(final==='u')[this.row,this.col]=this.saved;
     else if((final==='h'||final==='l')&&params==='?1049'){this.grid=Array.from({length:this.rows},()=>Array(this.columns).fill(' '));this.row=0;this.col=0;}
     else if(final==='m'||final==='n'||final==='c'||(final==='q'&&match[2]===' ')){}
     else if((final==='h'||final==='l')&&/^\?(?:25|2004|1004)$/.test(params)){}
     else this.fail();
     continue;
    }
    if(next===']'){const rest=this.pending.slice(i+2),end=/\x07|\x1b\\/.exec(rest);if(!end)break;i+=2+end.index+end[0].length;continue;}
    if(next==='7')this.saved=[this.row,this.col];else if(next==='8')[this.row,this.col]=this.saved;else this.fail();
    i+=2;continue;
   }
   i++;if(c==='\r'){this.col=0;continue;}if(c==='\n'){this.row++;scroll();continue;}if(c==='\b'){this.col=Math.max(0,this.col-1);continue;}if(c==='\t'){this.col=Math.min(this.columns-1,Math.floor(this.col/8+1)*8);continue;}if(c<' '||c==='\x7f')continue;
   const code=this.pending.codePointAt(i-1);if(code>0xffff){c=String.fromCodePoint(code);i++;}
   if(this.col>=this.columns){this.col=0;this.row++;scroll();}this.grid[this.row][this.col++]=c;
  }
  this.pending=this.pending.slice(i);if(this.pending.length>8192)throw Error('unsupported_terminal_sequence');this.version++;
 }
 get complete(){return !this.invalid&&this.pending.length===0&&this.decoder.lastNeed===0;}
 text(){if(!this.complete)return '';return this.grid.map(row=>row.join('').trimEnd()).join('\n');}
}
