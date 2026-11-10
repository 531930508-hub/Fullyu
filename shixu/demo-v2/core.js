(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TeaDemo=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SERIES=[
 {id:'xing',name:'醒',en:'GOOD DAY',phrase:'进入今天的状态',phraseEn:'A brighter beginning',note:'给新的开始，一点明亮。',color:'apricot'},
 {id:'song',name:'松',en:'CHILL',phrase:'给日间留个停顿',phraseEn:'A pause in your day',note:'不必赶路，先喝一杯。',color:'sage'},
 {id:'qing',name:'庆',en:'CHEERS',phrase:'以茶碰杯，共享此刻',phraseEn:'Here’s to this moment',note:'值得庆祝的，不只是大事。',color:'rose'},
 {id:'mian',name:'眠',en:'GOOD NIGHT',phrase:'慢慢结束今天',phraseEn:'Ease into the evening',note:'把这一刻，还给自己。',color:'lilac'}];
const FLAVORS=[{name:'花园',tag:'柔和花香',desc:'花香调，带一点轻微辛香。',en:'Floral Garden',descEn:'Floral aroma inspiration with a gentle spicy note.'},{name:'柚光',tag:'明亮果香',desc:'柚子香气灵感，明亮而轻盈。',en:'Citrus Light',descEn:'Bright, light citrus aroma inspiration.'},{name:'青野',tag:'清新草本',desc:'草本香气灵感，像经过一片绿意。',en:'Green Fields',descEn:'Fresh herbal aroma inspiration.'},{name:'林间',tag:'沉静木调',desc:'木质香气灵感，安静、有层次。',en:'Woodland',descEn:'Quiet, layered woody aroma inspiration.'},{name:'白韵',tag:'轻柔清雅',desc:'白茶香气灵感，轻柔、清雅。',en:'White Whisper',descEn:'Soft, delicate white-tea aroma inspiration.'}];
const EXPENSE_CATEGORIES=[
 {id:'labor',name:'人力',nameEn:'Labor',aliases:['人力','人工','工资','薪酬','员工','labor','payroll','staff']},
 {id:'rent',name:'租金',nameEn:'Rent',aliases:['租金','房租','场地','rent','lease']},
 {id:'hq',name:'总部管理费',nameEn:'HQ management',aliases:['总部管理费','管理费','总部费用','hq','management','overhead']},
 {id:'utilities',name:'水电物业',nameEn:'Utilities',aliases:['水电','物业','水电物业','能耗','utilities','utility']},
 {id:'marketing',name:'营销推广',nameEn:'Marketing',aliases:['营销','推广','广告','marketing','promotion']},
 {id:'other',name:'其他',nameEn:'Other',aliases:['其他','其它','杂费','other','misc']}];
const EXPENSE_SOURCES={manual:'手动录入',import:'批量导入',seed:'示例'};
/* Permission catalogue mirrors the concepts used by Presence: module -> points, four levels,
   data scope and approval flow by amount. Tea Hour owns its own roles, stores and business data. */
const PERMISSION_MODULES=[
 {key:'dashboard',name:'经营数据'},
 {key:'finance',name:'财务'},
 {key:'product',name:'商品与配方'},
 {key:'store',name:'门店与库存'},
 {key:'order',name:'订单与退款'},
 {key:'loss',name:'报损与损耗'},
 {key:'approval',name:'审批'},
 {key:'rbac',name:'账号与权限'},
 {key:'log',name:'操作记录'}];
const PERM_LEVEL_NAMES={MENU:'菜单',TAB:'标签页',ACTION:'按钮',FIELD:'敏感字段'};
const PERMISSIONS=[
 {code:'dashboard:view',name:'经营概览',module:'dashboard',level:'MENU',group:'经营概览'},
 {code:'dashboard:profit',name:'利润与成本（敏感）',module:'dashboard',level:'FIELD',group:'经营概览'},
 {code:'finance:view',name:'财务流水',module:'finance',level:'MENU',group:'财务流水'},
 {code:'finance:export',name:'导出流水',module:'finance',level:'ACTION',group:'财务流水'},
 {code:'finance:expense',name:'录入与导入运营费用',module:'finance',level:'ACTION',group:'财务流水'},
 {code:'product:view',name:'商品目录',module:'product',level:'MENU',group:'商品'},
 {code:'product:edit',name:'编辑商品与分类',module:'product',level:'ACTION',group:'商品'},
 {code:'product:price',name:'查看与调整售价（敏感）',module:'product',level:'FIELD',group:'商品'},
 {code:'product:publish',name:'上架 / 下架',module:'product',level:'ACTION',group:'商品'},
 {code:'mapping:view',name:'原料SKU映射',module:'product',level:'MENU',group:'原料'},
 {code:'mapping:edit',name:'维护原料映射',module:'product',level:'ACTION',group:'原料'},
 {code:'store:config',name:'门店与渠道配置',module:'store',level:'MENU',group:'门店'},
 {code:'store:config:edit',name:'修改门店与渠道',module:'store',level:'ACTION',group:'门店'},
 {code:'store:stock',name:'本店库存与售罄',module:'store',level:'ACTION',group:'门店'},
 {code:'store:device',name:'本店设备',module:'store',level:'MENU',group:'门店'},
 {code:'pos:use',name:'营业台与代点',module:'order',level:'MENU',group:'营业'},
 {code:'retail:handover',name:'零售实物交付',module:'order',level:'ACTION',group:'营业'},
 {code:'order:view',name:'订单查看',module:'order',level:'MENU',group:'订单'},
 {code:'order:refund',name:'限额内直接退款',module:'order',level:'ACTION',group:'退款'},
 {code:'order:refund:request',name:'发起退款申请',module:'order',level:'ACTION',group:'退款'},
 {code:'order:refund:approve',name:'审批退款',module:'order',level:'ACTION',group:'退款'},
 {code:'loss:view',name:'总部报损与损耗',module:'loss',level:'MENU',group:'报损'},
 {code:'loss:report',name:'门店登记报损',module:'loss',level:'ACTION',group:'报损'},
 {code:'loss:approve',name:'审批超限报损',module:'loss',level:'ACTION',group:'报损'},
 {code:'loss:config',name:'报损规则与预警线',module:'loss',level:'ACTION',group:'报损'},
 {code:'approval:view',name:'审批中心',module:'approval',level:'MENU',group:'审批'},
 {code:'approval:config',name:'审批流配置',module:'approval',level:'ACTION',group:'审批'},
 {code:'rbac:view',name:'权限管理',module:'rbac',level:'MENU',group:'权限'},
 {code:'rbac:edit',name:'维护账号与角色',module:'rbac',level:'ACTION',group:'权限'},
 {code:'rbac:scope',name:'配置数据范围（敏感）',module:'rbac',level:'FIELD',group:'权限'},
 {code:'log:view',name:'操作记录',module:'log',level:'MENU',group:'记录'}];
const PAGE_PERM={workbench:'pos:use',pos:'pos:use',retail:'retail:handover',orders:'order:view',availability:'store:stock',inventory:'store:stock',loss:'loss:report',dashboard:'dashboard:view',stores:'store:device',logs:'log:view','hq-overview':'dashboard:view',finance:'finance:view','hq-loss':'loss:view',products:'product:view',categories:'product:view',mappings:'mapping:view','hq-stores':'store:config',rbac:'rbac:view',approvals:'approval:view','hq-logs':'log:view'};
const ROLE_TEMPLATES=[
 {id:'r-super',name:'超级管理员',description:'全部权限与全部门店，仅用于演示',builtin:true,scope:'ALL',perms:['*']},
 {id:'r-finance',name:'总部财务',description:'财务流水、运营费用、退款与报损审批、全部门店经营数据',builtin:true,scope:'ALL',perms:['dashboard:view','dashboard:profit','finance:view','finance:export','finance:expense','order:view','order:refund:approve','loss:view','loss:approve','approval:view','approval:config','log:view']},
 {id:'r-ops',name:'总部运营',description:'商品、分类、映射、门店配置、报损规则与经营数据，不含财务',builtin:true,scope:'ALL',perms:['dashboard:view','product:view','product:edit','product:price','product:publish','mapping:view','mapping:edit','store:config','store:config:edit','order:view','loss:view','loss:approve','loss:config','approval:view','log:view']},
 {id:'r-region',name:'区域店长',description:'授权门店的营业、库存、报损与限额内退款',builtin:true,scope:'STORES',perms:['dashboard:view','pos:use','retail:handover','order:view','order:refund','order:refund:request','store:stock','store:device','loss:report','log:view']},
 {id:'r-manager',name:'门店店长',description:'单店日常营业、库存、报损与限额内退款',builtin:true,scope:'STORES',perms:['dashboard:view','pos:use','retail:handover','order:view','order:refund','order:refund:request','store:stock','store:device','loss:report','log:view']},
 {id:'r-staff',name:'门店店员',description:'营业台、代点、零售交付与订单查看，退款需申请',builtin:true,scope:'STORES',perms:['pos:use','retail:handover','order:view','order:refund:request']},
 {id:'r-audit',name:'只读审计',description:'全部页面只读，含金额、报损与审批记录，不能操作',builtin:true,scope:'ALL',perms:['dashboard:view','dashboard:profit','finance:view','product:view','mapping:view','store:config','order:view','loss:view','approval:view','rbac:view','log:view']}];
const STAFF_TEMPLATES=[
 {id:'u-lin',name:'林知秋',username:'13800000001',roleIds:['r-super'],stores:['*'],active:true},
 {id:'u-zhou',name:'周予安',username:'13800000002',roleIds:['r-finance'],stores:['*'],active:true},
 {id:'u-chen',name:'陈默',username:'13800000003',roleIds:['r-region'],stores:['sh','sh-west'],active:true},
 {id:'u-su',name:'苏禾',username:'13800000004',roleIds:['r-manager'],stores:['sh'],active:true},
 {id:'u-gu',name:'顾小满',username:'13800000005',roleIds:['r-staff'],stores:['sh'],active:true},
 {id:'u-xu',name:'许知远',username:'13800000006',roleIds:['r-audit'],stores:['*'],active:true}];
const categories=()=>[{id:'fresh',name:'纯茶鲜酿',nameEn:'Fresh tea',kind:'tea'},{id:'special',name:'特别鲜酿',nameEn:'Special brews',kind:'tea'},{id:'bottles',name:'瓶装庆系列',nameEn:'Celebration bottles',kind:'bottle'},{id:'drip',name:'手冲茶',nameEn:'Pour-over',kind:'retail'},{id:'bags',name:'茶包',nameEn:'Tea bags',kind:'retail'},{id:'boxes',name:'盒装茶',nameEn:'Tea boxes',kind:'retail'}];
function catalog(){
 const list=SERIES.flatMap(s=>FLAVORS.map((f,i)=>({id:`${s.id}-${i}`,name:`${s.name}·${f.name}`,nameEn:`${s.en} · ${f.en}`,series:s.id,flavor:i,desc:f.desc,descEn:f.descEn,tag:f.tag,tagEn:f.en,kind:'tea',category:'fresh',basic:true,price:2000,memberEligible:true,temps:s.id==='mian'?['热']:['热','冰'],ice:true,dose:3.5,unit:'杯',unitEn:'cup'})));
 list.push({id:'spark',name:'庆·细泡',nameEn:'CHEERS · Sparkling Tea',series:'qing',flavor:1,desc:'以茶代酒，给平常的日子一点气泡。',descEn:'A sparkling, alcohol-free tea concept for everyday celebrations.',tag:'气泡茶 · 按杯',tagEn:'Sparkling tea',kind:'tea',category:'special',price:2800,temps:['冰'],ice:false,dose:4,unit:'杯',unitEn:'cup'},
 {id:'smoke',name:'庆·烟岚',nameEn:'CHEERS · Smoked Tea',series:'qing',flavor:3,desc:'烟熏小种的研发灵感，威士忌般的饮用仪式。',descEn:'Smoked black-tea inspiration with a whisky-style ritual. No alcohol.',tag:'烟熏茶 · 按杯',tagEn:'Smoky tea',kind:'tea',category:'special',price:2800,temps:['热','冰'],ice:false,dose:4,unit:'杯',unitEn:'cup'},
 {id:'bottle',name:'庆·细泡｜瓶装香槟茶',nameEn:'CHEERS · Champagne-style Tea',series:'qing',flavor:1,desc:'开瓶的那一声，为此刻而响。香槟式包装，以茶碰杯。',descEn:'A champagne-style bottle and a celebratory pop. Alcohol-free concept; final packaging to be confirmed.',tag:'无酒精方向 · 整瓶分享',tagEn:'Alcohol-free concept · Share a bottle',kind:'bottle',category:'bottles',price:39800,temps:['冰镇'],ice:false,dose:1,unit:'瓶',unitEn:'bottle'});
 for(let f=0;f<5;f++){const ss=['song','xing','song','qing','mian'][f],ser=SERIES.find(s=>s.id===ss);list.push({id:`retail-${f}`,name:`${ser.name}·${FLAVORS[f].name} 手冲茶`,nameEn:`${ser.en} · ${FLAVORS[f].en} Pour-over`,series:ss,flavor:f,desc:'拆开、架上杯口、注水。把喜欢的茶带回日常。',descEn:'Open, place over a cup, and pour. A little tea ritual to take home.',tag:'单枚独立包装',tagEn:'Individually wrapped',kind:'retail',category:'drip',price:1200,temps:[],dose:1,unit:'枚',unitEn:'pack',spec:'1枚装 · 规格暂拟',specEn:'1 pack · Concept specification'});}
 for(const [id,name,nameEn,category,price,spec,specEn,ss] of [['tea-bags','松·日常茶包','CHILL · Everyday Tea Bags','bags',5800,'10袋 / 盒 · 暂拟','10 bags / box · Draft','song'],['tea-box','醒·柚光盒装茶','GOOD DAY · Citrus Tea Box','boxes',9800,'20袋 / 盒 · 暂拟','20 bags / box · Draft','xing'],['tea-gift','四时茶礼盒','Four Moments Tea Collection','boxes',16800,'四系列组合 · 暂拟','Four-series collection · Draft','qing']])list.push({id,name,nameEn,series:ss,flavor:1,desc:'留给日常，也适合送给想念的人。仅门店领取，规格与售价待确认。',descEn:'A ritual for yourself or a thoughtful gift. Store pickup only. Specifications and prices are provisional.',tag:spec,tagEn:specEn,kind:'retail',category,price,temps:[],dose:1,unit:'盒',unitEn:'box',spec,specEn});
 return list.map(p=>({...p,status:'published',spec:p.spec||'固定规格',specEn:p.specEn||'Fixed serving',cost:p.cost||Math.max(100,Math.round(p.price*.3)),updatedAt:Date.now()}));
}
function initialState(){
 const products=catalog();
 const store=(id,city,cityEn,label,labelEn,lat,lng)=>({id,city,cityEn,name:`${city}·${label}`,nameEn:`${cityEn} · ${labelEn}`,short:label,address:`${city}${label} · 示例地点，非真实营业地址`,addressEn:`${labelEn}, ${cityEn} · Example location only`,lat,lng,open:true,retailPickup:true,hours:'10:00–21:00',printer:'online',channels:{mini:true,assisted:true,meituan:true,taobao:true},soldOut:{},stock:Object.fromEntries(products.map(p=>[p.id,p.kind==='tea'?480:p.kind==='bottle'?12:36])),positions:city==='上海'?['吧台01','吧台02','吧台03','吧台04','吧台05','吧台06','吧台07','吧台08','窗边01','窗边02','窗边03','窗边04']:['01桌','02桌','03桌','04桌','吧台01','吧台02'],wait:8});
 return {version:7,products,categories:categories(),stores:{sh:store('sh','上海','Shanghai','城市中心店','Central',31.23,121.47),'sh-west':store('sh-west','上海','Shanghai','西岸店','West Bund',31.18,121.46),bj:store('bj','北京','Beijing','城市中心店','Central',39.92,116.42),'bj-east':store('bj-east','北京','Beijing','东城店','East',39.94,116.47)},member:{vip:false,points:1680,couponAvailable:true,nickname:'时叙的朋友',nicknameEn:'A friend of Tea Hour',code:'TH-2610-2906'},orders:[],finance:[],expenses:[],logs:[],receipts:[],mappings:products.filter(p=>p.kind==='tea').map(p=>({externalId:'SCM-'+p.id,productId:p.id,unit:'袋',factor:500})),counter:22,refundCounter:0,lossCounter:0,expenseCounter:0,losses:[],lossPolicy:{enabled:true,monthlyRatio:3,approvalThreshold:10000,approvers:['u-zhou','u-lin']},seeded:false,
  roles:ROLE_TEMPLATES.map(r=>({...r,perms:[...r.perms],createdAt:Date.now()})),
  staff:STAFF_TEMPLATES.map(u=>({...u,roleIds:[...u.roleIds],stores:[...u.stores],createdAt:Date.now()})),
  approvalFlows:[{id:'flow-refund',bizType:'REFUND',name:'退款审批',description:'满额退款需总部复核；限额内由店长直接处理',enabled:true,minAmount:5000,maxAmount:null,nodes:[{name:'总部财务复核',mode:'ANY',approvers:['u-zhou','u-lin']}],updatedAt:Date.now()}],
  approvals:[],approvalCounter:0};
}
const fail=(zh,en)=>{const err=new Error(zh);err.messageEn=en||'This action could not be completed. Please check your selection.';throw err;};
const product=(s,id)=>{const p=s.products.find(p=>p.id===id);if(!p)fail('商品不存在，请重新选择','This item no longer exists. Please choose again.');return p;};
const getOrder=(s,id)=>{const o=s.orders.find(o=>o.id===id);if(!o)fail('订单不存在','Order not found.');return o;};
const unitPrice=(p,vip=false)=>Math.max(0,p.price-(vip&&p.memberEligible&&p.kind==='tea'?200:0));
const round=n=>Math.round(n*1000)/1000;
function distance(lat,lng,st){const rad=x=>x*Math.PI/180;const a=Math.sin(rad(st.lat-lat)/2)**2+Math.cos(rad(lat))*Math.cos(rad(st.lat))*Math.sin(rad(st.lng-lng)/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));}
function nearestStore(s,lat,lng){if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)fail('定位坐标无效','Location is unavailable. Please choose a store.');return Object.values(s.stores).filter(x=>x.open&&x.channels.mini).map(x=>({...x,distance:distance(lat,lng,x)})).sort((a,b)=>a.distance-b.distance)[0]||null;}
function quote(s,lines,opts={}){
 const external=['meituan','taobao'].includes(opts.channel);let gross=0,memberDiscount=0;
 const items=lines.map(l=>{const p=product(s,l.id);if(!Number.isInteger(l.qty)||l.qty<1||l.qty>99)fail('商品数量须为1至99','Quantity must be between 1 and 99.');const unit=unitPrice(p,opts.vip&&!external);gross+=p.price*l.qty;memberDiscount+=(p.price-unit)*l.qty;return {...l,name:p.name,nameEn:p.nameEn,kind:p.kind,series:p.series,unit:p.unit,unitEn:p.unitEn,spec:p.spec,specEn:p.specEn,dose:p.dose,cost:p.cost||0,price:p.price,unitPrice:unit,amount:unit*l.qty,refundedQty:0};});
 const subtotal=gross-memberDiscount,couponDiscount=opts.coupon&&!external&&!items.some(l=>l.kind==='retail')&&s.member.couponAvailable&&subtotal>=3000?500:0;let remaining=couponDiscount;
 items.forEach((l,i)=>{const d=!couponDiscount?0:i===items.length-1?remaining:Math.floor(couponDiscount*l.amount/subtotal);l.total=l.amount-d;remaining-=d;});
 return {items,gross,memberDiscount,couponDiscount,discount:memberDiscount+couponDiscount,total:subtotal-couponDiscount};
}
function log(s,action,detail,extra={}){const entry={id:`L${Date.now()}-${s.logs.length}`,at:Date.now(),actor:extra.actor||'演示伙伴',staffId:extra.staffId||'',action,detail,...extra};s.logs.unshift(entry);return entry;}
function event(s,o,type,action,detail,extra={}){return log(s,action,detail,{orderId:o.id,storeId:o.pickupStore||o.store,type,...extra});}
/* ---------- accounts, roles and store scope ---------- */
function account(s,id){const u=(s.staff||[]).find(x=>x.id===id);if(!u)fail('账号不存在');return u;}
function rolesOf(s,user){return (user?.roleIds||[]).map(id=>(s.roles||[]).find(r=>r.id===id)).filter(Boolean);}
function permissionsOf(s,user){const set=new Set();rolesOf(s,user).forEach(r=>(r.perms||[]).forEach(p=>set.add(p)));return [...set];}
function can(s,userOrId,code){const u=typeof userOrId==='string'?(s.staff||[]).find(x=>x.id===userOrId):userOrId;if(!u||!u.active)return false;const list=permissionsOf(s,u);return list.includes('*')||list.includes(code);}
function requirePerm(s,userOrId,code){if(!can(s,userOrId,code))fail('当前账号没有此项权限，请联系总部管理员','This account does not have permission for that action.');}
function allowedStores(s,userOrId){const u=typeof userOrId==='string'?(s.staff||[]).find(x=>x.id===userOrId):userOrId;if(!u||!u.active)return [];const ids=u.stores||[];return Object.keys(s.stores).filter(id=>ids.includes('*')||ids.includes(id));}
function requireStore(s,userOrId,storeId){if(!allowedStores(s,userOrId).includes(storeId))fail('该门店不在当前账号的授权范围内');}
function roleNames(s,user){return rolesOf(s,user).map(r=>r.name).join(' / ')||'未分配角色';}
function scopedRoleChoices(s,actor){if(can(s,actor,'*'))return s.roles;const owned=new Set(permissionsOf(s,actor));return s.roles.filter(r=>(r.perms||[]).every(p=>p!=='*'&&owned.has(p)));}
function assertAssignable(s,actor,roleIds,stores){
 if(can(s,actor,'*'))return;
 const roles=scopedRoleChoices(s,actor).map(r=>r.id),storesAllowed=allowedStores(s,actor);
 if((roleIds||[]).some(id=>!roles.includes(id)))fail('不能授予超出自己权限的角色');
 if((stores||[]).some(id=>id==='*'||!storesAllowed.includes(id)))fail('不能授权自己看不到的门店');
}
function saveStaff(s,actorId,input){
 const actor=account(s,actorId);requirePerm(s,actor,'rbac:edit');
 const name=String(input.name||'').trim(),username=String(input.username||'').trim();
 if(!name)fail('请填写账号姓名');if(!/^1[3-9]\d{9}$/.test(username))fail('登录账号须为 11 位手机号');
 if((s.staff||[]).some(u=>u.username===username&&u.id!==input.id))fail('该手机号已被其他账号使用');
 if(!input.roleIds?.length)fail('请至少分配一个角色');if(!input.stores?.length)fail('请至少授权一家门店');
 assertAssignable(s,actor,input.roleIds,input.stores);
 const old=(s.staff||[]).find(u=>u.id===input.id);
 if(old&&old.id===actorId&&input.active===false)fail('不能停用当前登录账号');
 const row={...(old||{id:`u-${Date.now()}-${s.staff.length}`}),name,username,roleIds:[...new Set(input.roleIds)],stores:[...new Set(input.stores)],active:input.active!==false,createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
 if(old)Object.assign(old,row);else s.staff.push(row);
 log(s,old?'更新后台账号':'新增后台账号',`${name} · ${roleNames(s,row)} · ${row.stores.includes('*')?'全部门店':row.stores.length+' 家门店'}`,{actor:actor.name,staffId:actor.id});
 return old||row;
}
function setStaffActive(s,actorId,id,active){
 const actor=account(s,actorId);requirePerm(s,actor,'rbac:edit');const u=account(s,id);
 if(u.id===actorId&&!active)fail('不能停用当前登录账号');
 u.active=!!active;u.updatedAt=Date.now();log(s,active?'启用后台账号':'停用后台账号',u.name,{actor:actor.name,staffId:actor.id});return u;
}
function saveRole(s,actorId,input){
 const actor=account(s,actorId);requirePerm(s,actor,'rbac:edit');
 const role=(s.roles||[]).find(r=>r.id===input.id);
 if(role?.builtin)fail('内置角色不可直接修改，请复制为自定义角色');
 if(!input.name?.trim())fail('请填写角色名称');
 if((s.roles||[]).some(r=>r.name===input.name.trim()&&r.id!==input.id))fail('角色名称已存在');
 const perms=[...new Set((input.perms||[]).filter(code=>PERMISSIONS.some(p=>p.code===code)))];
 if(!can(s,actor,'*')){const owned=new Set(permissionsOf(s,actor));if(perms.some(p=>!owned.has(p)))fail('不能保存自己不具备的权限');}
 if(!['ALL','STORES','SELF'].includes(input.scope))fail('数据范围无效');
 const row=role||{id:`r-${Date.now()}-${s.roles.length}`,builtin:false,createdAt:Date.now()};
 Object.assign(row,{name:input.name.trim(),description:input.description||'',scope:input.scope,perms,updatedAt:Date.now()});
 if(!role)s.roles.push(row);
 log(s,role?'更新角色权限':'新增自定义角色',`${row.name} · ${perms.length} 项权限 · ${row.scope}`,{actor:actor.name,staffId:actor.id});return row;
}
function cloneRole(s,actorId,id,name){
 const actor=account(s,actorId);requirePerm(s,actor,'rbac:edit');const source=(s.roles||[]).find(r=>r.id===id);if(!source)fail('角色不存在');
 const label=String(name||'').trim()||`${source.name}副本`;if(s.roles.some(r=>r.name===label))fail('角色名称已存在');
 const row={id:`r-${Date.now()}-${s.roles.length}`,name:label,description:`复制自 ${source.name}`,builtin:false,scope:source.scope,perms:[...source.perms],createdAt:Date.now()};
 s.roles.push(row);log(s,'复制角色',`${source.name} → ${label}`,{actor:actor.name,staffId:actor.id});return row;
}
function removeRole(s,actorId,id){
 const actor=account(s,actorId);requirePerm(s,actor,'rbac:edit');const role=(s.roles||[]).find(r=>r.id===id);if(!role)fail('角色不存在');
 if(role.builtin)fail('内置角色不可删除');
 if(s.staff.some(u=>u.roleIds.includes(id)))fail('该角色仍有账号在用，不能删除');
 s.roles=s.roles.filter(r=>r.id!==id);log(s,'删除自定义角色',role.name,{actor:actor.name,staffId:actor.id});
}
/* ---------- refund approval ---------- */
function refundLineAmount(l,qty){return Math.floor(l.total*(l.refundedQty+qty)/l.qty)-Math.floor(l.total*l.refundedQty/l.qty);}
function refundQuote(o,lines){
 if(!Array.isArray(lines)||!lines.length)fail('请选择退款商品');
 const seen=new Set(),detail=[];let total=0;
 for(const x of lines){const idx=Number(x.index),qty=Number(x.qty),l=o.items[idx];
  if(!l)fail('退款商品不存在');if(seen.has(idx))fail('同一商品不能重复提交退款');seen.add(idx);
  if(!Number.isInteger(qty)||qty<1||qty>l.qty-l.refundedQty)fail('退款数量超过剩余可退数量');
  const amount=refundLineAmount(l,qty);total+=amount;detail.push({index:idx,qty,amount});
 }
 return {total,lines:detail};
}
function refundFlow(s){return (s.approvalFlows||[]).find(f=>f.bizType==='REFUND'&&f.enabled)||null;}
function refundNeedsApproval(s,userOrId,amount){const flow=refundFlow(s);if(!flow)return false;return !can(s,userOrId,'order:refund')||amount>=flow.minAmount;}
function pendingRefund(s,orderId){return (s.approvals||[]).find(a=>a.orderId===orderId&&a.status==='pending')||null;}
function submitRefundApproval(s,actorId,orderId,lines,reason,prepared){
 const actor=account(s,actorId);if(!can(s,actor,'order:refund')&&!can(s,actor,'order:refund:request'))fail('当前账号没有退款申请权限');
 const o=getOrder(s,orderId);if(o.business!=='retail')requireStore(s,actor,o.store);
 if(pendingRefund(s,o.id))fail('该订单已有退款正在审批');
 const flow=refundFlow(s);if(!flow)fail('退款审批流未启用，无法提交申请');
 const q=refundQuote(o,lines),approvers=(flow.nodes?.[0]?.approvers||[]).filter(id=>s.staff.some(u=>u.id===id&&u.active));
 if(!approvers.length)fail('退款审批流没有可用审批人，请联系总部');
 const stamp=dayStamp(),id=`AP-${stamp}-${String(++s.approvalCounter).padStart(3,'0')}`;
 const ap={id,bizType:'REFUND',orderId:o.id,orderNumber:o.number,storeId:o.store||o.pickupStore||'brand',amount:q.total,summary:`退款申请：${o.number} · ¥${(q.total/100).toFixed(2)} · ${reason||'顾客需求'}`,
  requesterId:actor.id,requesterName:actor.name,status:'pending',currentIndex:0,flowId:flow.id,flowName:flow.name,
  nodes:(flow.nodes||[]).map((n,i)=>({name:n.name,mode:n.mode||'ANY',approvers:[...n.approvers],status:i===0?'processing':'waiting',decisions:[]})),
  payload:{lines:q.lines,reason:reason||'顾客需求',prepared:!!prepared},createdAt:Date.now(),finishedAt:null,resultNote:''};
 s.approvals.unshift(ap);o.refundApprovalId=ap.id;
 log(s,'提交退款审批',`${o.number} · ¥${(q.total/100).toFixed(2)} · 等待${ap.nodes[0].name}`,{actor:actor.name,staffId:actor.id,storeId:ap.storeId,orderId:o.id,approvalId:ap.id});
 return ap;
}
function decideApproval(s,actorId,id,action,comment=''){
 const actor=account(s,actorId);const ap=(s.approvals||[]).find(a=>a.id===id);if(!ap)fail('审批单不存在');if(ap.status!=='pending')fail('该审批单已结束');
 requirePerm(s,actor,ap.bizType==='LOSS'?'loss:approve':'order:refund:approve');
 const label=ap.bizType==='LOSS'?'报损':'退款';
 const node=ap.nodes[ap.currentIndex];if(!node)fail('审批节点异常');
 if(!node.approvers.includes(actor.id))fail('您不是当前节点的审批人');
 if(node.decisions.some(d=>d.approverId===actor.id))fail('您已处理过该节点');
 node.decisions.push({approverId:actor.id,approverName:actor.name,action,comment:comment||'',at:Date.now()});
 const o=ap.orderId?getOrder(s,ap.orderId):null;
 const loss=()=> (s.losses||[]).find(l=>l.id===ap.payload?.lossId);
 if(action==='reject'){
  node.status='rejected';ap.status='rejected';ap.finishedAt=Date.now();ap.resultNote=`${actor.name} 驳回${comment?'：'+comment:''}`;
  if(ap.bizType==='LOSS'){
   const row=loss();if(row){row.status='rejected';row.decidedAt=Date.now();row.decisionNote=comment||'总部驳回';}
   log(s,'驳回报损申请',`${ap.id} · ${ap.summary}${comment?' · '+comment:''}`,{actor:actor.name,staffId:actor.id,storeId:ap.storeId,approvalId:ap.id,lossId:ap.payload?.lossId});return ap;
  }
  if(o)delete o.refundApprovalId;log(s,'驳回退款申请',`${ap.id} · ${ap.summary}${comment?' · '+comment:''}`,{actor:actor.name,staffId:actor.id,storeId:ap.storeId,orderId:ap.orderId,approvalId:ap.id});return ap;
 }
 if(action!=='approve')fail('审批动作无效');
 const passed=node.mode==='ALL'?node.approvers.every(a=>node.decisions.some(d=>d.approverId===a&&d.action==='approve')):node.decisions.some(d=>d.action==='approve');
 if(!passed)return ap;
 node.status='approved';
 if(ap.currentIndex<ap.nodes.length-1){ap.currentIndex++;ap.nodes[ap.currentIndex].status='processing';log(s,`${label}审批通过当前节点`,ap.id,{actor:actor.name,staffId:actor.id,approvalId:ap.id});return ap;}
 ap.status='approved';ap.finishedAt=Date.now();
 if(ap.bizType==='LOSS'){
  const row=loss();
  if(!row){ap.resultNote='审批已通过，但报损记录不存在';log(s,'报损审批通过但记录异常',`${ap.id} · ${ap.resultNote}`,{actor:actor.name,staffId:actor.id,storeId:ap.storeId,approvalId:ap.id});return ap;}
  row.status='approved';row.decidedAt=Date.now();row.decisionNote=comment||'总部复核通过';ap.resultNote=`报损已确认 ¥${(row.amount/100).toFixed(2)}`;
  log(s,'报损审批通过',`${ap.id} · ${ap.resultNote}`,{actor:actor.name,staffId:actor.id,storeId:ap.storeId,approvalId:ap.id,lossId:row.id});return ap;
 }
 let total=0,error='';
 try{ap.payload.lines.forEach(x=>{total+=refund(s,ap.orderId,x.index,x.qty,ap.payload.reason,ap.payload.prepared);});ap.resultNote=`已退款 ¥${(total/100).toFixed(2)}`;}
 catch(err){error=err.message;ap.resultNote=`审批已通过，但执行失败：${error}`;}
 if(o)delete o.refundApprovalId;
 log(s,error?'退款审批通过但执行失败':'退款审批通过',`${ap.id} · ${ap.resultNote}`,{actor:actor.name,staffId:actor.id,storeId:ap.storeId,orderId:ap.orderId,approvalId:ap.id});
 return ap;
}
function requestRefund(s,actorId,orderId,lines,reason,prepared){
 const actor=account(s,actorId);if(!can(s,actor,'order:refund')&&!can(s,actor,'order:refund:request'))fail('当前账号没有退款权限');
 const o=getOrder(s,orderId),q=refundQuote(o,lines),flow=refundFlow(s);
 if(flow&&refundNeedsApproval(s,actor,q.total))return {mode:'approval',total:q.total,approval:submitRefundApproval(s,actorId,orderId,lines,reason,prepared)};
 if(!can(s,actor,'order:refund'))fail('当前账号只能发起退款申请，审批流未启用时请联系总部');
 let total=0;q.lines.forEach(x=>{total+=refund(s,orderId,x.index,x.qty,reason,prepared);});
 log(s,'直接退款',`${o.number} · ¥${(total/100).toFixed(2)} · ${reason||'顾客需求'}`,{actor:actor.name,staffId:actor.id,storeId:o.store||'brand',orderId:o.id});
 return {mode:'direct',total};
}
function visibleApprovals(s,userOrId){
 const u=typeof userOrId==='string'?(s.staff||[]).find(x=>x.id===userOrId):userOrId;if(!u)return [];
 const all=can(s,u,'approval:config')||can(s,u,'finance:view')||can(s,u,'*');
 const stores=allowedStores(s,u);
 return (s.approvals||[]).filter(a=>all||a.requesterId===u.id||stores.includes(a.storeId));
}
function myApprovals(s,userOrId){
 const u=typeof userOrId==='string'?(s.staff||[]).find(x=>x.id===userOrId):userOrId;if(!u)return [];
 return visibleApprovals(s,u).filter(a=>{if(a.status!=='pending')return false;const n=a.nodes[a.currentIndex];return n&&n.approvers.includes(u.id)&&!n.decisions.some(d=>d.approverId===u.id);});
}
function saveRefundFlow(s,actorId,input){
 const actor=account(s,actorId);requirePerm(s,actor,'approval:config');
 const flow=refundFlow(s)||(s.approvalFlows||[]).find(f=>f.bizType==='REFUND');if(!flow)fail('退款审批流不存在');
 const min=Math.round(Number(input.minAmount));if(!Number.isFinite(min)||min<0)fail('请输入有效的审批起点金额');
 const approvers=[...new Set((input.approvers||[]).filter(id=>s.staff.some(u=>u.id===id&&u.active)))];if(!approvers.length)fail('请至少选择一位审批人');
 flow.enabled=input.enabled!==false;flow.minAmount=min;flow.nodes=[{name:flow.nodes?.[0]?.name||'总部财务复核',mode:'ANY',approvers}];flow.updatedAt=Date.now();
 log(s,'更新退款审批流',`起点 ¥${(min/100).toFixed(2)} · ${approvers.length} 位审批人 · ${flow.enabled?'启用':'停用'}`,{actor:actor.name,staffId:actor.id});
 return flow;
}
/* ---------- loss reporting ---------- */
function monthRange(now=Date.now()){const d=new Date(now);return {from:new Date(d.getFullYear(),d.getMonth(),1).getTime(),to:new Date(d.getFullYear(),d.getMonth()+1,1).getTime()};}
function lossValue(s,productId,qty){
 const p=product(s,productId),q=Number(qty);
 if(!Number.isFinite(q)||q<=0)fail('请填写有效的报损数量','Enter a valid loss quantity.');
 if(p.kind==='tea'){const grams=round(q);if(grams>100000)fail('单次报损数量过大，请分批登记');return Math.round(grams/p.dose*p.cost);}
 if(!Number.isInteger(q))fail('整件商品报损须为整数','Use whole units for packaged items.');
 return q*p.cost;
}
function lossSummary(s,{from,to,storeIds=null}={}){
 const range=(from==null||to==null)?monthRange():{from,to};
 const scope=storeIds&&storeIds.length?storeIds:Object.keys(s.stores);
 const rows=scope.map(storeId=>{
  const list=(s.losses||[]).filter(l=>l.storeId===storeId&&l.at>=range.from&&l.at<range.to&&l.status!=='rejected');
  const approved=list.filter(l=>l.status==='approved'),pending=list.filter(l=>l.status==='pending');
  const amount=approved.reduce((n,l)=>n+l.amount,0),pendingAmount=pending.reduce((n,l)=>n+l.amount,0);
  const sales=financeSummary(s,{from:range.from,to:range.to,storeId}).grossSales;
  const ratio=sales>0?amount/sales*100:0,policy=s.lossPolicy||{};
  return {storeId,store:s.stores[storeId]?.name||storeId,amount,pendingAmount,sales,ratio,limit:policy.monthlyRatio??0,count:approved.length,pending:pending.length,warning:policy.enabled!==false&&sales>0&&ratio>Number(policy.monthlyRatio||0),recent:list.slice().sort((a,b)=>b.at-a.at)};
 });
 return {from:range.from,to:range.to,rows,total:rows.reduce((n,r)=>n+r.amount,0),pendingTotal:rows.reduce((n,r)=>n+r.pendingAmount,0)};
}
function lossWarnings(s,{now=Date.now(),storeIds=null}={}){const {from,to}=monthRange(now);return lossSummary(s,{from,to,storeIds}).rows.filter(r=>r.warning);}
function reportLoss(s,actorId,input){
 const actor=account(s,actorId);requirePerm(s,actor,'loss:report');
 const storeId=input.storeId,st=s.stores[storeId];if(!st)fail('请选择有效门店');
 requireStore(s,actor,storeId);
 const policy=s.lossPolicy||{};if(policy.enabled===false)fail('报损功能已停用，请联系总部');
 const p=product(s,input.productId),qty=p.kind==='tea'?round(Number(input.qty)):Number(input.qty);
 if(!Number.isFinite(qty)||qty<=0)fail('请填写有效的报损数量','Enter a valid loss quantity.');
 if(p.kind!=='tea'&&!Number.isInteger(qty))fail('整件商品报损须为整数','Use whole units for packaged items.');
 const have=st.stock[p.id]||0;if(have<qty)fail(`本店${p.name}库存仅 ${round(have)}${p.kind==='tea'?'g':'件'}，请核对后重试`,'Loss quantity exceeds this store’s stock.');
 const reason=String(input.reason||'').trim();if(!reason)fail('请选择或填写报损原因','Please choose a loss reason.');
 const amount=lossValue(s,p.id,qty);st.stock[p.id]=round(have-qty);
 const seq=++s.lossCounter,id=`LS-${dayStamp()}-${String(seq).padStart(3,'0')}`;
 const loss={id,storeId,productId:p.id,name:p.name,nameEn:p.nameEn,kind:p.kind,qty,unit:p.kind==='tea'?'g':p.unit,unitEn:p.kind==='tea'?'g':p.unitEn,amount,cost:p.cost,reason,note:String(input.note||'').trim(),reporterId:actor.id,reporterName:actor.name,status:'approved',approvalId:null,at:Date.now(),decidedAt:Date.now(),decisionNote:'未达审批线，门店店长已登记'};
 s.losses.unshift(loss);
 const threshold=Number(policy.approvalThreshold)||0;
 if(threshold>0&&amount>=threshold){
  const approvers=(policy.approvers||[]).filter(uid=>s.staff.some(u=>u.id===uid&&u.active));
  if(approvers.length){
   const apId=`AP-${dayStamp()}-${String(++s.approvalCounter).padStart(3,'0')}`;
   const ap={id:apId,bizType:'LOSS',orderId:null,orderNumber:'',storeId,amount,summary:`报损申请：${p.name} · ${qty}${loss.unit} · ¥${(amount/100).toFixed(2)} · ${reason}`,requesterId:actor.id,requesterName:actor.name,status:'pending',currentIndex:0,flowId:'flow-loss',flowName:'报损审批',nodes:[{name:'总部报损复核',mode:'ANY',approvers,status:'processing',decisions:[]}],payload:{lossId:loss.id},createdAt:Date.now(),finishedAt:null,resultNote:''};
   s.approvals.unshift(ap);loss.status='pending';loss.approvalId=apId;loss.decidedAt=null;loss.decisionNote='';
  }
 }
 log(s,loss.status==='pending'?'提交超限报损':'登记门店报损',`${st.name} · ${p.name} ${qty}${loss.unit} · ¥${(amount/100).toFixed(2)} · ${reason}`,{actor:actor.name,staffId:actor.id,storeId,lossId:loss.id});
 return loss;
}
function saveLossPolicy(s,actorId,input){
 const actor=account(s,actorId);requirePerm(s,actor,'loss:config');
 const ratio=Number(input.monthlyRatio);if(!Number.isFinite(ratio)||ratio<0||ratio>100)fail('请输入 0 至 100 的月度损耗率预警线');
 const threshold=Math.round(Number(input.approvalThreshold));if(!Number.isFinite(threshold)||threshold<0)fail('请输入有效的审批起点金额');
 const approvers=[...new Set((input.approvers||[]).filter(id=>s.staff.some(u=>u.id===id&&u.active)))];if(!approvers.length)fail('请至少选择一位报损审批人');
 s.lossPolicy={enabled:input.enabled!==false,monthlyRatio:ratio,approvalThreshold:threshold,approvers};
 log(s,'更新报损规则',`月度损耗率 >${ratio}% 预警 · 审批起点 ¥${(threshold/100).toFixed(2)} · ${approvers.length} 位审批人 · ${s.lossPolicy.enabled?'启用':'停用'}`,{actor:actor.name,staffId:actor.id});
 return s.lossPolicy;
}
function dayStamp(n=Date.now()){const d=new Date(n);return `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;}
function addFinance(s,o,type,amount,extra={}){
 const dedupeKey=extra.dedupeKey||`ORDER:${o.id}:${type}:${s.finance.length}`;if(s.finance.some(f=>f.dedupeKey===dedupeKey))return null;
 const external=['meituan','taobao'].includes(o.channel),lineCost=type==='SALE'?(o.items||[]).reduce((n,l)=>n+(l.cost??product(s,l.id).cost??0)*l.qty,0):0,entry={id:`F-${Date.now()}-${s.finance.length}`,at:extra.at||Date.now(),type,amount,orderId:o.id,orderNumber:o.number,business:o.business,storeId:o.business==='retail'?'brand':o.store,channel:o.channel,method:o.method,settlement:extra.settlement||(external?'pending':'settled'),cost:extra.cost??lineCost,dedupeKey,memo:extra.memo||''};
 s.finance.unshift(entry);return entry;
}
function uniquePickupCode(s){
 const used=new Set((s.orders||[]).filter(o=>o.business==='retail'&&o.status==='awaiting').map(o=>o.pickupCode));
 let n=1000+((Number(s.counter||0)*137+73)%9000);
 while(used.has(String(n)))n=1000+(n-999)%9000;
 return String(n);
}
function addOrder(s,input,q,business){
 const number=++s.counter,external=['meituan','taobao'].includes(input.channel),eligible=!external&&input.owner==='customer'&&!input.remake;
 if(input.remake){q.total=0;q.items.forEach(l=>l.total=0);q.discount=q.gross;}
 const st=s.stores[input.store],cups=q.items.filter(l=>l.kind==='tea').reduce((n,l)=>n+l.qty,0),now=Date.now(),stamp=dayStamp(now);
 const o={id:business==='retail'?`TH-RETAIL-${stamp}-${number}`:`TH-${input.store}-${number}`,business,key:input.key||'',number:business==='retail'?`TH-R-${stamp}-${String(number).padStart(4,'0')}`:`${input.remake?'R':input.store.startsWith('sh')?'A':'B'}${String(number).padStart(3,'0')}`,store:business==='retail'?null:input.store,pickupStore:null,channel:input.channel,type:business==='retail'?'retail':input.type,seat:business==='fresh'&&input.type==='dine'?input.seat:'',method:input.method||'微信（模拟）',owner:input.owner||'guest',status:business==='retail'?'awaiting':'pending',createdAt:now,paidAt:now,readyAt:null,deliveredAt:null,everPrepared:false,refunded:0,refundedPoints:0,points:eligible?Math.floor(q.total/100):0,...q,units:[],pickupCode:business==='retail'?uniquePickupCode(s):'',printStatus:cups?(st.printer==='online'?'printed':'queued'):'none',printCount:cups&&st.printer==='online'?1:0,parent:input.parent||null,note:input.note||'',paymentRef:`SIM-PAY-${stamp}-${number}`,platformNo:external?`${input.channel==='meituan'?'美团':'闪购'} #${100+number}`:''};
 if(business==='fresh'){let seq=0;q.items.forEach((l,li)=>{for(let i=1;i<=l.qty;i++){seq++;o.units.push({id:`${o.number}-${seq}`,no:`${o.number}-${seq}`,lineIndex:li,name:l.name,temp:l.temp||'',ice:l.ice||'',kind:l.kind,label:l.kind==='tea',status:'pending',readyAt:null});}});}
 s.orders.unshift(o);if(eligible)s.member.points+=o.points;if(q.couponDiscount)s.member.couponAvailable=false;
 event(s,o,'created',input.remake?'创建补做单':'提交订单',o.number,{actor:input.channel==='mini'?'演示顾客':'演示伙伴'});
 event(s,o,input.remake?'remake':'payment',input.remake?'补做免收款':'模拟支付成功',o.method,{amount:o.total});
 if(!input.remake)addFinance(s,o,'SALE',o.total,{dedupeKey:`ORDER:${o.id}:SALE`,at:now,memo:'模拟订单收款'});
 if(cups)event(s,o,'print',o.printStatus==='printed'?'杯贴已模拟打印':'杯贴等待处理',`${cups}杯`);
 if(input.parent)event(s,getOrder(s,input.parent),'remake_link','关联补做单',o.number,{childOrderId:o.id});
 return o;
}
function validatePublished(p){if(p.status!=='published')fail(`${p.name}尚未上架或已下架`,'An item is no longer available. Please update your bag.');}
function placeOrder(s,input){
 if(input.key){const o=s.orders.find(o=>o.key===input.key);if(o)return o;}
 const st=s.stores[input.store];if(!st)fail('请选择有效门店','Please select a valid store.');
 if(!input.remake&&(!st.open||!st.channels[input.channel]))fail('本店或该渠道已暂停接单，请稍后再试','This store is not accepting orders right now.');
 if(!input.lines?.length)fail('请先选择商品','Your bag is empty.');
 if(input.lines.some(l=>product(s,l.id).kind==='retail'))fail('鲜酿与零售请分开结算','Fresh tea and retail have separate checkouts.');
 if(!['dine','takeaway','delivery'].includes(input.type))fail('请选择用餐方式','Please choose dine-in or takeaway.');
 if(input.type==='dine'&&!st.positions.includes(input.seat))fail('请确认送达位置','Please confirm your seat.');
 const q=quote(s,input.lines,input),consumption={};
 q.items.forEach(l=>{const p=product(s,l.id);validatePublished(p);if(st.soldOut[p.id])fail(`${p.name}已售罄，请调整购物袋`,'An item is sold out. Please update your bag.');if(p.temps.length&&!p.temps.includes(l.temp))fail(`${p.name}的温度规格不可售`,'The selected temperature is no longer available.');if(l.temp==='冰'&&p.ice&&!['标准冰','少冰'].includes(l.ice))fail('请选择可用冰量规格','Please select an ice option.');if(l.temp!=='冰')l.ice='';consumption[p.id]=round((consumption[p.id]||0)+p.dose*l.qty);});
 for(const [id,n]of Object.entries(consumption))if(!Number.isFinite(st.stock[id])||st.stock[id]<n)fail(`${product(s,id).name}库存不足，请调整数量`,'Not enough stock. Please adjust the quantity.');
 Object.entries(consumption).forEach(([id,n])=>st.stock[id]=round(st.stock[id]-n));return addOrder(s,input,q,'fresh');
}
function retailAvailable(s,id){return Math.max(0,Object.values(s.stores).filter(st=>st.retailPickup).reduce((n,st)=>n+(st.stock[id]||0),0)-s.orders.filter(o=>o.business==='retail'&&o.status==='awaiting').reduce((n,o)=>n+o.items.filter(l=>l.id===id).reduce((a,l)=>a+l.qty-l.refundedQty,0),0));}
function placeRetailOrder(s,input){
 if(input.key){const o=s.orders.find(o=>o.key===input.key);if(o)return o;}
 if(!input.lines?.length)fail('请先选择商品','Your bag is empty.');
 if(!['mini','assisted'].includes(input.channel))fail('零售不使用外卖渠道','Retail pickup is not available through delivery platforms.');
 const q=quote(s,input.lines,{channel:input.channel}),totals={};
 q.items.forEach(l=>{const p=product(s,l.id);if(p.kind!=='retail')fail('零售与鲜酿请分开结算','Retail and fresh tea have separate checkouts.');validatePublished(p);totals[p.id]=(totals[p.id]||0)+l.qty;});
 for(const [id,n]of Object.entries(totals))if(retailAvailable(s,id)<n)fail('零售可用库存不足，请减少数量','Not enough retail stock. Please reduce the quantity.');
 return addOrder(s,input,q,'retail');
}
function deliverRetail(s,id,storeId,code){const o=getOrder(s,id);if(o.business!=='retail')fail('仅零售需要交付确认','Only retail orders need handover confirmation.');if(o.deliveredAt)return o;if(o.status!=='awaiting')fail('此单已退款，不可交付','This order is not available for collection.');if(String(code||'').replace(/\D/g,'')!==o.pickupCode)fail('提货码不正确，请让顾客重新核对 4 位数字','The pickup code does not match.');const st=s.stores[storeId];if(!st?.retailPickup||!st.open)fail('本店暂不可领取','This store is not available for pickup.');const totals={};o.items.forEach(l=>totals[l.id]=(totals[l.id]||0)+l.qty-l.refundedQty);for(const [pid,n]of Object.entries(totals))if((st.stock[pid]||0)<n)fail('本店库存不足，请调货或选择其他门店','This store has insufficient stock. Please choose another store.');Object.entries(totals).forEach(([pid,n])=>st.stock[pid]-=n);o.status='delivered';o.pickupStore=storeId;o.deliveredAt=Date.now();event(s,o,'delivered','确认零售已交付',`${st.name} · 提货码核验通过，不可重复交付`);return o;}
function unitProgress(o){
 const units=(o.units||[]).filter(u=>u.status!=='refunded'),ready=units.filter(u=>u.status==='ready').length;
 return {total:units.length,ready,pending:units.length-ready,complete:units.length>0&&ready===units.length};
}
function syncOrderReady(s,o){
 const list=(o.units||[]).filter(u=>u.status!=='refunded');if(!list.length)return o;
 if(list.every(u=>u.status==='ready')){
  if(o.status!=='ready'){o.status='ready';o.readyAt=Date.now();o.everPrepared=true;event(s,o,'ready','全部杯量已出餐',`${list.length} 杯 · 逐杯扫码完成`);}
 }else if(o.status==='ready'){o.status='pending';o.readyAt=null;}
 return o;
}
function scanUnit(s,id,unitId){
 const o=getOrder(s,id);
 if(o.business!=='fresh')fail('零售请从提货入口核验提货码','Please verify the pickup code for retail orders.');
 if(o.status==='refunded')fail('已退款订单不可出餐','This order has been refunded.');
 const u=(o.units||[]).find(x=>x.id===unitId||x.no===unitId);
 if(!u)fail('杯贴编号不存在，请重新扫码','This cup label does not exist.');
 if(u.status==='refunded')fail('该杯已退款，无需出餐','This cup has been refunded.');
 if(u.status==='ready')fail('该杯已经出餐，请勿重复扫码','This cup is already marked ready.');
 if(!u.label)fail('该品项无需逐杯扫码，请点击确认备好','This item is confirmed manually.');
 u.status='ready';u.readyAt=Date.now();
 event(s,o,'cup_ready',`出餐 ${u.no}`,`${u.name}${u.temp?' · '+u.temp:''}${u.ice?' · '+u.ice:''} · 逐杯扫码`);
 return syncOrderReady(s,o);
}
function scanCupLabel(s,code){
 const label=String(code||'').trim().toUpperCase();
 if(!label)fail('请扫描杯贴','Scan a cup label.');
 const o=(s.orders||[]).find(o=>o.business==='fresh'&&(o.units||[]).some(u=>String(u.no).toUpperCase()===label));
 if(!o)fail(`没有找到杯贴 ${label}`,'This cup label was not found.');
 const u=o.units.find(u=>String(u.no).toUpperCase()===label);
 scanUnit(s,o.id,u.id);
 return {order:o,unit:u};
}
function confirmUnit(s,id,unitId){
 const o=getOrder(s,id);if(o.business!=='fresh')fail('零售请从提货入口核验提货码','Please verify the pickup code for retail orders.');
 const u=(o.units||[]).find(x=>x.id===unitId||x.no===unitId);
 if(!u)fail('品项不存在','This item does not exist.');
 if(u.status==='refunded')fail('该品项已退款','This item has been refunded.');
 if(u.status==='ready')return o;
 u.status='ready';u.readyAt=Date.now();
 event(s,o,'cup_ready',`备好 ${u.no}`,`${u.name} · 无需打印杯贴，人工确认`);
 return syncOrderReady(s,o);
}
function undoLastUnit(s,id){
 const o=getOrder(s,id);
 if(o.business!=='fresh')fail('零售没有出餐撤回','Retail orders do not use cup preparation.');
 const done=(o.units||[]).filter(u=>u.status==='ready').sort((a,b)=>((b.readyAt||0)-(a.readyAt||0))||(o.units.indexOf(b)-o.units.indexOf(a)));
 if(!done.length)fail('没有可撤回的杯量','There is no finished cup to undo.');
 const u=done[0];u.status='pending';u.readyAt=null;
 if(o.status==='ready'){o.status='pending';o.readyAt=null;}
 event(s,o,'undo_ready',`撤回 ${u.no}`,`${u.name} · 仅撤回最近一杯，原料不回库`);
 return o;
}
function finishOrder(s,id){
 const o=getOrder(s,id);
 if(o.business==='retail')fail('零售请从专用入口确认交付','Please use retail handover.');
 if(o.status==='refunded')fail('已退款订单不可出餐','This order has been refunded.');
 (o.units||[]).forEach(u=>{if(u.status==='pending'){u.status='ready';u.readyAt=Date.now();}});
 if(o.status!=='ready'){o.status='ready';o.readyAt=Date.now();o.everPrepared=true;event(s,o,'ready','整单已出餐','整单确认仅用于演示或异常处理，日常请逐杯扫码');}
 return o;
}
function undoReady(s,id){return undoLastUnit(s,id);}
function reprint(s,id){const o=getOrder(s,id);if(o.status==='refunded')fail('已退款订单无需打印');if(!cupCount(o))fail('本单没有需要杯贴的饮品');if(s.stores[o.store].printer!=='online'){o.printStatus='queued';event(s,o,'print','杯贴等待重试',o.number);return o;}o.printStatus='printed';o.printCount++;event(s,o,'print','补打杯贴','未创建新饮品，不扣原料');return o;}
function remake(s,id,reason){const o=getOrder(s,id);if(o.business!=='fresh')fail('零售不创建制作补做单');const lines=o.items.filter(l=>l.qty>l.refundedQty).map(l=>({id:l.id,qty:l.qty-l.refundedQty,temp:l.temp,ice:l.ice}));if(!lines.length)fail('本单没有可补做的商品');return placeOrder(s,{store:o.store,channel:o.channel,type:o.type,seat:o.seat,lines,remake:true,parent:o.id,owner:'guest',note:`补做 ${o.number} · ${reason||'服务补偿'}`,method:'补做 · 无需收款'});}
function refund(s,id,index,qty,reason,prepared){
 const o=getOrder(s,id),l=o.items[index];if(!l||!Number.isInteger(qty)||qty<1||qty>l.qty-l.refundedQty)fail('退款数量超过剩余可退数量');if(o.parent)fail('补做订单不产生退款');
 const amount=refundLineAmount(l,qty);l.refundedQty+=qty;o.refunded+=amount;
 const lineUnits=(o.units||[]).filter(u=>u.lineIndex===index&&u.status!=='refunded');
 lineUnits.slice(-qty).forEach(u=>{u.status='refunded';u.refundedAt=Date.now();});
 const release=o.business==='fresh'&&!prepared&&!o.everPrepared&&o.status==='pending';if(release)s.stores[o.store].stock[l.id]=round(s.stores[o.store].stock[l.id]+l.dose*qty);
 if(o.total&&o.points){const target=Math.floor(o.points*o.refunded/o.total);s.member.points-=target-o.refundedPoints;o.refundedPoints=target;}
 if(o.items.every(l=>l.qty===l.refundedQty)){o.status='refunded';if(o.couponDiscount)s.member.couponAvailable=true;o.printStatus='cancelled';delete o.refundApprovalId;}
 s.refundCounter++;event(s,o,'refund','模拟退款',`${l.name}×${qty} · ${reason||'顾客需求'} · ${release?'未制作预留释放':o.business==='retail'?'不自动增加实物库存':'已耗用原料不回库'}`,{amount,lineIndex:index,qty,refundRef:`SIM-REF-${s.refundCounter}`});
 const reverseCost=o.business==='fresh'?release:(o.business==='retail'&&!o.deliveredAt),lineCost=(l.cost??product(s,l.id).cost??0)*qty;
 addFinance(s,o,'REFUND',-amount,{dedupeKey:`ORDER:${o.id}:REFUND:${s.refundCounter}`,memo:`${l.name} ×${qty} · ${reason||'顾客需求'}`,cost:reverseCost?-lineCost:0});return amount;
}
const cupCount=o=>o.items.filter(l=>l.kind==='tea').reduce((n,l)=>n+l.qty-l.refundedQty,0);
function available(s,store,id){const p=product(s,id),st=s.stores[store];return p.status==='published'&&(p.kind==='retail'?retailAvailable(s,id)>0:!!st&&!st.soldOut[id]&&st.stock[id]>=p.dose);}
function financeSummary(s,{from=0,to=Number.MAX_SAFE_INTEGER,storeId='all',storeIds=null}={}){
 const list=(s.finance||[]).filter(f=>f.at>=from&&f.at<to&&(storeId!=='all'?f.storeId===storeId:(!storeIds||storeIds.includes(f.storeId)))),sum=arr=>arr.reduce((n,f)=>n+f.amount,0);
 const sales=list.filter(f=>f.type==='SALE'),refunds=list.filter(f=>f.type==='REFUND'),settled=list.filter(f=>f.settlement==='settled'),pending=list.filter(f=>f.settlement==='pending');
 return {entries:list.length,grossSales:sum(sales),refunds:-sum(refunds),net:sum(list),settled:sum(settled),pending:sum(pending),cash:sum(list.filter(f=>f.method.includes('现金'))),wechat:sum(list.filter(f=>f.method.includes('微信'))),saleCount:sales.length,refundCount:refunds.length};
}
/* ---------- operating expenses: manual entry + multi-store import ---------- */
const normalizeExpenseText=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,'').replace(/[·・\-—_]/g,'');
const expenseKey=x=>[x.storeId,x.category,x.at,Math.round(Number(x.amount)||0),String(x.memo||'').trim()].join('|');
const EXPENSE_HEADER_ALIASES={
 date:['日期','发生日期','时间','date','day'],
 store:['门店','门店名称','店铺','store','shop','location'],
 category:['类别','费用类别','费用类型','分类','category','type'],
 amount:['金额','金额元','费用金额','amount','cost','金额（元）','金额(元)'],
 memo:['备注','说明','摘要','memo','note','description']};
function parseDelimited(text){
 const clean=String(text??'').replace(/^\uFEFF/,''),first=clean.split(/\r?\n/).find(line=>line.trim()&&!line.trim().startsWith('#')),delimiter=((first||'').match(/\t/g)||[]).length>((first||'').match(/,/g)||[]).length?'\t':',',parsed=[];let row=[],field='',quoted=false,line=1;
 for(let i=0;i<clean.length;i++){
  const ch=clean[i];
  if(quoted){
   if(ch==='"'){if(clean[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;
  }else if(ch==='"'){quoted=true;}
  else if(ch===delimiter){row.push(field);field='';}
  else if(ch==='\n'){row.push(field);parsed.push({cells:row,line});row=[];field='';line++;}
  else if(ch!=='\r')field+=ch;
 }
 row.push(field);parsed.push({cells:row,line});
 return parsed.filter(x=>x.cells.some(c=>String(c).trim())&&!String(x.cells[0]||'').trim().startsWith('#'));
}
function resolveExpenseCategory(value){
 const raw=String(value??'').trim();
 if(!raw)fail('费用类别不能为空','Choose an expense category.');
 const hit=EXPENSE_CATEGORIES.find(c=>[c.id,c.name,c.nameEn,...c.aliases].some(x=>normalizeExpenseText(x)===normalizeExpenseText(raw)));
 if(!hit)fail(`无法识别费用类别“${raw}”`,`Unknown expense category "${raw}".`);
 return hit;
}
function resolveExpenseStore(s,value){
 const raw=String(value??'').trim();
 if(!raw)fail('门店不能为空','Choose a store.');
 const n=normalizeExpenseText(raw);
 if(['brand','hq','总部','品牌','品牌零售','总部品牌','headquarters'].includes(n))return 'brand';
 const list=Object.values(s.stores||{});
 const aliases=st=>[st.id,st.name,st.nameEn,st.short,`${st.city}${st.short}`,`${st.cityEn}${st.short}`];
 const exact=list.find(st=>aliases(st).some(x=>normalizeExpenseText(x)===n));
 if(exact)return exact.id;
 const partial=list.filter(st=>aliases(st).some(x=>{const a=normalizeExpenseText(x);return a&&(a.includes(n)||n.includes(a));}));
 if(partial.length===1)return partial[0].id;
 if(partial.length>1)fail(`门店“${raw}”匹配到多家，请填写完整门店名`,`Store "${raw}" is ambiguous. Use the full store name.`);
 fail(`无法识别门店“${raw}”`,`Unknown store "${raw}".`);
}
function parseExpenseDate(value){
 const raw=String(value??'').trim();
 const m=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
 if(!m)fail(`日期“${raw}”应为 YYYY-MM-DD`,`Date "${raw}" should be YYYY-MM-DD.`);
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(y,mo-1,d);
 if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)fail(`日期“${raw}”不存在`,`Date "${raw}" does not exist.`);
 return dt.getTime();
}
function parseExpenseAmount(value){
 const raw=String(value??'').trim().replace(/[¥￥,\s]/g,'');
 if(!/^\d+(\.\d{1,2})?$/.test(raw))fail(`金额“${value}”应为正数，最多两位小数`,`Amount "${value}" should be a positive number with up to two decimals.`);
 const cents=Math.round(Number(raw)*100);
 if(!Number.isSafeInteger(cents)||cents<=0||cents>100000000)fail(`金额“${value}”超出有效范围`,`Amount "${value}" is out of range.`);
 return cents;
}
function assertExpenseScope(s,actorId,storeId){
 if(storeId==='brand'){
  if(allowedStores(s,actorId).length!==Object.keys(s.stores||{}).length)fail('只有全部门店范围才能录入品牌 / 总部费用','Only an all-store scope can record brand or HQ expenses.');
 }else requireStore(s,actorId,storeId);
}
function expenseSummary(s,{from=0,to=Number.MAX_SAFE_INTEGER,storeIds=null}={}){
 const list=(s.expenses||[]).filter(x=>!x.voidedAt&&x.at>=from&&x.at<to&&(!storeIds||storeIds.includes(x.storeId))).sort((a,b)=>b.at-a.at);
 const byCategory=EXPENSE_CATEGORIES.map(c=>{const rows=list.filter(x=>x.category===c.id);return {id:c.id,name:c.name,nameEn:c.nameEn,amount:rows.reduce((n,x)=>n+x.amount,0),count:rows.length};});
 return {list,total:list.reduce((n,x)=>n+x.amount,0),count:list.length,byCategory};
}
function addExpense(s,actorId,input={}){
 requirePerm(s,actorId,'finance:expense');
 const storeId=resolveExpenseStore(s,input.storeId),at=parseExpenseDate(input.date),category=resolveExpenseCategory(input.category),amount=parseExpenseAmount(input.amount),memo=String(input.memo||'').trim().slice(0,120);
 assertExpenseScope(s,actorId,storeId);
 const actor=(s.staff||[]).find(u=>u.id===actorId),entry={id:`EX-${Date.now()}-${s.expenseCounter||0}`,at,storeId,category:category.id,amount,memo,source:'manual',createdAt:Date.now(),createdBy:actorId,createdByName:actor?.name||''};
 s.expenseCounter=(s.expenseCounter||0)+1;s.expenses.unshift(entry);
 log(s,'录入运营费用',`${storeId==='brand'?'品牌 / 总部':s.stores[storeId].name} · ${category.name} · ¥${(amount/100).toFixed(2)}${memo?' · '+memo:''}`,{storeId,actor:actor?.name||'演示伙伴',staffId:actorId,expenseId:entry.id});
 return entry;
}
function previewExpenses(s,actorId,text){
 requirePerm(s,actorId,'finance:expense');
 const table=parseDelimited(text);
 if(!table.length)fail('没有可导入的内容','Nothing to import.');
 if(table.length>501)fail('单次最多导入 500 行费用','Import at most 500 expense rows at a time.');
 const rows=table.map(x=>x.cells),keys=rows[0].map(v=>{const n=normalizeExpenseText(v).replace(/[（）()：:]/g,'');return Object.keys(EXPENSE_HEADER_ALIASES).find(k=>EXPENSE_HEADER_ALIASES[k].some(x=>normalizeExpenseText(x).replace(/[（）()：:]/g,'')===n))||'';});
 const idx={};keys.forEach((k,i)=>{if(k&&idx[k]===undefined)idx[k]=i;});
 for(const [k,label]of [['date','日期'],['store','门店'],['category','类别'],['amount','金额']])if(idx[k]===undefined)fail(`表头缺少“${label}”列，请使用：日期,门店,类别,金额,备注`,`Missing the "${label}" column. Use: date,store,category,amount,memo.`);
 const existing=new Set((s.expenses||[]).filter(x=>!x.voidedAt).map(expenseKey)),seen=new Set(),valid=[],errors=[],duplicates=[];
 rows.slice(1).forEach((cells,i)=>{
  const line=table[i+1].line,get=k=>cells[idx[k]]??'';
  try{
   const at=parseExpenseDate(get('date')),storeId=resolveExpenseStore(s,get('store')),category=resolveExpenseCategory(get('category')),amount=parseExpenseAmount(get('amount')),memo=String(get('memo')??'').trim().slice(0,120);
   assertExpenseScope(s,actorId,storeId);
   const item={line,at,storeId,store:storeId==='brand'?'品牌 / 总部':s.stores[storeId].name,category:category.id,categoryName:category.name,amount,memo},key=expenseKey(item);
   if(existing.has(key)||seen.has(key)){duplicates.push(item);return;}
   seen.add(key);valid.push(item);
  }catch(err){errors.push({line,message:err.message});}
 });
 const total=valid.reduce((n,x)=>n+x.amount,0);
 return {rows:valid,errors,duplicates,total,lineCount:rows.length-1};
}
function importExpenses(s,actorId,text,opts={}){
 const preview=previewExpenses(s,actorId,text);
 if(preview.errors.length){const first=preview.errors[0];fail(`第 ${first.line} 行需要修正：${first.message}`,`Fix line ${first.line}: ${first.message}`);}
 if(!preview.rows.length)fail('没有可新增的有效行（可能全部重复）','No new rows to import; they may all be duplicates.');
 const actor=(s.staff||[]).find(u=>u.id===actorId),created=[];
 preview.rows.forEach(r=>{
  const entry={id:`EX-${Date.now()}-${s.expenseCounter||0}`,at:r.at,storeId:r.storeId,category:r.category,amount:r.amount,memo:r.memo,source:opts.source||'import',batchId:opts.batchId||`IMP-${Date.now()}`,createdAt:Date.now(),createdBy:actorId,createdByName:actor?.name||''};
  s.expenseCounter=(s.expenseCounter||0)+1;s.expenses.unshift(entry);created.push(entry);
 });
 const total=created.reduce((n,x)=>n+x.amount,0);
 log(s,'批量导入运营费用',`${created.length} 笔 · ¥${(total/100).toFixed(2)} · ${new Set(created.map(x=>x.storeId)).size} 个门店`,{actor:actor?.name||'演示伙伴',staffId:actorId,source:opts.source||'import'});
 return {created,duplicates:preview.duplicates.length,total};
}
function voidExpense(s,actorId,id){
 requirePerm(s,actorId,'finance:expense');
 const entry=(s.expenses||[]).find(x=>x.id===id);
 if(!entry)fail('费用记录不存在','Expense not found.');
 if(entry.voidedAt)fail('该费用已作废','This expense is already voided.');
 assertExpenseScope(s,actorId,entry.storeId);
 entry.voidedAt=Date.now();entry.voidedBy=actorId;
 const actor=(s.staff||[]).find(u=>u.id===actorId);
 log(s,'作废运营费用',`${entry.storeId==='brand'?'品牌 / 总部':s.stores[entry.storeId]?.name||entry.storeId} · ${EXPENSE_CATEGORIES.find(c=>c.id===entry.category)?.name||entry.category} · ¥${(entry.amount/100).toFixed(2)}`,{actor:actor?.name||'演示伙伴',staffId:actorId,expenseId:entry.id});
 return entry;
}
function sampleExpenseText(s,{today=Date.now()}={}){
 const d=new Date(today),date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const rows=['日期,门店,类别,金额,备注'];
 Object.values(s.stores||{}).forEach(st=>{
  rows.push(`${date},${st.name},人力,68,演示：当日人力，可按实际替换`);
  rows.push(`${date},${st.name},租金,45,演示：租金日摊`);
  rows.push(`${date},${st.name},总部管理费,12,演示：总部管理费分摊`);
  rows.push(`${date},${st.name},水电物业,8,演示：当日水电物业`);
 });
 return rows.join('\n');
}
/* Store P&L uses the append-only ledger for revenue and ingredient cost, then deducts
   approved loss and operating expenses. Pending loss is shown separately. */
function storeProfit(s,{from=0,to=Number.MAX_SAFE_INTEGER,storeIds=null}={}){
 const scope=storeIds&&storeIds.length?storeIds:[...Object.keys(s.stores),'brand'];
 const rows=scope.map(storeId=>{
  const list=(s.finance||[]).filter(f=>f.storeId===storeId&&f.at>=from&&f.at<to);
  const revenue=list.reduce((n,f)=>n+f.amount,0),cogs=list.reduce((n,f)=>n+(f.cost||0),0);
  const remakes=(s.orders||[]).filter(o=>o.business==='fresh'&&o.parent&&o.store===storeId&&o.createdAt>=from&&o.createdAt<to);
  const remakeCost=remakes.reduce((n,o)=>n+(o.items||[]).reduce((m,l)=>m+(l.cost||0)*(l.qty-l.refundedQty),0),0);
  const ingredientCost=cogs+remakeCost;
  const approvedLosses=(s.losses||[]).filter(l=>l.storeId===storeId&&l.status==='approved'&&(l.decidedAt??l.at)>=from&&(l.decidedAt??l.at)<to);
  const pending=(s.losses||[]).filter(l=>l.storeId===storeId&&l.status==='pending'&&l.at>=from&&l.at<to);
  const loss=approvedLosses.reduce((n,l)=>n+l.amount,0),pendingLoss=pending.reduce((n,l)=>n+l.amount,0);
  const gross=revenue-ingredientCost-loss;
  const opexRows=(s.expenses||[]).filter(x=>x.storeId===storeId&&!x.voidedAt&&x.at>=from&&x.at<to);
  const opex=opexRows.reduce((n,x)=>n+x.amount,0),opexByCategory=EXPENSE_CATEGORIES.map(c=>({id:c.id,name:c.name,amount:opexRows.filter(x=>x.category===c.id).reduce((n,x)=>n+x.amount,0)}));
  const net=gross-opex;
  return {storeId,store:storeId==='brand'?'品牌零售':s.stores[storeId]?.name||storeId,revenue,cogs,remakeCost,ingredientCost,loss,lossCount:approvedLosses.length,pendingLoss,gross,margin:revenue>0?gross/revenue*100:0,opex,opexCount:opexRows.length,opexByCategory,net,netMargin:revenue>0?net/revenue*100:0,entries:list.length};
 });
 const totalRevenue=rows.reduce((n,r)=>n+r.revenue,0),totalCogs=rows.reduce((n,r)=>n+r.cogs,0),totalRemakeCost=rows.reduce((n,r)=>n+r.remakeCost,0),totalIngredientCost=rows.reduce((n,r)=>n+r.ingredientCost,0),totalLoss=rows.reduce((n,r)=>n+r.loss,0),totalGross=rows.reduce((n,r)=>n+r.gross,0),totalPendingLoss=rows.reduce((n,r)=>n+r.pendingLoss,0),totalOpex=rows.reduce((n,r)=>n+r.opex,0),totalNet=rows.reduce((n,r)=>n+r.net,0),totalOpexByCategory=EXPENSE_CATEGORIES.map(c=>({id:c.id,name:c.name,amount:rows.reduce((n,r)=>n+(r.opexByCategory.find(x=>x.id===c.id)?.amount||0),0)}));
 return {from,to,rows,totalRevenue,totalCogs,totalRemakeCost,totalIngredientCost,totalLoss,totalGross,totalPendingLoss,totalOpex,totalNet,totalOpexByCategory,totalMargin:totalRevenue>0?totalGross/totalRevenue*100:0,totalNetMargin:totalRevenue>0?totalNet/totalRevenue*100:0};
}
function seriesStats(s,orders){
 return SERIES.map(ser=>{const agg={id:ser.id,name:ser.name,en:ser.en,qty:0,revenue:0,orderIds:new Set(),products:{}};
  orders.filter(o=>o.business==='fresh').forEach(o=>o.items.filter(l=>l.kind==='tea'&&l.series===ser.id).forEach(l=>{const remain=l.qty-l.refundedQty;if(remain<=0)return;const net=Math.floor(l.total*remain/l.qty);agg.qty+=remain;agg.revenue+=net;agg.orderIds.add(o.id);const row=agg.products[l.id]||(agg.products[l.id]={id:l.id,name:l.name,nameEn:l.nameEn,qty:0,revenue:0,orderIds:new Set()});row.qty+=remain;row.revenue+=net;row.orderIds.add(o.id);}));
  return {...agg,orders:agg.orderIds.size,products:Object.values(agg.products).map(p=>({...p,orders:p.orderIds.size})).sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name,'zh'))};});
}
function bulkProducts(s,ids,action,value){
 const list=[...new Set(ids||[])].map(id=>product(s,id));if(!list.length)fail('请先选择商品','Select at least one item.');
 if(action==='publish'||action==='archive'||action==='draft'){const status={publish:'published',archive:'archived',draft:'draft'}[action];list.forEach(p=>validateProduct(s,p,status==='published'));list.forEach(p=>{p.status=status;p.updatedAt=Date.now();});}
 else if(action==='price'){const pct=Number(value);if(!Number.isFinite(pct)||pct<=-95||pct>1000)fail('批量调价幅度需在 -95% 至 1000% 之间','Enter a price adjustment between -95% and 1000%.');list.forEach(p=>{p.price=Math.max(1,Math.round(p.price*(100+pct)/100));p.updatedAt=Date.now();});}
 else if(action==='dose'){const dose=round(Number(value));if(!Number.isFinite(dose)||dose<=0||dose>100)fail('请填写有效的每杯投茶量','Enter a valid dose per cup.');if(list.some(p=>p.kind!=='tea'))fail('只有鲜酿茶可以设置投茶量','Only fresh tea can use a brew dose.');list.forEach(p=>{p.dose=dose;p.updatedAt=Date.now();});}
 else if(action==='category'){const c=s.categories.find(c=>c.id===value);if(!c)fail('请选择有效分类','Choose a valid category.');if(list.some(p=>p.kind!==c.kind))fail('分类类型与所选商品不一致','The category does not match every selected item.');list.forEach(p=>{p.category=c.id;p.updatedAt=Date.now();});}
 else fail('未知的批量操作','Unknown bulk action.');
 const label={publish:'批量上架',archive:'批量下架',draft:'批量转为草稿',price:`批量调价 ${value}%`,dose:`批量投茶量 ${value}g`,category:'批量移动分类'}[action];
 log(s,'总部批量调整商品',`${list.length} 款 · ${label}`);return list;
}
function saveMappings(s,rows){
 if(!Array.isArray(rows)||!rows.length)fail('没有可保存的映射','No mappings to save.');
 const next=[...s.mappings],seen=new Set();
 for(const r of rows){
  const p=s.products.find(p=>p.id===r.productId);if(!p||p.kind!=='tea')fail('只有独立散茶可以配置原料映射','Only loose-leaf tea can use an ingredient mapping.');
  const externalId=String(r.externalId||'').trim(),unit=String(r.unit||'').trim(),factor=Number(r.factor);
  if(!externalId||!unit||!Number.isFinite(factor)||factor<=0)fail(`${p.name}的SKU、单位或换算克数无效`,`Check the SKU, unit and grams for ${p.name}.`);
  if(seen.has(externalId))fail(`原料SKU重复：${externalId}`,`Duplicate ingredient SKU: ${externalId}.`);seen.add(externalId);
  const idx=next.findIndex(m=>m.productId===p.id),item={externalId,unit,factor:round(factor),productId:p.id};
  if(idx>=0)next[idx]=item;else next.push(item);
 }
 s.mappings=next;log(s,'总部批量保存原料映射',`${rows.length} 款散茶`);return s.mappings;
}
function saveCategory(s,input){if(!input.name?.trim()||!input.nameEn?.trim())fail('请填写分类中英文名称');if(!['tea','bottle','retail'].includes(input.kind))fail('分类类型无效');if(s.categories.some(c=>c.id!==input.id&&c.name===input.name.trim()&&c.kind===input.kind))fail('同类型分类名称已存在');let c=s.categories.find(c=>c.id===input.id);if(c&&c.kind!==input.kind&&s.products.some(p=>p.category===c.id))fail('已有商品的分类不能更换类型');if(!c){c={id:'cat-'+Date.now()+'-'+s.categories.length};s.categories.push(c);}Object.assign(c,{name:input.name.trim(),nameEn:input.nameEn.trim(),kind:input.kind});log(s,'保存分类',c.name);return c;}
function removeCategory(s,id){if(s.products.some(p=>p.category===id))fail('分类下仍有商品，请先移动商品');s.categories=s.categories.filter(c=>c.id!==id);log(s,'删除空分类',id);}
function validateProduct(s,p,publishing=false){if(!p.name?.trim())fail('请填写商品名称');if(!Number.isInteger(p.price)||p.price<1||p.price>2000000)fail('价格必须大于0且不超过20000元');if(!Number.isFinite(p.dose)||p.dose<=0||p.dose>100||(p.kind!=='tea'&&p.dose!==1))fail('请填写有效单杯用量，成品用量固定为1');if(!s.categories.some(c=>c.id===p.category&&c.kind===p.kind))fail('请选择匹配类型的分类');if(!SERIES.some(x=>x.id===p.series))fail('请选择系列');if(!p.unit?.trim()||!p.unitEn?.trim())fail('请填写中英文销售单位');if(p.kind==='tea'&&(!p.temps?.length||p.temps.some(t=>!['热','冰'].includes(t))))fail('至少保留一种可售温度');if(publishing&&(!p.nameEn?.trim()||!p.desc?.trim()||!p.descEn?.trim()||!p.spec?.trim()||!p.specEn?.trim()))fail('上架前请补齐名称、介绍和规格的中英文内容');}
function saveProduct(s,input){let old=s.products.find(p=>p.id===input.id);if(old&&old.kind!==input.kind)fail('已有商品不能更改业务类型，请新增商品');const p={...old,...input,id:old?.id||`item-${Date.now()}-${s.products.length}`,status:old?.status||'draft',dose:round(input.dose),updatedAt:Date.now()};p.memberEligible=p.kind==='tea'&&!!p.memberEligible;validateProduct(s,p,p.status==='published');if(old)Object.assign(old,p);else{s.products.push(p);Object.values(s.stores).forEach(st=>st.stock[p.id]=0);old=p;}log(s,'保存商品',`${p.name} · ${p.status}`);return old;}
function setProductStatus(s,id,status){const p=product(s,id);if(!['draft','published','archived'].includes(status))fail('商品状态无效');validateProduct(s,p,status==='published');p.status=status;p.updatedAt=Date.now();log(s,status==='published'?'商品上架':'商品下架/草稿',p.name);return p;}
function importReceipt(s,r){
 if(!r.id||!r.poId||!s.stores[r.warehouseId]||!r.items?.length)fail('入库事件缺少单号、门店或明细');
 const fingerprint=JSON.stringify({poId:r.poId,warehouseId:r.warehouseId,items:r.items});const old=s.receipts.find(x=>x.id===r.id);if(old){if(old.fingerprint!==fingerprint)fail('相同入库单号内容冲突，已阻止重复入库');return {duplicate:true,receipt:old};}
 const totals={},details=[];
 for(const line of r.items){if(!Number.isInteger(line.acceptQty)||line.acceptQty<0||!Number.isInteger(line.rejectQty||0)||(line.rejectQty||0)<0)fail('实收和拒收数量须为非负整数');if(!line.acceptQty)continue;const map=s.mappings.find(x=>x.externalId===line.productId);if(!map)fail('存在未映射的原料SKU，请先配置');const p=product(s,map.productId);if(p.kind!=='tea'||map.unit!==line.unit||!Number.isFinite(map.factor)||map.factor<=0)fail('原料单位或换算配置不匹配');const grams=round(line.acceptQty*map.factor);totals[p.id]=round((totals[p.id]||0)+grams);details.push({productId:p.id,name:p.name,acceptQty:line.acceptQty,unit:line.unit,factor:map.factor,grams});}
 if(!details.length)fail('没有可入库的实收数量');
 for(const [pid,n]of Object.entries(totals))s.stores[r.warehouseId].stock[pid]=round((s.stores[r.warehouseId].stock[pid]||0)+n);
 const receipt={...r,fingerprint,details,at:Date.now(),source:'本地模拟在场验收入库'};s.receipts.unshift(receipt);log(s,'模拟在场入库同步',`${r.id} · ${details.map(x=>x.name+' +'+x.grams+'g').join('、')}`,{type:'receipt',storeId:r.warehouseId,receiptId:r.id});return {duplicate:false,receipt};
}
function seed(s){if(s.seeded)return s;s.seeded=true;const cases=[{channel:'mini',type:'dine',seat:'吧台06',lines:[{id:'song-0',qty:1,temp:'热'},{id:'xing-1',qty:1,temp:'冰',ice:'少冰'}]},{channel:'meituan',type:'delivery',lines:[{id:'qing-2',qty:2,temp:'冰',ice:'标准冰'}]},{channel:'mini',type:'takeaway',lines:[{id:'mian-4',qty:1,temp:'热'}]},{channel:'taobao',type:'delivery',lines:[{id:'xing-0',qty:1,temp:'热'}]},{channel:'assisted',type:'dine',seat:'窗边02',lines:[{id:'bottle',qty:1,temp:'冰镇'}]},{channel:'mini',type:'dine',seat:'吧台03',lines:[{id:'song-3',qty:1,temp:'热'}]}];cases.forEach((c,n)=>{const o=placeOrder(s,{store:'sh',owner:'guest',...c});o.createdAt=Date.now()-(6-n)*60000;o.paidAt=o.createdAt;if(n>=4)finishOrder(s,o.id);s.logs.filter(l=>l.orderId===o.id).forEach(l=>l.at=o.createdAt+(l.type==='created'?0:1000));});placeOrder(s,{store:'bj',channel:'mini',type:'dine',seat:'01桌',lines:[{id:'song-2',qty:1,temp:'热'}]});placeRetailOrder(s,{channel:'mini',owner:'guest',lines:[{id:'tea-bags',qty:1},{id:'tea-box',qty:1}]});s.finance.forEach(f=>{const o=s.orders.find(o=>o.id===f.orderId);if(o)f.at=o.paidAt;});try{const target=s.orders.find(o=>o.channel==='assisted'&&o.items.some(l=>l.kind==='bottle'));if(target){const ap=submitRefundApproval(s,'u-su',target.id,[{index:0,qty:1}],'顾客改变计划',true);ap.createdAt=target.createdAt+120000;s.logs.filter(l=>l.approvalId===ap.id).forEach(l=>l.at=ap.createdAt);}}catch(err){}try{const l=reportLoss(s,'u-su',{storeId:'sh',productId:'song-0',qty:15,reason:'开封后受潮',note:'演示样例：物料开封后未及时密封'});l.at=Date.now()-3*86400000;l.decidedAt=l.at;s.logs.filter(x=>x.lossId===l.id).forEach(x=>x.at=l.at);}catch(err){}return s;}
return {SERIES,FLAVORS,EXPENSE_CATEGORIES,EXPENSE_SOURCES,PERMISSION_MODULES,PERM_LEVEL_NAMES,PERMISSIONS,PAGE_PERM,ROLE_TEMPLATES,STAFF_TEMPLATES,initialState,catalog,unitPrice,quote,placeOrder,placeRetailOrder,deliverRetail,retailAvailable,finishOrder,undoReady,unitProgress,scanUnit,scanCupLabel,confirmUnit,undoLastUnit,reprint,remake,refund,cupCount,available,seed,log,event,product,getOrder,distance,nearestStore,financeSummary,storeProfit,expenseSummary,addExpense,previewExpenses,importExpenses,voidExpense,sampleExpenseText,seriesStats,bulkProducts,saveMappings,saveCategory,removeCategory,saveProduct,setProductStatus,importReceipt,
 monthRange,lossValue,lossSummary,lossWarnings,reportLoss,saveLossPolicy,
 account,rolesOf,permissionsOf,can,requirePerm,allowedStores,requireStore,roleNames,scopedRoleChoices,saveStaff,setStaffActive,saveRole,cloneRole,removeRole,
 refundLineAmount,refundQuote,refundFlow,refundNeedsApproval,pendingRefund,submitRefundApproval,decideApproval,requestRefund,visibleApprovals,myApprovals,saveRefundFlow};
});
