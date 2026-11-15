const assert=require('node:assert/strict');
const E=require('./engine.js');
const c=E.clone(E.DEFAULT),rain=E.clone(E.PEOPLE[0]);
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS',name);}
function summary(p,month='2026-10',records=E.TRAINING_RECORDS,orders=E.TRAINING_ORDERS,asOf=E.TODAY,config=c){return E.trainingSummary(p,config,month,{records,orders},asOf);}
function row(s,id){return s.rows.find(x=>x.projectId===id);}
function project(id){return c.trainingProjects.find(x=>x.id===id);}

test('八项培训项目固定且互相独立',()=>{
 assert.equal(c.trainingProjects.length,8);
 assert.deepEqual(c.trainingProjects.map(x=>x.id),['sujin-face','sujin-hand','sujin-head','sujin-shoulder','sujin-eye','sujin-leg','headspa-60','headspa-90']);
 assert.equal(c.trainingProjects.filter(x=>x.group==='全感舒筋').length,6);
 assert.deepEqual(c.trainingProjects.filter(x=>x.group==='头部水疗').map(x=>x.duration),[60,90]);
 assert.ok(c.trainingProjects.every(x=>x.target===5&&x.amount===500));
 assert.equal(new Set(c.trainingProjects.map(x=>x.id)).size,8);
});
test('基础系数达到起始分钟即跳档',()=>{
 [0,7199,7200,8399,8400,9599,9600,12000].forEach((minutes,i)=>assert.equal(E.coefficient(minutes,c),[1,1,1.2,1.2,1.3,1.3,1.5,1.5][i]));
 assert.equal(E.coefficient(7200,c,false),1.2);
 assert.equal(E.coefficient(8400,c,false),1.3);
 assert.equal(E.coefficient(9600,c,false),1.5);
});
test('7200分钟按1.2计基础奖励',()=>assert.equal(E.calculate({...rain,minutes:7200},c).base,8640));
test('7199分钟仍按1.0计基础奖励',()=>assert.equal(E.calculate({...rain,minutes:7199},c).base,7199));
test('默认培训汇总按考核次日起累计，且仅计入达标当月',()=>{
 const s=summary(rain);
 assert.equal(s.rows.length,8);
 assert.equal(s.total,500);
 const head=row(s,'sujin-head');
 assert.equal(head.status,'completed');
 assert.equal(head.passedAt,'2026-02-03');
 assert.equal(head.start,'2026-02-04');
 assert.equal(head.completionDate,'2026-04-02');
 assert.equal(head.earnedThisMonth,0);
 assert.equal(head.count,5);
 assert.equal(head.rawCount,6);
 const shoulder=row(s,'sujin-shoulder');
 assert.equal(shoulder.status,'completed-this-month');
 assert.equal(shoulder.completionDate,'2026-10-18');
 assert.equal(shoulder.earnedThisMonth,500);
 const face=row(s,'sujin-face');
 assert.equal(face.status,'active');
 assert.equal(face.count,4);
 assert.equal(face.remaining,1);
 const spa=row(s,'headspa-60');
 assert.equal(spa.status,'active');
 assert.equal(spa.count,3);
 assert.equal(row(s,'sujin-hand').status,'uncertified');
});
test('通过考核当日订单不计入，次日开始计入',()=>{
 const projectId='sujin-head';
 const target=3;
 const config=E.clone(c);config.trainingProjects.find(x=>x.id===projectId).target=target;
 const records=[{personId:'rain',projectId,passedAt:'2026-02-03'}];
 const orders=['2026-02-03','2026-02-04','2026-02-05','2026-02-06'].map(date=>({personId:'rain',projectId,date}));
 const s=summary(rain,'2026-02',records,orders,'2026-02-28',config);
 const r=row(s,projectId);
 assert.equal(r.start,'2026-02-04');
 assert.equal(r.rawCount,3);
 assert.equal(r.completionDate,'2026-02-06');
 assert.equal(r.earnedThisMonth,500);
});
test('差一单不达标，刚好达标才计入',()=>{
 const projectId='sujin-head',config=E.clone(c);config.trainingProjects.find(x=>x.id===projectId).target=3;
 const records=[{personId:'rain',projectId,passedAt:'2026-02-03'}];
 const orders=['2026-02-04','2026-02-05'].map(date=>({personId:'rain',projectId,date}));
 let r=row(summary(rain,'2026-02',records,orders,'2026-02-28',config),projectId);
 assert.equal(r.status,'active');assert.equal(r.earnedThisMonth,0);assert.equal(r.completionDate,null);
 orders.push({personId:'rain',projectId,date:'2026-02-06'});
 r=row(summary(rain,'2026-02',records,orders,'2026-02-28',config),projectId);
 assert.equal(r.status,'completed-this-month');assert.equal(r.earnedThisMonth,500);assert.equal(r.completionDate,'2026-02-06');
});
test('月份边界含当月最后一日，不含次月第一日',()=>{
 const projectId='sujin-head',config=E.clone(c);config.trainingProjects.find(x=>x.id===projectId).target=2;
 const records=[{personId:'rain',projectId,passedAt:'2026-09-30'}];
 const orders=[{personId:'rain',projectId,date:'2026-10-31'},{personId:'rain',projectId,date:'2026-11-01'}];
 let r=row(summary(rain,'2026-10',records,orders,'2026-10-31',config),projectId);
 assert.equal(r.rawCount,1);assert.equal(r.status,'active');assert.equal(r.earnedThisMonth,0);
 r=row(summary(rain,'2026-11',records,orders,'2026-11-30',config),projectId);
 assert.equal(r.rawCount,2);assert.equal(r.status,'completed-this-month');assert.equal(r.completionDate,'2026-11-01');assert.equal(r.earnedThisMonth,500);
});
test('早月达标不重复计入后续月份',()=>{
 const projectId='sujin-head',config=E.clone(c);config.trainingProjects.find(x=>x.id===projectId).target=3;
 const records=[{personId:'rain',projectId,passedAt:'2026-07-31'}];
 const orders=['2026-08-01','2026-08-02','2026-08-03'].map(date=>({personId:'rain',projectId,date}));
 const aug=row(summary(rain,'2026-08',records,orders,'2026-08-31',config),projectId);
 assert.equal(aug.earnedThisMonth,500);assert.equal(aug.completionDate,'2026-08-03');
 const sep=row(summary(rain,'2026-09',records,orders,'2026-09-30',config),projectId);
 assert.equal(sep.status,'completed');assert.equal(sep.earnedThisMonth,0);
});
test('每个项目可独立设置次数与金额',()=>{
 const config=E.clone(c);config.trainingProjects.find(x=>x.id==='sujin-head').target=2;config.trainingProjects.find(x=>x.id==='sujin-head').amount=700;config.trainingProjects.find(x=>x.id==='sujin-face').target=3;config.trainingProjects.find(x=>x.id==='sujin-face').amount=300;
 const records=[{personId:'rain',projectId:'sujin-head',passedAt:'2026-02-03'},{personId:'rain',projectId:'sujin-face',passedAt:'2026-02-03'}];
 const orders=[{personId:'rain',projectId:'sujin-head',date:'2026-02-04'},{personId:'rain',projectId:'sujin-head',date:'2026-02-05'},{personId:'rain',projectId:'sujin-face',date:'2026-02-04'},{personId:'rain',projectId:'sujin-face',date:'2026-02-05'}];
 const s=summary(rain,'2026-02',records,orders,'2026-02-28',config);
 assert.equal(row(s,'sujin-head').earnedThisMonth,700);
 assert.equal(row(s,'sujin-face').status,'active');
 assert.equal(row(s,'sujin-face').earnedThisMonth,0);
 assert.equal(s.total,700);
});
test('不同项目订单互不串计，未知项目订单忽略',()=>{
 const records=[{personId:'rain',projectId:'sujin-head',passedAt:'2026-02-03'}];
 const orders=[{personId:'rain',projectId:'sujin-face',date:'2026-02-04'},{personId:'rain',projectId:'unknown',date:'2026-02-05'},{personId:'rain',projectId:'sujin-head',date:'2026-02-06'}];
 const s=summary(rain,'2026-02',records,orders,'2026-02-28');
 assert.equal(row(s,'sujin-head').count,1);
 assert.equal(row(s,'sujin-face').status,'uncertified');
});
test('未登记考核的项目即使有订单也不累计',()=>{
 const orders=[{personId:'rain',projectId:'sujin-hand',date:'2026-02-04'}];
 const s=summary(rain,'2026-02',[],orders,'2026-02-28');
 const r=row(s,'sujin-hand');assert.equal(r.status,'uncertified');assert.equal(r.count,0);assert.equal(s.total,0);
});
test('修改考核日期会重算同一批订单',()=>{
 const projectId='sujin-head',config=E.clone(c);config.trainingProjects.find(x=>x.id===projectId).target=2;
 const orders=['2026-02-01','2026-02-05','2026-02-09'].map(date=>({personId:'rain',projectId,date}));
 let s=summary(rain,'2026-02',[{personId:'rain',projectId,passedAt:'2026-02-04'}],orders,'2026-02-28',config);
 assert.equal(row(s,projectId).rawCount,2);assert.equal(row(s,projectId).status,'completed-this-month');
 s=summary(rain,'2026-02',[{personId:'rain',projectId,passedAt:'2026-02-08'}],orders,'2026-02-28',config);
 assert.equal(row(s,projectId).rawCount,1);assert.equal(row(s,projectId).status,'active');assert.equal(s.total,0);
});
test('考核日当晚尚未到次日时进度为零',()=>{
 const projectId='sujin-head';
 const records=[{personId:'rain',projectId,passedAt:'2026-10-21'}];
 const orders=[{personId:'rain',projectId,date:'2026-10-21'},{personId:'rain',projectId,date:'2026-10-22'}];
 const r=row(summary(rain,'2026-10',records,orders,'2026-10-21'),projectId);
 assert.equal(r.start,'2026-10-22');assert.equal(r.status,'upcoming');assert.equal(r.count,0);
});
test('统计截止日早于达标订单时不提前计入',()=>{
 let s=summary(rain,'2026-10',E.TRAINING_RECORDS,E.TRAINING_ORDERS,'2026-10-17');
 assert.equal(row(s,'sujin-shoulder').status,'active');assert.equal(row(s,'sujin-shoulder').count,4);assert.equal(s.total,0);
 s=summary(rain,'2026-10',E.TRAINING_RECORDS,E.TRAINING_ORDERS,'2026-10-18');
 assert.equal(row(s,'sujin-shoulder').status,'completed-this-month');assert.equal(s.total,500);
});
test('历史月份按该月规则与月末统计',()=>{
 const sep=summary(rain,'2026-09');
 assert.equal(sep.total,0);
 assert.equal(row(sep,'headspa-60').status,'upcoming');
});
test('培训补贴进入接单奖励合计',()=>{
 const r=E.calculate(rain,c);
 assert.equal(r.training,500);
 assert.equal(r.base,9720);
 assert.equal(r.repurchase,870);
 assert.equal(r.subtotal,11090);
});
test('默认历史配置与九月份培训不串月',()=>{
 const old={...E.clone(c),effective:'2026-09',version:'2026-09 历史'};
 assert.equal(E.ruleFor('2026-09',[c,old]).effective,'2026-09');
 assert.equal(E.ruleFor('2026-10',[c,old]).effective,'2026-10');
 assert.equal(summary(rain,'2026-09',E.TRAINING_RECORDS,E.TRAINING_ORDERS,'2026-09-30',old).total,0);
});
test('培训参数校验拒绝零次数、非整数、负金额、重复ID和空名称',()=>{
 const badTarget=E.clone(c);badTarget.trainingProjects[0].target=0;assert.match(E.validation(badTarget),/次数/);
 const fraction=E.clone(c);fraction.trainingProjects[0].target=2.5;assert.match(E.validation(fraction),/次数/);
 const negative=E.clone(c);negative.trainingProjects[0].amount=-1;assert.match(E.validation(negative),/金额/);
 const duplicate=E.clone(c);duplicate.trainingProjects[1].id=duplicate.trainingProjects[0].id;assert.match(E.validation(duplicate),/编号/);
 const empty=E.clone(c);empty.trainingProjects[0].name='';assert.match(E.validation(empty),/名称/);
 const zero=E.clone(c);zero.trainingProjects[0].amount=0;assert.equal(E.validation(zero),'');
});
test('旧schema被拒绝',()=>assert.match(E.validation({...c,schema:3}),/V5/));
test('培训项目金额可全为0',()=>{const config=E.clone(c);config.trainingProjects.forEach(p=>p.amount=0);assert.equal(summary(rain,'2026-10',E.TRAINING_RECORDS,E.TRAINING_ORDERS,'2026-10-21',config).total,0);});
test('斐波那契、档位与店长奖励回归',()=>{
 assert.deepEqual(E.sequence(10,c),[10,10,20,30,50,80,130,130,130,130]);
 assert.equal(E.fib([1,1,1,1],c).amount,70);
 assert.equal(E.fib([...Array(8).fill(1),.5],c).amount,525);
 assert.equal(E.calculate({...rain,newCount:100,returned:20},c).tier,1500);
 assert.equal(E.calculate(E.PEOPLE[2],c).manager,2168);
 assert.equal(E.calculate(E.PEOPLE[2],c,'2026-10',{west:200000}).manager,2000);
});
test('窗口与原结算金额链回归',()=>{
 assert.equal(E.windowFor('2026-10',6,2),'2026-03 ~ 2026-08');
 const r=E.calculate(rain,c);
 assert.equal(r.gross,11190);
 assert.equal(r.preTax,Math.round(r.gross/1.068));
 assert.equal(r.net,E.round(r.preTax-r.tax));
});
console.log(`${tests} tests passed.`);
