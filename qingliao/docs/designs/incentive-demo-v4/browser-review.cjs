/* Real CSS viewports in an isolated local Chrome profile, no dependencies. */
const {spawn}=require('node:child_process');
const {readFile,writeFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(__dirname,'.chrome-review')],{stdio:['ignore','ignore','pipe']});
let socket,seq=0;const pending=new Map(),errors=[];
const timeout=setTimeout(()=>{console.error('Browser verification timed out');chrome.kill();process.exit(1);},90000);
async function run(endpoint){
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const call=(method,params)=>send(method,params,sessionId);
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const viewport=width=>call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
 const ready=()=>evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;function check(){if(window.demo&&document.getElementById('tenDayAmount'))return resolve(true);if(Date.now()>deadline)return reject(Error('page not ready'));requestAnimationFrame(check)}check()})`);
 async function shot(name,width){await viewport(width);await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await evaluate(`document.activeElement?.blur();new Promise((resolve,reject)=>{const deadline=Date.now()+5000;function check(){if(document.getElementById('toast').hidden)return requestAnimationFrame(()=>requestAnimationFrame(resolve));if(Date.now()>deadline)return reject(Error('toast did not dismiss'));requestAnimationFrame(check)}check()})`);const m=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})');if(m.width!==width||m.scroll>width)throw Error('Overflow '+JSON.stringify(m));const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:m.height,scale:1}});await writeFile(path.join(__dirname,name+'.png'),Buffer.from(result.data,'base64'));return m;}
 await call('Page.enable');await call('Runtime.enable');await viewport(390);
 await call('Page.navigate',{url:pathToFileURL(path.join(root,'Full愈-接单奖励-手机端Demo-V4.html')).href});await ready();
 const checks=await evaluate(await readFile(path.join(__dirname,'browser-checks.js'),'utf8'));
 console.log('PASS browser interactions:',checks.length);checks.forEach(n=>console.log('PASS',n));
 const screenshots=[{name:'mobile-review',...await shot('mobile-review',390)}];
 screenshots.push({name:'mobile-narrow-review',...await shot('mobile-narrow-review',320)});
 const layout=[];
 for(const width of [320,375,390,430]){
  await viewport(width);
  const result=await evaluate(`(() => {const failures=[];let count=0;for(const p of demo.state.people){document.getElementById('demoPerson').value=p.id;document.getElementById('demoPerson').dispatchEvent(new Event('change'));for(const open of [false,true]){document.querySelectorAll('details').forEach(n=>n.open=open);const main=document.querySelector('main');if(document.documentElement.scrollWidth>innerWidth)failures.push({person:p.id,open,width:innerWidth,type:'page-overflow'});for(const id of ['durationTrack','conversionTrack']){const nodes=[...document.querySelectorAll('#'+id+' .threshold,#'+id+' .tier-value')];for(const n of nodes)if(n.scrollWidth>n.clientWidth+1)failures.push({person:p.id,open,id,text:n.textContent,type:'label-overflow'});}if(/收入|薪酬|薪资|工资|奖金|报酬|到手|应发|实发|在职|员工/.test(main.textContent))failures.push({person:p.id,type:'wording'});if(['durationValue','retentionValue','conversionValue','tenDayAmount'].some(id=>!document.getElementById(id).getClientRects().length))failures.push({person:p.id,type:'core-hidden'});count++;}}return {width:innerWidth,count,failures};})()`);
  layout.push(result);if(result.failures.length)throw Error(JSON.stringify(result));
 }
 await evaluate(`document.getElementById('demoPerson').value='tom';document.getElementById('demoPerson').dispatchEvent(new Event('change'));document.querySelectorAll('details').forEach(n=>n.open=false)`);
 screenshots.push({name:'mobile-gated-review',...await shot('mobile-gated-review',390)});
 await evaluate(`document.getElementById('demoPerson').value='ivy';document.getElementById('demoPerson').dispatchEvent(new Event('change'));document.querySelectorAll('details').forEach(n=>n.open=false)`);
 screenshots.push({name:'mobile-new-review',...await shot('mobile-new-review',390)});
 if(errors.length)throw Error('Page console errors '+JSON.stringify(errors));
 const report={interactions:checks,layout,screenshots,consoleErrors:errors};
 await writeFile(path.join(__dirname,'verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({layouts:layout.reduce((s,x)=>s+x.count,0),screenshots,consoleErrors:errors.length},null,2));
 await send('Browser.close');socket.close();clearTimeout(timeout);
}
let buffer='',started=false;
chrome.stderr.on('data',chunk=>{buffer+=chunk.toString();const found=buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(found&&!started){started=true;run(found[1]).catch(e=>{console.error(e);socket?.close();chrome.kill();clearTimeout(timeout);process.exitCode=1;});}});
chrome.on('error',e=>{console.error(e);clearTimeout(timeout);process.exitCode=1;});
