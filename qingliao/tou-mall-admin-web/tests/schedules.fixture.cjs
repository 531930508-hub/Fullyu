// Real schedules Vue/Element template and script; all data and writes are synthetic, served on localhost only.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/views/massagist/schedules/index.vue'), 'utf8');
const template = source.match(/<template>([\s\S]*?)<\/template>\s*<script>/)[1];
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'return');
const less = require(path.join(root, 'node_modules/less'));
const globalCSS = require(path.join(root, 'node_modules/sass')).renderSync({file: path.join(root, 'src/styles/index.scss')}).css.toString();
(async () => {
  const css = (await less.render(source.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].replace(/\/deep\//g, ''))).css;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>排班 · 隔离验证</title><link rel="stylesheet" href="/element.css"><style>${globalCSS}\n${css}body{margin:0}header{height:64px;padding:20px;border-bottom:1px solid #ebeef5;box-sizing:border-box}aside{position:absolute;top:64px;bottom:0;width:210px;padding:20px;border-right:1px solid #ebeef5;box-sizing:border-box}main{margin-left:210px;padding-top:20px}</style><div id="app"><header>排班组件验证</header><aside>合成测试导航</aside><main><schedules ref="target"/></main></div><script src="/vue.js"></script><script src="/element.js"></script><script>
  window.fixture={calls:[],errors:[],pending:[],hold:false,fail:false};const f=fixture;
  const store={getters:{shopId:1,shopListAll:[]},dispatch(){}};Vue.prototype.$store=store;
  Vue.config.errorHandler=e=>f.errors.push(e.message);
  Vue.mixin({methods:{notifyDelete:()=>Promise.resolve(),notifySuccess(){}}});
  Vue.filter('shopNameFilter',id=>({1:'合成一店',2:'合成二店'})[id]||'');
  const shops=[{id:1,name:'合成一店'},{id:2,name:'合成二店'}];
  Vue.component('shop-selector',{props:['value','placeholder'],template:'<el-select :value="value" :placeholder="placeholder" @change="v=>{$emit(\\'input\\',v);$emit(\\'change\\',v)}"><el-option v-for="s in shops" :key="s.id" :value="s.id" :label="s.name"/></el-select>',data:()=>({shops})});
  Vue.component('massagist-selector',{props:['value','placeholder','shopId','filterStatus','clearable'],template:'<el-select :value="value" :placeholder="placeholder" :clearable="clearable" @change="v=>$emit(\\'input\\',v)"><el-option :value="7" label="合成疗愈师7"/></el-select>'});
  const blank={template:'<div hidden></div>',methods:{open(){}}};
  const rows=shop=>Array.from({length:10},(_,i)=>({id:shop*100+i,shopId:shop,targetShopId:i===0?2:0,schedulesType:i===0?1:0,massagistName:'合成疗愈师'+(i+1),day:'2026-11-08',sequence:i+1,startTime:'10:00:00',endTime:'22:00:00'}));
  const massagistSchedulesApi={page:params=>{const p={...params};f.calls.push(p);return new Promise((resolve,reject)=>{const settle=()=>f.fail?reject(new Error('合成排班失败')):resolve({data:{list:rows(p.shopId),total:37}});if(f.hold)f.pending.push(settle);else settle();});},clearFuture:async()=>({data:0}),changeLogs:async()=>({data:{list:[],total:0}}),remove:async()=>({})};
  const dateUtil={getCurrentDateCode:()=>'2026-11-08'};const mapGetters=keys=>Object.fromEntries(keys.map(k=>[k,function(){return this.$store.getters[k];}]));
  const options=new Function('mapGetters','massagistSchedulesApi','dateUtil','MassagistSortDrawer','MassagistSelector','ShopSelector','MassagistSchedulesForm','MassagistForm','MassagistSchedulesTargetShopForm',${JSON.stringify(script).replace(/</g, '\\u003c')})(mapGetters,massagistSchedulesApi,dateUtil,blank,Vue.component('massagist-selector'),Vue.component('shop-selector'),blank,blank,blank);
  delete options.components.MassagistSelector;delete options.components.ShopSelector;
  options.template=${JSON.stringify(template.trim()).replace(/</g, '\\u003c')};Vue.component('schedules',options);
  window.app=new Vue({el:'#app'});f.page=()=>app.$refs.target;
  </script></html>`;
  const assets={'/vue.js':'node_modules/vue/dist/vue.js','/element.js':'node_modules/element-ui/lib/index.js','/element.css':'node_modules/element-ui/lib/theme-chalk/index.css','/fonts/element-icons.woff':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff','/fonts/element-icons.ttf':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf'};
  http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1').pathname;if(url==='/schedules'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}if(url==='/favicon.ico'){res.writeHead(204);return res.end();}if(!assets[url]){res.writeHead(404);return res.end();}res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(path.join(root,assets[url])).pipe(res);}).listen(19393,'127.0.0.1',()=>console.log('Schedules fixture ready: http://127.0.0.1:19393/schedules'));
})().catch(error=>{console.error(error);process.exitCode=1;});
