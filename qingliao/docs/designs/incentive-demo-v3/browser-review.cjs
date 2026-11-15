/* Local headless Chrome verification with real CSS viewport metrics. No dependencies. */
const {spawn}=require('node:child_process');
const {writeFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(__dirname,'.chrome-review')],{stdio:['ignore','ignore','pipe']});
let socket,seq=0;const pending=new Map();
const timeout=setTimeout(()=>{console.error('Browser verification timed out');chrome.kill();process.exit(1);},60000);
async function run(endpoint){
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data);const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const call=(method,params)=>send(method,params,sessionId);
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');
 const output=[];
 for(const [name,file,width,height,mobile] of [['mobile-review','Full愈-接单奖励-手机端Demo-V3.html',390,844,true],['pc-review','Full愈-激励管理-PC端Demo-V3.html',1440,1000,false]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await call('Page.navigate',{url:pathToFileURL(path.join(root,file)).href});
  await evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;function ready(){if(window.demo&&document.getElementById('app')?.children.length)return resolve(true);if(Date.now()>deadline)return reject(Error('page not ready'));requestAnimationFrame(ready)}ready()})`);
  const metrics=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,title:document.title})`);
  if(metrics.width!==width||metrics.scroll>width)throw Error('Viewport mismatch '+JSON.stringify(metrics));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.height,scale:1}});
  await writeFile(path.join(__dirname,name+'.png'),Buffer.from(shot.data,'base64'));output.push({name,...metrics});
  if(!mobile){
   await evaluate(`document.getElementById('settingsOpen').click();document.querySelector('[data-tab="shop"]').click()`);
   const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(__dirname,'settings-review.png'),Buffer.from(shot.data,'base64'));
  }
 }
 console.log(JSON.stringify(output,null,2));
 await send('Browser.close');socket.close();clearTimeout(timeout);
}
let buffer='',started=false;
chrome.stderr.on('data',chunk=>{buffer+=chunk.toString();const found=buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(found&&!started){started=true;run(found[1]).catch(e=>{console.error(e);socket?.close();chrome.kill();clearTimeout(timeout);process.exitCode=1;});}});
chrome.on('error',e=>{console.error(e);clearTimeout(timeout);process.exitCode=1;});
