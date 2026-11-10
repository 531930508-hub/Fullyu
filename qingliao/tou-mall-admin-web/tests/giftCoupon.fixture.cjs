// Local-only synthetic API fixture. Loads unchanged production Vue/Element components.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const less = require(path.join(root, 'node_modules/less'));
const sass = require(path.join(root, 'node_modules/sass'));
(async () => {
  const files = {GiftCustomerCouponForm:'src/views/order/GiftCustomerCouponForm.vue',
    ApprovalProgress:'src/views/order/approval/ApprovalProgress.vue',DescriptionTitle:'src/views/order/approval/DescriptionTitle.vue'};
  const payload = {}, css = [];
  for (const [name, file] of Object.entries(files)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    payload[name] = {template:source.match(/<template>([\s\S]*?)<\/template>\s*<script>/)[1],
      script:source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g,'').replace('export default','return')};
    const style = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (style) css.push((await less.render(style[1].replace(/::v-deep\s*/g,''))).css);
  }
  const globalCSS = sass.renderSync({file:path.join(root,'src/styles/index.scss')}).css.toString();
  const constant = fs.readFileSync(path.join(root,'src/consts/constant.js'),'utf8').replace('export default','return');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>赠券组件 · 隔离合成测试</title>
<link rel="stylesheet" href="/element.css"><style>${globalCSS}\n${css.join('\n')}body{margin:0;background:#f7f8fa}main{padding:24px}header{padding:20px;background:white}.fixture-label{color:#606266;margin-bottom:20px}</style>
<div id="app"><header>赠券组件测试</header><main><p class="fixture-label">真实 Vue 2 + Element UI；合成客户、审批与 API，仅访问本机，不连接业务服务。</p><el-button id="open-gift" @click="open">新增送券申请</el-button><el-button id="open-detail" @click="detail">送券审批详情</el-button><gift-customer-coupon-form ref="form"></gift-customer-coupon-form><approval-progress ref="progress"></approval-progress></main></div>
<script src="/vue.js"></script><script src="/element.js"></script><script>
const payload=${JSON.stringify(payload).replace(/</g,'\\u003c')};const constant=new Function(${JSON.stringify(constant)})();
window.fixture={calls:[],saved:[],errors:[],failSingle:false,failBatch:false,hold:false,pending:[],fullLoading:0};const f=fixture;
const store={getters:{userId:7,shopId:5},dispatch:async()=>{}};Vue.prototype.$store=store;Vue.prototype.constant=constant;
Vue.mixin({methods:{showFullLoading(){f.fullLoading++;},hideFullLoading(){f.fullLoading--;},notifySuccess(){},notifyConfirm(text){return this.$confirm(text,'确认');}}});
Vue.config.errorHandler=error=>{f.errors.push(error.message);ELEMENT.Message.error(error.message);};
Vue.filter('adminUsernameFilter',id=>id===7?'合成处理人':'合成申请人');
const mapGetters=keys=>Object.fromEntries(keys.map(key=>[key,function(){return this.$store.getters[key];}]));
const dateUtil={getCurrentDateCode:()=> '2026-11-08',getCurrentDateCodeAdd:()=> '2026-12-08',second2String:()=> '1分钟',waitTimeString:()=> '1分钟',getWeek:()=> '周日'};
function submit(action,data){f.calls.push({action,data});return new Promise((resolve,reject)=>{const settle=()=>{if(action==='single'?f.failSingle:f.failBatch)reject(new Error('合成'+(action==='single'?'保存':'导入')+'失败'));else {f.saved.push({action,data});resolve({data:null});}};if(f.hold)f.pending.push(settle);else settle();});}
const giftCustomerCouponApi={add:data=>submit('single',data),importExcel:(file,shopId)=>submit('batch',{name:file.name,shopId}),template:async()=>{f.calls.push({action:'template'});const response=await fetch('/template.xlsx');if(!response.ok)throw new Error('本地真实模板未准备');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='批量送券申请.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}};
const approvalDetailApi={list:async()=>({data:[{id:701,approvalId:77,flowUserType:1,targetUserId:9,state:3,createTime:'2026-11-08 10:00:00'},{id:702,approvalId:77,flowUserType:2,targetUserId:7,state:2,startTime:'2026-11-08 10:00:00'}]}),findApprovalCategoryDetail:async()=>({data:{couponNumber:3,couponAmount:'97.50',phone:'13800000001',customerName:'合成客户',limitations:'合成测试用券',startTime:'2026-11-08',endTime:'2026-12-08'}})};
const components={};for(const name of ['DescriptionTitle','GiftCustomerCouponForm','ApprovalProgress']){const deps={mapGetters,dateUtil,giftCustomerCouponApi,approvalDetailApi,DescriptionTitle:components.DescriptionTitle,ApprovalRefundApply:{template:'<span></span>'}};const options=new Function(...Object.keys(deps),payload[name].script)(...Object.values(deps));options.template=payload[name].template;components[name]=options;Vue.component(name,options);}
window.app=new Vue({el:'#app',methods:{open(){this.$refs.form.open();},detail(){return this.$refs.progress.open({id:702,approvalId:77,state:2,targetUserId:7,flowUserType:2,approval:{id:77,categoryTitle:'送券审批'}});}}});
f.release=()=>{const items=f.pending.splice(0);items.forEach(fn=>fn());};
</script></html>`;
  const staticFiles = {'/vue.js':'node_modules/vue/dist/vue.js','/element.js':'node_modules/element-ui/lib/index.js',
    '/element.css':'node_modules/element-ui/lib/theme-chalk/index.css','/fonts/element-icons.woff':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff',
    '/fonts/element-icons.ttf':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf'};
  http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1').pathname;
    if(url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
    if(url==='/favicon.ico'){res.writeHead(204);return res.end();}
    if(url==='/template.xlsx'){
      const file='/tmp/fullyu-gift-coupon-template.xlsx';
      if(!fs.existsSync(file)){res.writeHead(404);return res.end('Run GiftCouponControllerTest and copy its target template first');}
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');return fs.createReadStream(file).pipe(res);
    }
    const file=staticFiles[url];if(!file){res.writeHead(404);return res.end('Not found');}
    res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(path.join(root,file)).pipe(res);
  }).listen(19389,'127.0.0.1',()=>console.log('Gift fixture ready: http://127.0.0.1:19389'));
})().catch(error=>{console.error(error);process.exitCode=1;});
