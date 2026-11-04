// Observation only. A pending native approval never authorizes a key press.
export function pendingNativeCommandPermission(screen, {trustSent=false, commandObserved=false}={}) {
 if(!trustSent||!commandObserved||typeof screen!=='string'||screen.length>8192)return false;
 return screen.split('\n').some(line=>line.trim()==='Run this command?');
}

// Recognition only. The caller owns the one-use authorization budget and must
// verify native provenance and the live, unconsumed permit before pressing Enter.
export function exactWaiterPermission(screen,{expectedCommand}={}) {
 const bounded=typeof screen==='string'&&screen.length<=16384&&!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(screen);
 const commandValid=typeof expectedCommand==='string'&&/^'\/usr\/local\/bin\/node' '\/plugin\/bin\/psst-antigravity-native\.mjs' wait '\/tmp\/proof-home\/\.config\/psst\/antigravity\/native\/[0-9]+-[0-9]+-[0-9a-f-]{36}' '[0-9a-f-]{36}'$/.test(expectedCommand);
 const lines=bounded?screen.split('\n').map(line=>line.trim()).filter(Boolean):[];
 const header=lines.indexOf('Requesting permission for:'),question=lines.indexOf('Run this command?');
 const unique=lines.filter(line=>line==='Requesting permission for:').length===1&&lines.filter(line=>line==='Run this command?').length===1;
 const displayed=header>=0&&question>header?lines.slice(header+1,question).join('').replace(/\s/g,''):null;
 const compact=commandValid?expectedCommand.replace(/\s/g,''):null;
 const exactCommand=commandValid&&displayed!==null&&(displayed===compact||displayed===compact.replaceAll("'",''));
 const options=question>=0?lines.slice(question+1):[];
 const onceFocused=options[0]==='> 1. Yes, run command'&&options.filter(line=>line.startsWith('>')).length===1;
 const cancel=options.indexOf('4. No, cancel');
 const choice2=/^2\. Yes, and always allow in this conversation for commands that start with '(.+)'$/.exec(options[1]??'');
 const choice3=/^3\. Yes, and always allow for commands that start with '(.+)' \(Persist to settings\.json\)$/.exec(options[2]??'');
 // Native abbreviates the *unselected* persistent choices. Their shared label
 // must be a literal prefix of the exact full command verified above.
 const visiblePrefix=choice2?.[1];
 const prefixMatches=typeof visiblePrefix==='string'&&visiblePrefix.endsWith('...')&&visiblePrefix.length>=72&&
  commandValid&&expectedCommand.startsWith(visiblePrefix.slice(0,-3));
 const knownChoices=cancel===3&&Boolean(choice2&&choice3)&&choice3[1]===visiblePrefix&&prefixMatches;
 // Only inert key hints/status may follow the exact four known options. No
 // checkbox, remembered choice, additional control or unrecognized wording.
 const footer=cancel>=0?options.slice(cancel+1).join(' ').replace(/ +/g,' '):'';
 const footerWords=new Set('Navigate Choose choose expand Select select Confirm confirm Accept accept Run run command edit Edit review rerun re-run enter ctrl e g esc Esc cancel to fixture'.split(' '));
 const knownFooter=footer.length>0&&footer.length<160&&/^[A-Za-z0-9 ↑↓/·+.:-]+$/.test(footer)&&
  (footer.match(/[A-Za-z]+/g)??[]).every(word=>footerWords.has(word));
 const safeWords=new Set("Yes No run command and always allow in this conversation for commands that start with Persist to settings json cancel Navigate Choose choose expand Select select Confirm confirm Accept accept enter ctrl e g esc Esc edit Edit review rerun re-run fixture usr local bin node plugin psst-antigravity-native mjs wait 1 2 3 4".split(' '));
 const controlShape=options.join('\n').replace(/[A-Za-z0-9_-]+/g,word=>safeWords.has(word)?word:'?').slice(0,2048);
 return {controlShape,recognized:bounded&&unique&&exactCommand&&onceFocused&&knownChoices&&knownFooter,header:header>=0,question:question>header,exactCommand,onceFocused,knownChoices,knownFooter};
}
