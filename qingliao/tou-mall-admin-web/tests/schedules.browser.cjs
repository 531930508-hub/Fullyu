const fs=require('node:fs'),{chromium}=require('/tmp/fy-int/node_modules/playwright-core');
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const checks=[];let completed=false;
try{for(const width of [1280,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:19393/')?route.continue():route.abort());
 const check=(name,pass)=>{checks.push({width,name,pass});if(!pass)throw new Error(name);};
 const ready=()=>page.waitForFunction(()=>window.fixture&&fixture.page()&&!fixture.page().listLoading);
 await page.goto('http://127.0.0.1:19393/schedules');await ready();await page.waitForFunction(()=>fixture.page().dataList.length===10);
 check('default request is first small page of cooperating therapists',await page.evaluate(()=>fixture.calls[0].page===1&&fixture.calls[0].size===10&&fixture.calls[0].status===1&&fixture.calls[0].shopId===1));
 check('toolbar controls stay inside viewport',await page.locator('.operate-container').evaluate(node=>[...node.querySelectorAll('input,button')].every(el=>{const r=el.getBoundingClientRect();return r.right<=innerWidth+1&&r.left>=0;})));
 check('no page-level horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('all five action buttons visible',await page.evaluate(()=>['添加','调店','排班顺序','清除未来排班','操作记录'].every(t=>[...document.querySelectorAll('.operate-container button')].some(b=>b.innerText.includes(t)&&b.offsetParent))));
 check('rendered copy uses cooperation wording',!/(在职|离职|请假|薪资)/.test(await page.locator('.index').innerText()));
 await page.screenshot({path:'/tmp/fullyu-schedules-default-'+width+'.png',fullPage:true});
 await page.evaluate(()=>{fixture.hold=true;const p=fixture.page();p.searchForm.shopId=1;p.fetchData();p.searchForm.shopId=2;p.fetchData();});
 await page.waitForFunction(()=>fixture.pending.length===2);await page.evaluate(()=>fixture.pending[1]());await page.waitForFunction(()=>fixture.page().dataList[0]&&fixture.page().dataList[0].shopId===2);
 await page.evaluate(()=>{fixture.pending[0]();fixture.pending=[];fixture.hold=false;});await page.waitForTimeout(0);await ready();
 check('late old-shop response cannot overwrite current shop rows',await page.evaluate(()=>fixture.page().dataList.every(r=>r.shopId===2)));
 await page.evaluate(()=>{fixture.fail=true;fixture.page().fetchData();});await ready();await page.locator('.list-error').waitFor();
 check('failed load shows retry and no stale rows',await page.evaluate(()=>fixture.page().dataList.length===0)&&await page.getByRole('button',{name:'重新加载'}).isVisible());
 await page.screenshot({path:'/tmp/fullyu-schedules-error-'+width+'.png',fullPage:true});
 await page.evaluate(()=>fixture.fail=false);await page.getByRole('button',{name:'重新加载'}).click();await ready();await page.locator('.list-error').waitFor({state:'detached'});
 check('retry recovers rows and clears error',await page.evaluate(()=>fixture.page().dataList.length===10&&!fixture.page().listError));
 check('no runtime errors',errors.length===0&&(await page.evaluate(()=>fixture.errors.length))===0);await page.close();
}completed=true;}finally{await browser.close();fs.writeFileSync('/tmp/fullyu-schedules-browser-results.json',JSON.stringify({completed,realAPI:false,checks,failed:checks.filter(c=>!c.pass)},null,2));}
console.log(JSON.stringify({completed,checks:checks.length,failed:checks.filter(c=>!c.pass)}));})().catch(error=>{console.error(error);process.exitCode=1;});
