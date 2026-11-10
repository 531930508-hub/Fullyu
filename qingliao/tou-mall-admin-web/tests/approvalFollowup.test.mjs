import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const sources = await Promise.all(['../src/views/ums/approvalCategory/ApprovalCategoryForm.vue',
  '../src/views/order/approval/ApprovalProgress.vue', '../src/views/order/approval/index.vue',
  '../src/consts/constant.js'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
function setup(index, api={}) {
  const calls=[];let loading=0;
  const context=vm.createContext({mapGetters:()=>({}),ShopSelector:{},AdminUserSelector:{},DescriptionTitle:{},
    ApprovalRefundApply:{},ApprovalProgress:{},RefundForm:{},ApprovalCategorySelector:{},MassagistLeaveForm:{},
    FlowNodeCard:{},console:{log(){}},dateUtil:{},massagistLeaveApi:{},
    massagistApi:{identityOptions:async()=>({data:[]})},
    approvalCategoryApi:{add:async p=>calls.push(p),update:async p=>calls.push(p),...api},
    approvalDetailApi:{list:async()=>({data:[]}),findApprovalCategoryDetail:async()=>({data:{}}),
      page:async()=>({data:{list:[],total:0}}),pass:async(id)=>calls.push(id),reject:async(id)=>calls.push(id),...api}});
  const script=sources[index].match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options =');
  vm.runInContext(script,context);
  const state=Object.assign(context.options.data(),context.options.methods,{
    $options:context.options,$refs:{refForm:{validate:async()=>true}},$set:(o,k,v)=>{o[k]=v;},
    constant:{approvalStateMap:{approving:2,passed:3,rejected:0},flowUserTypeMap:{cc:3,create:1,approval:2}},
    $prompt:async()=>({value:'需要进一步跟进'}),notifyConfirm:async()=>{},$notify:{success(){}},notifySuccess(){},$emit(){},
    $message:{warning(){}},
    showFullLoading(){loading++;},hideFullLoading(){loading--;}});
  state.$options.filters={adminUsernameFilter:id=>String(id)};
  return {state,calls,loading:()=>loading,options:context.options};
}
test('low-rating category can be configured from actual category selector',()=>{
  assert.match(sources[3],/value: 'lowRating'/);
});
test('new approval configuration defaults to global scope and optional cc',()=>{
  const {state}=setup(0);state.open({code:'lowRating'});
  assert.equal(state.form.shopId,null);assert.equal(state.form.ccIdList.length,0);
  assert.equal(state.form.nodes.length,1);
  assert.equal(state.form.nodes[0].approveMode,'ANY');
  assert.equal(state.form.nodes[0].targets[0].type,'IDENTITY');
  assert.equal(state.form.nodes[0].targets[0].scope,'SHOP');
});
test('failed approval configuration keeps input and releases loading',async()=>{
  const {state,loading}=setup(0,{add:async()=>{throw new Error('save failed');}});
  state.open({code:'lowRating'});
  state.form.nodes=[{nodeName:'审批节点1',approveMode:'ANY',
    targets:[{type:'IDENTITY',code:'SHOP_MANAGER',scope:'SHOP'}]}];
  await assert.rejects(state.onSubmit(),/save failed/);
  assert.equal(loading(),0);assert.equal(state.dialogVisible,true);assert.equal(state.submitting,false);
  assert.equal(state.form.nodes.length,1);
});
test('duplicate approval configuration submission is guarded',async()=>{
  const {state,calls}=setup(0);state.submitting=true;await state.onSubmit();assert.equal(calls.length,0);
});
test('approval drawer displays original low-star feedback',()=>{
  assert.match(sources[1],/detailData.businessType === 'lowRating'/);
  assert.match(sources[1],/prop="comment"/);
});
test('drawer rejection uses selected node not unrelated list row',async()=>{
  const {state,calls}=setup(1);state.approvalDetail={id:99};state.fetch=async()=>{};
  await state.rejected({id:5});assert.deepEqual(calls,[5]);
});
test('drawer rejection failure is not swallowed and releases loading',async()=>{
  const {state,loading}=setup(1,{reject:async()=>{throw new Error('reject failed');}});
  state.approvalDetail={id:99};state.fetch=async()=>{};
  await assert.rejects(state.rejected({id:5}),/reject failed/);assert.equal(loading(),0);
});
test('drawer ignores responses from previously opened approval',async()=>{
  let release;
  const {state}=setup(1,{list:params=>params.approvalId===1 ? new Promise(r=>{release=r;}) : Promise.resolve({data:[{approvalId:2}]}),
    findApprovalCategoryDetail:async id=>({data:{orderId:id}})});
  state.buildApprovalUsers=rows=>{state.seenApproval=rows[0].approvalId;};
  state.approval={id:1};const first=state.fetch();
  state.approval={id:2};await state.fetch();
  release({data:[{approvalId:1}]});await first;
  assert.equal(state.detailData.orderId,2);assert.equal(state.seenApproval,2);
});
test('approval pages default to small page size across tabs',()=>{
  const {state,options}=setup(2);state.userId=10;state.fetchData=()=>{};
  options.watch.activeName.handler.call(state,'third');
  assert.equal(state.searchForm.size,10);assert.equal(state.searchForm.page,1);
});
test('drawer shows therapist name with id fallback',()=>{
  assert.match(sources[1],/scope.row.massagistName/);
  assert.match(sources[1],/scope.row.massagistId/);
});
test('list rejection failure is surfaced and releases submitting',async()=>{
  const {state}=setup(2,{reject:async()=>{throw new Error('reject failed');}});
  state.searchData=async()=>{};
  await assert.rejects(state.rejected({id:5}),/reject failed/);
  assert.equal(state.submitting,false);
});
test('batch pass failure releases full loading without success notification',async()=>{
  const {state,loading}=setup(2,{pass:async()=>{throw new Error('pass failed');}});
  let success=0;state.notifySuccess=()=>{success++;};state.selectIdList=[5,6];state.searchData=async()=>{};
  await assert.rejects(state.handlePass(1),/pass failed/);
  assert.equal(loading(),0);assert.equal(state.submitting,false);assert.equal(success,0);
});
test('batch rejection failure is surfaced and releases loading',async()=>{
  const {state,loading}=setup(2,{reject:async()=>{throw new Error('reject failed');}});
  state.selectIdList=[5,6];state.searchData=async()=>{};
  await assert.rejects(state.handlePass(0),/reject failed/);
  assert.equal(loading(),0);assert.equal(state.submitting,false);
});
test('batch captures selection before confirmation and blocks double submission',async()=>{
  const {state,calls}=setup(2);let release;
  state.selectIdList=[5,6];state.searchData=async()=>{};
  state.notifyConfirm=()=>new Promise(resolve=>{release=resolve;});
  const first=state.handlePass(1);state.selectIdList=[99];
  assert.equal(state.submitting,true);
  await state.handlePass(1);release();await first;
  assert.deepEqual(calls,[5,6]);
});
test('canceling list rejection performs no write',async()=>{
  const {state,calls}=setup(2);state.$prompt=async()=>{throw 'cancel';};
  await state.rejected({id:5});assert.equal(calls.length,0);assert.equal(state.submitting,false);
});
test('approval page failure releases list loading',async()=>{
  const {state,loading}=setup(2,{page:async()=>{throw new Error('list failed');}});
  await assert.rejects(state.fetchData(),/list failed/);assert.equal(loading(),0);assert.equal(state.listLoading,false);
});
