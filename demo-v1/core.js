(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TeaDemo=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SERIES=[
 {id:'xing',name:'醒',en:'AWAKEN',phrase:'进入今天的状态',note:'给新的开始，一点明亮。',color:'apricot'},
 {id:'song',name:'松',en:'UNWIND',phrase:'给日间留个停顿',note:'不必赶路，先喝一杯。',color:'sage'},
 {id:'qing',name:'庆',en:'CELEBRATE',phrase:'以茶碰杯，共享此刻',note:'值得庆祝的，不只是大事。',color:'rose'},
 {id:'mian',name:'眠',en:'SLOW DOWN',phrase:'慢慢结束今天',note:'把这一刻，还给自己。',color:'lilac'}
];
const FLAVORS=[{name:'花园',tag:'柔和花香',desc:'花香调，带一点轻微辛香。',en:'FLORAL'}, {name:'柚光',tag:'明亮果香',desc:'柚子香气灵感，明亮而轻盈。',en:'CITRUS'}, {name:'青野',tag:'清新草本',desc:'草本香气灵感，像经过一片绿意。',en:'HERBAL'}, {name:'林间',tag:'沉静木调',desc:'木质香气灵感，安静、有层次。',en:'WOODY'}, {name:'白韵',tag:'轻柔清雅',desc:'白茶原精香气灵感，轻柔、清雅。',en:'SOFT'}];
function catalog(){
 const list=SERIES.flatMap(s=>FLAVORS.map((f,i)=>({id:`${s.id}-${i}`,name:`${s.name}·${f.name}`,series:s.id,flavor:i,desc:f.desc,tag:f.tag,kind:'tea',basic:true,price:2000,memberEligible:true,temps:s.id==='mian'?['热']:['热','冰'],ice:true,dose:6,unit:'杯'})));
 list.push({id:'spark',name:'庆·细泡',series:'qing',flavor:1,desc:'以茶代酒，给平常的日子一点气泡。',tag:'气泡茶 · 按杯',kind:'tea',price:2800,temps:['冰'],ice:false,dose:6,unit:'杯'}, {id:'smoke',name:'庆·烟岚',series:'qing',flavor:3,desc:'烟熏小种的研发灵感，威士忌般的饮用仪式。',tag:'烟熏茶 · 按杯',kind:'tea',price:2800,temps:['热','冰'],ice:false,dose:6,unit:'杯'}, {id:'bottle',name:'庆·细泡｜瓶装香槟茶',series:'qing',flavor:1,desc:'开瓶的那一声，为此刻而响。香槟式包装，以茶碰杯。',tag:'无酒精方向 · 整瓶分享',kind:'bottle',price:39800,temps:['冰镇'],ice:false,dose:1,unit:'瓶'});
 [0,1,2,3,4].forEach((f,i)=>{const ss=['song','xing','song','qing','mian'][i];list.push({id:`retail-${i}`,name:`${SERIES.find(s=>s.id===ss).name}·${FLAVORS[f].name} 手冲飞碟杯`,series:ss,flavor:f,desc:'拆开、架上杯口、注水。把喜欢的茶带回日常。',tag:FLAVORS[f].tag,kind:'retail',price:1200,temps:[],ice:false,dose:1,unit:'枚',related:`${ss}-${f}`});});
 return list;
}
function initialState(){
 const products=catalog(); const store=id=>({id,name:id==='sh'?'上海·时叙店':'北京·筹备店',short:id==='sh'?'上海店':'北京店',open:true,printer:'online',channels:{mini:true,assisted:true,meituan:true,taobao:true},soldOut:{},stock:Object.fromEntries(products.map(p=>[p.id,p.kind==='tea'?480:p.kind==='bottle'?12:36])),positions:id==='sh'?['吧台01','吧台02','吧台03','吧台04','吧台05','吧台06','吧台07','吧台08','窗边01','窗边02','窗边03','窗边04']:['01桌','02桌','03桌','04桌','吧台01','吧台02'],wait:8});
 return {version:1,products,stores:{sh:store('sh'),bj:store('bj')},member:{vip:false,points:1680,couponAvailable:true},orders:[],logs:[],counter:22,refundCounter:0,seeded:false};
}
const product=(s,id)=>{const p=s.products.find(p=>p.id===id);if(!p)throw Error('商品不存在，请重新选择');return p;};
function unitPrice(p,vip=false){return Math.max(0,p.price-(vip&&p.memberEligible?200:0));}
function quote(s,lines,opts={}){
 const external=['meituan','taobao'].includes(opts.channel);let gross=0,memberDiscount=0;
 const items=lines.map(l=>{const p=product(s,l.id);if(!Number.isInteger(l.qty)||l.qty<1||l.qty>99)throw Error('商品数量须为1至99');const unit=unitPrice(p,opts.vip&&!external);gross+=p.price*l.qty;memberDiscount+=(p.price-unit)*l.qty;return {...l,name:p.name,kind:p.kind,unit:p.unit,price:p.price,unitPrice:unit,amount:unit*l.qty,refundedQty:0};});
 const subtotal=gross-memberDiscount;const couponDiscount=opts.coupon&&!external&&s.member.couponAvailable&&subtotal>=3000?500:0;
 let remaining=couponDiscount;
 items.forEach((l,i)=>{const d=!couponDiscount?0:i===items.length-1?remaining:Math.floor(couponDiscount*l.amount/subtotal);l.total=l.amount-d;remaining-=d;});
 return {items,gross,memberDiscount,couponDiscount,discount:memberDiscount+couponDiscount,total:subtotal-couponDiscount};
}
function log(s,action,detail){s.logs.unshift({id:`L${Date.now()}-${s.logs.length}`,at:Date.now(),actor:'演示伙伴',action,detail});}
function placeOrder(s,input){
 if(input.key){const existing=s.orders.find(o=>o.key===input.key);if(existing)return existing;}
 const st=s.stores[input.store];if(!st)throw Error('请选择有效门店');
 if(!input.remake&&(!st.open||!st.channels[input.channel]))throw Error('本店或该渠道已暂停接单，请稍后再试');
 if(!input.lines?.length)throw Error('请先选择商品');
 if(input.type==='dine'&&!st.positions.includes(input.seat))throw Error('请确认送达位置');
 const q=quote(s,input.lines,{vip:input.vip,coupon:input.coupon,channel:input.channel});const consumption={};
 q.items.forEach(l=>{const p=product(s,l.id);if(st.soldOut[p.id])throw Error(`${p.name}已售罄，请调整购物袋`);if(p.temps.length&&!p.temps.includes(l.temp))throw Error(`${p.name}的温度规格不可售`);if(l.temp==='冰'&&p.ice&&!['标准冰','少冰'].includes(l.ice))throw Error('请选择可用冰量规格');if(l.temp!=='冰')l.ice='';consumption[p.id]=(consumption[p.id]||0)+p.dose*l.qty;});
 for(const [id,n]of Object.entries(consumption))if(st.stock[id]<n)throw Error(`${product(s,id).name}库存不足，请调整数量`);
 Object.entries(consumption).forEach(([id,n])=>st.stock[id]-=n);
 const number=++s.counter;const isExternal=['meituan','taobao'].includes(input.channel);const eligible=!isExternal&&input.owner==='customer'&&!input.remake;
 if(input.remake){q.total=0;q.items.forEach(l=>l.total=0);q.discount=q.gross;}
 const cups=q.items.filter(l=>l.kind==='tea').reduce((n,l)=>n+l.qty,0);
 const o={id:`DEMO-${input.store}-${number}`,key:input.key||'',number:`${input.remake?'R':input.store==='sh'?'A':'B'}${String(number).padStart(3,'0')}`,store:input.store,channel:input.channel,type:input.type,seat:input.type==='dine'?input.seat:'',method:input.method||'模拟微信',owner:input.owner||'guest',status:'pending',createdAt:Date.now(),readyAt:null,refunded:0,refundedPoints:0,points:eligible?Math.floor(q.total/100):0,...q,items:q.items,printStatus:cups?(st.printer==='online'?'printed':'queued'):'none',printCount:cups&&st.printer==='online'?1:0,parent:input.parent||null,note:input.note||'',platformNo:isExternal?`${input.channel==='meituan'?'美团':'闪购'} #${100+number}`:''};
 s.orders.unshift(o);if(eligible)s.member.points+=o.points;if(q.couponDiscount)s.member.couponAvailable=false;log(s,input.remake?'补做订单':'收到订单',`${o.number} · ${o.items.map(l=>l.name+'×'+l.qty).join('、')}`);return o;
}
const getOrder=(s,id)=>{const o=s.orders.find(o=>o.id===id);if(!o)throw Error('订单不存在');return o;};
function finishOrder(s,id){const o=getOrder(s,id);if(o.status!=='pending')return o;o.status='ready';o.readyAt=Date.now();log(s,'已出餐',o.number+' · 无需领取核销');return o;}
function reprint(s,id){const o=getOrder(s,id);if(o.status==='refunded')throw Error('已退款订单无需打印');if(!cupCount(o))throw Error('本单没有需要杯贴的饮品');if(s.stores[o.store].printer!=='online'){o.printStatus='queued';log(s,'杯贴等待重试',o.number);return o;}o.printStatus='printed';o.printCount++;log(s,'补打杯贴',o.number+' · 未创建新饮品');return o;}
function remake(s,id,reason){const o=getOrder(s,id);const lines=o.items.filter(l=>l.qty>l.refundedQty).map(l=>({id:l.id,qty:l.qty-l.refundedQty,temp:l.temp,ice:l.ice}));if(!lines.length)throw Error('本单没有可补做的商品');return placeOrder(s,{store:o.store,channel:o.channel,type:o.type,seat:o.seat,lines,remake:true,parent:o.id,owner:'guest',note:`补做 ${o.number} · ${reason||'服务补偿'}`,method:'补做 · 无需收款'});}
function refund(s,id,lineIndex,qty,reason,prepared){
 const o=getOrder(s,id),l=o.items[lineIndex];if(!l||!Number.isInteger(qty)||qty<1||qty>l.qty-l.refundedQty)throw Error('退款数量超过剩余可退数量');
 if(o.parent)throw Error('补做订单不产生退款');
 const amount=Math.floor(l.total*(l.refundedQty+qty)/l.qty)-Math.floor(l.total*l.refundedQty/l.qty);l.refundedQty+=qty;o.refunded+=amount;
 if(!prepared&&o.status==='pending')s.stores[o.store].stock[l.id]+=product(s,l.id).dose*qty;
 if(o.total&&o.points){const target=Math.floor(o.points*o.refunded/o.total);s.member.points-=target-o.refundedPoints;o.refundedPoints=target;}
 if(o.items.every(l=>l.qty===l.refundedQty)){o.status='refunded';if(o.couponDiscount)s.member.couponAvailable=true;o.printStatus='cancelled';}
 s.refundCounter++;log(s,'模拟退款',`${o.number} · ${l.name}×${qty} · ¥${(amount/100).toFixed(2)} · ${reason||'顾客需求'} · ${prepared?'已耗用原料不回库':'未制作预留释放'}`);return amount;
}
function cupCount(o){return o.items.filter(l=>l.kind==='tea').reduce((n,l)=>n+l.qty-l.refundedQty,0);}
function available(s,store,id){const p=product(s,id),st=s.stores[store];return !st.soldOut[id]&&st.stock[id]>=p.dose;}
function seed(s){
 if(s.seeded)return s;s.seeded=true;
 const cases=[{channel:'mini',type:'dine',seat:'吧台06',lines:[{id:'song-0',qty:1,temp:'热'},{id:'xing-1',qty:1,temp:'冰',ice:'少冰'}]}, {channel:'meituan',type:'delivery',lines:[{id:'qing-2',qty:2,temp:'冰',ice:'标准冰'}]}, {channel:'mini',type:'takeaway',lines:[{id:'mian-4',qty:1,temp:'热'},{id:'retail-4',qty:2,temp:''}]}, {channel:'taobao',type:'delivery',lines:[{id:'xing-0',qty:1,temp:'热'}]}, {channel:'assisted',type:'dine',seat:'窗边02',lines:[{id:'bottle',qty:1,temp:'冰镇'}]}, {channel:'mini',type:'dine',seat:'吧台03',lines:[{id:'song-3',qty:1,temp:'热'}]}];
 cases.forEach((c,i)=>{const o=placeOrder(s,{store:'sh',owner:'guest',...c});o.createdAt=Date.now()-(6-i)*60000;if(i>=4){finishOrder(s,o.id);o.readyAt=Date.now()-(i-3)*60000;}});
 const bj=placeOrder(s,{store:'bj',channel:'mini',type:'dine',seat:'01桌',lines:[{id:'song-2',qty:1,temp:'热'}]});bj.createdAt=Date.now()-120000;return s;
}
return {SERIES,FLAVORS,initialState,catalog,unitPrice,quote,placeOrder,finishOrder,reprint,remake,refund,cupCount,available,seed,log,product,getOrder};
});
