import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/massagist/schedules/index.vue',import.meta.url),'utf8');
const script=source.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options =');
function setup(cancel=false) {
  const calls=[];
  const context=vm.createContext({mapGetters:()=>({}),MassagistSortDrawer:{},MassagistSelector:{},ShopSelector:{},
    MassagistSchedulesForm:{},MassagistForm:{},MassagistSchedulesTargetShopForm:{},console:{log(){}},
    massagistSchedulesApi:{clearFuture: async (id,shopId)=>{calls.push({id,shopId}); return {data:2};},
      changeLogs:async params=>{calls.push(params);return {data:{list:[{action:'编辑排班'}],total:1}};}}});
  vm.runInContext(script,context);
  const state=context.options.data();
  Object.assign(state,context.options.methods,{$confirm:async()=>{if(cancel) throw 'cancel';},
    $message:{warning(){},success(){}},notifySuccess(){},searchData(){},shopId:1});
  state.searchForm.shopId=1; state.searchForm.massagistId=7;
  return {state,calls};
}

test('clearFuture requires selected person and explicit confirmation',async()=>{
  const {state,calls}=setup();
  assert.equal(typeof state.handleClearFuture,'function','缺少清除未来未生效排班入口');
  await state.handleClearFuture();
  assert.deepEqual(calls,[{id:7,shopId:1}]);
  assert.equal(state.clearLoading,false);
});
test('cancel confirmation never sends destructive request',async()=>{
  const {state,calls}=setup(true);
  assert.equal(typeof state.handleClearFuture,'function');
  await state.handleClearFuture();
  assert.equal(calls.length,0);
});
test('no person selection never clears entire shop',async()=>{
  const {state,calls}=setup();state.searchForm.massagistId=null;
  assert.equal(typeof state.handleClearFuture,'function');
  await state.handleClearFuture();assert.equal(calls.length,0);
});
test('change logs use server pagination and explicit store scope',async()=>{
  const {state,calls}=setup();
  assert.equal(typeof state.openChangeLogs,'function');
  await state.openChangeLogs();
  assert.equal(calls[0].shopId,1);assert.equal(calls[0].page,1);assert.equal(calls[0].size,10);
  assert.equal(state.changeLogs.length,1);assert.equal(state.logTotal,1);
});
test('default schedule page is small and filters cooperating therapists',()=>{
  const {state}=setup();assert.equal(state.searchForm.size,10);assert.equal(state.searchForm.status,1);
});
test('failed clearing releases loading and preserves readable error',async()=>{
  const {state}=setup();
  state.searchData=()=>{throw 'refresh failed';};
  await assert.rejects(state.handleClearFuture(),error=>error==='refresh failed');
  assert.equal(state.clearLoading,false);
});
const transferSource = await readFile(new URL('../src/views/massagist/schedules/MassagistSchedulesTargetShopForm.vue',import.meta.url),'utf8');
function transferState(fail=false) {
  let loading=0; let submitted=0;
  const context=vm.createContext({mapGetters:()=>({}),MassagistSelector:{},ShopSelector:{},console:{log(){}},
    massagistSchedulesApi:{batchTargetShop:async()=>{submitted++;if(fail) throw '测试失败';},saveTargetShop:async()=>{}}});
  vm.runInContext(transferSource.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options ='),context);
  const state=Object.assign(context.options.data(),context.options.methods,{
    $refs:{refForm:{validate:async()=>true}},showFullLoading(){loading++;},hideFullLoading(){loading--;},
    $notify:{warning(){},success(){}},$store:{dispatch(){}},$emit(){}});
  state.form={shopId:1,targetShopId:2,day:'2026-11-20',startTime:'10:00',endTime:'22:00'};
  return {state,loading:()=>loading,submitted:()=>submitted};
}
test('transfer failures preserve form and release full-screen loading',async()=>{
  const {state,loading}=transferState(true);
  await assert.rejects(state.onSubmit(),error=>error==='测试失败');
  assert.equal(loading(),0);assert.equal(state.form.targetShopId,2);
});
test('duplicate transfer submission is guarded',async()=>{
  const {state,submitted}=transferState();state.submitting=true;
  await state.onSubmit();assert.equal(submitted(),0);
});
test('transfer form edit mode and submitting state are reactive',()=>{
  const {state}=transferState();assert.equal(state.isEdit,false);assert.equal(state.submitting,false);
  assert.match(transferSource,/:disabled="isEdit"[\s\S]*?value-format="yyyy-MM-dd"/);
});
function listState(page) {
  const context=vm.createContext({mapGetters:()=>({}),MassagistSortDrawer:{},MassagistSelector:{},ShopSelector:{},
    MassagistSchedulesForm:{},MassagistForm:{},MassagistSchedulesTargetShopForm:{},console:{log(){}},
    massagistSchedulesApi:{page}});
  vm.runInContext(script,context);
  return Object.assign(context.options.data(),context.options.methods,{$message:{warning(){},success(){},error(){}},shopId:1});
}
const later=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('late response for an old shop/date cannot replace the current schedule list',async()=>{
  const pending=[];const state=listState(()=>{const d=later();pending.push(d);return d.promise;});
  const a=state.fetchData();const b=state.fetchData();
  pending[1].resolve({data:{list:[{id:2,shopId:2}],total:1}});await b;
  pending[0].resolve({data:{list:[{id:1,shopId:1}],total:9}});await a;
  assert.equal(state.dataList[0].id,2);assert.equal(state.total,1);assert.equal(state.listLoading,false);
});
test('failed schedule list clears stale rows and shows retryable error',async()=>{
  const state=listState(async()=>{throw new Error('合成排班失败');});
  state.dataList=[{id:9,shopId:1}];state.total=1;
  await state.fetchData();
  assert.equal(state.dataList.length,0);assert.equal(state.total,0);assert.match(state.listError,/加载失败/);assert.equal(state.listLoading,false);
  assert.match(source.slice(0,source.indexOf('<script>')),/v-if="listError"[\s\S]*?@click="fetchData"/);
});
