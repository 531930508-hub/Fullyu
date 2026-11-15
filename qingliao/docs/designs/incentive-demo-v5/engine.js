/* V5 交互原型共享引擎；不连接生产服务，不写正式账单。 */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const TODAY='2026-10-21';

/* 培训项目范围固定：全感舒筋 6 个部位 + 头部水疗 60/90 分钟。 */
const TRAINING_PROJECTS=[
 {id:'sujin-face',group:'全感舒筋',name:'面部',part:'面部',projectId:2,duration:null,target:5,amount:500},
 {id:'sujin-hand',group:'全感舒筋',name:'手部',part:'手部',projectId:2,duration:null,target:5,amount:500},
 {id:'sujin-head',group:'全感舒筋',name:'头部',part:'头部',projectId:2,duration:null,target:5,amount:500},
 {id:'sujin-shoulder',group:'全感舒筋',name:'肩部',part:'肩部',projectId:2,duration:null,target:5,amount:500},
 {id:'sujin-eye',group:'全感舒筋',name:'眼部',part:'眼部',projectId:2,duration:null,target:5,amount:500},
 {id:'sujin-leg',group:'全感舒筋',name:'腿部',part:'腿部',projectId:2,duration:null,target:5,amount:500},
 {id:'headspa-60',group:'头部水疗',name:'60 分钟',part:null,projectId:1,duration:60,target:5,amount:500},
 {id:'headspa-90',group:'头部水疗',name:'90 分钟',part:null,projectId:1,duration:90,target:5,amount:500}
];

/* 模拟有效已完成订单：日期固定，不随考核日期移动。 */
const ORDER_DATES={
 rain:{
  'sujin-head':['2026-01-20','2026-02-04','2026-02-18','2026-03-05','2026-03-19','2026-04-02','2026-04-16'],
  'sujin-face':['2026-05-30','2026-06-16','2026-06-28','2026-07-10','2026-08-01'],
  'sujin-shoulder':['2026-09-10','2026-09-26','2026-09-30','2026-10-05','2026-10-12','2026-10-18'],
  'headspa-60':['2026-10-11','2026-10-15','2026-10-20']
 },
 sylvia:{
  'sujin-eye':['2026-04-20','2026-05-07','2026-05-20','2026-06-02','2026-06-18','2026-07-01'],
  'sujin-leg':['2026-08-01','2026-08-19','2026-09-02','2026-09-20','2026-10-03'],
  'headspa-90':['2026-08-20','2026-09-02','2026-09-15','2026-09-29','2026-10-06','2026-10-14']
 },
 lin:{
  'sujin-shoulder':['2026-03-30','2026-04-11','2026-04-25','2026-05-08','2026-05-22','2026-06-04'],
  'sujin-head':['2026-09-01','2026-09-16','2026-09-25','2026-10-02','2026-10-09','2026-10-16'],
  'headspa-60':['2026-06-02','2026-06-20','2026-07-05','2026-07-30'],
  'sujin-face':['2026-10-13','2026-10-17']
 },
 tom:{
  'sujin-head':['2026-03-10','2026-03-21','2026-04-04','2026-04-20','2026-05-06','2026-05-25'],
  'headspa-90':['2026-09-20','2026-10-06','2026-10-10','2026-10-16']
 },
 ivy:{
  'sujin-face':['2026-09-21','2026-10-02','2026-10-12']
 },
 ning:{
  'sujin-eye':['2026-07-02','2026-07-18','2026-08-02','2026-08-19','2026-09-03','2026-09-22'],
  'sujin-leg':['2026-08-28','2026-09-11','2026-09-24','2026-10-01','2026-10-08'],
  'headspa-60':['2026-09-26','2026-09-30','2026-10-05','2026-10-11','2026-10-17'],
  'sujin-shoulder':['2026-06-09','2026-06-22','2026-07-04','2026-07-19','2026-08-04']
 }
};
const TRAINING_ORDERS=Object.entries(ORDER_DATES).flatMap(([personId,projects])=>Object.entries(projects).flatMap(([projectId,dates])=>dates.map(date=>({personId,projectId,date}))));

/* 考核通过日期由管理端单独维护；同一疗愈师同一项目保留一条当前记录。 */
const TRAINING_RECORDS=[
 {personId:'rain',projectId:'sujin-head',passedAt:'2026-02-03'},
 {personId:'rain',projectId:'sujin-face',passedAt:'2026-06-15'},
 {personId:'rain',projectId:'sujin-shoulder',passedAt:'2026-09-25'},
 {personId:'rain',projectId:'headspa-60',passedAt:'2026-10-10'},
 {personId:'sylvia',projectId:'sujin-eye',passedAt:'2026-05-06'},
 {personId:'sylvia',projectId:'sujin-leg',passedAt:'2026-08-18'},
 {personId:'sylvia',projectId:'headspa-90',passedAt:'2026-09-01'},
 {personId:'lin',projectId:'sujin-shoulder',passedAt:'2026-04-10'},
 {personId:'lin',projectId:'sujin-head',passedAt:'2026-09-15'},
 {personId:'lin',projectId:'headspa-60',passedAt:'2026-06-01'},
 {personId:'lin',projectId:'sujin-face',passedAt:'2026-10-12'},
 {personId:'tom',projectId:'sujin-head',passedAt:'2026-03-20'},
 {personId:'tom',projectId:'headspa-90',passedAt:'2026-10-05'},
 {personId:'ivy',projectId:'sujin-face',passedAt:'2026-09-20'},
 {personId:'ning',projectId:'sujin-eye',passedAt:'2026-07-01'},
 {personId:'ning',projectId:'sujin-leg',passedAt:'2026-09-10'},
 {personId:'ning',projectId:'headspa-60',passedAt:'2026-09-25'},
 {personId:'ning',projectId:'sujin-shoulder',passedAt:'2026-06-08'}
];

const DEFAULT={
 schema:5,version:'2026-10 · V5示例',effective:'2026-10',
 a1:10,a2:10,cap:130,retention:60,minNew:30,retentionLength:6,retentionOffset:2,conversionLength:3,conversionOffset:1,
 coefficients:[1,1.2,1.3,1.5],newCoefficient:0.8,
 tiers:[{rate:10,amount:200},{rate:12,amount:400},{rate:15,amount:800},{rate:18,amount:1100},{rate:20,amount:1500}],
 trainingProjects:clone(TRAINING_PROJECTS),
 shops:[{id:'west',name:'西岸店',target:200000,commissionRate:1},{id:'raffles',name:'来福士店',target:180000,commissionRate:1}]
};

const PEOPLE=[
 {id:'rain',name:'张小雨',initial:'雨',shop:'west',manager:false,minutes:8100,retained:136,senior:214,newCount:45,returned:7,weights:[1,1,1,1],adjustments:[{name:'服务时长补记',amount:120},{name:'前期结算修正',amount:-20}],priorIncome:18000,priorTax:132,entry:'2026-01-08'},
 {id:'sylvia',name:'雅雅 Sylvia',initial:'雅',shop:'west',manager:false,minutes:8640,retained:90,senior:150,newCount:40,returned:5,weights:[1,1,1,1,0.5],adjustments:[],priorIncome:19000,priorTax:156,entry:'2025-11-12'},
 {id:'lin',name:'林然',initial:'林',shop:'west',manager:true,minutes:6900,retained:126,senior:180,newCount:50,returned:10,weights:[1,1,1,1,1,1,1,1],adjustments:[],priorIncome:16000,priorTax:84,entry:'2025-08-10'},
 {id:'tom',name:'阿周 Tom',initial:'周',shop:'raffles',manager:false,minutes:7800,retained:116,senior:200,newCount:40,returned:6,weights:[1,1,1,0.5],adjustments:[],priorIncome:15000,priorTax:60,entry:'2026-02-03'},
 {id:'ivy',name:'豆子 Ivy',initial:'豆',shop:'raffles',manager:false,newPartner:true,minutes:3600,retained:19,senior:30,newCount:20,returned:3,weights:[1,1],adjustments:[],priorIncome:3000,priorTax:0,entry:'2026-09-15'},
 {id:'ning',name:'周宁',initial:'宁',shop:'raffles',manager:true,minutes:9601,retained:145,senior:210,newCount:50,returned:9,weights:[1,1,1,1,1,1],adjustments:[],priorIncome:21000,priorTax:204,entry:'2025-09-12'}
];
const REVENUE={west:216800,raffles:169200};

function sequence(count,c){let a=Math.round(c.a1*100),b=Math.round(c.a2*100),cap=Math.round(c.cap*100),out=[];for(let n=0;n<count;n++){const raw=n===0?a:n===1?b:Math.min(a+b,cap);if(n>1){a=b;b=raw;}out.push(Math.min(raw,cap)/100);}return out;}
function fib(weights,c){const prices=sequence(weights.length+1,c);return {amount:round(weights.reduce((s,w,i)=>s+w*prices[i],0)),heads:round(weights.reduce((s,w)=>s+w,0)),count:weights.length,nextSeq:weights.length+1,next:prices[weights.length],prices};}
function coefficient(minutes,c,newPartner=false){return newPartner?c.newCoefficient:c.coefficients[minutes<7200?0:minutes<8400?1:minutes<9600?2:3];}
function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7);}
function windowFor(month,len,offset){return shiftMonth(month,-offset-len+1)+' ~ '+shiftMonth(month,-offset);}
function ruleFor(month,versions){return versions.filter(x=>x.effective<=month).sort((a,b)=>b.effective.localeCompare(a.effective))[0];}
function monthEnd(month){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
function addDays(date,days){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);}

function trainingSummary(p,c,month='2026-10',data,asOf=TODAY){
 const records=data?.records||TRAINING_RECORDS,orders=data?.orders||TRAINING_ORDERS;
 const end=monthEnd(month),cutoff=month===TODAY.slice(0,7)?(asOf<end?asOf:end):end;
 const rows=(c.trainingProjects||[]).map(project=>{
  const record=records.filter(r=>r.personId===p.id&&r.projectId===project.id).sort((a,b)=>String(b.passedAt).localeCompare(String(a.passedAt)))[0]||null;
  if(!record)return {projectId:project.id,project,passedAt:null,start:null,status:'uncertified',count:0,rawCount:0,target:project.target,remaining:project.target,completionDate:null,completionMonth:null,completedThisMonth:false,earnedThisMonth:0};
  const start=addDays(record.passedAt,1);
  const through=orders.filter(o=>o.personId===p.id&&o.projectId===project.id&&o.date>=start&&o.date<=cutoff).sort((a,b)=>a.date.localeCompare(b.date));
  const reached=through.length>=project.target,completionDate=reached?through[project.target-1].date:null,completionMonth=completionDate?completionDate.slice(0,7):null;
  const completedThisMonth=completionMonth===month;
  const status=start>cutoff?'upcoming':reached?(completedThisMonth?'completed-this-month':'completed'):'active';
  return {projectId:project.id,project,passedAt:record.passedAt,start,status,count:Math.min(through.length,project.target),rawCount:through.length,target:project.target,remaining:Math.max(0,project.target-through.length),completionDate,completionMonth,completedThisMonth,earnedThisMonth:completedThisMonth?project.amount:0};
 });
 return {rows,total:round(rows.reduce((s,r)=>s+r.earnedThisMonth,0)),registered:rows.filter(r=>r.passedAt).length,active:rows.filter(r=>r.status==='active').length,completedThisMonth:rows.filter(r=>r.completedThisMonth).length};
}

function calculate(p,c,month='2026-10',revenue=REVENUE,trainingData){
 const coeff=coefficient(p.minutes,c,p.newPartner),base=round(p.minutes*coeff);
 const retention=p.senior?p.retained/p.senior*100:0,conversion=p.newCount?p.returned/p.newCount*100:0;
 const eligible=p.senior>0&&retention+1e-10>=c.retention;
 const tier=c.tiers.filter(x=>conversion+1e-10>=x.rate).at(-1),tierPotential=p.newCount>=c.minNew&&tier?tier.amount:0;
 const nextTier=c.tiers.find(x=>x.rate>conversion+1e-10)||null;
 const f=fib(p.weights,c),repurchase=eligible?round(tierPotential+f.amount):0;
 const trainingDataFinal=trainingData||{records:TRAINING_RECORDS,orders:TRAINING_ORDERS};
 const trainingResult=trainingSummary(p,c,month,trainingDataFinal,TODAY);
 const training=trainingResult.total;
 const shop=c.shops.find(x=>x.id===p.shop),sales=revenue[p.shop]||0,manager=p.manager&&sales>=shop.target?round(sales*shop.commissionRate/100):0;
 const adjustment=round(p.adjustments.reduce((s,x)=>s+x.amount,0));
 const subtotal=round(base+manager+training+repurchase),gross=round(subtotal+adjustment);
 const preTax=Math.max(0,Math.round(gross/1.068)),serviceDifference=round(gross-preTax);
 const priorIncome=p.priorIncome||0,priorTax=p.priorTax||0,continuousMonths=month==='2026-09'?2:3;
 const annual=round(priorIncome+preTax),taxable=Math.max(0,round(annual*0.8-continuousMonths*5000));
 const taxTable=[[36000,3,0],[144000,10,2520],[300000,20,16920],[420000,25,31920],[660000,30,52920],[960000,35,85920],[Infinity,45,181920]];
 const bracket=taxTable.find(x=>taxable<=x[0]),taxRate=taxable?bracket[1]:0,quick=taxable?bracket[2]:0;
 const tax=Math.max(0,round(taxable*taxRate/100-quick-priorTax)),net=round(preTax-tax);
 return {coeff,base,retention,conversion,eligible,tierPotential,tier:eligible?tierPotential:0,nextTier,needed:nextTier?Math.max(0,Math.ceil(nextTier.rate*p.newCount/100-p.returned-1e-10)):0,f,repurchase,training,trainingResult,manager,shop,sales,adjustment,subtotal,gross,preTax,serviceDifference,annual,taxable,taxRate,quick,priorTax,tax,net,continuousMonths};
}

function validation(c){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.effective))return '请选择有效的生效月份';
 if(c.schema!==5)return '请使用 V5 规则配置';
 if(!Array.isArray(c.trainingProjects)||!c.trainingProjects.length)return '至少保留一个培训项目';
 if(c.trainingProjects.some(p=>!p.name||!String(p.name).trim()))return '培训项目名称不能为空';
 if(new Set(c.trainingProjects.map(p=>p.id)).size!==c.trainingProjects.length)return '培训项目编号须唯一';
 if(c.trainingProjects.some(p=>!Number.isInteger(p.target)||p.target<1||p.target>999))return '培训项目次数须为 1–999 的整数';
 if(c.trainingProjects.some(p=>!Number.isFinite(p.amount)||p.amount<0))return '培训补贴金额须为非负金额';
 if([c.a1,c.a2,c.cap,...c.coefficients,c.newCoefficient,...c.shops.map(x=>x.target),...c.tiers.map(x=>x.amount)].some(x=>!Number.isFinite(x)||x<=0))return '单价、系数、目标和奖励金额须大于 0';
 if(c.shops.some(x=>!Number.isFinite(x.commissionRate)||x.commissionRate<0||x.commissionRate>100))return '店长提点须在 0% 至 100% 之间';
 if(c.a2<c.a1||c.cap<Math.max(c.a1,c.a2))return '第二项不得低于第一项；单价上限不得低于两项种子';
 if(!Number.isFinite(c.retention)||c.retention<0||c.retention>100)return '留存率条件须在 0% 至 100% 之间';
 if(!Number.isInteger(c.minNew)||c.minNew<1)return '新客样本数须为正整数';
 if([c.retentionLength,c.conversionLength].some(x=>!Number.isInteger(x)||x<1||x>12)||[c.retentionOffset,c.conversionOffset].some(x=>!Number.isInteger(x)||x<1||x>12))return '窗口长度和偏移须为 1 至 12 的整数';
 if(c.tiers.some((x,i)=>!Number.isFinite(x.rate)||x.rate<=0||x.rate>100||(i>0&&(x.rate<=c.tiers[i-1].rate||x.amount<c.tiers[i-1].amount))))return '复购率档位须从小到大且金额不递减';
 if(c.coefficients.some((x,i)=>i>0&&x<c.coefficients[i-1]))return '基础系数应随时长区间递增或持平';
 return '';
}

root.Incentive={DEFAULT,PEOPLE,REVENUE,TODAY,TRAINING_PROJECTS,TRAINING_RECORDS,TRAINING_ORDERS,clone,round,sequence,fib,coefficient,calculate,validation,shiftMonth,windowFor,ruleFor,monthEnd,addDays,trainingSummary};
if(typeof module!=='undefined')module.exports=root.Incentive;
})(typeof window!=='undefined'?window:globalThis);
