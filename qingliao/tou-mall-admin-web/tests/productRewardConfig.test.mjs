import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/views/goods/product/ProductForm.vue',import.meta.url),'utf8');
function setup(fail=false) {
  let requests=0,loading=0;
  const context=vm.createContext({mapGetters:()=>({}),ShopSelector:{},RoomSelector:{},ProjectSelector:{},CouponSelector:{},
    productApi:{add:async()=>{requests++;if(fail) throw '测试保存失败';},upd:async()=>{},list(){}}});
  const script=source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options =');
  vm.runInContext(script,context);
  const state=Object.assign(context.options.data(),context.options.methods,{
    $refs:{refForm:{validate:async()=>true}},$set:(obj,key,val)=>{obj[key]=val;},
    showFullLoading(){loading++;},hideFullLoading(){loading--;},$notify:{warning(){},success(){}},$emit(){}});
  return {state,requests:()=>requests,loading:()=>loading};
}
test('new product defaults to zero gift months',()=>{
  const {state}=setup();state.open();assert.equal(state.form.rewardMemberMonths,0);
  assert.match(source,/v-model="form.rewardMemberMonths"/);
});
test('existing configured gift months are retained on edit',()=>{
  const {state}=setup();state.open({rewardMemberMonths:3});assert.equal(state.form.rewardMemberMonths,3);
});
test('failed product save releases loading and preserves input',async()=>{
  const {state,loading}=setup(true);state.open({rewardMemberMonths:2});
  await assert.rejects(state.onSubmit(),e=>e==='测试保存失败');
  assert.equal(loading(),0);assert.equal(state.form.rewardMemberMonths,2);
});
test('product save cannot submit twice while pending',async()=>{
  const {state,requests}=setup();state.open();state.submitting=true;
  await state.onSubmit();assert.equal(requests(),0);
});
