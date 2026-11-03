// Pure recognition only. No terminal input, files, configuration, or side effects.
// Caller must independently establish the specific user grant, fresh isolated
// /tmp/proof workspace, and a complete, settled xterm screen before any input.
const EXPECTED=Object.freeze([
 'Accessing workspace:',
 '/tmp/proof',
 'Do you trust the contents of this project?',
 'Antigravity CLI requires permission to read, edit, and execute files here.',
 '> Yes, I trust this folder',
 'No, exit',
 '↑/↓ Navigate · enter Confirm',
 'fixture',
]);
export function trustState(screen,{authorizedFixtureWorkspaceTrust=false}={}){
 const bounded=typeof screen==='string'&&screen.length<=8192&&!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(screen);
 const lines=bounded?screen.split('\n').map(line=>line.trim()).filter(Boolean):[];
 const exactModal=lines.length===EXPECTED.length&&lines.every((line,i)=>line===EXPECTED[i]);
 const uniqueFocus=bounded&&(screen.match(/>/g)??[]).length===1;
 const recognized=exactModal&&uniqueFocus;
 return {recognized,workspace:recognized?'/tmp/proof':null,
  mayAccept:recognized&&authorizedFixtureWorkspaceTrust===true};
}
