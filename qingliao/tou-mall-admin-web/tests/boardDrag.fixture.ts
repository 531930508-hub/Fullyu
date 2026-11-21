import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/views/home/Board.vue'), 'utf8');
const template = source.match(/<template>([\s\S]*?)<\/template>\s*<script>/)![1].replace(/@\/assets\//g, '/assets/');
const script = source.match(/<script>([\s\S]*?)<\/script>/)![1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'return');
const css = (await require('less').render(source.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1].replace(/\/deep\//g, ''))).css;
const globalCSS = require('sass').renderSync({file: path.join(root, 'src/styles/index.scss')}).css.toString();
const literal = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>看板拖拽 · 本地合成测试</title>
<link rel="stylesheet" href="/element.css"><style>${globalCSS}\n${css}</style><div id="app"><board ref="board"/></div>
<script src="/vue.js"></script><script src="/element.js"></script><script src="/sortable.js"></script><script src="/draggable.js"></script>
<script src="/dayjs.js"></script><script src="/dayjs-format.js"></script><script>
dayjs.extend(dayjs_plugin_customParseFormat);
const transparent='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
window.fixture={saves:[],errors:[],requests:0,holdSave:false,pending:[],rejectSave:false,opened:0};const f=fixture;
Vue.config.errorHandler=e=>f.errors.push(e.message);
const store=Vue.observable({getters:{shopId:1,shopList:[{id:1,name:'合成测试店'}],roles:['管理员'],avatar:transparent,sidebar:{opened:true},massagistId:11},dispatch:()=>Promise.resolve()});Vue.prototype.$store=store;
const mapGetters=keys=>Object.fromEntries(keys.map(k=>[k,function(){return store.getters[k]}]));
const date='2026-11-21';
const projects=[{id:1,type:1,category:1,title:'头部水疗'},{id:2,type:2,category:1,title:'全感舒筋'}];
const makeDetail=(id,bedId,projectId,massagistId,startTime)=>({id,orderId:id+100,shopId:1,type:1,state:0,bedId,bedType:projectId,bedName:bedId===5?'湿1':'干1',projectId,projectTitle:projects.find(p=>p.id===projectId).title,massagistId,massagist:{id:massagistId,name:massagistId===11?'疗愈师甲':'疗愈师乙',avatarUrl:transparent},startTime:date+' '+startTime+':00',endTime:dayjs(date+' '+startTime).add(60,'minute').format('YYYY-MM-DD HH:mm:ss'),duration:60,specifyType:1,isUpdateSort:true,order:{id:id+100,payType:1,state:1,parts:['合成测试'],oil:'无'},customer:{nickname:'合成顾客',phone:'0000',gender:0},comment:'非真实订单'});
let details=[];f.reset=()=>{details=[makeDetail(101,5,1,11,'14:00'),makeDetail(102,7,2,12,'15:00')];f.saves=[];f.rejectSave=false;f.holdSave=false;f.pending=[]};f.reset();
const beds=[{id:5,name:'湿1',type:1,status:1},{id:7,name:'干1',type:2,status:1},{id:8,name:'湿2',type:1,status:1}];
const clone=x=>JSON.parse(JSON.stringify(x));
const orderDetailApi={schedulingMap:async query=>{f.requests++;return {data:query.type===1?beds.map(b=>({...b,orderDetailList:clone(details.filter(d=>d.bedId===b.id))})):[11,12].map(id=>({id,name:id===11?'疗愈师甲':'疗愈师乙',type:1,orderDetailList:clone(details.filter(d=>d.massagistId===id)),schedulesList:[{startTime:'14:00:00',endTime:'22:00:00'}]}))}},updateOrderDetail:params=>new Promise((resolve,reject)=>{
 f.saves.push({...params});const settle=()=>{if(f.rejectSave)return reject(new Error('疗愈师「疗愈师甲」未认证「全感舒筋」，本次未调整'));
 const source=details.find(d=>d.id===params.id),target=details.find(d=>d.id===params.swapWithId);const old={...source};
 const move=(detail,bedId,start)=>{const bed=beds.find(b=>b.id===Number(bedId));detail.bedId=bed.id;detail.bedName=bed.name;detail.bedType=bed.type;detail.projectId=bed.type;detail.projectTitle=projects.find(p=>p.type===bed.type).title;detail.startTime=start;detail.endTime=dayjs(start).add(detail.duration,'minute').format('YYYY-MM-DD HH:mm:ss')};
 if(params.bedId){move(source,params.bedId,target?target.startTime:params.startTime);if(target)move(target,old.bedId,old.startTime)}
 resolve({data:{}})};if(f.holdSave)f.pending.push(settle);else settle();})};
const timeList=Array.from({length:32},(_,i)=>dayjs(date+' 14:00').add(i*15,'minute').format('HH:mm'));
const shopApi={timeShopEnd:async()=>({data:'22:00'}),timeList:async()=>({data:timeList}),timeListNew:async()=>({data:Object.fromEntries(timeList.map(t=>[t,2]))}),getReceptionData:async()=>({data:null})};
const dateUtil={getCurrentDateCode:()=>date,format:(v,p)=>dayjs(v).format(p),formatWeek:v=>dayjs(v).day(),addDay:(v,d)=>dayjs(v).add(d,'day').format('YYYY-MM-DD'),subtractDay:(v,d)=>dayjs(v).subtract(d,'day').format('YYYY-MM-DD')};
const blank={template:'<div hidden></div>',methods:{open(){f.opened++}}};
const ShopSelector={props:['value'],template:'<span>合成测试店 · 仅本地</span>'};
const SchedulesLine={props:['name'],template:'<div><span>{{name}}</span></div>'};
const context={mapGetters,shopApi,orderDetailApi,projectApi:{list:async()=>({data:projects})},dateUtil,formatDate:(v,p)=>dayjs(v).format(p.replace('hh','HH')),dayjs,draggable:vuedraggable,orderApi:{bookingDates:async()=>({data:[]})},roundScheduleApi:{findMassagistRound:async()=>({data:[]})},massagistSchedulesApi:{myDay:async()=>({data:{hasSchedule:true,shopId:1,shops:[{shopId:1,label:'合成测试店'}]}})},ShopSelector,SchedulesLine};
for(const name of ['PadOrderDetail','AppointmentDrawer','PasswordForm','ReceptionDiv','ReceptionDrawer','PadReceptionOrderDetail','Hamburger','AdminTodoCard'])context[name]=blank;
const options=new Function(...Object.keys(context),${literal(script)})(...Object.values(context));options.template=${literal(template)};Vue.component('board',options);
window.app=new Vue({el:'#app'});f.page=()=>app.$refs.board;
</script></html>`;
const assets: Record<string, string> = {'/vue.js':'node_modules/vue/dist/vue.js','/element.js':'node_modules/element-ui/lib/index.js','/element.css':'node_modules/element-ui/lib/theme-chalk/index.css','/fonts/element-icons.woff':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff','/fonts/element-icons.ttf':'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf','/sortable.js':'node_modules/sortablejs/Sortable.js','/draggable.js':'node_modules/vuedraggable/dist/vuedraggable.umd.js','/dayjs.js':'node_modules/dayjs/dayjs.min.js','/dayjs-format.js':'node_modules/dayjs/plugin/customParseFormat.js'};
http.createServer((req,res)=>{
  const url=new URL(req.url!, 'http://127.0.0.1').pathname;
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'none'");
  if(url==='/board'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const relative=assets[url]||(url.startsWith('/assets/')?'src'+url:undefined);
  if(!relative){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':url.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(file).pipe(res);
}).listen(9011,'127.0.0.1',()=>console.log('Board fixture ready: http://127.0.0.1:9011/board'));
