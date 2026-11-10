const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
let browser;
const base = process.env.DEMO_URL || 'http://127.0.0.1:8769/';
before(async () => { browser = await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true }); });
after(async () => { await browser?.close(); });
async function setup(t, viewport={width:1366,height:900}) {
  const context = await browser.newContext({viewport});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  t.after(async()=>{ await context.close(); assert.deepEqual(errors,[], 'No browser console/runtime errors'); });
  await page.goto(base); await page.waitForFunction(()=>!!window.DemoApp);
  return {page,context};
}
const click=(p,action,extra='')=>p.locator(`[data-action="${action}"]${extra}:visible`).first().click();
const state=p=>p.evaluate(()=>({s:U.S,ui:U.ui}));
async function add(p,id,{pos=false,temp,ice,qty=1}={}) {
  if(!pos) await click(p,'mini-nav','[data-screen="menu"]');
  await click(p,'product',`[data-id="${id}"]${pos?'[data-pos="true"]':''}`);
  if(temp) await click(p,'product-temp',`[data-temp="${temp}"]`);
  if(ice) await click(p,'product-ice',`[data-ice="${ice}"]`);
  for(let i=1;i<qty;i++) await click(p,'product-qty','[data-delta="1"]');
  await click(p,'add-product');
}
async function pay(p) { await click(p,'checkout'); await click(p,'pay-mini'); await click(p,'confirm-payment'); }
async function nav(p,page) { await click(p,'ops-nav',`[data-page="${page}"]`); }

test('Customer cold tea → failed payment → retry → one-click ready → receipt',async t=>{
 const {page:p}=await setup(t);
 await click(p,'series','[data-series="song"]');
 await click(p,'product','[data-id="song-0"]');
 await click(p,'product-temp','[data-temp="冰"]');
 await click(p,'product-ice','[data-ice="少冰"]');
 await click(p,'add-product');
 await click(p,'checkout');
 await click(p,'choose-seat'); await click(p,'seat-select','[data-seat="窗边02"]');
 await click(p,'pay-mini'); await click(p,'fail-payment');
 assert.equal((await state(p)).s.orders.length,7);
 assert.match(await p.locator('#payment-error').innerText(),/没有创建制作订单/);
 await click(p,'confirm-payment');
 let st=await state(p),o=st.s.orders[0];
 assert.equal(o.owner,'customer'); assert.equal(o.seat,'窗边02');
 assert.equal(o.items[0].temp,'冰'); assert.equal(o.items[0].ice,'少冰');
 assert.equal(st.ui.cart.length,0); assert.equal(o.status,'pending');
 await click(p,'go-workbench');
 await click(p,'finish',`[data-id="${o.id}"]`);
 assert.equal((await state(p)).s.orders.find(x=>x.id===o.id).status,'ready');
 await click(p,'surface','[data-surface="mini"]');
 assert.match(await p.locator('.receipt').innerText(),/你的茶，准备好了/);
});

test('Membership keeps bag; bottle398 and retail do not receive cup discount',async t=>{
 const {page:p}=await setup(t);
 await add(p,'song-0',{qty:2}); await add(p,'bottle');
 await click(p,'mini-nav','[data-screen="retail"]');
 await click(p,'product','[data-id="retail-0"]'); await click(p,'add-product');
 await click(p,'checkout'); await click(p,'join'); await click(p,'activate-member');
 let st=await state(p); assert.equal(st.ui.cart.length,3); assert.equal(st.s.member.vip,true);
 assert.equal(await p.evaluate(()=>Customer.cartQuote().total),44600);
 await p.locator('[data-change="coupon"]').check();
 assert.equal(await p.evaluate(()=>Customer.cartQuote().total),44100);
 await click(p,'pay-mini'); await click(p,'confirm-payment');
 st=await state(p); const o=st.s.orders[0];
 assert.equal(o.memberDiscount,400); assert.equal(o.couponDiscount,500); assert.equal(o.total,44100);
 assert.equal(o.items.find(l=>l.id==='bottle').price,39800);
 assert.equal(await p.evaluate(id=>TeaDemo.cupCount(U.S.orders.find(x=>x.id===id)),o.id),2);
});

test('Assisted draft survives navigation; cash guest validates short payment; QR associates customer',async t=>{
 const {page:p}=await setup(t);
 await click(p,'surface','[data-surface="workbench"]'); await nav(p,'pos');
 await add(p,'xing-0',{pos:true});
 await nav(p,'workbench'); await nav(p,'pos');
 assert.equal((await state(p)).ui.posCart.length,1);
 await click(p,'pos-type','[data-type="takeaway"]');
 await click(p,'pos-cash'); await p.locator('#cash-received').fill('10'); await click(p,'confirm-payment');
 assert.match(await p.locator('#payment-error').innerText(),/实收金额不能少于/);
 assert.equal((await state(p)).s.orders.length,7);
 await p.locator('#cash-received').fill('50'); await click(p,'confirm-payment');
 let st=await state(p),cash=st.s.orders[0];
 assert.equal(cash.owner,'guest'); assert.equal(cash.type,'takeaway'); assert.equal(cash.points,0);
 assert.match(await p.locator('#toast').innerText(),/找零¥30/);
 await nav(p,'pos'); await add(p,'song-1',{pos:true}); await click(p,'pos-qr');
 assert.match(await p.locator('.qr-demo').innerText(),/不可扫描/);
 await click(p,'confirm-payment');
 assert.equal((await state(p)).s.orders[0].owner,'customer');
});

test('Printer queues new cups, recovers with explicit reprint, no extra stock or order',async t=>{
 const {page:p}=await setup(t);
 await click(p,'surface','[data-surface="workbench"]'); await click(p,'scenarios');
 await click(p,'scene-printer','[data-status="paper"]'); await click(p,'scenarios');
 await click(p,'simulate-order','[data-channel="meituan"]');
 let st=await state(p),o=st.s.orders[0],stock=st.s.stores.sh.stock;
 assert.equal(o.printStatus,'queued'); assert.equal(o.status,'pending'); assert.equal(o.memberDiscount,0);
 await click(p,'printer'); await click(p,'printer-state','[data-status="online"]');
 assert.equal((await state(p)).s.orders[0].printStatus,'queued');
 await click(p,'reprint-confirm',`[data-id="${o.id}"]`); await click(p,'confirm-reprint');
 st=await state(p); assert.equal(st.s.orders.length,8); assert.equal(st.s.orders[0].printStatus,'printed');
 assert.deepEqual(st.s.stores.sh.stock,stock);
});

test('Sold-out after adding blocks payment; store switch cancel/confirm; filters, edit validation',async t=>{
 const {page:p}=await setup(t);
 await add(p,'song-0');
 await click(p,'surface','[data-surface="manage"]'); await nav(p,'products');
 await click(p,'sold-toggle','[data-id="song-0"]');
 await click(p,'surface','[data-surface="mini"]'); await click(p,'checkout'); await click(p,'pay-mini');
 await click(p,'confirm-payment'); assert.match(await p.locator('#payment-error').innerText(),/售罄/);
 assert.equal((await state(p)).s.orders.length,7);
 await click(p,'close'); await click(p,'back-menu'); await click(p,'choose-store');
 await click(p,'store-select','[data-store="bj"]'); await click(p,'close');
 assert.equal((await state(p)).ui.cart.length,1); assert.equal((await state(p)).ui.store,'sh');
 await click(p,'choose-store'); await click(p,'store-select','[data-store="bj"]'); await click(p,'confirm-store');
 assert.equal((await state(p)).ui.cart.length,0); assert.equal((await state(p)).ui.store,'bj');
 await click(p,'mini-nav','[data-screen="menu"]'); await p.locator('#tea-search').fill('不存在的香气');
 assert.match(await p.locator('.empty').innerText(),/换一种选择/); await click(p,'clear-filters');
 await click(p,'surface','[data-surface="manage"]'); await nav(p,'products');
 await click(p,'edit-product','[data-id="song-0"]');
 await p.locator('#edit-price').fill('0'); await click(p,'save-product');
 assert.equal(await p.locator('#sheet').getAttribute('open'),'');
 await p.locator('#edit-price').fill('22'); await p.locator('#edit-stock').fill('120');
 await p.locator('#edit-cold').uncheck(); await click(p,'save-product');
 const st=await state(p),prod=st.s.products.find(x=>x.id==='song-0');
 assert.equal(prod.price,2200); assert.deepEqual(prod.temps,['热']);
 assert.equal(st.s.stores.sh.stock['song-0'],120); assert.equal(st.s.stores.bj.stock['song-0'],480);
});

test('Partial then full refund, position correction, remake and ready undo preserve totals',async t=>{
 const {page:p}=await setup(t);
 await add(p,'song-0',{qty:2}); await pay(p);
 let st=await state(p),o=st.s.orders[0];
 await click(p,'go-workbench'); await click(p,'order-detail',`[data-id="${o.id}"]`);
 await click(p,'move-order'); await click(p,'save-order-seat','[data-seat="吧台01"]');
 assert.equal((await state(p)).s.orders[0].seat,'吧台01');
 await click(p,'order-detail',`[data-id="${o.id}"]`); await click(p,'refund-form');
 await p.locator('#refund-line').selectOption('0'); await p.locator('#refund-prepared').uncheck();
 await click(p,'confirm-refund'); st=await state(p); assert.equal(st.s.orders[0].refunded,2000);
 assert.equal(st.s.orders[0].status,'pending');
 await click(p,'remake-confirm'); await click(p,'confirm-remake');
 st=await state(p); const remake=st.s.orders[0]; assert.equal(remake.parent,o.id); assert.equal(remake.total,0);
 assert.equal(remake.items[0].qty,1);
 await click(p,'finish',`[data-id="${remake.id}"]`); await click(p,'undo-ready',`[data-id="${remake.id}"]`);
 assert.equal((await state(p)).s.orders[0].status,'pending');
 await click(p,'order-detail',`[data-id="${o.id}"]`); await click(p,'refund-form'); await click(p,'confirm-refund');
 const original=(await state(p)).s.orders.find(x=>x.id===o.id);
 assert.equal(original.status,'refunded'); assert.equal(original.refunded,4000);
 await click(p,'close'); await nav(p,'dashboard');
 const values=await p.locator('.stat .value').allTextContents();
 st=await state(p); const orders=st.s.orders.filter(x=>x.store==='sh'&&!x.parent);
 assert.equal(values[0],'¥'+await p.evaluate(n=>U.money(n),orders.reduce((n,x)=>n+x.total,0)));
 assert.match(values[2],/40/);
});

test('Two browser tabs sync new orders and completion while preserving assisted draft',async t=>{
 const {page:p,context}=await setup(t);
 const w=await context.newPage(); await w.goto(base+'#workbench'); await nav(w,'pos');
 await add(w,'song-1',{pos:true});
 await add(p,'xing-2'); await pay(p); const id=(await state(p)).s.orders[0].id;
 await w.waitForFunction(id=>U.S.orders.some(x=>x.id===id),id);
 assert.equal((await state(w)).ui.posCart.length,1);
 assert.match(await w.locator('#toast').innerText(),/新订单已到达/);
 await nav(w,'workbench'); await click(w,'finish',`[data-id="${id}"]`);
 await p.waitForFunction(id=>U.S.orders.find(x=>x.id===id).status==='ready',id);
 assert.match(await p.locator('.receipt').innerText(),/准备好了/);
});

test('Pause blocks new orders but not ready actions; reset and keyboard dismissal',async t=>{
 const {page:p}=await setup(t);
 await click(p,'surface','[data-surface="manage"]'); await nav(p,'stores');
 await click(p,'store-toggle'); await nav(p,'workbench');
 const id=(await state(p)).s.orders.find(o=>o.store==='sh'&&o.status==='pending').id;
 await click(p,'finish',`[data-id="${id}"]`);
 assert.equal((await state(p)).s.orders.find(o=>o.id===id).status,'ready');
 await click(p,'surface','[data-surface="mini"]'); await add(p,'song-0'); await click(p,'checkout');
 await click(p,'pay-mini'); await click(p,'confirm-payment');
 assert.match(await p.locator('#payment-error').innerText(),/暂停/);
 await p.keyboard.press('Escape'); assert.equal(await p.locator('dialog[open]').count(),0);
 await click(p,'about'); await click(p,'reset-confirm'); await click(p,'confirm-reset');
 const st=await state(p); assert.equal(st.s.orders.length,7); assert.equal(st.s.stores.sh.open,true); assert.equal(st.ui.cart.length,0);
});

test('Workbench queue title stays above the board, leaving usable tablet order cards',async t=>{
 const {page:p}=await setup(t,{width:1024,height:768});
 await click(p,'surface','[data-surface="workbench"]');
 const title=await p.locator('.queue-heading').boundingBox(),board=await p.locator('.board').boundingBox();
 assert.ok(title.y+title.height<=board.y, 'Queue heading must end above the board rather than wrapping it');
 const card=await p.locator('.order-card').first().boundingBox();
 assert.ok(card.width>=220,`Tablet order card width ${card.width} must fit the completion action`);
});

test('Responsive layouts, screen navigation, images and dialogs fit all target sizes',async t=>{
 const {page:p}=await setup(t);
 for(const [name,width,height] of [['desktop',1366,900],['tablet',1024,768],['phone',390,844],['small-phone',360,780]]) {
   await p.setViewportSize({width,height});
   for(const surface of ['mini','workbench','manage']) {
     await click(p,'surface',`[data-surface="${surface}"]`);
     if(surface==='mini') await click(p,'mini-nav','[data-screen="home"]');
     const size=await p.evaluate(()=>({w:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth}));
     assert.ok(size.sw<=size.w+1,`${name} ${surface}: page overflow ${JSON.stringify(size)}`);
     assert.deepEqual(await p.locator('img').evaluateAll(imgs=>imgs.filter(x=>!x.complete||!x.naturalWidth).map(x=>x.src)),[]);
     await p.screenshot({path:path.join(__dirname,'..',`preview-${name}-${surface}.png`),fullPage:true});
   }
   for(const section of ['pos','orders','products','stores','logs']) {
     await nav(p,section);
     const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
     assert.equal(overflow,false,`${name} ${section} overflow`);
   }
   await click(p,'surface','[data-surface="mini"]');
   await click(p,'mini-nav','[data-screen="home"]');
   await click(p,'product','[data-id="bottle"]');
   const rect=await p.locator('#sheet').boundingBox();
   assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1&&rect.y>=-1&&rect.y+rect.height<=height+1,`${name} dialog overflow`);
   await p.keyboard.press('Escape');
 }
});
