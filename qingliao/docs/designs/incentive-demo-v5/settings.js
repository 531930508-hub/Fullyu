let draft=null,settingsTab='repurchase';
const settingTabs=[['repurchase','复购接单奖励'],['base','基础接单系数'],['shop','店长提点'],['training','培训项目'],['windows','统计口径'],['history','版本记录']];
function field(label,key,value,extra=''){return `<label class="field"><span>${label}</span><input type="number" step="0.01" min="0" data-key="${key}" value="${value}" ${extra}></label>`;}
function trainingBrief(c){
 const list=c.trainingProjects||[];
 if(!list.length)return '未配置项目';
 const uniform=list.every(x=>x.target===list[0].target&&x.amount===list[0].amount);
 return uniform?`${list.length} 项统一 ${list[0].target} 次 / ${cash(list[0].amount)}`:`${list.length} 项独立次数与金额`;
}
function openSettings(tab){
 draft=E.clone(cfg());draft.effective='2026-10';settingsTab=tab||(role==='manager'?'shop':'repurchase');renderSettings();$('settingsDialog').showModal();
}
function renderSettings(){
 const readonly=role==='manager';
 $('settingsNav').innerHTML=settingTabs.map(([key,label])=>`<button data-tab="${key}" class="${settingsTab===key?'on':''}" aria-current="${settingsTab===key?'page':'false'}">${label}${readonly?' · 只读':''}</button>`).join('');
 $('saveSettings').disabled=readonly;$('effective').value=draft.effective;$('effective').disabled=readonly;$('settingsError').textContent='';let html='';
 if(settingsTab==='repurchase')html=`<h3>先满足留存条件，再计算两类复购奖励</h3><p>不默认启用新伙伴或小样本豁免。</p><div class="form-grid">${field('老客 60 天留存率条件（%）','retention',draft.retention,'max="100"')}${field('30 天档位最小新客样本数','minNew',draft.minNew,'step="1"')}</div><hr class="divider"><h3>30 天档位 · 取最高一档，不叠加</h3><table><thead><tr><th>新客复购率 ≥（%）</th><th>档位金额（元）</th></tr></thead><tbody>${draft.tiers.map((t,i)=>`<tr><td><input aria-label="第${i+1}档复购率" type="number" min="0" max="100" step="0.1" data-key="tiers.${i}.rate" value="${t.rate}"></td><td><input aria-label="第${i+1}档金额" type="number" min="0" data-key="tiers.${i}.amount" value="${t.amount}"></td></tr>`).join('')}</tbody></table><hr class="divider"><h3>10 天复购 · 每位单价递增</h3><div class="form-grid">${field('第 1 位单价（元）','a1',draft.a1)}${field('第 2 位单价（元）','a2',draft.a2)}<div class="full">${field('每位最高单价（元）','cap',draft.cap)}</div></div><div class="notice">封顶的是每位单价，不是月度总额。封顶后每个新增复购继续按该单价计入，再乘归属权重。</div><div class="calc-box"><div id="seqPreview"></div><div class="row" style="margin-top:12px"><label>试算完整复购人数 <input class="control" id="testHeads" type="number" min="0" max="100" step="1" value="9" style="width:80px"></label><strong id="testAmount"></strong></div></div>`;
 if(settingsTab==='base')html=`<h3>基础接单系数</h3><p>全部折算分钟使用一个区间系数，不分段累加；达到区间起点即进入该档。</p><div class="form-grid">${['0–<7,200 分钟','≥7,200–<8,400 分钟','≥8,400–<9,600 分钟','≥9,600 分钟'].map((t,i)=>field(t+' · 元/分钟','coefficients.'+i,draft.coefficients[i])).join('')}${field('新伙伴系数 · 元/分钟','newCoefficient',draft.newCoefficient)}</div><div class="calc-box" id="basePreview"></div><div class="notice">示例：7,200 分钟整点按第二档计算，8,400 分钟整点按第三档，9,600 分钟整点按第四档。分钟数沿用既有折算工时；不能以累计成就中的原始服务分钟直接替换。</div>`;
 if(settingsTab==='shop')html=`<h3>完成目标后，按整店实际业绩提点</h3><p>未完成时为零；完成后按全部业绩计算，不是固定金额，也不只计算超出目标的部分。</p>${draft.shops.filter(s=>!readonly||s.id==='west').map(s=>{const i=draft.shops.findIndex(x=>x.id===s.id);return `<div class="shop-rule"><h3>${s.name}</h3><div class="form-grid">${field('整店月业绩目标（元） · 示例','shops.'+i+'.target',s.target)}${field('店长提点比例（%） · 示例','shops.'+i+'.commissionRate',s.commissionRate,'max="100"')}</div><div class="calc-box" data-shop-preview="${s.id}"></div></div>`;}).join('')}<div class="notice">计算公式：实际业绩 ≥ 目标时，店长接单奖励 = 整店实际业绩 × 提点比例。比例可保留小数，金额四舍五入到分。目标业绩具体数据来源仍需正式接入核对。</div>`;
 if(settingsTab==='training')html=`<h3>8 个培训项目，各自设置次数与补贴</h3><p>全感舒筋的 6 个部位分别独立，头部水疗 60 / 90 分钟分别独立。通过考核的次日起累计对应项目订单，达到本项目次数后，补贴计入达标当月。</p><div class="training-setting-table"><table><thead><tr><th>培训项目</th><th>完成订单次数</th><th>补贴金额（元）</th></tr></thead><tbody>${draft.trainingProjects.map((p,i)=>`<tr><td><b>${esc(p.group)} · ${esc(p.name)}</b><small>${p.duration?p.duration+' 分钟课程':'服务部位'}</small></td><td><input aria-label="${esc(p.group+' '+p.name)}次数" type="number" min="1" max="999" step="1" data-key="trainingProjects.${i}.target" value="${p.target}"></td><td><input aria-label="${esc(p.group+' '+p.name)}补贴" type="number" min="0" step="0.01" data-key="trainingProjects.${i}.amount" value="${p.amount}"></td></tr>`).join('')}</tbody></table></div><div class="calc-box" id="trainingPreview"></div><div class="notice">每个项目单独累计、单独发放，同一项目只计入一次；未登记考核的项目不累计。考核通过日期不在此页设置，请在“培训考核”页面逐人维护。修改参数会形成新的规则版本，正式系统需冻结历史结算所用版本。</div>`;
 if(settingsTab==='windows')html=`<h3>统计窗口</h3><p>以所选月份为锚点，累计成就时间轴保持独立。</p><div class="form-grid">${field('老客窗口长度（月）','retentionLength',draft.retentionLength,'step="1" max="12"')}${field('老客窗口末月偏移（月）','retentionOffset',draft.retentionOffset,'step="1" max="12"')}${field('新客窗口长度（月）','conversionLength',draft.conversionLength,'step="1" max="12"')}${field('新客窗口末月偏移（月）','conversionOffset',draft.conversionOffset,'step="1" max="12"')}</div><div class="notice">本原型仅演示窗口标签变化；真实分子分母须由后端重新汇总，不伪造重算结果。</div>`;
 if(settingsTab==='history')html=`<h3>规则版本与修改记录</h3><p>本机演示版本，不覆盖真实历史结算。</p>${versions.slice().sort((a,b)=>b.effective.localeCompare(a.effective)).map(c=>`<div class="history-entry"><b>${esc(c.version)}</b><p>${c.effective} 起 · 每位上限 ${cash(c.cap)} · 培训 ${trainingBrief(c)}</p><p>${c.shops.filter(s=>!readonly||s.id==='west').map(s=>s.name+'提点 '+s.commissionRate+'%').join('；')}</p></div>`).join('')}${audit.length?'<h3>本地修改留痕</h3>'+audit.slice(-5).reverse().map(a=>`<div class="history-entry">${esc(a.time)} · ${esc(a.message)}</div>`).join(''):'<p class="subnote">暂无本地修改。</p>'}`;
 $('settingsContent').innerHTML=`<section class="settings-section">${html}</section>`;
 if(readonly)$('settingsContent').querySelectorAll('input').forEach(n=>n.disabled=true);
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.tab;renderSettings();document.querySelector(`[data-tab="${settingsTab}"]`).focus({preventScroll:true});});
 $('settingsContent').querySelectorAll('[data-key]').forEach(n=>n.oninput=()=>{const keys=n.dataset.key.split('.');let target=draft;keys.slice(0,-1).forEach(k=>target=target[k]);target[keys.at(-1)]=n.value===''?NaN:Number(n.value);updatePreviews();});
 if($('testHeads'))$('testHeads').oninput=updatePreviews;updatePreviews();
}
function updatePreviews(){
 const error=E.validation(draft);
 if($('seqPreview')){const n=Number($('testHeads').value);$('seqPreview').textContent=error||'实际单价：'+E.sequence(10,draft).map(num).join(' → ')+' …';$('testAmount').textContent=error?'—':Number.isInteger(n)&&n>=0&&n<=100?cash(E.fib(Array(n).fill(1),draft).amount):'请输入 0–100 的整数';}
 if($('basePreview'))$('basePreview').innerHTML=error?'请检查参数':`7,200 分钟即进入第二档：7,200 × ${num(E.coefficient(7200,draft))} = <strong>${cash(7200*E.coefficient(7200,draft))}</strong>`;
 if($('trainingPreview')){if(error){$('trainingPreview').textContent='请检查参数';}else{let total=0,completed=0,registered=0;const m=TODAY.slice(0,7);people.forEach(p=>{const s=E.trainingSummary(p,draft,m,trainingData(),TODAY);total+=s.total;completed+=s.completedThisMonth;registered+=s.registered;});$('trainingPreview').innerHTML=`演示数据 ${m}：已登记 ${registered} / ${people.length*draft.trainingProjects.length} 项；本月达标 ${completed} 项，补贴合计 <strong>${cash(total)}</strong>。`;}}
 document.querySelectorAll('[data-shop-preview]').forEach(n=>{const s=draft.shops.find(s=>s.id===n.dataset.shopPreview),sales=revenues[s.id];n.textContent=error?'请检查参数':sales>=s.target?`示例业绩 ${cash(sales)}，目标已完成：${s.commissionRate}% 提点 = ${cash(E.round(sales*s.commissionRate/100))}`:`示例业绩 ${cash(sales)}，目标尚未完成：当前 ${cash(0)}。完成后按全部业绩 × ${s.commissionRate}% 计算。`;});
}
function saveSettings(){
 if(role==='manager')return;draft.effective=$('effective').value;const error=E.validation(draft);
 if(error){$('settingsError').textContent=error;return;}
 if(draft.effective<'2026-10'){$('settingsError').textContent='历史月份只读，请选 2026-10 或之后的新版本';return;}
 const previous=versions.find(c=>c.effective===draft.effective),v=E.clone(draft);v.version=v.effective+' · V5修订 '+(audit.length+1);
 audit.push({time:new Date().toLocaleString('zh-CN'),message:`保存 ${v.effective}：${v.shops.map(s=>s.name+'提点'+s.commissionRate+'%').join('、')}；培训 ${trainingBrief(v)}`,previous:previous?E.clone(previous):null});
 versions=versions.filter(c=>c.effective!==v.effective).concat(v);persist();$('settingsDialog').close();render();$('settingsOpen')?.focus({preventScroll:true});toast(v.effective>month?'未来演示版本已保存，当前月份保持原规则':'示例规则已保存，报表与手机预览链接已更新');
}
