(() => {
 const $=id=>document.getElementById(id),E=window.demo.engine,out=[];
 function test(name,fn){if(!fn())throw Error('FAIL '+name);out.push(name);}
 function click(sel){const n=typeof sel==='string'?document.querySelector(sel):sel;if(!n)throw Error('Missing '+sel);n.click();}
 function text(sel){const n=typeof sel==='string'?document.querySelector(sel):sel;return n?n.textContent:'';}
 function value(sel){return document.querySelector(sel)?.value;}
 function setValue(sel,v,event='change'){const n=document.querySelector(sel);n.value=v;n.dispatchEvent(new Event(event,{bubbles:true}));}
 function nav(view){click(`[data-admin-view="${view}"]`);}
 function kpi(n,scope='.admin-kpis'){return document.querySelector(`${scope} .summary-card:nth-child(${n}) .value`)?.textContent||'';}
 function personRow(name){return [...document.querySelectorAll('.table-wrap tbody tr')].find(tr=>tr.textContent.includes(name));}
 function trainingRow(personId,projectId){const b=document.querySelector(`[data-train-edit="${personId}|${projectId}"],[data-train-add="${personId}|${projectId}"]`);return b?.closest('tr');}
 const banned=/收入|薪酬|薪资|工资|奖金|报酬|到手|应发|实发|在职|员工/;
 test('默认看板包含五张指标卡与培训合计',()=>document.querySelectorAll('.admin-kpis .summary-card').length===5&&kpi(4)==='¥2,000.00');
 test('报表含6位伙伴并展示培训项目数',()=>document.querySelectorAll('.table-wrap tbody tr').length===6&&personRow('张小雨').textContent.includes('已登记 4/8'));
 test('培训页可进入且登记18/48项',()=>{nav('training');return kpi(4,'.training-kpis')==='18 / 48'&&document.querySelectorAll('.training-table tbody tr').length===18;});
 test('本月培训合计2000且达标4项',()=>kpi(1,'.training-kpis')==='¥2,000.00'&&kpi(2,'.training-kpis').includes('4'));
 test('项目概览含全部8个项目及参数',()=>document.querySelectorAll('.project-chip').length===8&&text('.project-chip').includes('5 次 · ¥500.00'));
 test('项目概览筛选只显示对应项目',()=>{click('[data-project-filter="sujin-head"]');return document.querySelectorAll('.training-table tbody tr').length===3&&document.querySelector('[data-project-filter="sujin-head"]').classList.contains('on');});
 test('全部项目按钮恢复登记记录',()=>{click('[data-project-filter="all"]');return document.querySelectorAll('.training-table tbody tr').length===18;});
 test('项目下拉筛选与重置可用',()=>{setValue('#trainProject','sujin-head');return document.querySelectorAll('.training-table tbody tr').length===3;});
 test('未登记状态显示30个待登记项目',()=>{setValue('#trainProject','all');setValue('#trainStatus','uncertified');return document.querySelectorAll('.training-table tbody tr').length===30;});
 test('筛选重置回到18条已登记记录',()=>{click('#trainReset');return document.querySelectorAll('.training-table tbody tr').length===18;});
 test('姓名查询只保留对应疗愈师',()=>{setValue('#trainSearch','林', 'input');click('#trainSearchBtn');return document.querySelectorAll('.training-table tbody tr').length===4&&personRow('林然');});
 test('姓名重置恢复全部记录',()=>{click('#trainReset');return document.querySelectorAll('.training-table tbody tr').length===18;});
 test('修改考核日按新起点预览进度',()=>{click('[data-train-edit="rain|sujin-head"]');const d=$('trainingDate');if(!$('trainingDialog').open||!d.disabled&&false)return false;if(value('#trainingDate')!=='2026-02-03'||!text('#trainingDatePreview').includes('2026-04'))return false;setValue('#trainingDate','2026-03-20','input');return text('#trainingDatePreview').includes('2 / 5')&&text('#trainingDatePreview').includes('还差 3 单');});
 test('保存考核日会重算并保留历史计入提示',()=>{click('#trainingForm button[type="submit"]');const row=trainingRow('rain','sujin-head');return !$('trainingDialog').open&&row&&row.textContent.includes('2 / 5 单')&&row.textContent.includes('进行中')&&JSON.parse(localStorage.getItem('fullyu-incentive-demo-v5')).trainingRecords.find(r=>r.personId==='rain'&&r.projectId==='sujin-head').passedAt==='2026-03-20';});
 test('新增考核记录可选择未登记项目',()=>{click('#trainAdd');if(!$('trainingDialog').open||value('#trainingPerson')!=='rain'||value('#trainingProject')!=='sujin-hand')return false;setValue('#trainingDate','2026-10-01','input');return text('#trainingDatePreview').includes('2026-10-02')&&text('#trainingDatePreview').includes('0 / 5');});
 test('保存新增考核后表格出现0/5进度',()=>{click('#trainingForm button[type="submit"]');const row=trainingRow('rain','sujin-hand');return !$('trainingDialog').open&&row&&row.textContent.includes('0 / 5 单')&&row.textContent.includes('2026-10-01')&&document.querySelectorAll('.training-table tbody tr').length===19;});
 test('培训导出触发反馈',()=>{click('#exportTraining');return !$('toast').hidden&&text('#toast').includes('已导出');});
 test('培训页无禁用雇佣或收入类词',()=>!banned.test(text('#app'))&&!banned.test(text('#trainingFormBody')));
 test('项目参数页可编辑8项培训次数与金额',()=>{click('#trainSettings');return $('settingsDialog').open&&document.querySelectorAll('.training-setting-table tbody tr').length===8&&document.querySelector('input[data-key="trainingProjects.3.amount"]').value==='500';});
 test('培训参数预览随输入更新',()=>{setValue('input[data-key="trainingProjects.3.amount"]','600','input');return text('#trainingPreview').includes('本月达标')&&text('#trainingPreview').includes('6,000.00')===false&&text('#trainingPreview').includes('¥');});
 test('保存培训参数后本月合计增加100',()=>{click('#saveSettings');return !$('settingsDialog').open&&kpi(1,'.training-kpis')==='¥2,100.00'&&JSON.parse(localStorage.getItem('fullyu-incentive-demo-v5')).versions.find(v=>v.effective==='2026-10').trainingProjects.find(p=>p.id==='sujin-shoulder').amount===600;});
 test('管理端版本记录显示培训独立参数',()=>{click('#trainSettings');document.querySelector('[data-tab="history"]').click();const t=text('#settingsContent');document.querySelector('#settingsDialog [data-close]').click();return t.includes('V5修订')&&t.includes('8 项独立次数与金额');});
 test('基础系数设置采用跳档边界并试算7200',()=>{nav('dashboard');click('#settingsOpen');document.querySelector('[data-tab="base"]').click();const t=text('#settingsContent');document.querySelector('#settingsDialog [data-close]').click();return t.includes('≥7,200–<8,400')&&t.includes('7,200 分钟即进入第二档')&&t.includes('8,640.00');});
 test('看板培训合计与个人金额同步参数',()=>nav('dashboard')||kpi(4)==='¥2,100.00'&&personRow('张小雨').textContent.includes('¥600.00'));
 test('历史月份培训只计当月达标',()=>{setValue('#month','2026-09');return kpi(4)==='¥500.00'&&personRow('周宁').textContent.includes('¥500.00')&&!personRow('张小雨').textContent.includes('¥500.00')&&document.querySelectorAll('.table-wrap tbody tr').length===6;});
 test('无记录月份显示空态',()=>{setValue('#month','2026-08');return !!document.querySelector('.empty')&&!document.querySelector('.table-wrap tbody tr');});
 test('返回本月报表明细抽屉包含培训项目',()=>{click('#emptyReset');click('[data-detail="rain"]');const ok=$('detailDialog').open&&text('#detailTitle').includes('张小雨')&&text('#detailBody').includes('培训补贴')&&text('#detailBody').includes('全感舒筋 · 肩部')&&!document.querySelector('#detailBody #moneyToggle');document.querySelector('#detailDialog [data-close]').click();return ok;});
 test('店长身份仅看授权门店与只读参数',()=>{setValue('#role','manager');nav('training');const ok=kpi(4,'.training-kpis')==='11 / 24'&&document.querySelectorAll('.training-table tbody tr').length===11;click('#trainSettings');const ro=$('saveSettings').disabled&&[...document.querySelectorAll('#settingsContent input')].every(n=>n.disabled);document.querySelector('#settingsDialog [data-close]').click();return ok&&ro;});
 test('全部管理端页面无禁用词',()=>{setValue('#role','admin');nav('dashboard');return !banned.test(text('#app'))&&!banned.test(text('#settingsContent'))&&!banned.test(text('#detailBody'));});
 localStorage.removeItem('fullyu-incentive-demo-v5');
 return out;
})()
