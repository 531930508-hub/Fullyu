const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../incentive-demo-v3/engine.js');
const ctx={Incentive:E};
const filename=__dirname+'/milestones.js';
if(fs.existsSync(filename))vm.runInNewContext(fs.readFileSync(filename,'utf8'),ctx);
const M=ctx.Milestones||{};
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
const c=E.clone(E.DEFAULT),p=E.clone(E.PEOPLE[0]);
test('时长阶梯展示能力存在',()=>assert.equal(typeof M.duration,'function'));
if(M.duration){
 test('135小时在第二档且展示8100分钟',()=>{const d=M.duration(p,c);assert.equal(d.stage,1);assert.equal(d.hours,135);assert.equal(d.minutes,8100);assert.equal(d.coeff,1.2);assert.equal(d.nextBoundary,8400);assert.equal(d.remaining,300);});
 test('三处精确边界不提前跳档',()=>[7200,7201,8400,8401,9600,9601].forEach((minutes,i)=>assert.equal(M.duration({...p,minutes},c).stage,[0,1,1,2,2,3][i])));
 test('高于160小时进入第四档且没有下一档',()=>{const d=M.duration({...p,minutes:12000},c);assert.equal(d.stage,3);assert.equal(d.nextBoundary,null);assert.equal(d.coeff,1.5);});
 test('新伙伴独立系数不得伪装解锁标准阶梯',()=>{const d=M.duration({...p,newPartner:true,minutes:10000},c);assert.equal(d.stage,-1);assert.equal(d.coeff,.8);assert.equal(d.nextBoundary,null);});
 test('零时长与自定义系数',()=>{const d=M.duration({...p,minutes:0},{...c,coefficients:[1.1,1.3,1.4,1.6]});assert.equal(d.stage,0);assert.equal(d.coeff,1.1);assert.equal(d.remaining,7200);});
}
test('复购阶梯展示能力存在',()=>assert.equal(typeof M.conversion,'function'));
if(M.conversion){
 test('默认15档计800，下一档18差2位',()=>{const s=M.conversion(p,c);assert.equal(s.stage,2);assert.equal(s.applied,true);assert.equal(s.amount,800);assert.equal(s.next.rate,18);assert.equal(s.needed,2);});
 test('五档精确边界',()=>[10,12,15,18,20].forEach((returned,i)=>assert.equal(M.conversion({...p,newCount:100,returned},c).stage,i)));
 test('显示四舍五入不提前解锁',()=>assert.equal(M.conversion({...p,newCount:100000,returned:14999},c).stage,1));
 test('留存不足仍显示指标所在档但不计金额',()=>{const s=M.conversion({...p,senior:100,retained:59},c);assert.equal(s.stage,2);assert.equal(s.applied,false);assert.equal(s.amount,0);assert.equal(s.reason,'retention');});
 test('小样本不能展示为已获得档位奖励',()=>{const s=M.conversion({...p,newCount:20,returned:4},c);assert.equal(s.stage,4);assert.equal(s.amount,0);assert.equal(s.applied,false);assert.equal(s.reason,'sample');});
 test('无样本显示无有效比例位置',()=>{const s=M.conversion({...p,newCount:0,returned:0},c);assert.equal(s.stage,-1);assert.equal(s.amount,0);});
 test('最高档没有虚构下一档',()=>assert.equal(M.conversion({...p,newCount:100,returned:25},c).next,null));
}
const mobile=fs.readFileSync(__dirname+'/mobile.js','utf8');
test('移除手机日期及时间范围筛选',()=>assert.doesNotMatch(mobile,/id="(?:axisStart|axisEnd|month)"|data-axis=/));
test('累计成就不是折叠区并位于奖励前',()=>{assert.match(mobile,/id="achievementOverview"/);assert.doesNotMatch(mobile,/disclosure\('achievementDetails'/);assert.ok(mobile.indexOf('id="achievementOverview"')<mobile.indexOf('${rewardHTML(p)}'));});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
