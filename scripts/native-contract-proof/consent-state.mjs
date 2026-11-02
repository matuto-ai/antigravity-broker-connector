// Exact fixture-only user consent: terms accepted only with optional collection unchecked.
// Never infer a checkbox state from earlier transcript output.
export function consentState(screen) {
 const terms=screen.includes('Terms of Service & Data Use')&&screen.includes('https://antigravity.google/terms');
 const checked=/^\s*>?\s*\[x\] Yes, I agree to help improve Antigravity CLI by allowing\b/mi.test(screen);
 const unchecked=/^\s*>?\s*\[ \] Yes, I agree to help improve Antigravity CLI by allowing\b/m.test(screen);
 const focusedChecked=/^\s*>\s*\[x\] Yes, I agree to help improve Antigravity CLI by allowing\b/mi.test(screen);
 const focusCount=(screen.match(/^[ \t]*>/gm)??[]).length;
 const selectedAccept=/^\s*>\s*(?:Accept|Accept and continue)\s*$/mi.test(screen);
 return {focusCount,terms,checked,unchecked,focusedChecked,selectedAccept,
  mayUncheck:focusCount===1&&terms&&focusedChecked&&!unchecked,
  mayAccept:focusCount===1&&terms&&unchecked&&!checked&&selectedAccept};
}

// No normal-composer signature has yet been captured from the pinned native CLI.
// Modal disappearance is not permission to type commands into the next screen.
export function postConsentState(screen) {
 return {action:'stop_post_consent_composer_unverified',screen,maySendCommand:false};
}
