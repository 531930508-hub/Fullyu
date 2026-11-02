const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.DEMO_URL||'http://127.0.0.1:8769/';
test('WCAG automated checks on customer, tablet, admin and key dialogs',async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce'});
 const p=await context.newPage(),report=[];
 const click=(action,extra='')=>p.locator(`[data-action="${action}"]${extra}:visible`).first().click();
 async function scan(name){const r=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();report.push({name,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(x=>x.id)});}
 try{
  await p.goto(base);await scan('customer-home');
  await click('mini-nav','[data-screen="menu"]');await scan('customer-menu');
  await click('product','[data-id="song-0"]');await scan('product-dialog');
  for(let k=0;k<12;k++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.closest('dialog')?.id),'sheet','Modal traps keyboard focus');}
  await click('add-product');await click('checkout');await scan('checkout');
  await click('pay-mini');await click('fail-payment');await scan('payment-error');await click('close');
  await click('surface','[data-surface="workbench"]');await scan('workbench');
  await click('ops-nav','[data-page="pos"]');await scan('assisted-order');
  for(const [section,name]of [['products','products'],['dashboard','dashboard'],['stores','stores'],['orders','orders']]){await click('ops-nav',`[data-page="${section}"]`);await scan(name);}
  await click('order-detail');await click('refund-form');await scan('refund-dialog');
 }finally{await fs.writeFile(path.join(__dirname,'a11y-report.json'),JSON.stringify(report,null,2));await browser.close();}
 const violations=report.flatMap(r=>r.violations.map(v=>({screen:r.name,...v})));
 assert.deepEqual(violations,[]);
});
