// Observation only. A pending native approval never authorizes a key press.
export function pendingNativeCommandPermission(screen, {trustSent=false, commandObserved=false}={}) {
 if(!trustSent||!commandObserved||typeof screen!=='string'||screen.length>8192)return false;
 return screen.split('\n').some(line=>line.trim()==='Run this command?');
}
