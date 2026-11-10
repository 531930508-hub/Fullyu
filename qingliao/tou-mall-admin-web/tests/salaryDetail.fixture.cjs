// Real salary-detail Vue/Element template and script; all data and writes are synthetic.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/views/statistics/salaryDetail/index.vue'), 'utf8');
const template = source.match(/<template>([\s\S]*?)<\/template>\s*<script>/)[1];
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'return');
const less = require(path.join(root, 'node_modules/less'));
const globalCSS = require(path.join(root, 'node_modules/sass')).renderSync({file: path.join(root, 'src/styles/index.scss')}).css.toString();
(async () => {
  const css = (await less.render(source.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].replace(/\/deep\//g, ''))).css;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>结算详情 · 隔离验证</title><link rel="stylesheet" href="/element.css"><style>${globalCSS}\n${css}body{margin:0}header{height:64px;padding:20px;border-bottom:1px solid #ebeef5}aside{position:absolute;top:64px;bottom:0;width:220px;padding:20px;border-right:1px solid #ebeef5}main{margin-left:220px;padding-top:20px}.fixture-label{padding:0 20px;color:#606266}</style><div id="app"><header>结算详情组件验证</header><aside>合成测试导航</aside><main><p class="fixture-label">真实 Vue 2 + Element UI；仅合成数据，不访问业务接口。</p><salary-detail ref="target"/></main></div><script src="/vue.js"></script><script src="/element.js"></script><script>
  window.fixture={calls:[],errors:[],pending:[],pendingWrites:[],hold:null,peopleFail:false,monthsFail:false,infoFail:false,resetFail:false,holdWrite:false,writes:[],effects:0,loading:0};const f=fixture;
  const store={getters:Vue.observable({roles:['财务'],massagistId:7})};Vue.prototype.$store=store;
  Vue.mixin({methods:{notifyConfirm:text=>ELEMENT.MessageBox.confirm(text,'重新结算'),notifyWarning:text=>ELEMENT.Message.warning(text),showFullLoading(){f.loading++;},hideFullLoading(){f.loading--;}}});
  Vue.config.errorHandler=e=>f.errors.push(e.message);
  Vue.filter('massagistNameFilter',id=>id?'合成疗愈师'+id:'未关联疗愈师');
  const mapGetters=keys=>Object.fromEntries(keys.map(key=>[key,function(){return this.$store.getters[key];}]));
  const persons=Array.from({length:61},(_,i)=>({id:i+1,name:'合成疗愈师'+(i+1),status:i<55?1:i<59?0:2,shopId:5}));
  const months=id=>id===9?[]:id===8?['2026-09']:['2026-10','2026-09'];
  const resets=new Map();const record=p=>({massagistId:p.massagistId,monthCode:p.monthCode,actualIncome:1000+Number(p.massagistId)*10+(resets.get(p.massagistId+'|'+p.monthCode)||0)*100,preTaxIncome:1200,payableIncomeTax:100,totalDuration:180,coefficient:1.4,salary:252,otherAmount:20,totalSalary:1200,totalAnnualTaxableIncome:1000,taxRate:3,quickDeduction:0,totalPaidTax:100,receptionCapApplied:true,receptionDuration:200,receptionCountedDuration:100,receptionExcessDuration:100});
  const read=(kind,params,result)=>{const p={...params};f.calls.push({kind,...p});return new Promise((resolve,reject)=>{const settle=()=>f[kind+'Fail']?reject(new Error('合成'+kind+'失败')):resolve({data:result(p)});if(f.hold===kind)f.pending.push({kind,p,settle});else settle();});};
  const massagistApi={page:params=>read('people',params,p=>{const all=persons.filter(person=>(p.status===undefined||person.status===p.status)&&(!p.name||person.name.includes(p.name)));return {list:all.slice((p.page-1)*p.size,p.page*p.size),total:all.length};})};
  const salaryRecordApi={people:massagistApi.page,findMassagistAllMonthCode:id=>read('months',{id},p=>months(p.id)),info:params=>read('info',params,record),reset:params=>{const p={...params};f.writes.push(p);return new Promise((resolve,reject)=>{const settle=()=>{if(f.resetFail)return reject(new Error('合成重新结算失败'));const key=p.massagistId+'|'+p.monthCode;resets.set(key,(resets.get(key)||0)+1);f.effects++;resolve({data:{}});};if(f.holdWrite)f.pendingWrites.push({p,settle});else settle();});}};
  const SalaryOtherAmountDialog={template:'<div hidden></div>'};const options=new Function('mapGetters','salaryRecordApi','massagistApi','SalaryOtherAmountDialog',${JSON.stringify(script).replace(/</g, '\\u003c')})(mapGetters,salaryRecordApi,massagistApi,SalaryOtherAmountDialog);options.template=${JSON.stringify(template).replace(/</g, '\\u003c')};Vue.component('salary-detail',options);
  window.app=new Vue({el:'#app'});f.page=()=>app.$refs.target;f.roles=roles=>{store.getters.roles=roles;};f.persistedRecord=record;
  </script></html>`;
  const assets={'/vue.js':'node_modules/vue/dist/vue.js','/element.js':'node_modules/element-ui/lib/index.js','/element.css':'node_modules/element-ui/lib/theme-chalk/index.css','/fonts/element-icons.woff':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff','/fonts/element-icons.ttf':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf'};
  http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1').pathname;if(url==='/salary'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}if(url==='/favicon.ico'){res.writeHead(204);return res.end();}if(!assets[url]){res.writeHead(404);return res.end();}res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(path.join(root,assets[url])).pipe(res);}).listen(19392,'127.0.0.1',()=>console.log('Salary fixture ready: http://127.0.0.1:19392/salary'));
})().catch(error=>{console.error(error);process.exitCode=1;});
