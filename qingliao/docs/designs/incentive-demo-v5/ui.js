/* V5 presentation shell. Demo only; all state remains local. */
(function(){
'use strict';
const E=Incentive,$=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SURFACE=document.body.dataset.surface,STORE='fullyu-incentive-demo-v5',TODAY=E.TODAY;
const MOBILE='Full愈-接单奖励-手机端Demo-V5.html',PC='Full愈-激励管理-PC端Demo-V5.html';
const initial=E.clone(E.DEFAULT),sep={...E.clone(initial),effective:'2026-09',version:'2026-09 · 历史演示'};
let versions=[sep,initial],audit=[],people=E.clone(E.PEOPLE),revenues=E.clone(E.REVENUE),month='2026-10';
let trainingRecords=E.clone(E.TRAINING_RECORDS),trainingOrders=E.clone(E.TRAINING_ORDERS);
let personId=new URLSearchParams(location.search).get('person')||'rain',role='admin',shopFilter='all',query='',gateFilter='all';
let adminView='dashboard',trainingFilter={shop:'all',project:'all',status:'registered',query:''};
let hiddenMoney=false;
function normalizeRecords(records){
 const peopleIds=new Set(people.map(p=>p.id)),projectIds=new Set(E.DEFAULT.trainingProjects.map(p=>p.id)),seen=new Set();
 return (Array.isArray(records)?records:[]).filter(r=>r&&peopleIds.has(r.personId)&&projectIds.has(r.projectId)&&/^\d{4}-\d{2}-\d{2}$/.test(r.passedAt)&&r.passedAt<=TODAY).filter(r=>{const k=r.personId+'|'+r.projectId;if(seen.has(k))return false;seen.add(k);return true;}).map(r=>({personId:r.personId,projectId:r.projectId,passedAt:r.passedAt}));
}
function normalizeOrders(orders){
 const peopleIds=new Set(people.map(p=>p.id)),projectIds=new Set(E.DEFAULT.trainingProjects.map(p=>p.id));
 return (Array.isArray(orders)?orders:[]).filter(o=>o&&peopleIds.has(o.personId)&&projectIds.has(o.projectId)&&/^\d{4}-\d{2}-\d{2}$/.test(o.date)&&o.date<=TODAY).map(o=>({personId:o.personId,projectId:o.projectId,date:o.date}));
}
try{const s=JSON.parse(localStorage.getItem(STORE)||'null');if(s?.versions?.length&&s.versions.every(c=>!E.validation(c))){versions=s.versions;audit=s.audit||[];trainingRecords=normalizeRecords(s.trainingRecords||trainingRecords);if(Array.isArray(s.trainingOrders))trainingOrders=normalizeOrders(s.trainingOrders);}}catch(e){}
try{if(location.hash.startsWith('#v5=')){const s=JSON.parse(decodeURIComponent(location.hash.slice(4)));if(s?.versions?.length&&s.versions.every(c=>!E.validation(c)))versions=s.versions;if(Array.isArray(s.records))trainingRecords=normalizeRecords(s.records);if(Array.isArray(s.orders))trainingOrders=normalizeOrders(s.orders);}}catch(e){}
if(!people.some(p=>p.id===personId))personId='rain';
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',chart:'M4 3v17h17 M8 15l4-5 4 2 5-7',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',arrow:'M5 12h14 M14 7l5 5-5 5',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',heart:'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15s13-10 8-15z',book:'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1z M12 5v15',award:'M12 3l3 5 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',user:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-2a8 8 0 0 1 16 0v2',lock:'M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5z',chevron:'M5 9l7 7 7-7',edit:'M4 20h4l11-11-4-4L4 16z M13 5l4 4',plus:'M12 5v14 M5 12h14',calendar:'M4 6h16v15H4z M8 3v6 M16 3v6 M4 10h16'};
function icon(n){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n]||paths.grid}"/></svg>`;}
function fmt(n,d=2){return Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});}
function cash(n){return hiddenMoney?'••••':'¥'+fmt(n);}
function num(n){return Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});}
function cfg(){return E.ruleFor(month,versions)||initial;}
function currentCfg(){return E.ruleFor(TODAY.slice(0,7),versions)||initial;}
function person(){return people.find(p=>p.id===personId);}
function pm(p){return month==='2026-09'?{...p,minutes:Math.max(0,p.minutes-660),weights:p.weights.slice(0,-1),priorIncome:8000,priorTax:42}:p;}
function trainingData(){return {records:trainingRecords,orders:trainingOrders};}
function calc(p){return E.calculate(pm(p),cfg(),month,revenues,trainingData());}
function trainingSummaryFor(p,m=month,asOf=TODAY,c=cfg()){return E.trainingSummary(p,c,m,trainingData(),asOf);}
function trainingProject(id){return E.DEFAULT.trainingProjects.find(p=>p.id===id);}
function trainingName(project){return project?project.group+' · '+project.name:'未知项目';}
function trainingStatusLabel(row){
 if(row.status==='completed-this-month')return '本月达标';
 if(row.status==='completed')return '已达标';
 if(row.status==='upcoming')return '待开始';
 if(row.status==='active')return '进行中';
 return '未登记';
}
function trainingStatusClass(row){
 if(row.status==='completed-this-month')return 'filled';
 if(row.status==='completed')return 'done';
 if(row.status==='active')return 'soft';
 return 'plain';
}
function trainingRowsForPeople(list,asOf=TODAY){
 const c=currentCfg(),m=TODAY.slice(0,7);
 return list.flatMap(p=>{
  const s=E.trainingSummary(p,c,m,trainingData(),asOf);
  return s.rows.filter(r=>r.passedAt).map(r=>({...r,person:p,shop:c.shops.find(x=>x.id===p.shop)}));
 });
}
function progress(n){return `<div class="progress"><i style="width:${Math.max(0,Math.min(n,100))}%"></i></div>`;}
function kv(k,v,cl=''){return `<div class="keyval ${cl}"><span>${k}</span><span>${v}</span></div>`;}
function option(v,t,cur){return `<option value="${esc(v)}" ${String(cur)===String(v)?'selected':''}>${esc(t)}</option>`;}
function monthOptions(){return option('2026-10','2026 年 10 月',month)+option('2026-09','2026 年 9 月',month)+option('2026-08','2026 年 8 月 · 无记录',month);}
function link(file,id){const payload={versions,records:trainingRecords,orders:trainingOrders};return file+(id?'?person='+encodeURIComponent(id):'')+'#v5='+encodeURIComponent(JSON.stringify(payload));}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function persist(){try{localStorage.setItem(STORE,JSON.stringify({versions,audit,trainingRecords,trainingOrders}));}catch(e){toast('本次设置已应用；浏览器未开放本地存储');}}
function render(){
 const active=document.activeElement,id=active?.id,action=active?.dataset.sim;
 const open=[...document.querySelectorAll('#app details[id][open]')].map(n=>n.id);
 SURFACE==='admin'?renderAdmin():renderMobile();
 open.forEach(id=>{if($(id))$(id).open=true;});
 const target=id?$(id):action?document.querySelector(`[data-sim="${action}"]`):null;
 target?.focus({preventScroll:true});
}
function selectedPeople(){return people.filter(p=>(role!=='manager'||p.shop==='west')&&(shopFilter==='all'||p.shop===shopFilter)&&(!query||p.name.toLowerCase().includes(query.toLowerCase()))&&(gateFilter==='all'||(gateFilter==='yes')===calc(p).eligible));}
function exportCsv(list){
 if(!list.length){toast('当前没有可导出的记录');return;}
 const rows=[['月份','门店','伙伴','折算分钟','系数','基础接单奖励','60天留存率','30天复购率','10天加权复购数','30天奖励','10天奖励','店长提点比例','店长接单奖励','培训补贴','培训项目进度','其他调整','接单奖励合计','费用换算后金额','预扣税额','预计合作结算'],...list.map(p=>{const r=calc(p);const progress=r.trainingResult.rows.filter(x=>x.passedAt).map(x=>`${trainingName(x.project)} ${x.count}/${x.target}单${x.status==='completed-this-month'?'（本月达标）':x.status==='completed'?'（'+x.completionMonth+'已计入）':''}`).join('；')||'未登记';return [month,r.shop.name,p.name,pm(p).minutes,r.coeff,r.base,fmt(r.retention)+'%',fmt(r.conversion)+'%',r.f.heads,r.tier,r.eligible?r.f.amount:0,p.manager?r.shop.commissionRate+'%':'—',r.manager,r.training,progress,r.adjustment,r.subtotal,r.preTax,r.tax,r.net];})];
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Full愈-接单奖励报表-V5-模拟数据-'+month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前筛选的模拟报表');
}
/* V5_VIEWS */
$('effective').onchange=e=>{if(draft)draft.effective=e.target.value;};
$('saveSettings').onclick=saveSettings;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
window.addEventListener('storage',e=>{if(e.key===STORE){try{const s=JSON.parse(e.newValue);if(s?.versions?.length&&s.versions.every(c=>!E.validation(c))){versions=s.versions;audit=s.audit||[];trainingRecords=normalizeRecords(s.trainingRecords||trainingRecords);render();}}catch(e){}}});
window.demo={engine:E,get state(){return {versions,people,revenues,month,personId,role,adminView,trainingRecords,trainingOrders};},render,calculate:calc,trainingSummary:trainingSummaryFor,trainingRows:trainingRowsForPeople};
render();
})();
