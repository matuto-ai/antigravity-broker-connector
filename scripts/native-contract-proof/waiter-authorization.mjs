// Fixed, test-only authorization plans. No arbitrary budget, extra phase or retry.
export function waiterAuthorizationPlan(mode,flag) {
 if(flag===undefined)return [];
 if(flag==='--confirm-waiter-once'&&mode==='idle')return ['inbox'];
 if(flag==='--confirm-authorized-matrix'){
  if(mode==='idle'||mode==='busy')return ['inbox','rearm'];
  if(mode==='setup')return ['approval','inbox','rearm'];
 }
 throw Error('unsupported_native_waiter_authorization');
}
export function expectedWaiterPhase(plan,confirmed,s) {
 if(!Array.isArray(plan)||!Number.isSafeInteger(confirmed)||confirmed<0||confirmed>=plan.length)return null;
 const phase=plan[confirmed];
 if(phase==='approval')return s.mode==='setup'&&!s.approvalGranted&&s.setup.completed===2&&s.approval.sent===1&&s.approval.completed===0&&s.turn.completed===0?'approval':null;
 const setupReady=s.mode!=='setup'||s.approvalGranted&&s.approval.completed===1;
 if(!setupReady||s.turn.completed!==2)return null;
 if(phase==='inbox')return s.inbox.sent===1&&s.inbox.completed===0&&s.messages.completed===0&&s.rearm.sent===0?'inbox':null;
 if(phase==='rearm')return s.inbox.completed===1&&s.messages.completed===s.messageTools&&s.rearm.sent===1&&s.rearm.completed===0&&s.idleSeeded&&(s.mode!=='busy'||s.busyInjection)?'rearm':null;
 return null;
}
