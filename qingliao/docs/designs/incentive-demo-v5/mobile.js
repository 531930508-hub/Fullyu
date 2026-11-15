/* Mobile and admin detail use the same reward presentation and calculator. */
function disclosure(id,title,content,caption=''){
 return `<details class="disclosure" id="${id}"><summary><span>${title}${caption?`<small>${caption}</small>`:''}</span>${icon('chevron')}</summary><div class="disclosure-body">${content}</div></details>`;
}
function milestoneHTML(id,items,stage,pending=false){
 return `<ol id="${id}" class="milestone-list ${pending?'pending':''}" style="--count:${items.length}" aria-label="${id==='durationTrack'?'基础系数档位':'30天复购档位'}">${items.map((t,i)=>`<li class="milestone ${i<=stage?'reached':''} ${i===stage?'current':''}" ${i===stage?'aria-current="step"':''}><i class="dot" aria-hidden="true"></i><span class="threshold">${t.label}</span><span class="tier-value">${t.value}</span><span class="position-label">${i===stage?(pending?'指标所在档':'当前档'):''}</span></li>`).join('')}</ol>`;
}
function durationHTML(q,c,r){
 const d=Milestones.duration(q,c),labels=['不足120h','120–<140h','140–<160h','≥160h'];
 const note=q.newPartner?'当前采用新伙伴专属系数，标准时长阶梯暂不适用。':d.stage===3?`已在最高时长档，继续接单仍按 ${num(d.coeff)} 元/分钟累计。`:`再累计 ${num(d.remaining)} 分钟达到 ${num(d.nextBoundary/60)} 小时，进入第 ${d.stage+2} 档。`;
 return `<section class="business-card" id="baseCard"><header class="business-title"><h2>基础接单奖励</h2><strong class="money" id="baseAmount">${cash(r.base)}</strong></header><div class="metric-head"><div><small>当月累计时长 · 折算上钟</small><div class="metric-value" id="durationValue">${num(d.hours)}<em>小时</em></div></div><div class="current-state" id="durationState"><b>${q.newPartner?'新伙伴专属':'当前第 '+(d.stage+1)+' 档'}</b>${num(d.coeff)} 元 / 分钟</div></div>${milestoneHTML('durationTrack',c.coefficients.map((v,i)=>({label:labels[i],value:num(v)+' 元/分钟'})),d.stage)}<p class="milestone-note" id="durationNext">${note}</p><p class="business-note">本月 ${num(d.minutes)} 分钟 × ${num(d.coeff)} 元/分钟；全月按同一系数计算。<br>达到 120 / 140 / 160 小时即进入下一档。</p></section>`;
}
function repurchaseHTML(q,c,r){
 const t=Milestones.conversion(q,c),hasSample=q.newCount>=c.minNew;
 const rate=n=>fmt(Math.floor((n+1e-10)*100)/100,2)+'%';
 const state=!hasSample?'样本不足，暂不计档':t.stage<0?'尚未进入首档':r.eligible?'当前 '+c.tiers[t.stage].rate+'% 档':'指标在 '+c.tiers[t.stage].rate+'% 档';
 const next=!hasSample?`新客样本 ${num(q.newCount)} / ${c.minNew}，补足后才参与 30 天档位。`:t.next?`达到 ${t.next.rate}% 档还需 ${num(t.needed)} 位复购，奖励至少增加 ${cash(t.next.amount-r.tierPotential)}。`:'已在最高复购档，10 天复购仍可继续累计。';
 return `<section class="business-card" id="repurchaseCard"><header class="business-title"><h2>复购接单奖励</h2><strong class="money" id="repurchaseAmount">${cash(r.repurchase)}</strong></header>
 <div class="retention-summary"><div class="metric-head"><div><small>老客 60 天留存率</small><div class="metric-value" id="retentionValue">${q.senior?rate(r.retention):'—'}</div></div><div class="current-state" id="retentionState"><b>${r.eligible?'已达标':'未达标'}</b>门槛 ${c.retention}%</div></div><p class="gate-note">${r.eligible?'已满足两类复购奖励的共同前提':'留存达标后，30 天与 10 天复购奖励才计入'}${q.senior<50?' · 老客样本较少':''}</p></div>
 <div class="rate-section"><div class="metric-head"><div><small>新客 30 天复购率</small><div class="metric-value" id="conversionValue">${q.newCount?rate(r.conversion):'—'}</div></div><div class="current-state" id="conversionState"><b>${state}</b>${num(q.returned)} / ${num(q.newCount)} 位</div></div>${milestoneHTML('conversionTrack',c.tiers.map(t=>({label:t.rate+'%',value:cash(t.amount)})),t.stage,!t.applied)}<div class="applied-reward"><span>30 天档位奖励${t.applied?'':' · 尚未计入'}</span><strong class="money" id="thirtyDayAmount">${cash(r.tier)}</strong></div><p class="milestone-note" id="conversionNext">${next}${r.eligible?'':' 须先满足留存条件。'}</p><p class="business-note">取最高一档，不叠加；下一档人数按新客分母不变试算。</p></div>
 <div class="ten-day-section"><div class="applied-reward"><span>新客 10 天复购奖励</span><strong class="money" id="tenDayAmount">${cash(r.eligible?r.f.amount:0)}</strong></div><p class="business-note">${num(r.f.heads)} 位加权复购 · ${r.eligible?'按递增单价累计':'留存未达标，暂未计入'}</p><div class="next-reward"><div><p>下一位新客 10 天内再来</p><small>${r.eligible?'接单奖励可再增加':'满足留存条件后可增加'}</small></div><strong class="money" id="nextReward">${hiddenMoney?'••••':'+'+cash(r.f.next)}</strong></div><p class="next-footnote">第 ${r.f.nextSeq} 位 · ${r.f.next>=c.cap?'已到单价上限，后续继续累计':'按完整归属一位试算'}</p></div></section>`;
}
function trainingItemHTML(row){
 const project=row.project,certified=!!row.passedAt;
 const status=trainingStatusLabel(row),cls=trainingStatusClass(row);
 let note='',amount='';
 if(!certified){note='未登记考核，暂不累计';amount='—';}
 else if(row.status==='completed-this-month'){note=`${row.completionDate} 达标 · 计入本月`;amount='+'+cash(row.project.amount);}
 else if(row.status==='completed'){note=`已于 ${row.completionMonth} 计入 · 不重复发放`;amount='已计入 '+cash(row.project.amount);}
 else if(row.status==='upcoming'){note=`${row.start} 起开始累计`;amount=`达标 ${cash(row.project.amount)}`;}
 else {note=`还差 ${row.remaining} 单`;amount=`达标 ${cash(row.project.amount)}`;}
 return `<article class="training-item" data-training-project="${project.id}" data-training-status="${row.status}"><div class="training-item-head"><div><b>${trainingName(project)}</b><small>${certified?row.passedAt+' 通过考核 · 次日起累计':'管理端尚未登记考核'}</small></div><span class="tag ${cls}">${status}</span></div><div class="training-line">${progress(row.count/row.target*100)}<span>${row.count} / ${row.target} 单</span></div><div class="training-foot"><span>${note}</span><strong class="money">${amount}</strong></div></article>`;
}
function trainingHTML(p,c,r){
 const s=trainingSummaryFor(p),registered=s.rows.filter(x=>x.passedAt),visible=registered.filter(x=>x.status!=='completed'),past=registered.filter(x=>x.status==='completed'),uncertified=s.rows.length-registered.length;
 visible.sort((a,b)=>{const order={ 'completed-this-month':0,active:1,upcoming:2};return (order[a.status]??3)-(order[b.status]??3);});
 return `<section class="business-card training-card" id="trainingCard"><header class="business-title"><h2>培训补贴</h2><strong class="money" id="trainingAmount">${cash(r.training)}</strong></header><p class="training-intro">通过考核的次日起累计对应项目订单，达到目标后补贴计入达标当月。</p><div class="training-list">${visible.length?visible.map(trainingItemHTML).join(''):`<div class="training-empty">本月没有进行中的培训项目${past.length?`；${past.length} 个已在此前月份达标`:''}。</div>`}</div><div class="training-summary"><span>已登记 ${registered.length} / ${s.rows.length} 个项目</span><span>${s.completedThisMonth?`本月达标 ${s.completedThisMonth} 项`:(uncertified?uncertified+' 项未登记考核':'本月暂无达标')}</span></div>${past.length?`<p class="training-past">此前已达标 ${past.length} 项，已计入历史月份；详情见下方“培训项目与考核”。</p>`:''}<p class="business-note">未登记考核的项目不累计；考核日期与项目参数由管理端维护。每个项目只计入达标当月，不在后续月份重复发放。</p></section>`;
}
function trainingDetailHTML(s){
 return `<div class="training-all" id="trainingAllList">${s.rows.map(row=>`<div class="training-all-row" data-training-detail="${row.project.id}"><div><b>${trainingName(row.project)}</b><small>${row.passedAt?row.passedAt+' 通过':'未登记考核'}</small></div><div class="training-all-progress">${row.passedAt?`${row.count} / ${row.target} 单`:'—'}<span class="tag ${trainingStatusClass(row)}">${trainingStatusLabel(row)}</span></div></div>`).join('')}</div><p>每个项目独立累计；舒筋 6 个部位与头部水疗 60/90 分钟分别计算。修改考核日期会按同一批有效订单重新计算进度，但已计入的达标月份需要按正式结算冻结规则处理。</p>`;
}
function rewardHTML(p,drawer=false){
 const r=calc(p),c=cfg(),q=pm(p),prefix=drawer?'drawer-':'',history=month==='2026-09';
 const train=trainingSummaryFor(p);
 const moneyButton=drawer?'':`<button id="moneyToggle" class="money-button" aria-label="${hiddenMoney?'显示':'隐藏'}奖励金额">${icon('eye')}</button>`;
 const rows=[...(p.manager?[['店长接单奖励',r.manager,'managerAmount']]:[])];
 const breakdown=rows.length?`<section class="business-card other-rewards" aria-label="其他奖励构成">${rows.map(([title,amount,id])=>`<div class="reward-row" ${id==='managerAmount'?'data-manager-reward':''}><span>${title}</span><strong class="money" id="${prefix+id}">${cash(amount)}</strong></div>`).join('')}</section>`:'';
 const baseRule=`<h4>基础接单奖励</h4>${kv('折算上钟时长',num(q.minutes)+' 分钟')}${kv('当前系数',r.coeff+' 元 / 分钟')}<p>全月折算分钟乘同一系数，不分段累加；与累计成就中的服务分钟分开统计。达到 120 / 140 / 160 小时即进入下一档。</p>`;
 const managerRule=p.manager?`<h4>店长接单奖励</h4>${kv('本月整店实际业绩',cash(r.sales))}${kv('整店目标',cash(r.shop.target))}${kv('提点比例',r.shop.commissionRate+'%')}<p>${r.sales>=r.shop.target?'目标已完成，按全部实际业绩计算提点。':'目标尚未完成，当前为零；完成后按全部实际业绩计算提点，不只计算超出部分。'}</p><p>计算：${cash(r.sales)} × ${r.shop.commissionRate}%${r.sales>=r.shop.target?' = '+cash(r.manager):'，完成目标后计入'}。</p>`:'';
 const certified=train.rows.filter(x=>x.passedAt);
 const trainingRule=`<h4>培训补贴</h4>${kv('累计起点','通过考核的次日')}${kv('本月达标项目',train.completedThisMonth+' 项')}${kv('已登记项目',certified.length+' / '+train.rows.length+' 项')}${certified.length?certified.map(x=>kv(trainingName(x.project),x.count+' / '+x.target+' 单 · '+trainingStatusLabel(x))).join(''):'<p>尚未登记考核记录。</p>'}<p>每个项目独立设置目标次数与补贴金额；达标补贴只计入达标当月，不重复发放。未登记项目不累计。</p>`;
 const nextTier=q.newCount<c.minNew?`当前新客样本 ${num(q.newCount)} / ${c.minNew}，补足后计算 30 天档位。`:r.nextTier?`下一档 ${r.nextTier.rate}%：${cash(r.nextTier.amount)}，比当前档增加 ${cash(r.nextTier.amount-r.tierPotential)}。在 ${num(q.newCount)} 位新客分母不变时，还需 ${num(r.needed)} 位完整归属的新客复购。`:'已到 30 天最高档；10 天复购仍可继续积累。';
 const repurchaseData=`<h4>复购数据 · 比例与人数</h4>${kv('老客 60 天留存率',fmt(r.retention,1)+'%')}${kv('老客留存人次',num(q.retained)+' / '+num(q.senior))}${kv('新客 30 天复购率',fmt(r.conversion,1)+'%')}${kv('30 天复购 / 新客数',num(q.returned)+' / '+num(q.newCount))}${kv('10 天加权复购数',num(r.f.heads)+' 位')}<p>${r.eligible?'已满足':'待满足'} ${c.retention}% 留存条件。${q.senior<50?'老客样本较少；不自动免除条件。':''}</p>
 <h4>奖励金额 · 与上方数据分开</h4>${kv('30 天档位奖励',cash(r.tier))}${kv('10 天递增奖励',cash(r.eligible?r.f.amount:0))}${!r.eligible?kv('待满足条件的参考金额',cash(r.tierPotential+r.f.amount)):''}<p>${nextTier}${r.eligible?'':'以上金额需先满足留存条件。'}</p>
 <h4>规则与窗口</h4><p>老客：${E.windowFor(month,c.retentionLength,c.retentionOffset)}；新客：${E.windowFor(month,c.conversionLength,c.conversionOffset)}。10 天复购按 ${month} 首单月归属。</p><p>30 天档位取最高一档，不叠加：${c.tiers.map(t=>t.rate+'% → '+cash(t.amount)).join('；')}。</p><p>10 天实际单价：${E.sequence(9,c).map(x=>cash(x)).join('、')}……每位上限 ${cash(c.cap)}，封顶后继续累计；共同服务按该位单价乘归属权重。</p><p>未满足留存条件时，两类复购奖励均不计入合计。观察期、有效服务或退款变化可能改变预估。</p>`;
 const ledger=`<p class="detail-intro">接单奖励合计与合作结算是两个口径，下列明细展示换算过程。</p>${kv('接单奖励合计',cash(r.subtotal))}${kv('其他调整',(r.adjustment>=0?'+':'−')+cash(Math.abs(r.adjustment)))}${q.adjustments.map(a=>`<div class="adjustment-line">${esc(a.name)}<span>${a.amount>=0?'+':'−'}${cash(Math.abs(a.amount))}</span></div>`).join('')}${kv('调整后合计',cash(r.gross),'total')}${kv('服务费换算差额','−'+cash(r.serviceDifference))}${kv('费用换算后金额',cash(r.preTax))}${kv('预扣税额','−'+cash(r.tax))}${kv(history?'合作结算 · 演示':'预计合作结算',cash(r.net),'total')}<p>调整后合计 ÷ 1.068，四舍五入到元，再扣除预扣税额。分类已包含的款项不重复进入其他调整。</p>
 <details class="plain-details" id="${prefix}taxDetails"><summary>税费计算依据 ${icon('chevron')}</summary>${kv('年度累计换算后金额',cash(r.annual))}${kv('年度计税基数',cash(r.taxable))}${kv('累计连续月份',r.continuousMonths+' 个月')}${kv('适用税率',r.taxRate+'%')}${kv('速算扣除数',cash(r.quick))}${kv('此前已缴税额',cash(r.priorTax))}<p>历史累计为模拟数据，正式结果由既有结算服务统一返回。</p></details>`;
 return `<section class="reward-overview"><div class="income-hero reward-hero"><div class="row"><h2>本月接单奖励</h2><div class="toolbar"><span class="tag">预估</span>${moneyButton}</div></div><div class="hero-value money" id="rewardTotal">${cash(r.subtotal)}</div><p class="hero-note">按当前规则估算，仅含已满足条件的奖励</p></div></section>
 ${durationHTML(q,c,r)}${repurchaseHTML(q,c,r)}${trainingHTML(p,c,r)}${breakdown}
 <div class="detail-group">${disclosure(prefix+'calculationDetails','奖励计算说明',baseRule+managerRule+trainingRule)}${disclosure(prefix+'repurchaseDetails','统计口径与复购规则',repurchaseData)}${disclosure(prefix+'trainingDetails','培训项目与考核',trainingDetailHTML(train))}${disclosure(prefix+'settlementDetails','合作结算明细',ledger)}</div>`;
}
function achievementHTML(p){
 return `<div class="achievement-head"><h2>累计成就</h2><small>加入于 ${p.entry}</small></div><div class="ach-grid"><div><strong id="achDays"></strong><small>加入天数</small></div><div><strong id="achMinutes"></strong><small>累计服务分钟</small></div><div><strong id="achPeople"></strong><small>服务客人 · 位</small></div></div><div class="fan-row">${icon('heart')}<div><b id="fanName"></b><p id="fanPhone"></p></div><span id="fanMinutes"></span></div>`;
}
const certs=[{name:'深疗 90 分钟',date:'2026-03-12',duration:90},{name:'芳香 60 分钟',date:'2026-06-02',duration:60},{name:'头部水疗 45 分钟',date:'2026-08-20',duration:45}];
function dateAt(offset){const d=new Date('2026-01-08T00:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function renderAchievements(){
 const p=person(),records=[];
 for(let i=0;i<=286;i+=3){const date=dateAt(i),proj=certs[Math.floor(i/3)%3];if(date>=p.entry&&date>proj.date)records.push({date,project:proj.name,minutes:proj.duration,customer:i%27===0?'王女士':'客人'+i%17});}
 const by={};records.forEach(r=>by[r.customer]=(by[r.customer]||0)+r.minutes);const top=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
 $('achDays').textContent=num(Math.max(0,Math.round((Date.parse(TODAY)-Date.parse(p.entry))/86400000)+1));$('achMinutes').textContent=num(records.reduce((s,r)=>s+r.minutes,0));$('achPeople').textContent=Object.keys(by).length;
 $('fanName').textContent=top?'头号粉丝 · '+top[0]:'暂无服务记录';$('fanPhone').textContent=top?'138****5678 · 号码已脱敏':'完成服务后在这里积累';$('fanMinutes').textContent=top?top[1]+' 分钟':'';
}
function renderMobile(){
 const p=person();
 $('app').innerHTML=`<div class="mobile-stage"><details class="prototype-bar" id="scenario"><summary><span>V5 原型 · 模拟数据</span><span>演示场景 ${icon('chevron')}</span></summary><div class="prototype-controls"><label class="field"><span>演示人物（正式页面无此切换）</span><select id="demoPerson">${people.map(x=>option(x.id,x.name+' · '+(x.manager?'店长':'疗愈师'),personId)).join('')}</select></label>${[['head','模拟 +1 位10天复购','half','模拟 +0.5 权重'],['return','模拟30天窗口 +1位','gate','切换留存条件'],['minutes','模拟 +90 分钟','train-order','模拟 +1 单培训'],['train-cert','登记一项培训考核','shop','切换整店目标状态']].map(a=>`<div class="toolbar"><button class="btn sm" data-sim="${a[0]}">${a[1]}</button><button class="btn sm" data-sim="${a[2]}">${a[3]}</button></div>`).join('')}<div class="toolbar"><button class="btn sm" data-sim="reset">重置演示数据</button></div><a href="${esc(link(PC))}" target="_blank">打开管理端参数与考核管理 →</a></div></details>
 <main class="mobile-app mobile-v3 mobile-v4 mobile-v5"><nav class="mobile-nav"><span class="brand">Full愈</span><span class="small muted">我的接单</span></nav><header class="mobile-head"><div class="avatar">${p.initial}</div><div class="partner-identity"><h1>${esc(p.name)}</h1><p>${cfg().shops.find(s=>s.id===p.shop).name} · ${p.manager?'店长':'疗愈师'}</p></div><div class="head-right"><span class="month-label">2026 年 10 月</span></div></header>
 <section class="achievement" id="achievementOverview">${achievementHTML(p)}</section>
 ${rewardHTML(p)}
 <div class="detail-group service-group">${disclosure('certificationDetails','项目认证与服务记录','<p>累计成就中的服务次数用于能力积累；培训补贴按各项目考核通过次日起的有效订单单独累计，详见上方培训补贴卡与“培训项目与考核”。</p>','与培训补贴分开统计')}</div>
 <footer class="mobile-footer">${icon('lock')} 仅本人可见 · 客户号码已脱敏<br>累计成就截至今日 · 奖励按本月统计<br>全部为演示数据，不作为实际结算依据</footer></main></div>`;
 $('demoPerson').onchange=e=>{personId=e.target.value;hiddenMoney=false;render();$('scenario').open=true;};
 $('moneyToggle').onclick=()=>{hiddenMoney=!hiddenMoney;render();};
 document.querySelectorAll('[data-sim]').forEach(b=>b.onclick=()=>simulate(b.dataset.sim));
 renderAchievements();
}
function simulate(kind){
 const p=person();if(month!=='2026-10'&&kind!=='reset'){toast('历史月份为演示快照，请切回 10 月试算');return;}
 switch(kind){
  case'head':p.weights.push(1);break;
  case'half':p.weights.push(.5);break;
  case'return':p.returned=Math.min(p.newCount,p.returned+1);break;
  case'gate':p.retained=calc(p).eligible?Math.floor(p.senior*(cfg().retention-2)/100):Math.ceil(p.senior*cfg().retention/100);break;
  case'minutes':p.minutes+=90;break;
  case'train-order':{
   const s=trainingSummaryFor(p),row=s.rows.find(x=>x.passedAt&&x.status==='active');
   if(!row){toast('当前没有进行中的培训项目');return;}
   trainingOrders.push({personId:p.id,projectId:row.projectId,date:TODAY});break;
  }
  case'train-cert':{
   const s=trainingSummaryFor(p),row=s.rows.find(x=>!x.passedAt);
   if(!row){toast('该疗愈师已登记全部培训项目');return;}
   trainingRecords.push({personId:p.id,projectId:row.projectId,passedAt:E.addDays(TODAY,-15)});
   trainingOrders.push({personId:p.id,projectId:row.projectId,date:E.addDays(TODAY,-10)},{personId:p.id,projectId:row.projectId,date:E.addDays(TODAY,-6)});break;
  }
  case'shop':{const s=cfg().shops.find(s=>s.id===p.shop);revenues[p.shop]=revenues[p.shop]>=s.target?s.target-10000:s.target+10000;break;}
  case'reset':people=E.clone(E.PEOPLE);revenues=E.clone(E.REVENUE);trainingRecords=E.clone(E.TRAINING_RECORDS);trainingOrders=E.clone(E.TRAINING_ORDERS);month='2026-10';hiddenMoney=false;adminView='dashboard';trainingFilter={shop:'all',project:'all',status:'registered',query:''};break;
 }
 render();$('scenario').open=true;toast(kind==='reset'?'演示数据已重置，规则配置保留':'模拟数据已更新，未写入正式系统');
}
