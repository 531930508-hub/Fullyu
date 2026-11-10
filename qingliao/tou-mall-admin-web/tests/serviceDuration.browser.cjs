const fs=require('node:fs');const {chromium}=require('/tmp/fy-int/node_modules/playwright-core');
(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const results=[];
  try{for(const width of [1280,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:19390/')?route.continue():route.abort());
    const check=(name,pass)=>{results.push({width,name,pass});if(!pass)throw new Error(name);};
    await page.goto('http://127.0.0.1:19390/');await page.waitForFunction(()=>window.fixture&&!fixture.page().listLoading&&fixture.page().total===23);
    check('defaults to ten rows and cooperating therapists',await page.evaluate(()=>fixture.calls[0].status===1&&fixture.page().dataList.length===10));
    check('server total feeds pagination',await page.locator('.el-pagination__total').innerText()==='共 23 条');
    const fits=await page.locator('.operate-container').evaluate(node=>{const frame=node.getBoundingClientRect();return [...node.querySelectorAll('input,button')].every(item=>{const r=item.getBoundingClientRect();return r.left>=frame.left-1&&r.right<=innerWidth;});});check('filters and export stay within viewport',fits);
    await page.locator('.el-pagination .btn-next').click();await page.waitForFunction(()=>!fixture.page().listLoading&&fixture.page().searchForm.page===2);
    check('next page requests page two',await page.evaluate(()=>fixture.calls.at(-1).page===2&&fixture.page().dataList[0].massagistId===11));
    const status=page.locator('.duration-filters .el-select').nth(2);await status.click();await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({hasText:'已结束合作'}).click();
    await page.waitForFunction(()=>!fixture.page().listLoading&&fixture.page().total===6);
    check('status change resets page and filters ended cooperation',await page.evaluate(()=>fixture.calls.at(-1).page===1&&fixture.calls.at(-1).status===0&&fixture.page().dataList.every(row=>row.massagistId>=24&&row.massagistId<=29)));
    await page.locator('.duration-filters .el-select').nth(1).click();const therapistMenu=page.locator('.el-select-dropdown').filter({hasText:'合成疗愈师24'});await therapistMenu.waitFor({state:'visible'});const options=await therapistMenu.locator('.el-select-dropdown__item').allTextContents();check('therapist dropdown uses same cooperation filter',options.length===6&&options.every(t=>t.includes('已结束合作')));await page.keyboard.press('Escape');await therapistMenu.waitFor({state:'hidden'});
    await page.screenshot({path:'/tmp/fullyu-duration-'+width+'.png',fullPage:true});
    await page.evaluate(()=>{fixture.fail=true;});
    await status.click();await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({hasText:'暂停合作'}).click();await page.waitForFunction(()=>fixture.errors.includes('合成查询失败')&&!fixture.page().listLoading);
    check('failed query keeps last result and releases spinner',await page.evaluate(()=>fixture.page().dataList.length===6));
    await page.evaluate(()=>{fixture.fail=false;fixture.hold=true;fixture.page().searchForm.status=1;fixture.page().fetchData();fixture.page().searchForm.status=0;fixture.page().fetchData();});
    await page.waitForFunction(()=>fixture.pending.length===2);await page.evaluate(()=>fixture.pending[1].settle());await page.waitForFunction(()=>!fixture.page().listLoading&&fixture.page().total===6);await page.evaluate(()=>{fixture.pending[0].settle();fixture.pending=[];fixture.hold=false;});await page.waitForFunction(()=>fixture.page().total===6);
    check('old response cannot overwrite a newer filter',await page.evaluate(()=>fixture.page().dataList[0].massagistId===24));
    await page.evaluate(()=>{fixture.exportFail=true;});await page.getByRole('button',{name:'导出全部结果'}).click();await page.getByRole('button',{name:'确定',exact:true}).click();await page.waitForFunction(()=>fixture.errors.includes('合成导出失败')&&!fixture.page().exporting);
    check('failed export releases global and button loading',await page.evaluate(()=>fixture.loading===0));
    check('export carries cooperation filter but no pagination',await page.evaluate(()=>fixture.exports.length===1&&fixture.exports[0].status===0&&!('page' in fixture.exports[0])&&!('size' in fixture.exports[0])));
    const before=await page.evaluate(()=>fixture.exports.length);await page.getByRole('button',{name:'导出全部结果'}).click();await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>!fixture.page().exporting);check('cancel does not invoke export',await page.evaluate(()=>fixture.exports.length)===before);
    check('no browser runtime errors',errors.length===0);
    await page.close();
  }}finally{await browser.close();fs.writeFileSync('/tmp/fullyu-duration-browser-results.json',JSON.stringify({realAPI:false,realPayments:0,realMessages:0,checks:results,failed:results.filter(r=>!r.pass)},null,2));}
  console.log(JSON.stringify({checks:results.length,failed:results.filter(r=>!r.pass)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
