// Pure gate for the observed idle fixture composer. Never treats a permission modal as a prompt.
export function composerState(screen) {
  if (typeof screen !== 'string' || screen.length > 8192 || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(screen)) return {ready:false};
  const lines=screen.split('\n').map(x=>x.trim()).filter(Boolean);
  const tail=lines.slice(-4);
  const frame=tail.length===4 && /^─{20,}$/.test(tail[0]) && tail[1]==='>' && /^─{20,}$/.test(tail[2]) && /^\? for shortcuts\s+fixture$/.test(tail[3]);
  const known=screen.includes('Antigravity CLI 1.4.7') && lines.some(x=>x.endsWith('      fixture')) && lines.some(x=>x.endsWith('/tmp/proof'));
  const modal=/Terms of Service|Data Use|Do you trust|Navigate ·|Confirm|Allow this|permission required|Approve|No, exit/i.test(screen);
  return {ready:frame && known && !modal};
}
