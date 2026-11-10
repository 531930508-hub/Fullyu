import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/order/GiftCustomerCouponForm.vue', import.meta.url), 'utf8');
const progress = await readFile(new URL('../src/views/order/approval/ApprovalProgress.vue', import.meta.url), 'utf8');
function setup(api={}) {
  const calls=[]; let loading=0, successes=0, warnings=[];
  const context=vm.createContext({mapGetters:()=>({}), dateUtil:{},
    giftCustomerCouponApi:{add:async p=>calls.push(p),importExcel:async(...p)=>calls.push(p),template:async()=>calls.push('template'),...api}});
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options ='),context);
  const state=Object.assign(context.options.data(),context.options.methods,{
    userId:7,shopId:5,$nextTick:fn=>fn(),$refs:{refForm:{validate:async()=>true,clearValidate(){},resetFields(){}},refFile:{clearFiles(){}}},
    $message:{warning:msg=>warnings.push(msg)},$notify:{success:()=>successes++},$emit(){},notifyConfirm:async()=>{},
    showFullLoading:()=>loading++,hideFullLoading:()=>loading--});
  return {state,calls,loading:()=>loading,successes:()=>successes,warnings};
}
test('new gift form defaults to zero unit value',()=>assert.equal(setup().state.form.couponAmount,0));
test('opening a new application clears last recipient and amount',()=>{
  const {state}=setup();state.form.phone='13800000001';state.form.couponAmount=97.5;
  state.open();assert.equal(state.form.phone,'');assert.equal(state.form.couponAmount,0);
});
test('old application without value is editable as zero',()=>{
  const {state}=setup();state.open({phone:'13800000001',couponAmount:null});assert.equal(state.form.couponAmount,0);
});
test('value is submitted per coupon without multiplying quantity',async()=>{
  const {state,calls}=setup();state.open();state.form.couponNumber=3;state.form.couponAmount=97.5;
  await state.onSubmit();assert.equal(Number(calls[0].couponAmount),97.5);assert.equal(calls[0].couponNumber,3);
});
test('negative or sub-cent value does not submit despite valid form mock',async()=>{
  for(const value of [-1,0.001,100000000]) {const {state,calls}=setup();state.form.couponAmount=value;
    await state.onSubmit();assert.equal(calls.length,0);}
});
test('single save failure preserves all inputs and releases loading',async()=>{
  const {state,loading,successes}=setup({add:async()=>{throw new Error('save failed');}});state.open();state.form.couponAmount=12.3;
  await assert.rejects(state.onSubmit(),/save failed/);assert.equal(state.dialogVisible,true);assert.equal(state.form.couponAmount,12.3);
  assert.equal(state.submitting,false);assert.equal(loading(),0);assert.equal(successes(),0);
});
test('duplicate submit makes one write and prevents dialog closing while pending',async()=>{
  const releases=[];const {state,calls}=setup({add:p=>{calls.push(p);return new Promise(r=>releases.push(r));}});
  state.open();const first=state.onSubmit();await new Promise(setImmediate);
  const second=state.onSubmit();await new Promise(setImmediate);state.handleClose();
  try { assert.equal(state.dialogVisible,true);assert.equal(calls.length,1); }
  finally { releases.forEach(r=>r());await Promise.allSettled([first,second]); }
  assert.equal(state.dialogVisible,false);
});
test('missing batch file shows warning and never opens confirmation',async()=>{
  const {state,calls,warnings}=setup();state.activeName='second';await state.onSubmit();assert.equal(calls.length,0);assert.equal(warnings.length,1);
});
test('failed batch retains selected file and releases loading',async()=>{
  const {state,loading,successes}=setup({importExcel:async()=>{throw new Error('import failed');}});state.open();state.activeName='second';state.excelFile={raw:{name:'test.xlsx'}};
  await assert.rejects(state.onSubmit(),/import failed/);assert.ok(state.excelFile);assert.equal(state.dialogVisible,true);
  assert.equal(state.submitting,false);assert.equal(loading(),0);assert.equal(successes(),0);
});
test('canceling batch confirmation is a no-op and releases guard',async()=>{
  const {state,calls,loading}=setup();state.activeName='second';state.excelFile={raw:{}};state.notifyConfirm=async()=>{throw 'cancel';};
  await state.onSubmit();assert.equal(calls.length,0);assert.equal(state.submitting,false);assert.equal(loading(),0);
});
test('template download uses actual application API not stale OSS template',async()=>{
  const {state,calls}=setup();await state.downloadTemplate();assert.deepEqual(calls,['template']);assert.doesNotMatch(source,/https:\/\/.*批量|fullytherapy\.oss/);
});
test('approval detail presents unit value and total for approver',()=>{
  assert.match(progress,/label="单券价值"/);assert.match(progress,/label="赠券总价值"/);assert.match(progress,/couponAmount/);
});
test('form explicitly distinguishes configured value from new cash receipt',()=>{
  assert.match(source,/单券价值/);assert.match(source,/不代表新增现金收款/);assert.match(source,/:loading="submitting"/);
});
