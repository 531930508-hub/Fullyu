const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const file=path.resolve(__dirname,'../../Full愈时叙-双端交互Demo-V1.html');
test('Single HTML opens offline and completes a customer order with no external requests',async()=>{
 const html=await fs.readFile(file,'utf8');
 assert.ok(!html.includes('src="assets/'),'Images are embedded');
 assert.ok(!/<script src=/.test(html),'Scripts are embedded');
 assert.ok(!/<link rel="stylesheet"/.test(html),'Styles are embedded');
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const c=await browser.newContext({offline:true,viewport:{width:390,height:844}}),p=await c.newPage(),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const click=(a,extra='')=>p.locator(`[data-action="${a}"]${extra}:visible`).first().click();
 try{
  await p.goto(pathToFileURL(file).href);await p.waitForFunction(()=>window.DemoApp);
  assert.deepEqual(await p.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src.slice(0,60))),[]);
  await click('series','[data-series="song"]');await click('product','[data-id="song-0"]');await click('add-product');
  await click('checkout');await click('pay-mini');await click('confirm-payment');
  const id=await p.evaluate(()=>U.ui.currentOrder);
  await click('go-workbench');await click('finish',`[data-id="${id}"]`);
  await click('surface','[data-surface="mini"]');
  assert.match(await p.locator('.receipt').innerText(),/准备好了/);
  await p.reload();assert.equal(await p.evaluate(id=>U.S.orders.find(o=>o.id===id)?.status,id),'ready');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 }finally{await browser.close();}
});
