// Real Vue 2 / Element UI components, synthetic APIs; never access business services.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), sass = require(path.join(root, 'node_modules/sass'));
const payload = {}, styles = [];
for (const [name, file] of Object.entries({BoardDrawer: 'src/views/incentive/dashboard/BoardDrawer.vue', Dashboard: 'src/views/incentive/dashboard/index.vue', Training: 'src/views/incentive/training/index.vue'})) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  payload[name] = {template: source.match(/<template>([\s\S]*?)<\/template>\s*<script>/)[1],
    script: source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'return')};
  styles.push(sass.renderSync({data: source.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]}).css.toString().replace(/::v-deep\s*/g, ''));
}
const format = fs.readFileSync(path.join(root, 'src/views/incentive/format.js'), 'utf8').replace(/export /g, '');
const globalCSS = sass.renderSync({file: path.join(root, 'src/styles/index.scss')}).css.toString();
const html = kind => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>奖励与培训 · 隔离组件验证</title><link rel="stylesheet" href="/element.css"><style>${globalCSS}\n${styles.join('\n')}body{margin:0}header{height:64px;padding:20px;border-bottom:1px solid #ebeef5}aside{position:absolute;top:64px;bottom:0;width:220px;padding:20px;border-right:1px solid #ebeef5}main{margin-left:220px;padding-top:20px}.fixture-label{padding:0 20px;color:#606266}</style><div id="app"><header>奖励与培训组件验证</header><aside>合成测试导航</aside><main><p class="fixture-label">真实 Vue 2 + Element UI；仅合成数据，不访问业务接口。</p><${kind} ref="target"></${kind}></main></div><script src="/vue.js"></script><script src="/element.js"></script><script>
${format}
const payload=${JSON.stringify(payload).replace(/</g, '\\u003c')};
window.fixture={calls:[],errors:[],pending:[],pendingWrites:[],hold:false,holdWrite:false,readFail:false,saveFail:false,deleteFail:false,exportFail:false,exports:[],writes:[],downloads:[],loading:0};const f=fixture;
const store={getters:Vue.observable({roles:['运营']})};Vue.prototype.$store=store;Vue.prototype.$router={push:()=>{}};
Vue.mixin({methods:{notifyConfirm:(text,title)=>ELEMENT.MessageBox.confirm(text,title||'确认'),notifyWarning:text=>ELEMENT.Message.warning(text),notifySuccess:text=>ELEMENT.Message.success(text),showFullLoading(){f.loading++;},hideFullLoading(){f.loading--;}}});
Vue.config.errorHandler=e=>{f.errors.push(e.message);ELEMENT.Message.error(e.message);};
const mapGetters=keys=>Object.fromEntries(keys.map(key=>[key,function(){return this.$store.getters[key];}]));
const persons=Array.from({length:61},(_,i)=>({massagistId:i+1,massagistName:'合成疗愈师'+(i+1),shopId:5,shopName:'合成门店',status:i<55?1:i<59?0:2,cooperationStatus:i<55?'合作中':i<59?'已结束合作':'暂停合作'}));
const projects=Array.from({length:8},(_,i)=>({projectKey:'p'+i,projectGroup:'合成组',projectName:'合成项目'+(i+1),projectId:101+i,durationMinutes:60,enabled:1,targetCount:50,amount:100}));
const certificates=new Map();for(const person of persons)if(person.massagistId%2)certificates.set(person.massagistId+'|p0',{certId:person.massagistId*10,projectKey:'p0',passedAt:'2026-01-01',remark:''});
const rows=params=>persons.filter(p=>(params.status===-1||p.status===params.status)&&(!params.keyword||p.massagistName.includes(params.keyword)));
const trainingRow=person=>{const certs=projects.map(p=>({...p,...(certificates.get(person.massagistId+'|'+p.projectKey)||{certId:null,passedAt:null})}));return {...person,certs,certifiedCount:certs.filter(c=>c.certId).length,progress:certs.map(c=>({projectKey:c.projectKey,status:c.certId?'completed-this-month':'uncertified',count:c.certId?50:0,target:50,earnedAmount:c.certId?'100.00':'0.00',progressPercent:c.certId?100:0,passedAt:c.passedAt}))};};
const board=person=>({...person,month:'2026-11',cutoff:'2026-11-08',currentMonth:true,joinDays:365,warnings:[],base:{minutes:180,coefficient:1,amount:180,bands:[]},training:{earnedAmount:100,projects:trainingRow(person).progress,projectCount:8,completedCount:1},repurchase:{totalAmount:20,potentialAmount:20,retentionRate:80,retentionThreshold:60,retentionEligible:true,conversionRate:50,tenDayRecords:[]},manager:{totalAmount:0,manager:false},settlement:{subtotal:300,net:280,tax:20,preTax:300,adjustment:0}});
const read=(kind,params,result)=>{const p={...params};f.calls.push({kind,...p});return new Promise((resolve,reject)=>{const settle=()=>f.readFail?reject(new Error('合成查询失败')):resolve({data:result(p)});if(f.hold)f.pending.push({kind,p,settle});else settle();});};
const write=(kind,value,update)=>{f.writes.push({kind,value:JSON.parse(JSON.stringify(value))});return new Promise((resolve,reject)=>{const settle=()=>{if((kind==='save'&&f.saveFail)||(kind==='delete'&&f.deleteFail))return reject(new Error('合成'+(kind==='save'?'保存':'撤销')+'失败'));update();resolve({data:{}});};if(f.holdWrite)f.pendingWrites.push({kind,settle});else settle();});};
const incentiveApi={shops:async()=>({data:[{id:5,name:'合成门店'}]}),config:async()=>({data:{trainingProjects:projects,tiers:[]}}),
trainingRecords:params=>read('training',params,p=>{const all=rows(p);return {list:all.slice((p.page-1)*p.size,p.page*p.size).map(trainingRow),total:all.length,pageNum:p.page,pageSize:p.size,cutoff:'2026-11-08',shopId:5,trainingProjects:projects};}),
dashboard:params=>read('dashboard',params,p=>{const all=rows(p);return {therapists:all.slice((p.page-1)*p.size,p.page*p.size).map(board),therapistCount:all.length,totalSettlement:all.length*300,totalBase:all.length*180,totalTraining:all.length*100,totalRepurchase:all.length*20,totalManager:0,cutoff:'2026-11-08',warnings:[]};}),
board:params=>read('board',params,p=>board(persons.find(person=>person.massagistId===p.massagistId))),
saveTrainingRecord:params=>write('save',params,()=>certificates.set(params.massagistId+'|'+params.projectKey,{...params,certId:params.massagistId*10+Number(params.projectKey.slice(1))})),
deleteTrainingRecord:id=>write('delete',id,()=>{for(const [key,cert]of certificates)if(cert.certId===id)certificates.delete(key);}),
exportCsv:async params=>{f.exports.push({...params});if(f.exportFail)throw new Error('合成导出失败');return {data:'合成导出'};}};
const saveAs=(blob,filename)=>f.downloads.push(filename);const components={};
for(const name of ['BoardDrawer','Dashboard','Training']){const deps={mapGetters,incentiveApi,money,trainingStatus,decimal,percent,numberValue,saveAs,BoardDrawer:components.BoardDrawer};const options=new Function(...Object.keys(deps),payload[name].script)(...Object.values(deps));options.template=payload[name].template;components[name]=options;Vue.component(name,options);}
window.app=new Vue({el:'#app'});f.page=()=>app.$refs.target;f.roles=roles=>{store.getters.roles=roles;};
</script></html>`;
const assets={'/vue.js':'node_modules/vue/dist/vue.js','/element.js':'node_modules/element-ui/lib/index.js','/element.css':'node_modules/element-ui/lib/theme-chalk/index.css','/fonts/element-icons.woff':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff','/fonts/element-icons.ttf':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf'};
http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1').pathname;
  if(url==='/training'||url==='/dashboard'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html(url.slice(1)));}
  if(url==='/favicon.ico'){res.writeHead(204);return res.end();}const file=assets[url];if(!file){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(path.join(root,file)).pipe(res);
}).listen(19391,'127.0.0.1',()=>console.log('Incentive fixture ready: http://127.0.0.1:19391/training'));
