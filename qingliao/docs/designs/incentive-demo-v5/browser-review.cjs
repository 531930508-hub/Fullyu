/* V5 real-CSS browser verification: interactions, overflow, screenshots, console errors. */
const {spawn} = require('node:child_process');
const {readFile, writeFile} = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const mobileFile = pathToFileURL(path.join(root, 'Full愈-接单奖励-手机端Demo-V5.html')).href;
const pcFile = pathToFileURL(path.join(root, 'Full愈-激励管理-PC端Demo-V5.html')).href;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + path.join(__dirname, '.chrome-review-v5')
], {stdio: ['ignore', 'ignore', 'pipe']});
let socket, seq = 0;
const pending = new Map(), errors = [];
const timeout = setTimeout(() => {
  console.error('Browser verification timed out');
  chrome.kill();
  process.exit(1);
}, 120000);

async function run(endpoint) {
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data), p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const viewport = (width, height = 844, mobile = true) => call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile
  });
  const ready = marker => evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;function check(){if(window.demo&&document.getElementById('${marker}'))return resolve(true);if(Date.now()>deadline)return reject(Error('page not ready'));requestAnimationFrame(check)}check()})`);
  const waitToast = () => evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+6000;function check(){const t=document.getElementById('toast');if(!t||t.hidden)return requestAnimationFrame(()=>requestAnimationFrame(resolve));if(Date.now()>deadline)return reject(Error('toast did not dismiss'));requestAnimationFrame(check)}check()})`);
  const navigate = async (url, marker) => {
    await call('Page.navigate', {url});
    await ready(marker);
  };
  async function shot(name, width, height, mobile, viewportOnly = false) {
    await viewport(width, height, mobile);
    await call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
    await waitToast();
    const m = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})');
    if (m.width !== width || m.scroll > width) throw Error('Overflow ' + name + ' ' + JSON.stringify(m));
    const clip = {x: 0, y: 0, width, height: viewportOnly ? height : m.height, scale: 1};
    const result = await call('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true, clip});
    await writeFile(path.join(__dirname, name + '.png'), Buffer.from(result.data, 'base64'));
    return {...m, file: name + '.png', shotHeight: clip.height};
  }

  await call('Page.enable');
  await call('Runtime.enable');

  /* ---------------- Mobile ---------------- */
  await viewport(390, 844, true);
  await navigate(mobileFile, 'tenDayAmount');
  await evaluate(`localStorage.removeItem('fullyu-incentive-demo-v5');location.reload()`);
  await ready('tenDayAmount');
  const mobileChecks = await evaluate(await readFile(path.join(__dirname, 'mobile-checks.js'), 'utf8'));
  console.log('PASS mobile interactions:', mobileChecks.length);
  mobileChecks.forEach(n => console.log('PASS', n));

  const mobileLayout = [];
  for (const width of [320, 375, 390, 430]) {
    await viewport(width, 844, true);
    const result = await evaluate(`(() => {
      const failures=[],banned=/收入|薪酬|薪资|工资|奖金|报酬|到手|应发|实发|在职|员工/;let count=0;
      for(const p of demo.state.people){
        document.getElementById('demoPerson').value=p.id;
        document.getElementById('demoPerson').dispatchEvent(new Event('change'));
        for(const open of [false,true]){
          document.querySelectorAll('main details').forEach(n=>n.open=open);
          const main=document.querySelector('main');
          if(document.documentElement.scrollWidth>innerWidth)failures.push({person:p.id,open,width:innerWidth,type:'page-overflow',scroll:document.documentElement.scrollWidth});
          const nodes=[...main.querySelectorAll('#durationTrack .threshold,#durationTrack .tier-value,#conversionTrack .threshold,#conversionTrack .tier-value,#trainingCard .training-item-head b,#trainingCard .training-foot>span,#trainingCard .training-summary span,#trainingCard .training-past')];
          for(const n of nodes)if(n.scrollWidth>n.clientWidth+1)failures.push({person:p.id,open,type:'label-overflow',text:n.textContent.trim().slice(0,40),scroll:n.scrollWidth,client:n.clientWidth});
          if(banned.test(main.textContent))failures.push({person:p.id,open,type:'wording'});
          if(['rewardTotal','baseAmount','repurchaseAmount','trainingAmount','durationValue','retentionValue','conversionValue','tenDayAmount','trainingCard'].some(id=>!document.getElementById(id)?.getClientRects().length))failures.push({person:p.id,open,type:'core-hidden'});
          if(document.querySelectorAll('#trainingCard [data-training-project]').length>3)failures.push({person:p.id,open,type:'training-too-long'});
          count++;
        }
      }
      return {width:innerWidth,count,failures};
    })()`);
    mobileLayout.push(result);
    if (result.failures.length) throw Error('Mobile layout ' + JSON.stringify(result));
    console.log('PASS mobile layout', width, result.count);
  }

  await evaluate(`document.querySelectorAll('main details').forEach(n=>n.open=false);document.getElementById('scenario').open=false;document.getElementById('demoPerson').value='rain';document.getElementById('demoPerson').dispatchEvent(new Event('change'))`);
  const screenshots = [];
  screenshots.push(await shot('mobile-review', 390, 844, true));
  screenshots.push(await shot('mobile-narrow-review', 320, 844, true));
  await evaluate(`document.getElementById('demoPerson').value='tom';document.getElementById('demoPerson').dispatchEvent(new Event('change'));document.querySelectorAll('main details').forEach(n=>n.open=false)`);
  screenshots.push(await shot('mobile-gated-review', 390, 844, true));
  await evaluate(`document.getElementById('demoPerson').value='ivy';document.getElementById('demoPerson').dispatchEvent(new Event('change'));document.querySelectorAll('main details').forEach(n=>n.open=false)`);
  screenshots.push(await shot('mobile-new-review', 390, 844, true));
  await evaluate(`document.getElementById('demoPerson').value='rain';document.getElementById('demoPerson').dispatchEvent(new Event('change'));document.getElementById('trainingDetails').open=true;document.getElementById('trainingCard').scrollIntoView()`);
  screenshots.push(await shot('mobile-training-details', 390, 844, true));

  /* ---------------- PC ---------------- */
  await navigate(pcFile, 'role');
  await evaluate(`localStorage.removeItem('fullyu-incentive-demo-v5');location.reload()`);
  await ready('role');
  const pcChecks = await evaluate(await readFile(path.join(__dirname, 'pc-checks.js'), 'utf8'));
  console.log('PASS PC interactions:', pcChecks.length);
  pcChecks.forEach(n => console.log('PASS', n));

  /* PC checks mutate demo state and remove storage; reload to the clean default. */
  await evaluate('location.reload()');
  await ready('role');

  const pcLayout = [];
  for (const width of [1440, 1280, 1024, 760]) {
    await viewport(width, 1000, false);
    for (const view of ['dashboard', 'training']) {
      await evaluate(`document.querySelector('[data-admin-view="${view}"]').click()`);
      const result = await evaluate(`(() => {
        const failures=[],banned=/收入|薪酬|薪资|工资|奖金|报酬|到手|应发|实发|在职|员工/;const width=innerWidth;
        if(document.documentElement.scrollWidth>width)failures.push({type:'page-overflow',scroll:document.documentElement.scrollWidth});
        const app=document.getElementById('app');
        if(banned.test(app.textContent))failures.push({type:'wording'});
        if(!document.getElementById('role')?.getClientRects().length)failures.push({type:'chrome-hidden'});
        const cards=[...app.querySelectorAll('.admin-kpis .summary-card')];
        if(cards.length!==${view === 'dashboard' ? 5 : 4})failures.push({type:'kpi-count',value:cards.length});
        if(cards.some(n=>!n.getClientRects().length))failures.push({type:'kpi-hidden'});
        if(!app.querySelector('.table-wrap table'))failures.push({type:'table-hidden'});
        return {width,view:'${view}',failures};
      })()`);
      pcLayout.push(result);
      if (result.failures.length) throw Error('PC layout ' + JSON.stringify(result));
      console.log('PASS PC layout', width, view);
    }
  }

  await viewport(1440, 1000, false);
  await evaluate(`document.querySelector('[data-admin-view="dashboard"]').click()`);
  screenshots.push(await shot('pc-dashboard-review', 1440, 1000, false));
  await evaluate(`document.querySelector('[data-admin-view="training"]').click()`);
  screenshots.push(await shot('pc-training-review', 1440, 1000, false));
  await evaluate(`document.querySelector('[data-train-edit="rain|sujin-head"]').click()`);
  screenshots.push(await shot('pc-training-dialog', 1440, 1000, false, true));
  await evaluate(`document.getElementById('trainingDialog').close();document.getElementById('trainSettings').click()`);
  screenshots.push(await shot('pc-settings-training', 1440, 1000, false, true));

  if (errors.length) throw Error('Page console errors ' + JSON.stringify(errors));
  const report = {interactions: {mobile: mobileChecks, pc: pcChecks}, mobileLayout, pcLayout, screenshots, consoleErrors: errors};
  await writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    mobileInteractions: mobileChecks.length,
    pcInteractions: pcChecks.length,
    mobileLayouts: mobileLayout.reduce((s, x) => s + x.count, 0),
    pcLayouts: pcLayout.length,
    screenshots: screenshots.map(x => ({file: x.file, width: x.width, height: x.shotHeight})),
    consoleErrors: errors.length
  }, null, 2));
  await send('Browser.close');
  socket.close();
  clearTimeout(timeout);
}

let buffer = '', started = false;
chrome.stderr.on('data', chunk => {
  buffer += chunk.toString();
  const found = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (found && !started) {
    started = true;
    run(found[1]).catch(e => {
      console.error(e);
      socket?.close();
      chrome.kill();
      clearTimeout(timeout);
      process.exitCode = 1;
    });
  }
});
chrome.on('error', e => {
  console.error(e);
  clearTimeout(timeout);
  process.exitCode = 1;
});
