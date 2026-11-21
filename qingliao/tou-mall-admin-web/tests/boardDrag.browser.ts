import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
const checks: string[] = [];
let completed = false;
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.route('**/*', (route: any) => route.request().url().startsWith('http://127.0.0.1:9011/') ? route.continue() : route.abort());
  const ready = () => page.waitForFunction(() => (window as any).fixture && !(window as any).fixture.page().listLoading && (window as any).fixture.page().dataList.length === 3);
  const reset = async () => {
    await page.goto('http://127.0.0.1:9011/board');
    await ready();
    await page.locator('.el-loading-mask').waitFor({state: 'hidden'});
    await page.evaluate(() => { const p = (window as any).fixture.page(); p.$refs.refScrollContainer.scrollTop = 0; });
  };
  const startDrag = async () => {
    const box = await page.locator('[data-detail-id="101"]').boundingBox();
    await page.mouse.move(box.x + 55, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 65, box.y + 40);
    await page.waitForFunction(() => (window as any).fixture.page().isDragging);
  };
  const drop = async (bed: number, slot: number) => {
    const box = await page.locator('.data-item[data-item-id="' + bed + '"]').boundingBox();
    await page.mouse.move(box.x + 65, box.y + 8 + slot * 80 + 40, {steps: 6});
    await page.mouse.up();
  };
  const settle = () => page.waitForFunction(() => !(window as any).fixture.page().pendingMove && !(window as any).fixture.page().listLoading);
  const check = (name: string, result: boolean) => {assert.ok(result, name); checks.push(name);};

  await reset();
  await startDrag();
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  await page.evaluate(() => (window as any).fixture.page().fetchData());
  check('自动刷新不会中断真实鼠标拖动', await page.evaluate((n: number) => (window as any).fixture.requests === n && (window as any).fixture.page().isDragging, requests));
  await drop(7, 0);
  await page.getByRole('dialog').waitFor();
  const preview = await page.getByRole('dialog').innerText();
  check('单独跨区移动显示换前换后项目和原疗愈师', ['头部水疗', '全感舒筋', '湿1', '干1', '疗愈师甲（保留）'].every(t => preview.includes(t)));
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await settle();
  check('取消后订单回原床位且没有保存', await page.evaluate(() => {const f=(window as any).fixture;return f.saves.length===0&&f.page().dataList[0].orderDetailList[0].id===101}));

  await reset();
  await startDrag();await drop(7, 4);
  await page.getByRole('dialog').waitFor();
  const swap = await page.getByRole('dialog').innerText();
  check('真实跨区互换预览包含双方', ['确认互换排期', '另一单', '疗愈师甲（保留）', '疗愈师乙（保留）'].every(t => swap.includes(t)));
  await page.waitForFunction(() => {const d=document.querySelector('.el-message-box')!;return getComputedStyle(d).opacity==='1'&&!d.parentElement!.className.includes('enter-active')});
  await page.screenshot({path:'/tmp/fullyu-board-drag-confirm.png'});
  await page.evaluate(() => (window as any).fixture.holdSave = true);
  await page.getByRole('button', {name: '确认', exact: true}).click();
  await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
  const heldRequests = await page.evaluate(() => (window as any).fixture.requests);
  await page.evaluate(() => (window as any).fixture.page().fetchData());
  check('请求保存期间拖动和刷新均锁住', await page.evaluate((n: number) => {const f=(window as any).fixture;return f.page().pendingMove&&f.requests===n&&f.page().$children.filter((c:any)=>c.$options.name==='draggable').every((c:any)=>c._sortable.option('disabled'))}, heldRequests));
  await page.evaluate(() => (window as any).fixture.pending[0]());
  await settle();
  check('只发一次正确的互换请求并展示返回排期', await page.evaluate(() => {const f=(window as any).fixture,p=f.page();return f.saves.length===1&&f.saves[0].id===101&&f.saves[0].swapWithId===102&&p.dataList[1].orderDetailList[0].id===101&&p.dataList[0].orderDetailList[0].id===102}));
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.screenshot({path:'/tmp/fullyu-board-drag-after.png'});

  await reset();await page.evaluate(() => (window as any).fixture.rejectSave = true);
  await startDrag();await drop(7, 0);
  await page.getByRole('button', {name: '确认', exact: true}).click();await settle();
  check('技能拒绝原因可见且恢复原排期', await page.locator('.el-message').filter({hasText:'未认证'}).isVisible() && await page.evaluate(() => (window as any).fixture.page().dataList[0].orderDetailList[0].id===101));

  await reset();await startDrag();await page.mouse.move(1000, 140, {steps:6});await page.mouse.up();await settle();
  check('看板外松手提示不保存', await page.evaluate(() => (window as any).fixture.saves.length===0)&&await page.locator('.el-message').filter({hasText:'列内'}).isVisible());

  await reset();await startDrag();await drop(8,1);
  await page.getByRole('dialog').waitFor();
  check('同区移动准确吸附到14:15', (await page.getByRole('dialog').innerText()).includes('14:15~15:15'));
  await page.getByRole('button',{name:'确认',exact:true}).click();await settle();
  check('同区移动提交正确时间且保留原项目',await page.evaluate(()=>{const f=(window as any).fixture;return f.saves[0].startTime==='2026-11-21 14:15:00'&&f.page().dataList[2].orderDetailList[0].projectId===1}));
  await page.evaluate(()=>{const p=(window as any).fixture.page();p.$refs.refScrollContainer.scrollTop=400;});
  await page.evaluate(()=>(window as any).fixture.page().fetchData());
  check('刷新不抢滚动位置',await page.evaluate(()=>(window as any).fixture.page().$refs.refScrollContainer.scrollTop===400));
  check('没有Vue或浏览器运行错误',errors.length===0&&await page.evaluate(()=>(window as any).fixture.errors.length===0));
  const tablet=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});
  tablet.on('pageerror',(e:Error)=>errors.push(e.message));
  await tablet.route('**/*',(route:any)=>route.request().url().startsWith('http://127.0.0.1:9011/')?route.continue():route.abort());
  await tablet.goto('http://127.0.0.1:9011/board');
  await tablet.waitForFunction(()=>(window as any).fixture&&!(window as any).fixture.page().listLoading&&(window as any).fixture.page().dataList.length===3);
  await tablet.locator('.el-loading-mask').waitFor({state:'hidden'});
  await tablet.evaluate(()=>(window as any).fixture.page().$refs.refScrollContainer.scrollTop=0);
  const card=await tablet.locator('[data-detail-id="101"]').boundingBox();
  const destination=await tablet.locator('.data-item[data-item-id="8"]').boundingBox();
  const session=await tablet.context().newCDPSession(tablet);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:card.x+55,y:card.y+40}]});
  await tablet.locator('.check-item').waitFor();
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:card.x+75,y:card.y+40}]});
  await tablet.waitForFunction(()=>(window as any).fixture.page().isDragging);
  for(let step=1;step<=12;step++) {
    await tablet.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:card.x+75+(destination.x+65-card.x-75)*step/12,y:card.y+40+(destination.y+48-card.y-40)*step/12}]});
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await tablet.getByRole('dialog').waitFor();
  check('触屏长按拖动能到达正确床位', (await tablet.getByRole('dialog').innerText()).includes('湿2'));
  await tablet.getByRole('button',{name:'取消',exact:true}).tap();
  await tablet.waitForFunction(()=>!(window as any).fixture.page().pendingMove);
  await tablet.getByRole('dialog').waitFor({state:'hidden'});
  await tablet.locator('[data-detail-id="101"]').tap({position:{x:55,y:40}});
  await tablet.waitForFunction(()=>(window as any).fixture.opened===1);
  check('触屏短点仍能打开订单详情', await tablet.evaluate(()=>(window as any).fixture.saves.length===0));
  check('触屏运行无异常',errors.length===0&&await tablet.evaluate(()=>(window as any).fixture.errors.length===0));
  completed=true;
} finally {
  await browser.close();
  writeFileSync('/tmp/fullyu-board-drag-browser-results.json',JSON.stringify({completed,realAPI:false,checks},null,2));
}
console.log(JSON.stringify({completed,checks:checks.length}));
