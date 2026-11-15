(() => {
 const $=id=>document.getElementById(id),E=window.demo.engine;
 const out=[];
 function test(name,fn){if(!fn())throw Error('FAIL '+name);out.push(name);}
 function person(id){$('demoPerson').value=id;$('demoPerson').dispatchEvent(new Event('change',{bubbles:true}));}
 function click(kind){document.querySelector(`[data-sim="${kind}"]`).click();}
 function text(id){return $(id).textContent;}
 function current(id){return [...$(id).children].findIndex(n=>n.getAttribute('aria-current')==='step');}
 function reset(){click('reset');person('rain');document.querySelectorAll('details[open]').forEach(n=>n.open=false);}
 reset();
 test('累计成就置顶且位于奖励之前',()=>!$('achievementOverview').closest('details')&&$('achievementOverview').getBoundingClientRect().top<$('rewardTotal').getBoundingClientRect().top);
 test('手机主区域没有时间筛选',()=>!document.querySelector('main #month,main #axisStart,main #axisEnd,main [data-axis],main input[type="date"],main input[type="month"]'));
 test('主金额与基础复购培训明细正确',()=>text('rewardTotal')==='¥11,090.00'&&text('baseAmount')==='¥9,720.00'&&text('repurchaseAmount')==='¥870.00'&&text('trainingAmount')==='¥500.00');
 test('时长、复购与培训指标均常显',()=>['durationValue','retentionValue','conversionValue','tenDayAmount','trainingAmount'].every(id=>$(id).getClientRects().length&&!$(id).closest('details')));
 test('135小时处于第二档并采用1.2系数',()=>text('durationValue')==='135小时'&&current('durationTrack')===1&&$('durationTrack').children.length===4&&text('durationState').includes('1.2'));
 test('跳档文案说明达到端点即进入下一档',()=>text('durationNext').includes('再累计 300 分钟')&&text('durationNext').includes('140 小时'));
 test('默认30天15档，10天70',()=>current('conversionTrack')===2&&$('conversionTrack').children.length===5&&text('thirtyDayAmount')==='¥800.00'&&text('tenDayAmount')==='¥70.00');
 test('培训卡只展示当前项目并保留历史摘要',()=>{const ids=[...$('trainingCard').querySelectorAll('[data-training-project]')].map(n=>n.dataset.trainingProject);return ids.length===3&&ids.includes('sujin-shoulder')&&ids.includes('sujin-face')&&ids.includes('headspa-60')&&!ids.includes('sujin-head')&&text('trainingCard').includes('已登记 4 / 8')&&text('trainingCard').includes('此前已达标 1 项');});
 test('本月达标培训项目计入500',()=>{const row=$('trainingCard').querySelector('[data-training-project="sujin-shoulder"]');return row.dataset.trainingStatus==='completed-this-month'&&row.textContent.includes('2026-10-18')&&row.textContent.includes('+¥500.00');});
 test('培训详情默认折叠但完整保留8项',()=>!$('trainingDetails').open&&$('trainingAllList').querySelectorAll('.training-all-row').length===8&&text('trainingDetails').includes('全感舒筋 · 头部')&&text('trainingDetails').includes('头部水疗 · 90 分钟'));
 test('说明、证书与结算默认折叠且内容保留',()=>['calculationDetails','repurchaseDetails','trainingDetails','settlementDetails','certificationDetails'].every(id=>!$(id).open)&&text('settlementDetails').includes('预计合作结算'));
 $('repurchaseDetails').open=true;$('trainingDetails').open=true;$('moneyToggle').focus();$('moneyToggle').click();
 test('全部金额隐藏且比例时长进度仍可见',()=>!document.querySelector('main').textContent.includes('¥')&&text('durationValue')==='135小时'&&text('retentionValue').includes('%')&&text('trainingAmount')==='••••'&&$('trainingCard').querySelectorAll('[data-training-project]').length===3);
 test('金额切换保留展开和焦点',()=>$('repurchaseDetails').open&&$('trainingDetails').open&&document.activeElement.id==='moneyToggle');
 $('moneyToggle').click();click('head');
 test('加一位沿用斐波那契而非固定单价',()=>text('tenDayAmount')==='¥120.00'&&text('nextReward')==='+¥80.00');
 click('half');test('共同归属权重应用当前顺位单价',()=>text('tenDayAmount')==='¥160.00'&&text('nextReward')==='+¥130.00');
 reset();test('下一档提示不将最低差额误写成跨档最终差额',()=>text('conversionNext').includes('至少'));
 click('return');click('return');
 test('30天两位直接跨到20档并取最高档',()=>current('conversionTrack')===4&&text('thirtyDayAmount')==='¥1,500.00');
 click('gate');test('留存未达标两项归零，保留指标所在档',()=>text('repurchaseAmount')==='¥0.00'&&text('thirtyDayAmount')==='¥0.00'&&text('tenDayAmount')==='¥0.00'&&text('conversionTrack').includes('指标所在档')&&text('retentionState').includes('未达标')&&text('trainingAmount')==='¥500.00');
 reset();const p=window.demo.state.people[0];
 test('界面遵守7200/8400/9600跳档端点',()=>[7199,7200,8399,8400,9599,9600].every((v,i)=>{p.minutes=v;window.demo.render();return current('durationTrack')===[0,1,1,2,2,3][i];}));
 p.minutes=7200;window.demo.render();test('7200分钟界面显示8,640',()=>text('baseAmount')==='¥8,640.00'&&text('durationValue')==='120小时');
 p.minutes=8400;window.demo.render();test('8400分钟界面显示第三档',()=>text('baseAmount')==='¥10,920.00'&&current('durationTrack')===2);
 p.minutes=9600;window.demo.render();test('9600分钟界面显示第四档',()=>text('baseAmount')==='¥14,400.00'&&current('durationTrack')===3);
 reset();click('minutes');test('模拟时长同时更新金额及指标',()=>text('durationValue')==='136.5小时'&&text('baseAmount')==='¥9,828.00');
 click('train-order');
 test('培训订单在次日起累计并计入达标当月',()=>text('trainingAmount')==='¥1,000.00'&&$('trainingCard').querySelector('[data-training-project="sujin-face"]').dataset.trainingStatus==='completed-this-month'&&text('trainingCard').includes('本月达标 2 项'));
 click('train-cert');
 test('登记新考核从次日起累计且独立项目不串',()=>text('trainingAmount')==='¥1,000.00'&&$('trainingCard').querySelector('[data-training-project="sujin-hand"]').textContent.includes('2 / 5 单')&&text('trainingCard').includes('已登记 5 / 8'));
 reset();person('ivy');
 test('新伙伴不突出标准时长档',()=>current('durationTrack')===-1&&text('durationState').includes('0.8'));
 test('新伙伴培训进度与补贴分离',()=>text('trainingAmount')==='¥0.00'&&$('trainingCard').querySelector('[data-training-project="sujin-face"]').textContent.includes('3 / 5 单'));
 person('tom');test('历史达标项目移出当前列表但仍保留摘要',()=>!$('trainingCard').querySelector('[data-training-project="sujin-head"]')&&text('trainingCard').includes('此前已达标 1 项'));
 reset();return out;
})()
