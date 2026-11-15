/* 仅用于双端交互原型；不连接生产服务。金额采用分计算，税费沿用已核实的旧页展示公式。 */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const DEFAULT={version:'2026-10 · 原型示例',effective:'2026-10',a1:10,a2:10,cap:130,retention:60,minNew:30,retentionLength:6,retentionOffset:2,conversionLength:3,conversionOffset:1,coefficients:[1,1.2,1.3,1.5],newCoefficient:0.8,tiers:[{rate:10,amount:200},{rate:12,amount:400},{rate:15,amount:800},{rate:18,amount:1100},{rate:20,amount:1500}],parts:[{id:'head',name:'头部',amount:100},{id:'neck',name:'肩颈',amount:100},{id:'eyes',name:'眼部',amount:80}],shops:[{id:'west',name:'西岸店',target:200000,reward:1500},{id:'raffles',name:'来福士店',target:180000,reward:1200}]};
const PEOPLE=[
{id:'rain',name:'张小雨',initial:'雨',shop:'west',manager:false,minutes:8100,retained:136,senior:214,newCount:45,returned:7,weights:[1,1,1,1],training:['head','neck'],adjustments:[{name:'服务时长补记',amount:120},{name:'前期结算修正',amount:-20}],priorIncome:18000,priorTax:132,entry:'2026-01-08'},
{id:'sylvia',name:'雅雅 Sylvia',initial:'雅',shop:'west',manager:false,minutes:8640,retained:90,senior:150,newCount:40,returned:5,weights:[1,1,1,1,0.5],training:['eyes'],adjustments:[],priorIncome:19000,priorTax:156,entry:'2025-11-12'},
{id:'lin',name:'林然',initial:'林',shop:'west',manager:true,minutes:6900,retained:126,senior:180,newCount:50,returned:10,weights:[1,1,1,1,1,1,1,1],training:[],adjustments:[],priorIncome:16000,priorTax:84,entry:'2025-08-10'},
{id:'tom',name:'阿周 Tom',initial:'周',shop:'raffles',manager:false,minutes:7800,retained:116,senior:200,newCount:40,returned:6,weights:[1,1,1,0.5],training:['head'],adjustments:[],priorIncome:15000,priorTax:60,entry:'2026-02-03'},
{id:'ivy',name:'豆子 Ivy',initial:'豆',shop:'raffles',manager:false,newPartner:true,minutes:3600,retained:19,senior:30,newCount:20,returned:3,weights:[1,1],training:['head','eyes'],adjustments:[],priorIncome:3000,priorTax:0,entry:'2026-09-15'},
{id:'ning',name:'周宁',initial:'宁',shop:'raffles',manager:true,minutes:9601,retained:145,senior:210,newCount:50,returned:9,weights:[1,1,1,1,1,1],training:[],adjustments:[],priorIncome:21000,priorTax:204,entry:'2025-09-12'}
];
const REVENUE={west:216800,raffles:169200};
function sequence(count,c){let a=Math.round(c.a1*100),b=Math.round(c.a2*100),cap=Math.round(c.cap*100),out=[];for(let n=0;n<count;n++){const raw=n===0?a:n===1?b:Math.min(a+b,cap);if(n>1){a=b;b=raw;}out.push(Math.min(raw,cap)/100);}return out;}
function fib(weights,c){const prices=sequence(weights.length+1,c);return {amount:round(weights.reduce((s,w,i)=>s+w*prices[i],0)),heads:round(weights.reduce((s,w)=>s+w,0)),count:weights.length,nextSeq:weights.length+1,next:prices[weights.length],prices};}
function coefficient(minutes,c,newPartner=false){return newPartner?c.newCoefficient:c.coefficients[minutes<=7200?0:minutes<=8400?1:minutes<=9600?2:3];}
function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7);}
function windowFor(month,len,offset){return shiftMonth(month,-offset-len+1)+' ~ '+shiftMonth(month,-offset);}
function ruleFor(month,versions){return versions.filter(x=>x.effective<=month).sort((a,b)=>b.effective.localeCompare(a.effective))[0];}
function calculate(p,c,month='2026-10',revenue=REVENUE){
 const coeff=coefficient(p.minutes,c,p.newPartner),base=round(p.minutes*coeff);
 const retention=p.senior?p.retained/p.senior*100:0,conversion=p.newCount?p.returned/p.newCount*100:0;
 const eligible=p.senior>0&&retention+1e-10>=c.retention;
 const tier=c.tiers.filter(x=>conversion+1e-10>=x.rate).at(-1),tierPotential=p.newCount>=c.minNew&&tier?tier.amount:0;
 const nextTier=c.tiers.find(x=>x.rate>conversion+1e-10)||null;
 const f=fib(p.weights,c),repurchase=eligible?round(tierPotential+f.amount):0;
 const training=round(p.training.reduce((s,id)=>s+(c.parts.find(x=>x.id===id)?.amount||0),0));
 const shop=c.shops.find(x=>x.id===p.shop),sales=revenue[p.shop]||0,manager=p.manager&&sales>=shop.target?shop.reward:0;
 const adjustment=round(p.adjustments.reduce((s,x)=>s+x.amount,0));
 const subtotal=round(base+manager+training+repurchase),gross=round(subtotal+adjustment);
 const preTax=Math.max(0,Math.round(gross/1.068)),serviceDifference=round(gross-preTax);
 const priorIncome=p.priorIncome||0,priorTax=p.priorTax||0,continuousMonths=month==='2026-09'?2:3;
 const annual=round(priorIncome+preTax),taxable=Math.max(0,round(annual*0.8-continuousMonths*5000));
 const taxTable=[[36000,3,0],[144000,10,2520],[300000,20,16920],[420000,25,31920],[660000,30,52920],[960000,35,85920],[Infinity,45,181920]];
 const bracket=taxTable.find(x=>taxable<=x[0]),taxRate=taxable?bracket[1]:0,quick=taxable?bracket[2]:0;
 const tax=Math.max(0,round(taxable*taxRate/100-quick-priorTax)),net=round(preTax-tax);
 return {coeff,base,retention,conversion,eligible,tierPotential,tier:eligible?tierPotential:0,nextTier,needed:nextTier?Math.max(0,Math.ceil(nextTier.rate*p.newCount/100-p.returned-1e-10)):0,f,repurchase,training,manager,shop,sales,adjustment,subtotal,gross,preTax,serviceDifference,annual,taxable,taxRate,quick,priorTax,tax,net,continuousMonths};
}
function validation(c){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.effective))return '请选择有效的生效月份';
 if([c.a1,c.a2,c.cap,...c.coefficients,c.newCoefficient,...c.parts.map(x=>x.amount),...c.shops.flatMap(x=>[x.target,x.reward]),...c.tiers.map(x=>x.amount)].some(x=>!Number.isFinite(x)||x<=0))return '单价、系数、目标和奖励金额须大于 0';
 if(c.a2<c.a1||c.cap<Math.max(c.a1,c.a2))return '第二项不得低于第一项；单价上限不得低于两项种子';
 if(!Number.isFinite(c.retention)||c.retention<0||c.retention>100)return '留存率条件须在 0% 至 100% 之间';
 if(!Number.isInteger(c.minNew)||c.minNew<1)return '新客样本数须为正整数';
 if([c.retentionLength,c.conversionLength].some(x=>!Number.isInteger(x)||x<1||x>12)||[c.retentionOffset,c.conversionOffset].some(x=>!Number.isInteger(x)||x<1||x>12))return '窗口长度和偏移须为 1 至 12 的整数';
 if(c.tiers.some((x,i)=>!Number.isFinite(x.rate)||x.rate<=0||x.rate>100||(i>0&&(x.rate<=c.tiers[i-1].rate||x.amount<c.tiers[i-1].amount))))return '复购率档位须从小到大且金额不递减';
 if(c.coefficients.some((x,i)=>i>0&&x<c.coefficients[i-1]))return '基础系数应随时长区间递增或持平';
 return '';
}
root.Incentive={DEFAULT,PEOPLE,REVENUE,clone,round,sequence,fib,coefficient,calculate,validation,shiftMonth,windowFor,ruleFor};
if(typeof module!=='undefined')module.exports=root.Incentive;
})(typeof window!=='undefined'?window:globalThis);
