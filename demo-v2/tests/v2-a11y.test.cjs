const {test}=require('node:test');
const a=require('node:assert/strict');
const {chromium}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const fs=require('node:fs/promises'),path=require('node:path');
const base=process.env.DEMO_URL||'file://'+path.resolve(__dirname,'../index.html');
test('WCAG automated evidence for both languages, operations and key dialogs; keyboard focus',async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const c=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce'}),p=await c.newPage(),report=[];
 p.setDefaultTimeout(5000);
 await p.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,bad){bad({code:1});}}}));
 const click=(action,extra='')=>p.locator(`[data-action="${action}"]${extra}:visible`).first().click();
 async function scan(name){const r=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();report.push({name,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>v.id)});}
 try{
  await p.goto(base);await p.waitForFunction(()=>window.DemoV2);
  for(const lang of ['zh','en']){
   await p.evaluate(lang=>{U.ui.surface='mini';U.ui.locale=lang;U.ui.screen='home';DemoApp.render();},lang);
   for(const screen of ['home','menu','retail','profile','orders']){await click('mini-nav',`[data-screen="${screen}"]`);await scan(`${lang}-${screen}`);}
   await click('mini-nav','[data-screen="home"]');await click('choose-store');await scan(`${lang}-stores`);await click('store-select','[data-store="sh"]');
   await click('scan-table');await scan(`${lang}-table-qr`);await click('close');
   await click('mini-nav','[data-screen="profile"]');await click('member-code');await scan(`${lang}-member-code`);await click('close');
   await click('mini-nav','[data-screen="menu"]');await click('product','[data-id="song-0"]');await scan(`${lang}-product`);
   for(let n=0;n<15;n++){await p.keyboard.press('Tab');a.equal(await p.evaluate(()=>document.activeElement.closest('dialog')?.id),'sheet');}
   await p.keyboard.press('Shift+Tab');a.equal(await p.evaluate(()=>document.activeElement.closest('dialog')?.id),'sheet');
   await click('add-product');await click('checkout');await scan(`${lang}-checkout`);await click('pay-mini');await scan(`${lang}-pay-store`);await click('confirm-pay-store');await click('fail-payment');await scan(`${lang}-payment-error`);await click('confirm-payment');await p.locator('#sheet').waitFor({state:'hidden'});await scan(`${lang}-receipt`);
   await click('customer-timeline');await scan(`${lang}-timeline`);await p.keyboard.press('Escape');a.equal(await p.locator('#sheet').isVisible(),false);a.equal(await p.evaluate(()=>document.activeElement.dataset.action),'customer-timeline');
  }
  await click('surface','[data-surface="manage"]');
  for(const page of ['hq-overview','finance','products','categories','mappings','hq-stores','approvals','rbac','hq-logs','hq-loss']){await click('ops-nav',`[data-page="${page}"]`);await scan(page);}
  await click('ops-nav','[data-page="approvals"]');await click('approval-open');await scan('approval-detail');await click('close');
  await click('approval-tab','[data-tab="records"]');await scan('approval-records');
  await click('approval-tab','[data-tab="flow"]');await scan('approval-flow');
  await click('ops-nav','[data-page="rbac"]');await click('staff-new');await scan('staff-new');await click('close');
  await click('rbac-tab','[data-tab="roles"]');await scan('rbac-roles');await click('role-view');await scan('role-view');await click('close');
  await click('role-new');await scan('role-new');await click('close');
  await click('ops-nav','[data-page="hq-overview"]');
  await click('series-detail','[data-series="song"]');await scan('series-detail');await click('close');
  await click('ops-nav','[data-page="products"]');
  await p.locator('[data-change="product-select"]').first().check();
  await click('bulk-dose');await scan('bulk-dose');await click('close');
  await click('new-product');await scan('product-editor');await click('close');
  await click('ops-nav','[data-page="categories"]');
  await click('new-category');await scan('category-editor');await click('close');
  await click('surface','[data-surface="workbench"]');
  for(const page of ['workbench','pos','retail','orders','availability','inventory','dashboard','stores','logs','loss']){await click('ops-nav',`[data-page="${page}"]`);await scan(page);}
  await click('ops-nav','[data-page="workbench"]');await click('order-process');await scan('order-process');await click('close');
  await click('ops-nav','[data-page="pos"]');await click('pos-member-scan');await scan('pos-member-scan');await click('pos-member-use');await click('product','[data-id="song-0"]');await click('add-product');await click('pos-qr');await scan('pos-payment-qr');await click('pay-mode','[data-mode="scan"]');await scan('pos-payment-scan');await click('close');
  for(const [page,action,name]of [['inventory','new-receipt','receipt-import'],['orders','order-detail','order-detail'],['retail','deliver-retail','handover']]){await click('ops-nav',`[data-page="${page}"]`);await click(action);await scan(name);await click('close');}
  await click('ops-nav','[data-page="orders"]');await click('order-process');await click('refund-form');await scan('refund');await p.locator('#sheet [data-action="close"]').click();
  await p.setViewportSize({width:360,height:780});await click('surface','[data-surface="mini"]');await p.evaluate(()=>{U.ui.locale='en';U.ui.screen='home';DemoApp.render();});await scan('small-phone-en-home');
 }finally{await fs.writeFile(path.join(__dirname,'v2-a11y-report.json'),JSON.stringify(report,null,2));await browser.close();}
 a.deepEqual(report.flatMap(r=>r.violations.map(v=>({screen:r.name,...v}))),[]);
});
