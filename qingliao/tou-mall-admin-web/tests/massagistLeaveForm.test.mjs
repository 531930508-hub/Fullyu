import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/massagist/leave/MassagistLeaveForm.vue', import.meta.url), 'utf8');
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(add = async () => ({data:{id:50}})) {
  const calls=[],loading=[],events=[],notices=[];
  const context=vm.createContext({mapGetters:()=>({}),console,massagistLeaveApi:{add:async data=>{calls.push(data);return add(data);}}});
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options='),context);
  const state=Object.assign(context.options.data(),context.options.methods,{shopId:2,userId:8,massagistId:7,
    shopList:[{id:1,clockInTime:'10:00:00',clockOutTime:'22:00:00'},{id:2,clockInTime:'09:00:00',clockOutTime:'21:00:00'}],
    $set:(object,key,value)=>object[key]=value,$nextTick:fn=>fn(),$refs:{refForm:{validate:async()=>true,clearValidate:()=>{}}},
    showFullLoading:()=>loading.push('show'),hideFullLoading:()=>loading.push('hide'),
    $notify:{success:text=>notices.push(text)},$emit:event=>events.push(event)});
  return {state,calls,loading,events,notices,options:context.options};
}
const valid={dates:['2026-11-09','2026-11-11'],startTime:'14:00',endTime:'16:00',marks:'合成测试休息'};
test('edit preserves saved hours instead of resetting them to store opening hours',()=>{
  const {state}=setup();state.open({...valid,id:50,datesStr:valid.dates.join(','),startTime:'14:00:00',endTime:'16:00:00'});
  assert.equal(state.form.startTime,'14:00');assert.equal(state.form.endTime,'16:00');
  assert.equal(state.clockInTime,'09:00');assert.equal(state.clockOutTime,'21:00');
});
test('new request defaults to the linked store not the first store in the list',()=>{
  const {state}=setup();state.open();assert.equal(state.form.startTime,'09:00');assert.equal(state.form.endTime,'21:00');
});
test('open clones selected dates rather than mutating the list record',()=>{
  const {state}=setup();const dates=[...valid.dates];state.open({...valid,dates});state.form.dates.push('2026-11-12');assert.equal(dates.length,2);
});
test('failed save preserves draft and releases loading with a visible retryable error',async()=>{
  const {state,calls,loading,events}=setup(async()=>{throw new Error('合成保存失败');});state.open({...valid});
  assert.equal(await state.onSubmit(),false);assert.equal(state.submitting,false);assert.equal(state.dialogVisible,true);
  assert.equal(state.form.marks,valid.marks);assert.match(state.submitError,/合成保存失败/);
  assert.deepEqual(loading,['show','hide']);assert.equal(calls.length,1);assert.equal(events.length,0);
});
test('duplicate submit is locked before asynchronous validation completes',async()=>{
  const d=deferred();const {state,calls}=setup();state.open({...valid});state.$refs.refForm.validate=()=>d.promise;
  const first=state.onSubmit();const second=state.onSubmit();assert.equal(state.submitting,true);d.resolve(true);await Promise.all([first,second]);assert.equal(calls.length,1);
});
test('pending write prevents cancel or replacing the draft with another request',async()=>{
  const d=deferred();const {state,calls}=setup(()=>d.promise);state.open({...valid});const writing=state.onSubmit();
  for(let i=0;i<20&&calls.length===0;i++) await Promise.resolve();assert.equal(calls.length,1);state.handleClose();state.open({...valid,marks:'另一个申请'});
  assert.equal(state.dialogVisible,true);assert.equal(state.form.marks,valid.marks);assert.equal(calls.length,1);
  d.resolve({data:{id:50}});await writing;
});
test('successful save writes captured identity and dates once then closes and emits once',async()=>{
  const {state,calls,loading,events,notices}=setup();state.open({...valid});assert.equal(await state.onSubmit(),true);
  assert.equal(calls.length,1);assert.equal(calls[0].shopId,2);assert.equal(calls[0].createUser,8);assert.equal(calls[0].massagistId,7);
  assert.equal(Array.from(calls[0].dates).join(','),valid.dates.join(','));assert.equal(state.dialogVisible,false);
  assert.deepEqual(events,['submit-success']);assert.equal(notices.length,1);assert.deepEqual(loading,['show','hide']);
});
test('equal or reversed times are rejected without any API write',async()=>{
  const {state,calls}=setup();for(const endTime of ['14:00','13:30']) {state.open({...valid,endTime});assert.equal(await state.onSubmit(),false);}
  assert.equal(calls.length,0);assert.match(state.submitError,/结束时间必须晚于开始时间/);
});
test('missing linked identity cannot submit a request',async()=>{
  const {state,calls}=setup();state.open({...valid});state.massagistId=0;assert.equal(await state.onSubmit(),false);assert.equal(calls.length,0);
});
test('form validation rejection releases submit lock without showing global loading',async()=>{
  const {state,calls,loading}=setup();state.open({...valid});state.$refs.refForm.validate=async()=>{throw new Error('validation');};
  assert.equal(await state.onSubmit(),false);assert.equal(state.submitting,false);assert.equal(calls.length,0);assert.equal(loading.length,0);
});
test('failure can retry the same preserved draft and clear the old error on success',async()=>{
  let count=0;const {state,calls}=setup(async()=>{if(++count===1)throw new Error('合成第一次失败');return {data:{id:50}};});state.open({...valid});
  await state.onSubmit();assert.equal(state.dialogVisible,true);assert.equal(await state.onSubmit(),true);assert.equal(calls.length,2);assert.equal(state.submitError,'');
});
test('template uses cooperation wording and exposes saving and error states',()=>{
  const template=source.split('</template>')[0];assert.doesNotMatch(template,/请假|在职|离职/);assert.match(template,/申请休息/);
  assert.match(template,/:loading="submitting"/);assert.match(template,/:disabled="submitting"/);assert.match(template,/submitError/);
});
