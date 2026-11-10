// Transactional component acceptance: synthetic APIs only, never a production endpoint.
const {chromium} = require('/tmp/fy-int/node_modules/playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const results = [];const check=(name,pass,observed)=>{results.push({name,pass:!!pass,observed});assert.ok(pass,name);};
  try {
    for (const width of [1280,1440]) {
      const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,acceptDownloads:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:19389/')?route.continue():route.abort());
      await page.goto('http://127.0.0.1:19389/');await page.locator('#open-gift').click();
      const dialog=page.locator('.el-dialog:visible');await dialog.waitFor();
      const field=label=>dialog.locator('.el-form-item').filter({has:page.locator('.el-form-item__label').filter({hasText:label})}).locator('input').first();
      await field('客户手机号').fill('13800000001');await field('赠送数量').fill('3');await field('赠送数量').blur();
      await field('单券价值').fill('97.50');await field('单券价值').blur();
      await page.evaluate(()=>{const form=app.$refs.form;form.dateTime=['2026-11-08','2026-12-08'];form.changeDate(form.dateTime);});
      await page.waitForFunction(()=>app.$refs.form.totalGiftAmount==='292.50'&&!document.querySelector('.dialog-fade-enter-active'));
      const submit=()=>dialog.getByRole('button',{name:'提 交'}).click();
      const measure=await dialog.evaluate(d=>{const b=d.getBoundingClientRect();return {left:b.left,right:b.right,scroll:d.scrollWidth,width:d.clientWidth,fields:[...d.querySelectorAll('.el-input-number,.el-date-editor')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))};});
      check(`single layout fits ${width}`,measure.left>=0&&measure.right<=width&&measure.scroll<=measure.width+1&&measure.fields.every(r=>r.left>=measure.left&&r.right<=measure.right),measure);
      check(`unit and total explanation ${width}`,await dialog.textContent().then(s=>s.includes('292.50')&&s.includes('不代表新增现金收款')));
      await page.screenshot({path:`/tmp/fullyu-gift-form-${width}.png`});
      await page.evaluate(()=>fixture.failSingle=true);await submit();
      await page.locator('.el-message').filter({hasText:'合成保存失败'}).waitFor();
      await page.waitForFunction(()=>!app.$refs.form.submitting&&fixture.fullLoading===0);
      let state=await page.evaluate(()=>({visible:app.$refs.form.dialogVisible,value:app.$refs.form.form.couponAmount,phone:app.$refs.form.form.phone,saved:fixture.saved.length,calls:fixture.calls.filter(c=>c.action==='single').length}));
      check(`failed save preserves editable draft ${width}`,state.visible&&state.value===97.5&&state.phone==='13800000001'&&state.saved===0&&state.calls===1,state);
      await page.evaluate(()=>{fixture.failSingle=false;fixture.hold=true;});await submit();
      await page.waitForFunction(()=>fixture.pending.length===1&&app.$refs.form.submitting);
      await page.evaluate(()=>{app.$refs.form.onSubmit();app.$refs.form.handleClose();});
      state=await page.evaluate(()=>({visible:app.$refs.form.dialogVisible,calls:fixture.calls.filter(c=>c.action==='single').length,saved:fixture.saved.length}));
      check(`pending duplicate and close rejected ${width}`,state.visible&&state.calls===2&&state.saved===0,state);
      await page.evaluate(()=>{fixture.hold=false;fixture.release();});await dialog.waitFor({state:'hidden'});
      state=await page.evaluate(()=>({saved:fixture.saved.filter(c=>c.action==='single'),loading:fixture.fullLoading}));
      check(`single success settled exactly once ${width}`,state.saved.length===1&&state.saved[0].data.couponAmount==='97.50'&&state.saved[0].data.couponNumber===3&&!('createUser' in state.saved[0].data)&&state.loading===0,state);
      await page.locator('#open-gift').click();await dialog.waitFor();
      check(`new form has no previous recipient ${width}`,await page.evaluate(()=>app.$refs.form.form.phone===''&&app.$refs.form.form.couponAmount===0));
      await dialog.getByRole('tab',{name:'批量审批'}).click();await submit();
      await page.locator('.el-message').filter({hasText:'请先选择赠券Excel文件'}).waitFor();
      check(`missing file never submits ${width}`,await page.evaluate(()=>fixture.calls.filter(c=>c.action==='batch').length===0&&!app.$refs.form.submitting));
      const downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'批量审批模板下载'}).click();const download=await downloadEvent;
      const stream=await download.createReadStream();const chunks=[];for await (const chunk of stream)chunks.push(chunk);
      const bytes=Buffer.concat(chunks);check(`real generated xlsx template downloaded ${width}`,download.suggestedFilename()==='批量送券申请.xlsx'&&bytes.equals(fs.readFileSync('/tmp/fullyu-gift-coupon-template.xlsx')),{size:bytes.length,name:download.suggestedFilename()});
      await dialog.locator('input[type=file]').setInputFiles({name:'synthetic-gift.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
      await page.evaluate(()=>fixture.failBatch=true);await submit();
      const confirm=page.locator('.el-message-box:visible');await confirm.waitFor();await confirm.getByRole('button',{name:'确定',exact:true}).click();
      await page.locator('.el-message').filter({hasText:'合成导入失败'}).waitFor();await page.waitForFunction(()=>!app.$refs.form.submitting&&fixture.fullLoading===0);
      check(`batch failure retains file and no saved batch ${width}`,await page.evaluate(()=>app.$refs.form.dialogVisible&&app.$refs.form.excelFile.raw.name==='synthetic-gift.xlsx'&&!fixture.saved.some(c=>c.action==='batch')));
      await submit();await confirm.waitFor();await confirm.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>!app.$refs.form.submitting);
      check(`confirmation cancel causes no second write ${width}`,await page.evaluate(()=>fixture.calls.filter(c=>c.action==='batch').length===1));
      await page.evaluate(()=>{fixture.failBatch=false;fixture.hold=true;});await submit();await confirm.waitFor();await confirm.getByRole('button',{name:'确定',exact:true}).click();
      await page.waitForFunction(()=>fixture.pending.length===1);await page.evaluate(()=>{app.$refs.form.onSubmit();app.$refs.form.handleClose();});
      check(`batch pending is locked ${width}`,await page.evaluate(()=>app.$refs.form.dialogVisible&&fixture.calls.filter(c=>c.action==='batch').length===2));
      await page.evaluate(()=>{fixture.hold=false;fixture.release();});await dialog.waitFor({state:'hidden'});
      check(`batch retry saves exactly once ${width}`,await page.evaluate(()=>fixture.saved.filter(c=>c.action==='batch').length===1&&fixture.fullLoading===0));
      await page.locator('#open-detail').click();await page.waitForFunction(()=>!app.$refs.progress.loading&&app.$refs.progress.detailData.couponNumber===3);
      const drawer=page.locator('.el-drawer:visible');await drawer.waitFor();
      await page.waitForFunction(()=>!document.querySelector('.el-drawer-fade-enter-active'));
      const text=await drawer.textContent();check(`approval shows unit and total ${width}`,text.includes('97.50元')&&text.includes('292.50元'),text);
      const drawerSize=await drawer.evaluate(d=>({scroll:d.querySelector('.el-drawer__body').scrollWidth,width:d.querySelector('.el-drawer__body').clientWidth}));
      check(`approval content not clipped ${width}`,drawerSize.scroll<=drawerSize.width+1,drawerSize);
      await page.evaluate(()=>document.querySelectorAll('.el-message,.el-notification').forEach(e=>e.style.display='none'));
      await page.screenshot({path:`/tmp/fullyu-gift-detail-${width}.png`});
      check(`only expected synthetic failures ${width}`,errors.length===0&&await page.evaluate(()=>fixture.errors.length===2&&fixture.errors.includes('合成保存失败')&&fixture.errors.includes('合成导入失败')),errors);
      await page.close();
    }
  } finally {
    await browser.close();fs.writeFileSync('/tmp/fullyu-gift-browser-results.json',JSON.stringify({checks:results.length,results,realApi:false,realPayments:0,realMessages:0},null,2));
  }
  console.log(JSON.stringify({checks:results.length,failed:results.filter(r=>!r.pass)},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
