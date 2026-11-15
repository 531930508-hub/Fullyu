(function(root){
'use strict';
const E=Incentive;
function duration(p,c){
 const boundaries=[7200,8400,9600];
 const stage=p.newPartner?-1:p.minutes<7200?0:p.minutes<8400?1:p.minutes<9600?2:3;
 const nextBoundary=stage>=0&&stage<3?boundaries[stage]:null;
 return {stage,minutes:p.minutes,hours:p.minutes/60,coeff:E.coefficient(p.minutes,c,p.newPartner),nextBoundary,remaining:nextBoundary===null?0:Math.max(0,nextBoundary-p.minutes)};
}
function conversion(p,c){
 const r=E.calculate(p,c);
 const stage=p.newCount?c.tiers.reduce((found,t,i)=>r.conversion+1e-10>=t.rate?i:found,-1):-1;
 const reason=!r.eligible?'retention':p.newCount<c.minNew?'sample':null;
 return {stage,applied:reason===null&&stage>=0,reason,amount:r.tier,next:r.nextTier,needed:r.needed};
}
root.Milestones={duration,conversion};
})(typeof window!=='undefined'?window:globalThis);
