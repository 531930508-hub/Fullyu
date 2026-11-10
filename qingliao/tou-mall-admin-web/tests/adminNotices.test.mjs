import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const require=createRequire(new URL('../package.json',import.meta.url))
const source = await readFile(new URL('../src/views/todo/AdminNoticeSettings.vue', import.meta.url),'utf8').catch(()=>null)
function setup(api={}) {
  assert.ok(source,'待办中心缺少个人服务号通知设置')
  const requests=[],success=[]
  const context=vm.createContext({adminNoticeApi:{status:async()=>({data:{enabled:true,bound:false,following:false,qrAvailable:false,realDeliveryEnabled:false}}),logs:async p=>{requests.push(p);return {data:{list:[],total:0}}},unlink:async()=>{requests.push('unlink');return {code:200}},...api}})
  const script=source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options =')
  vm.runInContext(script,context)
  const state=Object.assign(context.options.data(),context.options.methods,{$confirm:async()=>{},$message:{success:m=>success.push(m)}})
  return {state,options:context.options,requests,success}
}
test('notification styles compile with installed Sass without fixture preprocessing',()=>{
  setup();const style=source.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
  assert.doesNotThrow(()=>require('sass').renderSync({data:style}))
})
test('todo center exposes personal notification entry without new admin scope',async()=>{
  const todo=await readFile(new URL('../src/views/todo/index.vue',import.meta.url),'utf8')
  assert.match(todo,/AdminNoticeSettings/);assert.match(todo,/refNoticeSettings\.open/);assert.match(todo,/:key="userId"/)
})
test('opening settings reads status and server-paginated logs only',async()=>{
  const {state,requests}=setup();await state.open();assert.equal(state.visible,true);assert.equal(state.status.realDeliveryEnabled,false);assert.equal(requests.length,1);assert.equal(requests[0].page,1);assert.equal(requests[0].size,10)
})
test('settings never collects raw openid or binding nonce',()=>{setup();assert.doesNotMatch(source,/v-model="[^\"]*(?:openId|nonce)/);assert.doesNotMatch(source,/adminNoticeApi\.(begin|confirm)/)})
test('unavailable QR and mock are labeled honestly',()=>{setup();assert.match(source,/扫码绑定尚未开放/);assert.match(source,/不会发送真实微信消息/);assert.match(source,/模拟评估/);assert.doesNotMatch(source,/MOCK:\s*['"]已发送/)})
test('status failure displays retry state and releases loading',async()=>{const {state}=setup({status:async()=>{throw Error('offline')}});await state.open();assert.equal(state.status,null);assert.ok(state.statusError);assert.equal(state.statusLoading,false)})
test('failed log fetch is distinct from empty history',async()=>{const {state}=setup({logs:async()=>{throw Error('offline')}});await state.open();assert.ok(state.logsError);assert.equal(state.logsLoading,false);assert.equal(state.rows.length,0)})
test('failed status can be retried',async()=>{let count=0;const {state}=setup({status:async()=>{if(!count++)throw Error('offline');return {data:{enabled:false}}}});await state.open();await state.loadStatus();assert.equal(state.statusError,'');assert.equal(state.status.enabled,false)})
test('page changes call server instead of downloading all logs',async()=>{const {state,requests}=setup();await state.open();await state.changePage(2);assert.equal(requests[1].page,2);assert.equal(requests[1].size,10)})
test('old page response cannot overwrite new page',async()=>{let release;const {state}=setup({logs:p=>p.page===1?new Promise(r=>release=r):Promise.resolve({data:{list:[{id:2}],total:11}})});state.visible=true;const first=state.loadLogs();state.page=2;await state.loadLogs();release({data:{list:[{id:1}],total:11}});await first;assert.equal(state.rows[0].id,2)})
test('closed dialog ignores pending status and logs',async()=>{let release;const {state}=setup({status:()=>new Promise(r=>release=r)});const pending=state.open();state.closed();release({data:{bound:true}});await pending;assert.equal(state.status,null);assert.equal(state.rows.length,0)})
test('unlink requires current binding and prevents duplicate submit',async()=>{const {state,requests}=setup();state.visible=true;await state.unlink();assert.equal(requests.length,0);state.status={bound:true};state.submitting=true;await state.unlink();assert.equal(requests.length,0)})
test('unlink confirmation cancellation causes no write',async()=>{const {state,requests,success}=setup();state.visible=true;state.status={bound:true};state.$confirm=async()=>{throw 'cancel'};await state.unlink();assert.equal(requests.length,0);assert.equal(success.length,0);assert.equal(state.submitting,false)})
test('failed unlink retains binding and displays actionable error',async()=>{const {state,success}=setup({unlink:async()=>{throw Error('offline')}});state.visible=true;state.status={bound:true};await state.unlink();assert.equal(state.status.bound,true);assert.ok(state.actionError);assert.equal(state.submitting,false);assert.equal(success.length,0)})
test('successful unlink refreshes persisted status and reports once',async()=>{const {state,requests,success}=setup();state.visible=true;state.status={bound:true};await state.unlink();assert.equal(state.status.bound,false);assert.equal(requests.filter(x=>x==='unlink').length,1);assert.equal(success.length,1)})
test('settings cannot close while unlink transaction is pending',()=>{const {state}=setup();let closed=0;state.submitting=true;state.beforeClose(()=>closed++);assert.equal(closed,0);state.submitting=false;state.beforeClose(()=>closed++);assert.equal(closed,1)})
test('component destruction invalidates pending requests',()=>{const {state,options}=setup();const previous=state.statusRequest;options.beforeDestroy.call(state);assert.ok(state.statusRequest>previous)})
test('status captions avoid claiming delivery for blocked integrations',()=>{const {state}=setup();assert.equal(state.stateLabel('MOCK'),'模拟评估');assert.equal(state.stateLabel('LIVE_BLOCKED'),'真实发送未开放');assert.equal(state.stateLabel('unrecognized'),'待确认')})
test('log time is shown without ISO separator',()=>{const {state}=setup();assert.equal(state.timeLabel('2026-11-08T06:37:19'),'2026-11-08 06:37:19');assert.equal(state.timeLabel(null),'');assert.match(source,/timeLabel\(scope\.row\.createTime\)/)})
