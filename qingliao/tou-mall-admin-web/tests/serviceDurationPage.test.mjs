import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/views/statistics/serviceDuration/index.vue',import.meta.url),'utf8');
function setup(api={}){
  const calls=[];let loading=0;
  const ctx=vm.createContext({mapGetters:()=>({}),statisticsApi:{serviceDuration:async p=>{calls.push({...p});return {data:{list:[{massagistId:1}],total:31}};},serviceDurationExport:async p=>calls.push({...p}),...api},dateUtil:{},ServiceDurationDetail:{},ShopSelector:{},AdjustForm:{},MassagistSelector:{},constant:{}});
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','this.options='),ctx);
  const state=Object.assign(ctx.options.data(),ctx.options.methods,{$set:(obj,k,v)=>obj[k]=v,notifyConfirm:async()=>{},showFullLoading:()=>loading++,hideFullLoading:()=>loading--});
  return {state,calls,loading:()=>loading,options:ctx.options};
}
test('default is page one ten rows and cooperating therapists',()=>{const {state}=setup();assert.equal(state.searchForm.page,1);assert.equal(state.searchForm.size,10);assert.equal(state.searchForm.status,1);});
test('reads server page list and total instead of whole array',async()=>{const {state}=setup();await state.fetchData();assert.equal(state.dataList[0].massagistId,1);assert.equal(state.total,31);assert.equal(state.listLoading,false);});
test('filter resets to first page',async()=>{const {state,calls}=setup();state.searchForm.page=4;await state.searchData();assert.equal(state.searchForm.page,1);assert.equal(calls[0].page,1);});
test('page change preserves filters',async()=>{const {state,calls}=setup();state.searchForm.status=0;await state.handleCurrentChange(3);assert.equal(calls[0].page,3);assert.equal(calls[0].status,0);});
test('page size change resets page',async()=>{const {state,calls}=setup();state.searchForm.page=3;await state.handleSizeChange(20);assert.equal(calls[0].page,1);assert.equal(calls[0].size,20);});
test('failure releases spinner and preserves previous results',async()=>{const {state}=setup({serviceDuration:async()=>{throw new Error('failed');}});state.dataList=[{massagistId:9}];await assert.rejects(state.fetchData(),/failed/);assert.equal(state.listLoading,false);assert.equal(state.dataList[0].massagistId,9);});
test('old response cannot replace the newer filter page',async()=>{const releases=[];const {state}=setup({serviceDuration:p=>new Promise(resolve=>releases.push({status:p.status,resolve}))});state.searchForm.status=1;const first=state.fetchData();state.searchForm.status=0;const second=state.fetchData();releases[1].resolve({data:{list:[{massagistId:2}],total:2}});await second;releases[0].resolve({data:{list:[{massagistId:1}],total:9}});await first;assert.equal(state.dataList[0].massagistId,2);assert.equal(state.total,2);});
test('older finally cannot stop newest loading spinner',async()=>{const releases=[];const {state}=setup({serviceDuration:()=>new Promise(resolve=>releases.push(resolve))});const first=state.fetchData(),second=state.fetchData();releases[0]({data:{list:[],total:0}});await first;assert.equal(state.listLoading,true);releases[1]({data:{list:[],total:0}});await second;assert.equal(state.listLoading,false);});
test('export copies current filters and releases loading on error',async()=>{const calls=[];const {state,loading}=setup({serviceDurationExport:async p=>{calls.push(p);throw new Error('export failed');}});state.searchForm.status=0;await assert.rejects(state.exportExcel(),/export failed/);assert.equal(calls[0].status,0);assert.equal(loading(),0);assert.equal(state.exporting,false);});
test('status selector and pagination use established components',()=>{assert.match(source,/<el-pagination/);assert.match(source,/已结束合作/);assert.match(source,/:filter-status="searchForm.status"/);});
