// Observation only. A pending native approval never authorizes a key press.
export function pendingNativeCommandPermission(screen, {trustSent=false, commandObserved=false}={}) {
 if(!trustSent||!commandObserved||typeof screen!=='string'||screen.length>8192)return false;
 return screen.split('\n').some(line=>line.trim()==='Run this command?');
}

// Recognition only. The caller owns the one-use authorization budget and must
// verify native provenance and the live, unconsumed permit before pressing Enter.
export function exactWaiterPermission(screen,{expectedCommand}={}) {
 const bounded=typeof screen==='string'&&screen.length<=16384&&!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(screen);
 const commandValid=typeof expectedCommand==='string'&&/^'\/usr\/local\/bin\/node' '\/plugin\/bin\/psst-antigravity-native\.mjs' (?:wait|wait-approval) '\/tmp\/proof-home\/\.config\/psst\/antigravity\/native\/[0-9]+-[0-9]+-[0-9a-f-]{36}' '[0-9a-f-]{36}'$/.test(expectedCommand);
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
 const knownFooter=footer==='↑/↓ Navigate · tab Amend · ctrl+g edit/expand command esc to cancel fixture';
 const safeWords=new Set("Yes No run command and always allow in this conversation for commands that start with Persist to settings json cancel Navigate tab Amend Choose choose expand Select select Confirm confirm Accept accept enter ctrl e g esc Esc edit Edit review rerun re-run fixture usr local bin node plugin psst-antigravity-native mjs wait 1 2 3 4".split(' '));
 const controlShape=options.join('\n').replace(/[A-Za-z0-9_-]+/g,word=>safeWords.has(word)?word:'?').slice(0,2048);
 const keyHint=/^↑\/↓ Navigate · ([A-Za-z0-9+-]{1,8}) ([A-Za-z]{1,10}) · ctrl\+g edit\/expand command esc to cancel fixture$/.exec(footer);
 const footerDiagnostic=exactCommand&&knownChoices&&onceFocused&&keyHint?{key:keyHint[1],label:keyHint[2]}:null;
 return {footerDiagnostic,controlShape,recognized:bounded&&unique&&exactCommand&&onceFocused&&knownChoices&&knownFooter,header:header>=0,question:question>header,exactCommand,onceFocused,knownChoices,knownFooter};
}

// Separate regression scope: a pending prompt must stop the fixture without
// authorizing execution. A pass here is never automatic-arrival acceptance.
// util-linux script may handle the requested SIGTERM and exit 0. Both observed
// forms require a successfully sent stop signal and independently verified cleanup.
export function nativePermissionBoundaryVerified(s) {
 return ['idle','setup','busy'].includes(s.mode)&&s.confirmationBudget===0&&s.permissionConfirmations===0&&
  s.nativePermissionBlocked===true&&s.provenanceVerified===true&&s.commandCount===1&&s.promptRecognized===true&&
  s.inboxProcesses===0&&s.approvalProcesses===0&&s.waiterCompleted===0&&s.approvalWaiterCompleted===0&&s.rearmCompleted===0&&
  s.messagesCompleted===0&&s.idleSeeded===false&&s.approvalGranted===false&&s.permissionsUnchanged===true&&s.shutdownVerified===true&&
  s.boundaryStopSignalSent===true&&((s.nativeSignal==='SIGTERM'&&s.nativeExit===null)||(s.nativeSignal===null&&s.nativeExit===0))&&
  s.providerFailure===null&&s.parserFailed===false&&s.timedOut===false&&s.overflow===false&&
  s.collectionUnchecked===true&&s.termsAccepted===true&&s.trustConfirmationSent===true&&s.consentBlocked===false;
}
