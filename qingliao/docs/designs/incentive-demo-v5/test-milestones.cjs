const assert=require('node:assert/strict');
const E=require('./engine.js');
require('./milestones.js');
const M=globalThis.Milestones,c=E.clone(E.DEFAULT),rain=E.clone(E.PEOPLE[0]);
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS',name);}
test('时长档位在起始点立即跳档',()=>{
 [[0,0],[7199,0],[7200,1],[8399,1],[8400,2],[9599,2],[9600,3],[12000,3]].forEach(([minutes,stage])=>assert.equal(M.duration({...rain,minutes},c).stage,stage));
});
test('跳档后系数与下一档剩余分钟正确',()=>{
 const at7200=M.duration({...rain,minutes:7200},c);
 assert.equal(at7200.coeff,1.2);assert.equal(at7200.nextBoundary,8400);assert.equal(at7200.remaining,1200);assert.equal(at7200.hours,120);
 const at8400=M.duration({...rain,minutes:8400},c);
 assert.equal(at8400.coeff,1.3);assert.equal(at8400.nextBoundary,9600);assert.equal(at8400.remaining,1200);
 const top=M.duration({...rain,minutes:9600},c);
 assert.equal(top.coeff,1.5);assert.equal(top.nextBoundary,null);assert.equal(top.remaining,0);
});
test('新伙伴不突出标准时长档，使用专属系数',()=>{
 const d=M.duration({...rain,minutes:9000,newPartner:true},c);
 assert.equal(d.stage,-1);assert.equal(d.coeff,.8);assert.equal(d.nextBoundary,null);
});
test('复购档位默认在15%档且已计入',()=>{
 const t=M.conversion(rain,c);
 assert.equal(t.stage,2);assert.equal(t.applied,true);assert.equal(t.reason,null);assert.equal(t.amount,800);assert.equal(t.next.rate,18);assert.equal(t.needed,2);
});
test('留存未达时保留指标所在档但不计入',()=>{
 const t=M.conversion({...rain,retained:100},c);
 assert.equal(t.stage,2);assert.equal(t.applied,false);assert.equal(t.reason,'retention');assert.equal(t.amount,0);
});
test('新客样本不足只限制30天档位',()=>{
 const t=M.conversion({...rain,newCount:20,returned:3,retained:19,senior:30},c);
 assert.equal(t.stage,2);assert.equal(t.applied,false);assert.equal(t.reason,'sample');
});
test('没有新客时不伪造档位',()=>{
 const t=M.conversion({...rain,newCount:0,returned:0},c);
 assert.equal(t.stage,-1);assert.equal(t.applied,false);
});
console.log(`${tests} milestone tests passed.`);
