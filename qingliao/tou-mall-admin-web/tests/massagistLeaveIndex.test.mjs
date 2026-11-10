import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/massagist/leave/index.vue', import.meta.url), 'utf8');
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(api = {}) {
  const calls=[],loading=[],notices=[],errors=[];
  const context=vm.createContext({mapGetters:()=>({}),console,ApprovalCategorySelector:{},RefundForm:{},ApprovalProgress:{},ShopSelector:{},MassagistLeaveForm:{},getInfoNew:async()=>({data:{shopId:2}}),
    approvalCategoryApi:{listByShopId:async()=>({data:[{id:5,title:'请假审批'}]})},
    approvalDetailApi:{page:async params=>{calls.push({kind:'page',...params});return api.page?api.page(params):{data:{list:[{id:1}],total:1}};}},
    massagistLeaveApi:{cancelLeave:async id=>{calls.push({kind:'cancel',id});return api.cancel?api.cancel(id):{};},
      findMassagistLeaveDetailByApprovalId:async id=>{calls.push({kind:'detail',id});return api.detail?api.detail(id):{data:{id:50}};}}});
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options='),context);
  const state=Object.assign(context.options.data.call({userId:8}),context.options.methods,{userId:8,shopId:2,massagistId:7,
    showFullLoading:()=>loading.push('show'),hideFullLoading:()=>loading.push('hide'),notifyConfirm:async()=>{},
    $notify:{success:t=>notices.push(t),error:t=>errors.push(t)},$message:{error:t=>errors.push(t)},
    $refs:{refMassagistLeaveForm:{open:()=>true},refApprovalProgress:{open:()=>{}}}});
  return {state,calls,loading,notices,errors};
}
test('failed list request releases loading and shows a retryable error',async()=>{
  const {state,loading}=setup({page:async()=>{throw new Error('合成列表失败');}});state.dataList=[{id:9}];
  await state.fetchData();assert.deepEqual(loading,['show','hide']);assert.match(state.listError,/加载失败/);assert.equal(state.dataList.length,1);
});
test('successful list clears a previous error',async()=>{
  const {state}=setup();state.listError='旧错误';await state.fetchData();assert.equal(state.listError,'');assert.equal(state.total,1);
});
test('stale page response cannot replace a newer page',async()=>{
  const pending=[];const {state}=setup({page:()=>{const d=deferred();pending.push(d);return d.promise;}});
  const a=state.fetchData();const b=state.fetchData();pending[1].resolve({data:{list:[{id:2}],total:1}});await b;
  pending[0].resolve({data:{list:[{id:1}],total:9}});await a;assert.equal(state.dataList[0].id,2);assert.equal(state.total,1);
});
test('cancel is locked against duplicate clicks and refreshes once',async()=>{
  const d=deferred();const {state,calls,notices}=setup({cancel:()=>d.promise});
  const a=state.cancelLeave({approvalId:20});const b=state.cancelLeave({approvalId:20});
  for(let i=0;i<20&&!calls.some(c=>c.kind==='cancel');i++) await Promise.resolve();
  d.resolve({});await Promise.all([a,b]);
  assert.equal(calls.filter(c=>c.kind==='cancel').length,1);assert.equal(notices.length,1);assert.equal(state.cancellingId,null);
});
test('failed cancel shows no success, keeps the list, and releases the lock',async()=>{
  const {state,calls,notices,errors}=setup({cancel:async()=>{throw new Error('合成撤销失败');}});
  await state.cancelLeave({approvalId:20});assert.equal(notices.length,0);assert.equal(errors.length,1);assert.equal(state.cancellingId,null);
  assert.equal(calls.filter(c=>c.kind==='page').length,0);
});
test('declined confirmation writes nothing',async()=>{
  const {state,calls}=setup();state.notifyConfirm=async()=>{throw new Error('cancel');};
  await state.cancelLeave({approvalId:20});assert.equal(calls.length,0);assert.equal(state.cancellingId,null);
});
test('template uses rest wording and disables the row being cancelled',()=>{
  const template=source.slice(0,source.indexOf('<script>')).replace(/<!--[\s\S]*?-->/g,'');
  assert.doesNotMatch(template,/请假|在职|离职/);assert.match(template,/申请休息/);assert.match(template,/cancellingId/);assert.match(template,/listError/);
  assert.doesNotMatch(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/'请假审批'/g,''),/请假记录/);
});
