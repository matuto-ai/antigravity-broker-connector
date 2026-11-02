// Exact fixture-only user consent: terms accepted only with optional collection unchecked.
// Never infer a checkbox state from earlier transcript output.
export function consentState(screen) {
 const terms=screen.includes('Terms of Service & Data Use')&&screen.includes('https://antigravity.google/terms');
 const checked=/^\s*>?\s*\[x\] Yes, I agree to help improve Antigravity CLI by allowing\b/mi.test(screen);
 const unchecked=/^\s*>?\s*\[ \] Yes, I agree to help improve Antigravity CLI by allowing\b/m.test(screen);
 const focusedChecked=/^\s*>\s*\[x\] Yes, I agree to help improve Antigravity CLI by allowing\b/mi.test(screen);
 const focusCount=(screen.match(/>/g)??[]).length;
 const focusedUnchecked=/^[ \t]*>[ \t]*\[ \] Yes, I agree to help improve Antigravity CLI by allowing\b/m.test(screen);
 const selectedPrevious=/(?:^|[ \t])>[ \t]*(?:\[Previous\]|Previous)(?=[ \t]|$)/m.test(screen);
 const selectedDone=/(?:^|[ \t])>[ \t]*(?:\[Done\]|Done)(?=[ \t]|$)/m.test(screen);
 const nativeButtons=(screen.includes('[Previous]')||selectedPrevious)&&(screen.includes('[Done]')||selectedDone);
 const arrowNavigation=screen.includes('↑/↓ Navigate');
 const selectedAccept=/^\s*>\s*(?:Accept|Accept and continue)\s*$/mi.test(screen);
 return {focusCount,terms,checked,unchecked,focusedChecked,focusedUnchecked,selectedPrevious,selectedDone,nativeButtons,arrowNavigation,selectedAccept,
  mayUncheck:focusCount===1&&terms&&focusedChecked&&!unchecked,
  mayAccept:focusCount===1&&terms&&unchecked&&!checked&&(selectedAccept||(selectedDone&&nativeButtons))};
}

// No normal-composer signature has yet been captured from the pinned native CLI.
// Modal disappearance is not permission to type commands into the next screen.
export function postConsentState(screen) {
 return {action:'stop_post_consent_composer_unverified',screen,maySendCommand:false};
}

// Only the recorded checkbox -> Previous -> Done controls are eligible for bounded
// navigation. Horizontal Previous -> Done uses one authorized Right, not an
// inferred Enter. The next settled screen must visibly prove Done focus.
export function consentNavigation(state, previousFocus=null, steps=0) {
 if(!state.terms||!state.unchecked||state.checked||state.focusCount!==1)return {action:'stop'};
 if(state.mayAccept)return {action:'accept'};
 if(!state.nativeButtons||!state.arrowNavigation||steps>=2)return {action:'stop'};
 if(state.focusedUnchecked&&previousFocus===null&&steps===0)return {action:'down',focus:'checkbox'};
 if(state.selectedPrevious&&previousFocus==='checkbox'&&steps===1)return {action:'right',focus:'previous'};
 return {action:'stop'};
}

export function navigationRenderState(sentVersion,currentVersion,elapsedMs){
 if(sentVersion!==currentVersion)return 'changed';
 return elapsedMs<1000?'wait':'stop';
}
