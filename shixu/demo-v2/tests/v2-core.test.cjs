const {test}=require('node:test');
const a=require('node:assert/strict');
const D=require('../core.js');
const tea=(s,extra={})=>D.placeOrder(s,{store:'sh',channel:'mini',type:'takeaway',owner:'customer',lines:[{id:'song-0',qty:2,temp:'热'}],...extra});
const retail=(s,extra={})=>D.placeRetailOrder(s,{channel:'mini',owner:'customer',lines:[{id:'retail-0',qty:2,temp:''}],...extra});
test('V2 has multiple stores per city and nearest open ordering store',()=>{const s=D.initialState();a.equal(s.version,7);a.equal(Object.values(s.stores).filter(x=>x.city==='上海').length,2);a.equal(D.nearestStore(s,31.23,121.47).id,'sh');s.stores.sh.open=false;a.notEqual(D.nearestStore(s,31.23,121.47).id,'sh');a.throws(()=>D.nearestStore(s,NaN,0));});
test('Fresh and retail cannot share a production order',()=>{const s=D.initialState();a.throws(()=>tea(s,{lines:[{id:'song-0',qty:1,temp:'热'},{id:'retail-0',qty:1}]}),/分开/);a.equal(s.orders.length,0);a.equal(s.stores.sh.stock['song-0'],480);});
test('Retail payment reserves network stock, not a pickup store; delivery is idempotent',()=>{const s=D.initialState(),before=structuredClone(s.stores);const o=retail(s,{key:'r1'});a.equal(o.store,null);a.equal(o.status,'awaiting');a.deepEqual(s.stores,before);a.equal(retail(s,{key:'r1'}).id,o.id);D.deliverRetail(s,o.id,'bj',o.pickupCode);a.equal(o.status,'delivered');a.equal(o.pickupStore,'bj');a.equal(s.stores.bj.stock['retail-0'],34);a.equal(s.stores.sh.stock['retail-0'],36);D.deliverRetail(s,o.id,'sh',o.pickupCode);a.equal(s.stores.sh.stock['retail-0'],36);a.equal(o.pickupStore,'bj');});
test('Retail delivery rejects insufficient store stock atomically and supports another store',()=>{const s=D.initialState(),o=retail(s);s.stores.sh.stock['retail-0']=1;a.throws(()=>D.deliverRetail(s,o.id,'sh',o.pickupCode),/库存/);a.equal(o.status,'awaiting');a.equal(s.stores.sh.stock['retail-0'],1);D.deliverRetail(s,o.id,'bj',o.pickupCode);a.equal(o.status,'delivered');});
test('Network outstanding retail orders cannot oversell; uncollected refunds do not create stock',()=>{const s=D.initialState();Object.values(s.stores).forEach(x=>x.stock['retail-0']=1);const o=retail(s,{lines:[{id:'retail-0',qty:4}]});a.throws(()=>retail(s),/库存/);D.refund(s,o.id,0,2,'计划改变',false);a.equal(Object.values(s.stores).reduce((n,x)=>n+x.stock['retail-0'],0),4);a.equal(D.retailAvailable(s,'retail-0'),2);a.throws(()=>D.finishOrder(s,o.id),/零售/);});
test('Delivered retail refund does not return stock automatically or permit redelivery',()=>{const s=D.initialState(),o=retail(s);D.deliverRetail(s,o.id,'sh',o.pickupCode);D.refund(s,o.id,0,1,'售后',false);a.equal(s.stores.sh.stock['retail-0'],34);D.deliverRetail(s,o.id,'bj',o.pickupCode);a.equal(s.stores.bj.stock['retail-0'],36);});
test('Dose snapshot and preparation history protect stock after recipe edits',()=>{const s=D.initialState(),o=tea(s);D.product(s,'song-0').dose=8;a.equal(o.items[0].dose,3.5);D.refund(s,o.id,0,1,'未制作',false);a.equal(s.stores.sh.stock['song-0'],476.5);D.finishOrder(s,o.id);D.undoReady(s,o.id);D.refund(s,o.id,0,1,'出品后退款',false);a.equal(s.stores.sh.stock['song-0'],476.5);});
test('Series statistics split four moments and list product detail for a range',()=>{const s=D.initialState();tea(s);D.placeOrder(s,{store:'sh',channel:'mini',type:'takeaway',owner:'customer',lines:[{id:'qing-0',qty:1,temp:'热'}]});const refunded=D.placeOrder(s,{store:'sh',channel:'mini',type:'takeaway',owner:'customer',lines:[{id:'song-1',qty:1,temp:'热'}]});D.refund(s,refunded.id,0,1,'测试',false);const rows=D.seriesStats(s,s.orders),song=rows.find(x=>x.id==='song'),qing=rows.find(x=>x.id==='qing');a.equal(rows.length,4);a.deepEqual(rows.map(x=>x.en),['GOOD DAY','CHILL','CHEERS','GOOD NIGHT']);a.equal(song.qty,2);a.equal(song.orders,1);a.equal(song.revenue,4000);a.equal(song.products[0].id,'song-0');a.equal(song.products[0].qty,2);a.equal(qing.qty,1);a.equal(qing.revenue,2000);a.equal(qing.products[0].id,'qing-0');});
test('Retail order numbers stay unique and long across stores; fresh numbers stay short',()=>{const s=D.initialState(),r=retail(s),f=tea(s);a.match(r.number,/^TH-R-\d{6}-\d{4}$/);a.ok(r.number.length>=16);a.match(r.id,/^TH-RETAIL-\d{6}-\d+$/);a.match(f.number,/^[ABR]\d{3}$/);a.equal(D.placeRetailOrder(s,{channel:'mini',owner:'customer',lines:[{id:'retail-0',qty:1}],key:'r-later'}).number.slice(0,7),r.number.slice(0,7));a.notEqual(D.placeRetailOrder(s,{channel:'mini',owner:'customer',lines:[{id:'retail-0',qty:1}],key:'r-third'}).number,r.number);});
test('Append-only ledger records settled sales, refunds and pending platform money',()=>{const s=D.seed(D.initialState()),before=D.financeSummary(s),o=tea(s),sold=D.financeSummary(s);a.equal(sold.entries,before.entries+1);a.equal(sold.net,before.net+o.total);a.equal(s.finance[0].dedupeKey,`ORDER:${o.id}:SALE`);a.equal(s.finance[0].storeId,'sh');D.refund(s,o.id,0,1,'测试',true);const refunded=D.financeSummary(s);a.equal(refunded.entries,before.entries+2);a.equal(refunded.net,before.net+2000);a.equal(refunded.refundCount,before.refundCount+1);a.equal(refunded.refunds,before.refunds+2000);const platform=D.placeOrder(s,{store:'sh',channel:'meituan',type:'delivery',owner:'customer',lines:[{id:'song-0',qty:1,temp:'热'}]});const pending=D.financeSummary(s);a.equal(pending.pending,before.pending+platform.total);a.equal(pending.settled,before.settled+2000);a.throws(()=>D.refund(s,o.id,0,2,'再退',true),/退款|超过/);});
test('HQ bulk product changes and SKU mappings validate atomically',()=>{const s=D.initialState(),before=D.product(s,'song-0').price;D.bulkProducts(s,['song-0','song-1'],'price','10');a.equal(D.product(s,'song-0').price,Math.round(before*1.1));D.bulkProducts(s,['song-0','song-1'],'dose','3');a.equal(D.product(s,'song-0').dose,3);a.throws(()=>D.bulkProducts(s,['song-0','retail-0'],'dose','4'),/鲜酿/);a.equal(D.product(s,'song-0').dose,3);D.bulkProducts(s,['song-0','song-1'],'archive');a.equal(D.product(s,'song-1').status,'archived');a.throws(()=>D.bulkProducts(s,['song-0','retail-0'],'category','fresh'),/类型/);const rows=D.saveMappings(s,[{productId:'song-0',externalId:'SCM-TEST-A',unit:'袋',factor:250},{productId:'song-1',externalId:'SCM-TEST-B',unit:'盒',factor:100}]);a.equal(rows.find(x=>x.productId==='song-0').factor,250);a.equal(rows.find(x=>x.productId==='song-1').unit,'盒');const snapshot=structuredClone(s.mappings);a.throws(()=>D.saveMappings(s,[{productId:'song-2',externalId:'SCM-DUP',unit:'袋',factor:500},{productId:'song-3',externalId:'SCM-DUP',unit:'袋',factor:500}]),/重复/);a.deepEqual(s.mappings,snapshot);a.throws(()=>D.saveMappings(s,[{productId:'retail-0',externalId:'SCM-X',unit:'袋',factor:500}]),/散茶/);});
test('Order events carry explicit linkage, payment/refund amount and stable snapshots',()=>{const s=D.initialState(),o=tea(s);D.refund(s,o.id,0,1,'原因',true);D.finishOrder(s,o.id);const events=s.logs.filter(x=>x.orderId===o.id);a.ok(events.some(x=>x.type==='payment'&&x.amount===4000));a.ok(events.some(x=>x.type==='refund'&&x.amount===2000));a.ok(events.some(x=>x.type==='ready'));a.ok(events.every(x=>x.storeId==='sh'));});
test('Category and product drafts need bilingual content to publish',()=>{const s=D.initialState();const c=D.saveCategory(s,{name:'旅行茶包',nameEn:'Travel tea bags',kind:'retail'});let p=D.saveProduct(s,{name:'新茶包',nameEn:'New tea bags',desc:'日常泡茶',descEn:'Daily tea ritual',tag:'盒装',tagEn:'Box',kind:'retail',series:'song',category:c.id,price:4500,dose:1,unit:'盒',unitEn:'box',temps:[],status:'draft',spec:'10袋',specEn:'10 bags'});a.equal(p.status,'draft');a.throws(()=>D.removeCategory(s,c.id),/商品/);D.setProductStatus(s,p.id,'published');a.equal(p.status,'published');D.setProductStatus(s,p.id,'archived');a.throws(()=>retail(s,{lines:[{id:p.id,qty:1}]}),/下架|上架/);a.throws(()=>D.saveProduct(s,{...p,dose:0}),/用量/);});
test('Receipt event converts pack units once; duplicate event with conflicting data is rejected',()=>{const s=D.initialState(),r={id:'GR-DEMO-1',poId:'PO-DEMO-1',warehouseId:'sh',items:[{productId:'SCM-song-0',acceptQty:2,unit:'袋',rejectQty:1}]};a.equal(D.importReceipt(s,r).duplicate,false);a.equal(s.stores.sh.stock['song-0'],1480);a.equal(D.importReceipt(s,r).duplicate,true);a.equal(s.stores.sh.stock['song-0'],1480);a.throws(()=>D.importReceipt(s,{...r,items:[{...r.items[0],acceptQty:3}]}),/冲突/);});
test('Unmapped, wrong-unit, invalid and multi-line receipts are rejected before any stock changes',()=>{const s=D.initialState();for(const item of [{productId:'bad',acceptQty:1,unit:'袋'},{productId:'SCM-song-0',acceptQty:1,unit:'kg'},{productId:'SCM-song-0',acceptQty:-1,unit:'袋'}]){a.throws(()=>D.importReceipt(s,{id:'x',poId:'p',warehouseId:'sh',items:[{productId:'SCM-song-0',acceptQty:1,unit:'袋'},item]}));a.equal(s.stores.sh.stock['song-0'],480);}});
test('V1 pricing, print, remake, fractional refund and platform constraints remain valid',()=>{const s=D.initialState();s.member.vip=true;let o=tea(s,{channel:'meituan',type:'delivery',vip:true,coupon:true});a.equal(o.total,4000);const stock=s.stores.sh.stock['song-0'];D.reprint(s,o.id);a.equal(s.stores.sh.stock['song-0'],stock);const r=D.remake(s,o.id,'补做');a.equal(r.total,0);a.equal(s.stores.sh.stock['song-0'],stock-7);o=tea(s,{lines:[{id:'song-0',qty:3,temp:'热'}],coupon:true});let total=0;for(let n=0;n<3;n++)total+=D.refund(s,o.id,0,1,'退',true);a.equal(total,o.total);a.equal(o.status,'refunded');});

test('Every fresh cup gets a sequential unit and the order is ready only when all are scanned',()=>{
 const s=D.initialState(),o=D.placeOrder(s,{store:'sh',channel:'mini',type:'takeaway',owner:'customer',lines:[{id:'song-0',qty:1,temp:'热'},{id:'qing-0',qty:1,temp:'冰',ice:'标准冰'}]});
 a.deepEqual(o.units.map(u=>u.no),[`${o.number}-1`,`${o.number}-2`]);
 a.equal(D.unitProgress(o).total,2);
 D.scanUnit(s,o.id,o.units[0].id);
 a.equal(o.status,'pending');a.equal(D.unitProgress(o).ready,1);
 a.throws(()=>D.scanUnit(s,o.id,o.units[0].id),/已经出餐/);
 D.scanUnit(s,o.id,o.units[1].id);
 a.equal(o.status,'ready');a.ok(o.readyAt);
 D.undoLastUnit(s,o.id);
 a.equal(o.units.find(u=>u.no===`${o.number}-2`).status,'pending');
 a.equal(o.status,'pending');a.equal(o.readyAt,null);
 D.finishOrder(s,o.id);a.equal(o.status,'ready');a.ok(o.units.every(u=>u.status==='ready'));
});

test('Bottles are confirmed manually instead of scanning a cup label',()=>{
 const s=D.initialState(),o=D.placeOrder(s,{store:'sh',channel:'mini',type:'takeaway',owner:'customer',lines:[{id:'bottle',qty:1,temp:'冰镇'}]});
 const unit=o.units[0];
 a.equal(unit.label,false);
 a.throws(()=>D.scanUnit(s,o.id,unit.id),/人工确认|无需逐杯/);
 D.confirmUnit(s,o.id,unit.id);
 a.equal(o.status,'ready');
});

test('Retail pickup codes are four digits, unique among awaiting orders and reject a wrong code',()=>{
 const s=D.initialState(),first=retail(s),second=retail(s);
 a.match(first.pickupCode,/^\d{4}$/);
 a.match(second.pickupCode,/^\d{4}$/);
 a.notEqual(first.pickupCode,second.pickupCode);
 const wrong=String((Number(first.pickupCode[0])+1)%10)+first.pickupCode.slice(1);
 a.throws(()=>D.deliverRetail(s,first.id,'sh',wrong),/提货码不正确/);
 a.equal(first.status,'awaiting');
 D.deliverRetail(s,first.id,'sh',first.pickupCode.slice(0,2)+' '+first.pickupCode.slice(2));
 a.equal(first.status,'delivered');
 a.equal(second.status,'awaiting');
});

test('Scanner resolves a cup label and updates that cup without another button',()=>{
 const s=D.initialState(),o=D.placeOrder(s,{store:'sh',channel:'mini',type:'takeaway',owner:'customer',lines:[{id:'song-0',qty:1,temp:'热'},{id:'qing-0',qty:1,temp:'冰',ice:'标准冰'}]});
 const hit=D.scanCupLabel(s,o.units[1].no.toLowerCase());
 a.equal(hit.order.id,o.id);a.equal(hit.unit.id,o.units[1].id);
 a.equal(o.units[1].status,'ready');a.equal(o.status,'pending');
 D.scanCupLabel(s,o.units[0].no);
 a.equal(o.status,'ready');a.ok(o.readyAt);
 a.throws(()=>D.scanCupLabel(s,'A999-9'),/没有找到/);
});

test('Store profit nets ingredient cost and approved loss but not pending loss',()=>{
 const s=D.initialState(),o=tea(s);
 let profit=D.storeProfit(s,{storeIds:['sh']});
 a.equal(profit.rows.length,1);
 a.equal(profit.rows[0].revenue,4000);
 a.equal(profit.rows[0].cogs,1200);
 a.equal(profit.rows[0].gross,2800);
 a.equal(profit.totalMargin,70);
 D.refund(s,o.id,0,1,'测试',false);
 profit=D.storeProfit(s,{storeIds:['sh']});
 a.equal(profit.rows[0].revenue,2000);
 a.equal(profit.rows[0].cogs,600);
 a.equal(profit.rows[0].gross,1400);
 D.remake(s,o.id,'测试补做');
 profit=D.storeProfit(s,{storeIds:['sh']});
 a.equal(profit.rows[0].remakeCost,600);
 a.equal(profit.rows[0].ingredientCost,1200);
 a.equal(profit.rows[0].gross,800);
 const loss=D.reportLoss(s,'u-su',{storeId:'sh',productId:'bottle',qty:1,reason:'破损 / 洒漏'});
 a.equal(loss.status,'pending');
 profit=D.storeProfit(s,{storeIds:['sh']});
 a.equal(profit.rows[0].loss,0);
 a.equal(profit.rows[0].pendingLoss,loss.amount);
 a.equal(profit.rows[0].gross,800);
 const ap=s.approvals.find(x=>x.id===loss.approvalId);
 D.decideApproval(s,'u-zhou',ap.id,'approve','核实');
 profit=D.storeProfit(s,{storeIds:['sh']});
 a.equal(profit.rows[0].loss,loss.amount);
 a.equal(profit.rows[0].pendingLoss,0);
 a.equal(profit.rows[0].gross,800-loss.amount);
 a.ok(profit.rows[0].margin<0);
});

test('Prepared refunds keep ingredient cost while returned retail reservations reverse it',()=>{
 const s=D.initialState(),o=tea(s);
 D.finishOrder(s,o.id);
 D.refund(s,o.id,0,1,'出品后退款',false);
 let row=D.storeProfit(s,{storeIds:['sh']}).rows[0];
 a.equal(row.revenue,2000);
 a.equal(row.cogs,1200);
 a.equal(row.gross,800);
 const r=retail(s,{lines:[{id:'retail-0',qty:2}]});
 D.deliverRetail(s,r.id,'sh',r.pickupCode);
 D.refund(s,r.id,0,1,'交付后退款',false);
 const deliveredRow=D.storeProfit(s,{storeIds:['brand']}).rows[0];
 a.equal(deliveredRow.revenue,1200);
 a.equal(deliveredRow.cogs,720);
 a.equal(deliveredRow.gross,480);
 const s2=D.initialState(),u=retail(s2,{lines:[{id:'retail-0',qty:2}]});
 D.refund(s2,u.id,0,1,'未领取退款',false);
 const uncollectedRow=D.storeProfit(s2,{storeIds:['brand']}).rows[0];
 a.equal(uncollectedRow.revenue,1200);
 a.equal(uncollectedRow.cogs,360);
 a.equal(uncollectedRow.gross,840);
});

test('Loss deducts stock on report; over-threshold entries wait for HQ and approval does not restore stock',()=>{
 const s=D.seed(D.initialState());
 const stock=s.stores.sh.stock['bottle'];
 const loss=D.reportLoss(s,'u-su',{storeId:'sh',productId:'bottle',qty:2,reason:'破损 / 洒漏'});
 a.equal(loss.status,'pending');a.ok(loss.approvalId);
 a.equal(s.stores.sh.stock['bottle'],stock-2);
 const ap=s.approvals.find(x=>x.id===loss.approvalId);
 a.equal(ap.bizType,'LOSS');
 a.ok(D.myApprovals(s,s.staff.find(u=>u.id==='u-zhou')).some(x=>x.id===ap.id));
 D.decideApproval(s,'u-zhou',ap.id,'approve','核实');
 a.equal(loss.status,'approved');
 a.equal(s.stores.sh.stock['bottle'],stock-2);
});

test('Rejected loss stays out of the monthly ratio and never restores stock',()=>{
 const s=D.seed(D.initialState());
 const stock=s.stores.sh.stock['bottle'];
 const loss=D.reportLoss(s,'u-su',{storeId:'sh',productId:'bottle',qty:1,reason:'盘点差异'});
 const ap=s.approvals.find(x=>x.id===loss.approvalId);
 D.decideApproval(s,'u-zhou',ap.id,'reject','数量待核');
 a.equal(loss.status,'rejected');
 a.equal(s.stores.sh.stock['bottle'],stock-1);
 const row=D.lossSummary(s,{storeIds:['sh']}).rows[0];
 a.equal(row.recent.some(x=>x.id===loss.id),false);
});

test('Monthly loss warning follows the policy ratio and loose first-month line can be adjusted',()=>{
 const s=D.seed(D.initialState());
 const row=D.lossSummary(s,{storeIds:['sh']}).rows[0];
 a.ok(row.ratio>0);a.equal(row.warning,row.ratio>s.lossPolicy.monthlyRatio);
 D.saveLossPolicy(s,'u-lin',{enabled:true,monthlyRatio:20,approvalThreshold:5000,approvers:['u-zhou']});
 a.equal(D.lossSummary(s,{storeIds:['sh']}).rows[0].warning,false);
 D.saveLossPolicy(s,'u-lin',{enabled:false,monthlyRatio:20,approvalThreshold:5000,approvers:['u-zhou']});
 a.equal(D.lossSummary(s,{storeIds:['sh']}).rows[0].warning,false);
 a.throws(()=>D.reportLoss(s,'u-su',{storeId:'sh',productId:'bottle',qty:1,reason:'盘点差异'}),/停用/);
});

test('Operating expenses are permission-gated and deduct net profit by date and store',()=>{
 const s=D.initialState(),o=tea(s),day=new Date();day.setHours(0,0,0,0);
 const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const today=iso(day),yesterday=iso(new Date(day.getTime()-864e5));
 a.throws(()=>D.addExpense(s,'u-su',{date:today,storeId:'sh',category:'labor',amount:'100'}),/权限/);
 a.throws(()=>D.addExpense(s,'u-su',{date:today,storeId:'brand',category:'hq',amount:'100'}),/全部门店|权限/);
 const labor=D.addExpense(s,'u-zhou',{date:today,storeId:'sh',category:'labor',amount:'100',memo:'兼职'});
 const old=D.addExpense(s,'u-zhou',{date:yesterday,storeId:'sh',category:'rent',amount:'50',memo:'昨日'});
 const other=D.addExpense(s,'u-zhou',{date:today,storeId:'bj',category:'utilities',amount:'30',memo:'北京'});
 a.equal(labor.amount,10000);a.equal(labor.source,'manual');a.equal(old.source,'manual');
 let profit=D.storeProfit(s,{from:day.getTime(),to:day.getTime()+864e5,storeIds:['sh']});
 a.equal(profit.rows[0].gross,2800);
 a.equal(profit.rows[0].opex,10000);
 a.equal(profit.rows[0].net,-7200);
 a.equal(profit.rows[0].opexByCategory.find(c=>c.id==='labor').amount,10000);
 a.equal(profit.rows[0].opexByCategory.find(c=>c.id==='rent').amount,0);
 a.equal(profit.totalOpex,10000);a.equal(profit.totalNet,-7200);
 const both=D.storeProfit(s,{from:day.getTime(),to:day.getTime()+864e5,storeIds:['sh','bj']});
 a.equal(both.totalOpex,13000);a.equal(both.totalNet,-10200);
 const summary=D.expenseSummary(s,{from:day.getTime(),to:day.getTime()+864e5,storeIds:['sh']});
 a.equal(summary.count,1);a.equal(summary.total,10000);a.equal(summary.byCategory.find(c=>c.id==='labor').amount,10000);
 D.voidExpense(s,'u-zhou',labor.id);
 profit=D.storeProfit(s,{from:day.getTime(),to:day.getTime()+864e5,storeIds:['sh']});
 a.equal(profit.rows[0].opex,0);a.equal(profit.rows[0].net,2800);
 a.equal(D.expenseSummary(s,{from:day.getTime(),to:day.getTime()+864e5,storeIds:['sh']}).total,0);
 a.throws(()=>D.voidExpense(s,'u-zhou',labor.id),/已作废/);
 a.throws(()=>D.voidExpense(s,'u-su',other.id),/权限/);
});

test('Multi-store CSV import matches names and categories, skips duplicates and preserves net profit',()=>{
 const s=D.initialState(),day=new Date();day.setHours(0,0,0,0);
 const iso=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
 const csv=`日期,门店,类别,金额,备注
${iso},上海·城市中心店,人力,"1,200",工资
${iso},sh-west,房租,3500.50,西岸租金
${iso},品牌零售,总部管理费,300,总部分摊
`;
 const preview=D.previewExpenses(s,'u-zhou',csv);
 a.equal(preview.errors.length,0);a.equal(preview.rows.length,3);a.equal(preview.total,120000+350050+30000);
 a.deepEqual(preview.rows.map(x=>x.storeId),['sh','sh-west','brand']);
 a.deepEqual(preview.rows.map(x=>x.category),['labor','rent','hq']);
 const result=D.importExpenses(s,'u-zhou',csv);
 a.equal(result.created.length,3);a.equal(s.expenses.length,3);
 a.equal(result.duplicates,0);
 const again=D.previewExpenses(s,'u-zhou',csv);
 a.equal(again.rows.length,0);a.equal(again.duplicates.length,3);
 a.throws(()=>D.importExpenses(s,'u-zhou',csv),/没有可新增/);
 const summary=D.expenseSummary(s,{from:day.getTime(),to:day.getTime()+864e5,storeIds:['sh','sh-west','brand']});
 a.equal(summary.total,120000+350050+30000);
 a.equal(summary.byCategory.find(c=>c.id==='rent').amount,350050);
});

test('Expense import is atomic: one bad row blocks every valid row and reports the source line',()=>{
 const s=D.initialState(),day=new Date();day.setHours(0,0,0,0);
 const iso=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
 const csv=`日期,门店,类别,金额,备注
${iso},上海·城市中心店,租金,100,有效
${iso},不存在的门店,租金,100,无效
`;
 const preview=D.previewExpenses(s,'u-zhou',csv);
 a.equal(preview.rows.length,1);a.equal(preview.errors.length,1);a.equal(preview.errors[0].line,3);
 a.throws(()=>D.importExpenses(s,'u-zhou',csv),/第 3 行/);
 a.equal(s.expenses.length,0);
 a.throws(()=>D.previewExpenses(s,'u-zhou','门店,类别,金额\n上海·城市中心店,租金,100'),/表头缺少.*日期/);
 const zero=D.previewExpenses(s,'u-zhou',`日期,门店,类别,金额\n${iso},上海·城市中心店,租金,0`);a.equal(zero.errors.length,1);a.equal(zero.errors[0].line,2);a.match(zero.errors[0].message,/金额/);
 a.throws(()=>D.addExpense(s,'u-zhou',{date:iso,storeId:'sh',category:'labor',amount:'-1'}),/金额/);
 a.equal(s.expenses.length,0);
});
