/* Mobile and admin detail use the same reward presentation and calculator. */
function disclosure(id,title,content,caption=''){
 return `<details class="disclosure" id="${id}"><summary><span>${title}${caption?`<small>${caption}</small>`:''}</span>${icon('chevron')}</summary><div class="disclosure-body">${content}</div></details>`;
}
function milestoneHTML(id,items,stage,pending=false){
 return `<ol id="${id}" class="milestone-list ${pending?'pending':''}" style="--count:${items.length}" aria-label="${id==='durationTrack'?'基础系数档位':'30天复购档位'}">${items.map((t,i)=>`<li class="milestone ${i<=stage?'reached':''} ${i===stage?'current':''}" ${i===stage?'aria-current="step"':''}><i class="dot" aria-hidden="true"></i><span class="threshold">${t.label}</span><span class="tier-value">${t.value}</span><span class="position-label">${i===stage?(pending?'指标所在档':'当前档'):''}</span></li>`).join('')}</ol>`;
}
function durationHTML(q,c,r){
 const d=Milestones.duration(q,c),labels=['≤120小时','>120小时','>140小时','>160小时'];
 const note=q.newPartner?'当前采用新伙伴专属系数，标准时长阶梯暂不适用。':d.nextBoundary===null?'已在最高时长档，继续接单仍按当前系数累计。':d.remaining===0?`已到 ${num(d.nextBoundary/60)} 小时边界；超过后进入下一档。`:`再累计超过 ${num(d.remaining)} 分钟，可进入第 ${d.stage+2} 档。`;
 return `<section class="business-card" id="baseCard"><header class="business-title"><h2>基础接单奖励</h2><strong class="money" id="baseAmount">${cash(r.base)}</strong></header><div class="metric-head"><div><small>当月累计时长 · 折算上钟</small><div class="metric-value" id="durationValue">${num(d.hours)}<em>小时</em></div></div><div class="current-state" id="durationState"><b>${q.newPartner?'新伙伴专属':'当前第 '+(d.stage+1)+' 档'}</b>${num(d.coeff)} 元 / 分钟</div></div>${milestoneHTML('durationTrack',c.coefficients.map((v,i)=>({label:labels[i],value:num(v)+' 元/分钟'})),d.stage)}<p class="milestone-note" id="durationNext">${note}</p><p class="business-note">本月 ${num(d.minutes)} 分钟 × ${num(d.coeff)} 元/分钟；全月按同一系数计算。<br>恰好 120 / 140 / 160 小时仍按前一档，超过才升档。</p></section>`;
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
function rewardHTML(p,drawer=false){
 const r=calc(p),c=cfg(),q=pm(p),prefix=drawer?'drawer-':'',history=month==='2026-09';
 const rows=[...(p.manager?[['店长接单奖励',r.manager,'managerAmount']]:[]),['培训补贴',r.training,'trainingAmount']];
 const breakdown=rows.map(([title,amount,id])=>`<div class="reward-row" ${id==='managerAmount'?'data-manager-reward':''}><span>${title}</span><strong class="money" id="${prefix+id}">${cash(amount)}</strong></div>`).join('');
 const baseRule=`<h4>基础接单奖励</h4>${kv('折算上钟时长',num(q.minutes)+' 分钟')}${kv('当前系数',r.coeff+' 元 / 分钟')}<p>全月折算分钟乘同一系数，不分段累加；与累计成就中的服务分钟分开统计。</p>`;
 const managerRule=p.manager?`<h4>店长接单奖励</h4>${kv('本月整店实际业绩',cash(r.sales))}${kv('整店目标',cash(r.shop.target))}${kv('提点比例',r.shop.commissionRate+'%')}<p>${r.sales>=r.shop.target?'目标已完成，按全部实际业绩计算提点。':'目标尚未完成，当前为零；完成后按全部实际业绩计算提点，不只计算超出部分。'}</p><p>计算：${cash(r.sales)} × ${r.shop.commissionRate}%${r.sales>=r.shop.target?' = '+cash(r.manager):'，完成目标后计入'}。</p>`:'';
 const parts=[...new Set(q.training)].map(id=>c.parts.find(x=>x.id===id)?.name).filter(Boolean);
 const trainingRule=`<h4>培训补贴</h4>${kv('统一部位金额',cash(c.trainingAmount)+' / 部位')}${kv('本月通过部位',parts.length?parts.join('、'):'暂无')}<p>所有部位使用同一金额。同一部位首次通过计一次，重复认证不重复计入。</p>`;
 const nextTier=q.newCount<c.minNew?`当前新客样本 ${num(q.newCount)} / ${c.minNew}，补足后计算 30 天档位。`:r.nextTier?`下一档 ${r.nextTier.rate}%：${cash(r.nextTier.amount)}，比当前档增加 ${cash(r.nextTier.amount-r.tierPotential)}。在 ${num(q.newCount)} 位新客分母不变时，还需 ${num(r.needed)} 位完整归属的新客复购。`:'已到 30 天最高档；10 天复购仍可继续积累。';
 const repurchaseData=`<h4>复购数据 · 比例与人数</h4>${kv('老客 60 天留存率',fmt(r.retention,1)+'%')}${kv('老客留存人次',num(q.retained)+' / '+num(q.senior))}${kv('新客 30 天复购率',fmt(r.conversion,1)+'%')}${kv('30 天复购 / 新客数',num(q.returned)+' / '+num(q.newCount))}${kv('10 天加权复购数',num(r.f.heads)+' 位')}<p>${r.eligible?'已满足':'待满足'} ${c.retention}% 留存条件。${q.senior<50?'老客样本较少；不自动免除条件。':''}</p>
 <h4>奖励金额 · 与上方数据分开</h4>${kv('30 天档位奖励',cash(r.tier))}${kv('10 天递增奖励',cash(r.eligible?r.f.amount:0))}${!r.eligible?kv('待满足条件的参考金额',cash(r.tierPotential+r.f.amount)):''}<p>${nextTier}${r.eligible?'':'以上金额需先满足留存条件。'}</p>
 <h4>规则与窗口</h4><p>老客：${E.windowFor(month,c.retentionLength,c.retentionOffset)}；新客：${E.windowFor(month,c.conversionLength,c.conversionOffset)}。10 天复购按 ${month} 首单月归属。</p><p>30 天档位取最高一档，不叠加：${c.tiers.map(t=>t.rate+'% → '+cash(t.amount)).join('；')}。</p><p>10 天实际单价：${E.sequence(9,c).map(x=>cash(x)).join('、')}……每位上限 ${cash(c.cap)}，封顶后继续累计；共同服务按该位单价乘归属权重。</p><p>未满足留存条件时，两类复购奖励均不计入合计。观察期、有效服务或退款变化可能改变预估。</p>`;
 const ledger=`<p class="detail-intro">接单奖励合计与合作结算是两个口径，下列明细展示换算过程。</p>${kv('接单奖励合计',cash(r.subtotal))}${kv('其他调整',(r.adjustment>=0?'+':'−')+cash(Math.abs(r.adjustment)))}${q.adjustments.map(a=>`<div class="adjustment-line">${esc(a.name)}<span>${a.amount>=0?'+':'−'}${cash(Math.abs(a.amount))}</span></div>`).join('')}${kv('调整后合计',cash(r.gross),'total')}${kv('服务费换算差额','−'+cash(r.serviceDifference))}${kv('费用换算后金额',cash(r.preTax))}${kv('预扣税额','−'+cash(r.tax))}${kv(history?'合作结算 · 演示':'预计合作结算',cash(r.net),'total')}<p>调整后合计 ÷ 1.068，四舍五入到元，再扣除预扣税额。分类已包含的款项不重复进入其他调整。</p>
 <details class="plain-details" id="${prefix}taxDetails"><summary>税费计算依据 ${icon('chevron')}</summary>${kv('年度累计换算后金额',cash(r.annual))}${kv('年度计税基数',cash(r.taxable))}${kv('累计连续月份',r.continuousMonths+' 个月')}${kv('适用税率',r.taxRate+'%')}${kv('速算扣除数',cash(r.quick))}${kv('此前已缴税额',cash(r.priorTax))}<p>历史累计为模拟数据，正式结果由既有结算服务统一返回。</p></details>`;
 return `<section class="reward-overview"><div class="income-hero reward-hero"><div class="row"><h2>本月接单奖励</h2><div class="toolbar"><span class="tag">预估</span><button id="moneyToggle" class="money-button" aria-label="${hiddenMoney?'显示':'隐藏'}奖励金额">${icon('eye')}</button></div></div><div class="hero-value money" id="rewardTotal">${cash(r.subtotal)}</div><p class="hero-note">按当前规则估算，仅含已满足条件的奖励</p></div></section>
 ${durationHTML(q,c,r)}${repurchaseHTML(q,c,r)}<section class="business-card other-rewards" aria-label="其他奖励构成">${breakdown}</section>
 <div class="detail-group">${disclosure(prefix+'calculationDetails','奖励计算说明',baseRule+managerRule+trainingRule)}${disclosure(prefix+'repurchaseDetails','统计口径与复购规则',repurchaseData)}${disclosure(prefix+'settlementDetails','合作结算明细',ledger)}</div>`;
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
 $('certList').innerHTML=certs.map(c=>{const rows=records.filter(r=>r.project===c.name),count30=rows.filter(r=>r.date>=dateAt(257)).length;return `<article class="cert-card"><div class="cert-title">${icon('award')}<b>${c.name}</b></div><p>认证通过日 ${c.date} · 次日起计入</p><div class="cert-stats"><div><b>${rows.length}</b><small>认证后累计服务次数</small></div><div><b>${count30}</b><small>近 30 天服务次数</small></div></div></article>`;}).join('');
}
function renderMobile(){
 const p=person();
 $('app').innerHTML=`<div class="mobile-stage"><details class="prototype-bar" id="scenario"><summary><span>V4 原型 · 模拟数据</span><span>演示场景 ${icon('chevron')}</span></summary><div class="prototype-controls"><label class="field"><span>演示人物（正式页面无此切换）</span><select id="demoPerson">${people.map(x=>option(x.id,x.name+' · '+(x.manager?'店长':'疗愈师'),personId)).join('')}</select></label>${[['head','模拟 +1 位10天复购','half','模拟 +0.5 权重'],['return','模拟30天窗口 +1位','gate','切换留存条件'],['minutes','模拟 +90 分钟','training','模拟通过眼部认证'],['shop','切换整店目标状态','reset','重置演示数据']].map(a=>`<div class="toolbar"><button class="btn sm" data-sim="${a[0]}">${a[1]}</button><button class="btn sm" data-sim="${a[2]}">${a[3]}</button></div>`).join('')}<a href="${esc(link(PC))}" target="_blank">打开管理端参数设置 →</a></div></details>
 <main class="mobile-app mobile-v3 mobile-v4"><nav class="mobile-nav"><span class="brand">Full愈</span><span class="small muted">我的接单</span></nav><header class="mobile-head"><div class="avatar">${p.initial}</div><div class="partner-identity"><h1>${esc(p.name)}</h1><p>${cfg().shops.find(s=>s.id===p.shop).name} · ${p.manager?'店长':'疗愈师'}</p></div><div class="head-right"><span class="month-label">2026 年 10 月</span></div></header>
 <section class="achievement" id="achievementOverview">${achievementHTML(p)}</section>
 ${rewardHTML(p)}
 <div class="detail-group service-group">${disclosure('certificationDetails','项目认证','<div id="certList"></div><p>展示认证后累计与近 30 天次数；部位认证补贴在上方奖励中单独计算。</p>','认证日期与服务次数')}</div>
 <footer class="mobile-footer">${icon('lock')} 仅本人可见 · 客户号码已脱敏<br>累计成就截至今日 · 奖励按本月统计<br>全部为演示数据，不作为实际结算依据</footer></main></div>`;
 $('demoPerson').onchange=e=>{personId=e.target.value;hiddenMoney=false;render();$('scenario').open=true;};
 $('moneyToggle').onclick=()=>{hiddenMoney=!hiddenMoney;render();};
 document.querySelectorAll('[data-sim]').forEach(b=>b.onclick=()=>simulate(b.dataset.sim));
 renderAchievements();
}
function simulate(kind){
 const p=person();if(month!=='2026-10'&&kind!=='reset'){toast('历史月份为演示快照，请切回 10 月试算');return;}
 switch(kind){case'head':p.weights.push(1);break;case'half':p.weights.push(.5);break;case'return':p.returned=Math.min(p.newCount,p.returned+1);break;case'gate':p.retained=calc(p).eligible?Math.floor(p.senior*(cfg().retention-2)/100):Math.ceil(p.senior*cfg().retention/100);break;case'minutes':p.minutes+=90;break;case'training':if(p.training.includes('eyes')){toast('本部位已计入，不重复增加补贴');return;}p.training.push('eyes');break;case'shop':{const s=cfg().shops.find(s=>s.id===p.shop);revenues[p.shop]=revenues[p.shop]>=s.target?s.target-10000:s.target+10000;break;}case'reset':people=E.clone(E.PEOPLE);revenues=E.clone(E.REVENUE);month='2026-10';hiddenMoney=false;break;}
 render();$('scenario').open=true;toast(kind==='reset'?'演示数据已重置，规则配置保留':'模拟数据已更新，未写入正式系统');
}
