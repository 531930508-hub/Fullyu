const TRAIN_STATUS_ORDER={'completed-this-month':0,active:1,upcoming:2,completed:3,uncertified:4};
const TRAIN_STATUS_OPTIONS=[['all','全部状态'],['registered','已登记考核'],['active','进行中'],['completed-this-month','本月达标'],['completed','已达标'],['upcoming','待开始'],['uncertified','未登记']];
function authorizedPeople(){return people.filter(p=>role!=='manager'||p.shop==='west');}
function sidebarHTML(active){
 return `<aside class="sidebar"><div class="brand">Full愈</div><div class="eyebrow">伙伴服务管理</div><div class="nav-label">经营中心</div><button class="side-item ${active==='dashboard'?'active':''}" data-admin-view="dashboard">${icon('chart')}接单奖励</button><button class="side-item ${active==='training'?'active':''}" data-admin-view="training">${icon('award')}培训考核</button><div class="side-item placeholder">${icon('grid')}门店运营 <small>示意</small></div><div class="side-item placeholder">${icon('user')}伙伴档案 <small>示意</small></div><div class="sidebar-bottom">放松有道　自在生活<br>交互原型 · V5<br>全部人物与数据均为示例</div></aside>`;
}
function adminChrome(active,crumb,content){
 return `<div class="admin-shell">${sidebarHTML(active)}<div class="admin-main"><header class="admin-top"><span class="small">经营中心 / ${crumb}</span><div class="toolbar"><label class="small" for="role">演示身份</label><select class="control" id="role">${option('admin','管理人员 · 全部门店',role)}${option('manager','西岸店长 · 授权门店',role)}</select><span class="tag">仅演示</span></div></header><main class="admin-content">${content}</main></div></div>`;
}
function bindAdminChrome(){
 $('role').onchange=e=>{role=e.target.value;shopFilter='all';trainingFilter.shop='all';render();};
 document.querySelectorAll('[data-admin-view]').forEach(b=>b.onclick=()=>{adminView=b.dataset.adminView;render();});
}
function trainingScopePeople(){return authorizedPeople().filter(p=>(trainingFilter.shop==='all'||p.shop===trainingFilter.shop)&&(!trainingFilter.query||p.name.toLowerCase().includes(trainingFilter.query.toLowerCase())));}
function trainingAdminRows(){const c=currentCfg(),m=TODAY.slice(0,7);return trainingScopePeople().flatMap(p=>E.trainingSummary(p,c,m,trainingData(),TODAY).rows.map(row=>({...row,person:p,shop:c.shops.find(x=>x.id===p.shop)})));}
function filteredTrainingRows(rows){
 return rows.filter(r=>{
  if(trainingFilter.project!=='all'&&r.projectId!==trainingFilter.project)return false;
  if(trainingFilter.status==='registered')return !!r.passedAt;
  return trainingFilter.status==='all'||r.status===trainingFilter.status;
 }).sort((a,b)=>(TRAIN_STATUS_ORDER[a.status]-TRAIN_STATUS_ORDER[b.status])||a.person.name.localeCompare(b.person.name,'zh-CN')||a.projectId.localeCompare(b.projectId));
}
function trainingStatusNote(row){
 if(row.status==='completed-this-month')return '本月计入 '+cash(row.earnedThisMonth);
 if(row.status==='completed')return row.completionMonth+' 已计入，不重复';
 if(row.status==='active')return '还差 '+row.remaining+' 单';
 if(row.status==='upcoming')return row.start+' 起开始累计';
 return '尚未登记考核';
}
function downloadCsv(rows,filename,message){
 if(!rows.length){toast('当前没有可导出的记录');return;}
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(message);
}
function exportTrainingCsv(rows){
 downloadCsv([['疗愈师','门店','培训项目','通过考核日','累计起点','有效订单数','目标次数','达标日期','计入月份','本月补贴','状态'],...rows.map(r=>[r.person.name,r.shop.name,trainingName(r.project),r.passedAt||'',r.start||'',r.passedAt?r.rawCount:'',r.target,r.completionDate||'',r.completionMonth||'',r.earnedThisMonth,r.passedAt?trainingStatusLabel(r):'未登记'])],'Full愈-培训考核-V5-模拟数据-'+TODAY+'.csv','已导出当前筛选的培训考核记录');
}
function renderAdmin(){
 if(adminView==='training')return renderTrainingAdmin();
 const c=cfg(),list=month==='2026-08'?[]:selectedPeople(),rs=list.map(calc),sum=k=>E.round(rs.reduce((s,r)=>s+r[k],0));
 const shops=c.shops.filter(s=>(role!=='manager'||s.id==='west')&&(shopFilter==='all'||s.id===shopFilter));
 const trainingTotal=sum('training'),trainingCompleted=rs.reduce((s,r)=>s+r.trainingResult.completedThisMonth,0),trainingRegistered=rs.reduce((s,r)=>s+r.trainingResult.registered,0),trainingSlots=list.length*c.trainingProjects.length;
 $('app').innerHTML=adminChrome('dashboard','接单奖励',`<div class="admin-title"><div><div class="eyebrow muted">INCENTIVE OVERVIEW</div><h1>伙伴接单奖励看板</h1><p>当月预估、门店提点与培训考核，集中管理。</p></div><div class="toolbar"><a class="btn" href="${esc(link(MOBILE,'rain'))}" target="_blank">${icon('user')}手机端预览</a><button class="btn primary" id="settingsOpen">${icon('settings')}参数设置</button></div></div>
 <div class="panel"><div class="filterbar"><label class="field"><span>月份</span><select id="month">${monthOptions()}</select></label><label class="field"><span>门店范围</span><select id="shop">${option('all',role==='manager'?'全部授权门店':'全部门店',shopFilter)}${c.shops.filter(s=>role!=='manager'||s.id==='west').map(s=>option(s.id,s.name,shopFilter)).join('')}</select></label><label class="field grow"><span>伙伴姓名</span><input id="search" value="${esc(query)}" placeholder="搜索疗愈师或店长"></label><label class="field"><span>复购条件</span><select id="gate">${option('all','全部',gateFilter)}${option('yes','已满足',gateFilter)}${option('no','待满足',gateFilter)}</select></label><button class="btn" id="searchBtn">查询</button><button class="btn text" id="clearFilters">重置筛选</button></div></div>
 <div class="admin-kpis five"><div class="summary-card"><div class="small">接单奖励合计</div><div class="value money">${cash(sum('subtotal'))}</div><div class="muted">基础 + 店长 + 培训 + 复购</div></div><div class="summary-card"><div class="small">复购接单奖励</div><div class="value money">${cash(sum('repurchase'))}</div><div class="muted">不含待满足条件的参考金额</div></div><div class="summary-card"><div class="small">店长接单奖励</div><div class="value money">${cash(sum('manager'))}</div><div class="muted">整店实际业绩 × 提点比例</div></div><div class="summary-card"><div class="small">培训补贴</div><div class="value money">${cash(trainingTotal)}</div><div class="muted">本月达标 ${trainingCompleted} 项 · 已登记 ${trainingRegistered} / ${trainingSlots} 项</div></div><div class="summary-card"><div class="small">预计合作结算合计</div><div class="value money">${cash(sum('net'))}</div><div class="muted">包含调整、服务费换算与预扣税额</div></div></div>
 <div class="shop-grid">${shops.map(s=>{const sales=month==='2026-08'?0:revenues[s.id],done=sales>=s.target,award=done?E.round(sales*s.commissionRate/100):0;return `<article class="shop-card"><div class="row"><h3>${esc(s.name)} · 整店目标</h3><span class="tag ${done?'filled':'soft'}">${done?'已完成':'进行中'} ${fmt(sales/s.target*100,1)}%</span></div>${progress(sales/s.target*100)}<div class="row small"><span>${cash(sales)} <span class="muted">/ ${cash(s.target)}</span></span><span>店长提点 <b>${s.commissionRate}%</b></span></div><div class="subnote">${done?`店长接单奖励：${cash(sales)} × ${s.commissionRate}% = ${cash(award)}`:`距目标还差 ${cash(s.target-sales)}，完成后按整店全部实际业绩提点。`}</div></article>`;}).join('')}</div>
 <section class="panel training-teaser"><div class="teaser-copy"><div class="eyebrow muted">TRAINING</div><h2>培训考核</h2><p>8 个独立项目 · 通过考核的次日起累计 · 达标只计入当月</p></div><div class="teaser-stats"><div><strong>${trainingRegistered}</strong><small>已登记考核</small></div><div><strong>${trainingSlots-trainingRegistered}</strong><small>待登记项目</small></div><div><strong>${trainingCompleted}</strong><small>本月达标</small></div></div><div class="toolbar"><button class="btn primary" id="trainingManage">${icon('calendar')}管理考核日期</button></div></section>
 <section class="panel"><div class="panel-head"><div><h2>伙伴月度报表</h2><p class="small muted">${month==='2026-09'?'历史演示':'截止 2026-10-21 14:30'} · ${list.length} 位伙伴 · 满足复购条件 ${rs.filter(r=>r.eligible).length} 位</p></div><button class="btn sm" id="export">${icon('download')}导出当前筛选 CSV</button></div><div class="table-wrap"><table><thead><tr><th>伙伴 / 门店</th><th>折算分钟 / 系数</th><th>基础接单奖励</th><th>60 天留存率</th><th>30 天复购率</th><th>10 天复购</th><th>复购接单奖励</th><th>店长接单奖励</th><th>培训补贴</th><th>接单奖励合计</th><th>预计合作结算</th><th>操作</th></tr></thead><tbody>${list.map(p=>{const r=calc(p);return `<tr><td><div class="person-cell"><span class="avatar">${p.initial}</span><div>${esc(p.name)}<small>${r.shop.name} · ${p.manager?'店长':'疗愈师'}</small></div></div></td><td>${num(pm(p).minutes)} / ${r.coeff}<small>${p.newPartner?'新伙伴系数':'达到起点即跳档'}</small></td><td>${cash(r.base)}</td><td>${fmt(r.retention,1)}%<small>${r.eligible?'条件已满足':'条件待满足'}</small></td><td>${fmt(r.conversion,1)}%<small>${p.returned} / ${p.newCount} 位${p.newCount<c.minNew?' · 样本待补足':''}</small></td><td>${num(r.f.heads)} 位<small>下一位 ${cash(r.f.next)}</small></td><td>${cash(r.repurchase)}<small>${r.eligible?cash(r.tier)+' + '+cash(r.f.amount):'暂未计入'}</small></td><td>${p.manager?cash(r.manager):'—'}${p.manager?`<small>整店提点 ${r.shop.commissionRate}%</small>`:''}</td><td>${cash(r.training)}<small>本月达标 ${r.trainingResult.completedThisMonth} 项 · 已登记 ${r.trainingResult.registered}/${c.trainingProjects.length}</small></td><td class="amount-col">${cash(r.subtotal)}</td><td class="amount-col">${cash(r.net)}</td><td><button class="btn sm" data-detail="${p.id}">查看明细</button></td></tr>`;}).join('')}</tbody></table>${list.length?'':`<div class="empty">${icon('book')}<h3>暂无符合条件的记录</h3><p>试试其他月份、门店或姓名。</p><button class="btn" id="emptyReset">返回本月报表</button></div>`}</div><div class="table-footer"><span>金额统一为元。未满足条件的复购金额不计入合计；培训补贴只含本月达标项目。</span><span>横向滚动查看完整报表 →</span></div></section>
 <div class="notice" style="margin-top:18px">老客窗口 ${E.windowFor(month,c.retentionLength,c.retentionOffset)}；新客窗口 ${E.windowFor(month,c.conversionLength,c.conversionOffset)}。培训补贴按考核通过次日起累计，8 个项目互不合并。店长按授权门店查看，角色切换仅用于原型演示。</div><p class="preview-note">当前规则：${esc(c.version)}。提点 ${c.shops.map(s=>s.commissionRate+'%').join(' / ')}、门店目标、培训次数与金额为示例配置；修改仅保存在本机。</p>`);
 bindAdminChrome();
 $('month').onchange=e=>{month=e.target.value;render();};$('shop').onchange=e=>{shopFilter=e.target.value;render();};$('gate').onchange=e=>{gateFilter=e.target.value;render();};
 $('searchBtn').onclick=()=>{query=$('search').value.trim();render();};$('search').onkeydown=e=>{if(e.key==='Enter')$('searchBtn').click();};$('clearFilters').onclick=()=>{shopFilter='all';query='';gateFilter='all';render();};
 if($('emptyReset'))$('emptyReset').onclick=()=>{month='2026-10';shopFilter='all';query='';gateFilter='all';render();};
 $('settingsOpen').onclick=()=>openSettings();$('export').onclick=()=>exportCsv(list);document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
 $('trainingManage').onclick=()=>{adminView='training';trainingFilter.shop=shopFilter;render();};
}
function renderTrainingAdmin(){
 const c=currentCfg(),scope=trainingAdminRows(),rows=filteredTrainingRows(scope),registered=scope.filter(r=>r.passedAt),active=scope.filter(r=>r.status==='active'),completed=scope.filter(r=>r.completedThisMonth),total=scope.reduce((s,r)=>s+r.earnedThisMonth,0),peopleCount=trainingScopePeople().length;
 const projectStats=c.trainingProjects.map(project=>{const list=scope.filter(r=>r.projectId===project.id);return {project,registered:list.filter(r=>r.passedAt).length,active:list.filter(r=>r.status==='active').length,completed:list.filter(r=>r.completedThisMonth).length};});
 $('app').innerHTML=adminChrome('training','培训考核',`<div class="admin-title"><div><div class="eyebrow muted">TRAINING RECORDS</div><h1>培训考核与补贴</h1><p>逐人维护 8 个项目的考核通过日期；进度从次日起累计，达标只计入当月。</p></div><div class="toolbar"><button class="btn" id="trainSettings">${icon('settings')}调整次数与补贴</button><button class="btn" id="exportTraining">${icon('download')}导出考核 CSV</button><button class="btn primary" id="trainAdd">${icon('plus')}登记考核</button></div></div>
 <div class="admin-kpis training-kpis"><div class="summary-card"><div class="small">本月培训补贴</div><div class="value money">${cash(total)}</div><div class="muted">只含 ${TODAY.slice(0,7)} 达标项目</div></div><div class="summary-card"><div class="small">本月达标项目</div><div class="value">${completed.length}<small> 项</small></div><div class="muted">每个项目只计入一次</div></div><div class="summary-card"><div class="small">进行中</div><div class="value">${active.length}<small> 项</small></div><div class="muted">已登记且尚未达到目标次数</div></div><div class="summary-card"><div class="small">已登记考核</div><div class="value">${registered.length}<small> / ${scope.length}</small></div><div class="muted">覆盖 ${peopleCount} 位疗愈师 · 8 个项目独立</div></div></div>
 <section class="panel training-projects-panel"><div class="panel-head"><div><h2>项目概览</h2><p class="small muted">全感舒筋 6 个部位与头部水疗 60 / 90 分钟分别累计；点击项目筛选表格。</p></div><button class="btn sm ${trainingFilter.project==='all'?'primary':''}" data-project-filter="all">全部项目</button></div><div class="project-grid">${projectStats.map(s=>`<button class="project-chip ${trainingFilter.project===s.project.id?'on':''}" data-project-filter="${s.project.id}" aria-pressed="${trainingFilter.project===s.project.id}"><span class="project-name">${esc(s.project.group)} · ${esc(s.project.name)}</span><span class="project-rule">${s.project.target} 次 · ${cash(s.project.amount)}</span><span class="project-stat">已登记 ${s.registered} / ${peopleCount} · 进行中 ${s.active} · 本月达标 ${s.completed}</span></button>`).join('')}</div></section>
 <section class="panel"><div class="panel-head"><div><h2>考核记录</h2><p class="small muted">统计至 ${TODAY} · 当前 ${rows.length} 条${trainingFilter.status==='uncertified'?'未登记项目':'记录'}</p></div><span class="tag soft">次日起累计</span></div><div class="filterbar"><label class="field"><span>门店范围</span><select id="trainShop">${option('all',role==='manager'?'全部授权门店':'全部门店',trainingFilter.shop)}${c.shops.filter(s=>role!=='manager'||s.id==='west').map(s=>option(s.id,s.name,trainingFilter.shop)).join('')}</select></label><label class="field"><span>培训项目</span><select id="trainProject">${option('all','全部项目',trainingFilter.project)}${c.trainingProjects.map(p=>option(p.id,trainingName(p),trainingFilter.project)).join('')}</select></label><label class="field"><span>状态</span><select id="trainStatus">${TRAIN_STATUS_OPTIONS.map(([v,t])=>option(v,t,trainingFilter.status)).join('')}</select></label><label class="field grow"><span>疗愈师姓名</span><input id="trainSearch" value="${esc(trainingFilter.query)}" placeholder="搜索姓名"></label><button class="btn" id="trainSearchBtn">查询</button><button class="btn text" id="trainReset">重置筛选</button></div><div class="table-wrap training-table-wrap"><table class="training-table"><thead><tr><th>疗愈师 / 门店</th><th>培训项目</th><th>通过考核日</th><th>累计起点</th><th>有效订单进度</th><th>达标日期</th><th>本月补贴</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="person-cell"><span class="avatar">${r.person.initial}</span><div>${esc(r.person.name)}<small>${r.shop.name} · ${r.person.manager?'店长':'疗愈师'}</small></div></div></td><td><b>${esc(trainingName(r.project))}</b><small>${r.project.duration?r.project.duration+' 分钟课程':'独立服务部位'}</small></td><td>${r.passedAt||'—'}${r.passedAt?'<small>管理端登记</small>':'<small>尚未登记</small>'}</td><td>${r.start||'—'}${r.start?'<small>通过次日起</small>':''}</td><td>${r.passedAt?`<div class="progress-cell">${progress(r.count/r.target*100)}<span>${r.count} / ${r.target} 单</span></div><small>${r.status==='completed'||r.status==='completed-this-month'?'已满 '+r.target+' 单':'还差 '+r.remaining+' 单'}</small>`:'—'}</td><td>${r.completionDate||'—'}${r.completionDate?'<small>'+(r.completedThisMonth?'本月达标':'历史达标')+'</small>':''}</td><td class="amount-col">${r.earnedThisMonth?cash(r.earnedThisMonth):'—'}<small>${trainingStatusNote(r)}</small></td><td><span class="tag ${trainingStatusClass(r)}">${trainingStatusLabel(r)}</span></td><td>${r.passedAt?`<button class="btn sm" data-train-edit="${r.person.id}|${r.projectId}">修改日期</button>`:`<button class="btn sm" data-train-add="${r.person.id}|${r.projectId}">登记考核</button>`}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">'+icon('book')+'<h3>当前筛选没有记录</h3><p>可以调整项目、状态或姓名，也可以直接登记考核。</p><button class="btn" id="trainEmptyReset">重置筛选</button></div>'}</div><div class="table-footer"><span>共 ${rows.length} 条 · 统计截止 ${TODAY}</span><span>修改考核日会按同一批模拟订单重算，正式历史结算需冻结</span></div></section>
 <div class="notice" style="margin-top:18px">补贴计算：通过考核的次日起，累计对应项目订单；第 ${c.trainingProjects[0].target} 单完成当日达标，补贴计入达标当月，同一项目不重复计入。舒筋 6 个部位与头部水疗 60 / 90 分钟各自独立，参数当前为 ${trainingBrief(c)}。</div><p class="preview-note">真实数据缺口：现有订单只有项目与时长，没有服务部位字段，也没有培训考核表；正式接入需新增部位服务记录与考核记录来源。当前表格与订单均为模拟数据。</p>`);
 bindAdminChrome();
 $('trainShop').onchange=e=>{trainingFilter.shop=e.target.value;render();};$('trainProject').onchange=e=>{trainingFilter.project=e.target.value;render();};$('trainStatus').onchange=e=>{trainingFilter.status=e.target.value;render();};
 $('trainSearchBtn').onclick=()=>{trainingFilter.query=$('trainSearch').value.trim();render();};$('trainSearch').onkeydown=e=>{if(e.key==='Enter')$('trainSearchBtn').click();};
 $('trainReset').onclick=()=>{trainingFilter={shop:'all',project:'all',status:'registered',query:''};render();};
 if($('trainEmptyReset'))$('trainEmptyReset').onclick=()=>{trainingFilter={shop:'all',project:'all',status:'registered',query:''};render();};
 $('trainSettings').onclick=()=>openSettings('training');$('exportTraining').onclick=()=>exportTrainingCsv(rows);$('trainAdd').onclick=()=>openTrainingDialog();
 document.querySelectorAll('[data-project-filter]').forEach(b=>b.onclick=()=>{const id=b.dataset.projectFilter;trainingFilter.project=id==='all'||trainingFilter.project===id?'all':id;trainingFilter.status='registered';render();});
 document.querySelectorAll('[data-train-edit],[data-train-add]').forEach(b=>b.onclick=()=>{const edit=!!b.dataset.trainEdit,[personId,projectId]=(b.dataset.trainEdit||b.dataset.trainAdd).split('|');openTrainingDialog(personId,projectId,edit);});
}
function openDetail(id){
 const p=selectedPeople().find(p=>p.id===id);if(!p){toast('当前授权范围内无此伙伴');return;}
 $('detailTitle').textContent=p.name+' · '+month;
 $('detailBody').innerHTML=rewardHTML(p,true)+`<a class="btn primary drawer-preview" href="${esc(link(MOBILE,p.id))}" target="_blank">打开该人物的手机原型 ${icon('arrow')}</a>`;
 $('detailDialog').showModal();
}
let trainingFormState=null;
function openTrainingDialog(personId,projectId,locked){
 const list=authorizedPeople();
 if(!list.length){toast('当前身份没有可管理的疗愈师');return;}
 let person=list.find(p=>p.id===personId);
 let project=currentCfg().trainingProjects.find(p=>p.id===projectId);
 if(!person){person=list.find(p=>!trainingRecords.some(r=>r.personId===p.id))||list[0];}
 if(!project){const summary=E.trainingSummary(person,currentCfg(),TODAY.slice(0,7),trainingData(),TODAY);project=(summary.rows.find(r=>!r.passedAt)||summary.rows[0]).project;}
 trainingFormState={personId:person.id,projectId:project.id,locked:!!locked&&!!personId&&!!projectId};
 renderTrainingForm();
 $('trainingDialog').showModal();
}
function renderTrainingForm(){
 if(!trainingFormState)return;
 const c=currentCfg(),list=authorizedPeople(),person=list.find(p=>p.id===trainingFormState.personId)||list[0],project=c.trainingProjects.find(p=>p.id===trainingFormState.projectId)||c.trainingProjects[0];
 trainingFormState.personId=person.id;trainingFormState.projectId=project.id;
 const existing=trainingRecords.find(r=>r.personId===person.id&&r.projectId===project.id),date=existing?existing.passedAt:TODAY;
 $('trainingTitle').textContent=trainingFormState.locked?'修改考核通过日期':'登记培训考核';
 $('trainingFormBody').innerHTML=`<form id="trainingForm" class="training-form" novalidate><div class="form-grid"><label class="field"><span>疗愈师</span><select id="trainingPerson" ${trainingFormState.locked?'disabled':''}>${list.map(p=>option(p.id,p.name+' · '+c.shops.find(s=>s.id===p.shop).name,person.id)).join('')}</select></label><label class="field"><span>培训项目</span><select id="trainingProject" ${trainingFormState.locked?'disabled':''}>${c.trainingProjects.map(p=>option(p.id,trainingName(p),project.id)).join('')}</select></label><div class="full">${kv('当前项目规则',project.target+' 次 · '+cash(project.amount)+' 补贴')}${kv('疗愈师加入日期',person.entry)}</div><label class="field full"><span>通过考核日期</span><input id="trainingDate" type="date" value="${date}" max="${TODAY}" min="${person.entry}" required></label></div><div class="calc-box" id="trainingDatePreview"></div><p class="notice" style="margin:14px 0">从通过考核的次日起累计${trainingName(project)}订单。达标当月计入 ${cash(project.amount)}，之后不重复计入。修改日期会重算演示进度，正式结算需按冻结记录处理。</p><p id="trainingError" class="form-error" role="alert"></p><div class="toolbar training-form-actions"><button type="button" class="btn" id="cancelTraining">取消</button><button type="submit" class="btn primary">${existing?'保存新的考核日期':'保存考核记录'}</button></div></form>`;
 $('trainingPerson').onchange=e=>{trainingFormState={personId:e.target.value,projectId:trainingFormState.projectId,locked:false};renderTrainingForm();};
 $('trainingProject').onchange=e=>{trainingFormState={personId:trainingFormState.personId,projectId:e.target.value,locked:false};renderTrainingForm();};
 $('trainingDate').oninput=updateTrainingDatePreview;
 $('cancelTraining').onclick=()=>$('trainingDialog').close();
 $('trainingForm').onsubmit=e=>{e.preventDefault();saveTrainingRecord();};
 updateTrainingDatePreview();
}
function trainingDraftRecord(){
 if(!trainingFormState)return null;
 const date=$('trainingDate').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const person=authorizedPeople().find(p=>p.id===trainingFormState.personId),project=currentCfg().trainingProjects.find(p=>p.id===trainingFormState.projectId);
 if(!person||!project||date<person.entry||date>TODAY)return null;
 return {person,project,date};
}
function updateTrainingDatePreview(){
 const record=trainingDraftRecord(),box=$('trainingDatePreview');if(!box)return;
 if(!record){box.textContent='请选择通过考核日期；日期不能早于加入日期，也不能晚于今天。';return;}
 const temp=trainingRecords.filter(r=>!(r.personId===record.person.id&&r.projectId===record.project.id)).concat({personId:record.person.id,projectId:record.project.id,passedAt:record.date});
 const summary=E.trainingSummary(record.person,currentCfg(),TODAY.slice(0,7),{records:temp,orders:trainingOrders},TODAY),row=summary.rows.find(r=>r.projectId===record.project.id);
 let note='';
 if(row.status==='completed-this-month')note=`按当前模拟订单已于 ${row.completionDate} 达标，本月计入 ${cash(row.earnedThisMonth)}。`;
 else if(row.status==='completed')note=`按当前模拟订单已于 ${row.completionDate} 达标，已在 ${row.completionMonth} 计入，本月不重复。`;
 else if(row.status==='upcoming')note=`累计起点为 ${row.start}，目前尚未开始累计。`;
 else note=`已累计 ${row.rawCount} / ${row.target} 单，还差 ${row.remaining} 单达标。`;
 box.innerHTML=`<b>${row.start}</b> 起累计 · ${note}`;
}
function saveTrainingRecord(){
 const record=trainingDraftRecord(),error=$('trainingError');
 if(!record){error.textContent='请选择有效的考核日期；不能早于加入日期，也不能晚于今天。';return;}
 trainingRecords=trainingRecords.filter(r=>!(r.personId===record.person.id&&r.projectId===record.project.id)).concat({personId:record.person.id,projectId:record.project.id,passedAt:record.date});
 persist();$('trainingDialog').close();render();toast('考核日期已保存；历史计入与正式结算冻结规则仍需后端确认');
}
