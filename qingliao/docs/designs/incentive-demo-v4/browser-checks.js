(() => {
 const $=id=>document.getElementById(id),E=window.demo.engine;
 const out=[];
 function test(name,fn){if(!fn())throw Error(name);out.push(name);}
 function person(id){$('demoPerson').value=id;$('demoPerson').dispatchEvent(new Event('change',{bubbles:true}));}
 function click(kind){document.querySelector(`[data-sim="${kind}"]`).click();}
 function text(id){return $(id).textContent;}
 function current(id){return [...$(id).children].findIndex(n=>n.getAttribute('aria-current')==='step');}
 function reset(){click('reset');person('rain');document.querySelectorAll('details[open]').forEach(n=>n.open=false);}
 reset();
 test('顶部成就常显且在金额前',()=>!$('achievementOverview').closest('details')&&$('achievementOverview').getBoundingClientRect().top<$('rewardTotal').getBoundingClientRect().top);
 test('手机没有任何时间筛选',()=>!document.querySelector('#month,#axisStart,#axisEnd,[data-axis],input[type="date"],input[type="month"]:not(#effective)'));
 test('主金额与两类明细正确',()=>text('rewardTotal')==='¥10,790.00'&&text('baseAmount')==='¥9,720.00'&&text('repurchaseAmount')==='¥870.00');
 test('时长和复购指标均常显',()=>['durationValue','retentionValue','conversionValue','tenDayAmount'].every(id=>$(id).getClientRects().length&&!$(id).closest('details')));
 test('默认时长135小时第二档',()=>text('durationValue')==='135小时'&&current('durationTrack')===1&&$('durationTrack').children.length===4);
 test('默认新客15档，10天70',()=>current('conversionTrack')===2&&$('conversionTrack').children.length===5&&text('thirtyDayAmount')==='¥800.00'&&text('tenDayAmount')==='¥70.00');
 test('说明及认证默认折叠但内容保留',()=>['calculationDetails','repurchaseDetails','settlementDetails','certificationDetails'].every(id=>!$(id).open)&&document.querySelectorAll('.cert-card').length===3&&text('settlementDetails').includes('预计合作结算'));
 $('repurchaseDetails').open=true;$('moneyToggle').focus();$('moneyToggle').click();
 test('全部金额隐藏且比例时长仍可见',()=>!document.querySelector('main').textContent.includes('¥')&&text('durationValue')==='135小时'&&text('retentionValue').includes('%'));
 test('金额切换保留展开和焦点',()=>$('repurchaseDetails').open&&document.activeElement.id==='moneyToggle');
 $('moneyToggle').click();click('head');
 test('加一位沿用斐波那契而非固定单价',()=>text('tenDayAmount')==='¥120.00'&&text('nextReward')==='+¥80.00');
 click('half');test('共同归属权重应用当前顺位单价',()=>text('tenDayAmount')==='¥160.00'&&text('nextReward')==='+¥130.00');
 reset();test('下一档提示不将最低差额误写成跨档最终差额',()=>text('conversionNext').includes('至少'));
 click('return');click('return');
 test('30天两位直接跨到20档并取最高档',()=>current('conversionTrack')===4&&text('thirtyDayAmount')==='¥1,500.00');
 click('gate');test('留存未达标两项归零，保留指标所在档',()=>text('repurchaseAmount')==='¥0.00'&&text('thirtyDayAmount')==='¥0.00'&&text('tenDayAmount')==='¥0.00'&&text('conversionTrack').includes('指标所在档')&&text('retentionState').includes('未达标'));
 reset();const p=window.demo.state.people[0];
 test('界面遵守全部时长端点',()=>[7200,7201,8400,8401,9600,9601].every((v,i)=>{p.minutes=v;window.demo.render();return current('durationTrack')===[0,1,1,2,2,3][i];}));
 p.minutes=8400;window.demo.render();test('到边界提示超过后才升级',()=>text('durationNext').includes('超过后'));
 reset();click('minutes');test('模拟时长同时更新金额及指标',()=>text('durationValue')==='136.5小时'&&text('baseAmount')==='¥9,828.00');
 click('training');const amount=text('trainingAmount');click('training');test('统一补贴和防重保留',()=>amount==='¥300.00'&&text('trainingAmount')===amount);
 person('lin');test('店长按全额业绩1%计2168',()=>text('managerAmount')==='¥2,168.00');click('shop');test('目标未达店长奖励为零',()=>text('managerAmount')==='¥0.00');
 person('ivy');test('新伙伴不突出标准时长档',()=>current('durationTrack')===-1&&text('durationState').includes('0.8'));
 test('小样本有比例但没有已生效复购档',()=>text('conversionState').includes('样本不足')&&text('thirtyDayAmount')==='¥0.00'&&$('conversionTrack').classList.contains('pending'));
 reset();
 return out;
})()
