// Actual Vue/Element page and selectors; synthetic local API, not a running business backend.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),less=require(path.join(root,'node_modules/less')),sass=require(path.join(root,'node_modules/sass'));
(async()=>{
  const sources={Duration:'src/views/statistics/serviceDuration/index.vue',ShopSelector:'src/views/shop/shopList/ShopSelector.vue',MassagistSelector:'src/views/massagist/management/MassagitSelector.vue'};
  const payload={},css=[];
  for(const [name,file] of Object.entries(sources)){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    payload[name]={template:text.match(/<template>([\s\S]*?)<\/template>\s*<script>/)[1],script:text.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','return')};
    const style=text.match(/<style[^>]*>([\s\S]*?)<\/style>/);if(style)css.push((await less.render(style[1])).css);
  }
  const globalCSS=sass.renderSync({file:path.join(root,'src/styles/index.scss')}).css.toString();
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>服务时长 · 隔离组件测试</title><link rel="stylesheet" href="/element.css"><style>${globalCSS}\n${css.join('\n')}body{margin:0}header{height:64px;padding:20px;border-bottom:1px solid #ebeef5}aside{position:absolute;top:64px;bottom:0;width:220px;padding:20px;border-right:1px solid #ebeef5}main{margin-left:220px;padding-top:20px}.fixture-label{padding:0 20px 20px;color:#606266}.index{letter-spacing:.05em}</style><div id="app"><header>服务时长组件验证</header><aside>合成测试导航</aside><main><p class="fixture-label">真实 Vue 2 + Element UI；合成数据，仅访问本机。</p><duration ref="duration"></duration></main></div><script src="/vue.js"></script><script src="/element.js"></script><script>
  const payload=${JSON.stringify(payload).replace(/</g,'\\u003c')};
  window.fixture={calls:[],errors:[],pending:[],hold:false,fail:false,exportFail:false,exports:[],loading:0};const f=fixture;
  const persons=Array.from({length:31},(_,i)=>({id:i+1,name:'合成疗愈师'+(i+1),status:i<23?1:i<29?0:2,shopId:5}));
  const store={getters:{userId:9,roles:['运营'],massagistId:null,shopId:5,shopList:[{id:5,name:'合成门店',status:1}],massagistList:persons},dispatch:async()=>{}};Vue.prototype.$store=store;Vue.prototype.constant={shopStatusMap:{available:1}};
  Vue.mixin({methods:{notifyConfirm:text=>ELEMENT.MessageBox.confirm(text,'确认'),showFullLoading(){f.loading++;},hideFullLoading(){f.loading--;}}});
  Vue.config.errorHandler=e=>{f.errors.push(e.message);ELEMENT.Message.error(e.message);};
  Vue.filter('jobStatusFilter',value=>({0:'已结束合作',1:'合作中',2:'暂停合作'}[value]));Vue.filter('shopStatusFilter',()=> '可用');Vue.filter('shopNameFilter',()=> '合成门店');Vue.filter('massagistNameFilter',id=>'合成疗愈师'+id);
  const mapGetters=keys=>Object.fromEntries(keys.map(key=>[key,function(){return this.$store.getters[key];}]));
  const dateUtil={getCurrentMonthCode:()=> '2026-11',getCurrentDateCode:()=> '2026-11-08'};
  const statisticsApi={serviceDuration:params=>{const p={...params};f.calls.push(p);return new Promise((resolve,reject)=>{const settle=()=>{if(f.fail)return reject(new Error('合成查询失败'));const all=persons.filter(m=>(p.status===-1||m.status===p.status)&&(!p.massagistId||m.id===p.massagistId));resolve({data:{total:all.length,list:all.slice((p.page-1)*p.size,p.page*p.size).map(m=>({shopId:5,massagistId:m.id,periodCode:'2026-11',serviceCount:3,dateRangeWorkTime:40,serviceDuration:180,receptionDuration:30,serviceWorkingHours:180,receptionWorkingHours:20,adjustDuration:0,totalWorkingHours:200}))}});};if(f.hold)f.pending.push({p,settle});else settle();});},serviceDurationExport:async p=>{f.exports.push({...p});if(f.exportFail)throw new Error('合成导出失败');}};
  const refs={template:'<span></span>',methods:{open(){}}};const components={};
  for(const name of ['ShopSelector','MassagistSelector','Duration']){const deps={mapGetters,dateUtil,statisticsApi,ShopSelector:components.ShopSelector,MassagistSelector:components.MassagistSelector,ServiceDurationDetail:refs,AdjustForm:refs,constant:{adjustStatus:[{}, {value:1}]}};const options=new Function(...Object.keys(deps),payload[name].script)(...Object.values(deps));options.template=payload[name].template;components[name]=options;Vue.component(name,options);}
  window.app=new Vue({el:'#app'});f.page=()=>app.$refs.duration;f.release=()=>{const pending=f.pending.splice(0);pending.forEach(item=>item.settle());};
  </script></html>`;
  const assets={'/vue.js':'node_modules/vue/dist/vue.js','/element.js':'node_modules/element-ui/lib/index.js','/element.css':'node_modules/element-ui/lib/theme-chalk/index.css','/fonts/element-icons.woff':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff','/fonts/element-icons.ttf':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf'};
  http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1').pathname;if(url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}if(url==='/favicon.ico'){res.writeHead(204);return res.end();}const file=assets[url];if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(path.join(root,file)).pipe(res);}).listen(19390,'127.0.0.1',()=>console.log('Duration fixture ready: http://127.0.0.1:19390'));
})().catch(e=>{console.error(e);process.exitCode=1;});
