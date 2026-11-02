/* Local-only prototype. No payments, messages, printers, or external APIs are called. */
window.U=(()=>{
 const D=window.TeaDemo,KEY='fullyu-teahour-demo-v2';let S;
 try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');S=raw?.version===7?raw:D.seed(D.initialState());}catch{S=D.seed(D.initialState());}
 let saved={};try{saved=JSON.parse(sessionStorage.getItem(KEY+'-ui')||'{}');}catch{}
 const ui={locale:'zh',retailCart:[],checkoutKind:'fresh',storeSelected:false,storeSource:'',storeConfirmed:false,city:'全部',geoStatus:'idle',coords:null,retailCategory:'all',retailFilter:'awaiting',retailSearch:'',productStatus:'all',categoryFilter:'all',surface:location.hash==='#workbench'?'workbench':location.hash==='#manage'?'manage':'mini',screen:'home',opsPage:location.hash==='#manage'?'hq-overview':'workbench',store:'sh',opsStore:'sh',series:'song',temp:'全部',flavor:'全部',menuAll:false,query:'',cart:[],posCart:[],type:'takeaway',seat:'吧台06',posType:'dine',posSeat:'吧台01',posMember:false,coupon:false,posCoupon:false,filter:'all',productKind:'all',productSearch:'',orderSearch:'',posSeries:'all',currentOrder:null,dashRange:'today',dashFrom:'',dashTo:'',financeRange:'today',financeFrom:'',financeTo:'',financeType:'all',financeStore:'all',financeSearch:'',expenseSheet:'',productSelection:[],stockKind:'all',lossStatus:'all',lossStore:'all',payMode:'qr',posPayMode:'qr',staffId:'u-lin',rbacTab:'staff',approvalTab:'todo',approvalStatus:'all',approvalSearch:'',selectedRoleId:'',...saved};
 const STORE_PAGES=['workbench','pos','retail','orders','availability','inventory','loss','dashboard','stores','logs'],HQ_PAGES=['hq-overview','finance','approvals','hq-loss','products','categories','mappings','hq-stores','rbac','hq-logs'];
 ui.surface=location.hash==='#workbench'?'workbench':location.hash==='#manage'?'manage':'mini';ui.opsPage=ui.surface==='workbench'?(STORE_PAGES.includes(ui.opsPage)?ui.opsPage:'workbench'):ui.surface==='manage'?(HQ_PAGES.includes(ui.opsPage)?ui.opsPage:'hq-overview'):ui.opsPage;
 if(!Array.isArray(ui.productSelection))ui.productSelection=[];
 const me=()=>{const list=S.staff||[];let u=list.find(x=>x.id===ui.staffId&&x.active);if(!u)u=list.find(x=>x.active&&(x.stores||[]).includes('*'))||list.find(x=>x.active)||list[0];if(u&&u.id!==ui.staffId)ui.staffId=u.id;return u;};
 const can=code=>D.can(S,me(),code);
 const myStores=()=>D.allowedStores(S,me());
 const pageAllowed=page=>{const code=D.PAGE_PERM?.[page];return !code||can(code);};
 const firstPage=surfaceName=>{const list=surfaceName==='manage'?HQ_PAGES:STORE_PAGES;return list.find(pageAllowed)||'';};
 if(!myStores().includes(ui.opsStore))ui.opsStore=myStores()[0]||'sh';
 if(!STORE_PAGES.includes(ui.opsPage)&&!HQ_PAGES.includes(ui.opsPage))ui.opsPage=ui.surface==='manage'?'hq-overview':'workbench';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=c=>(c/100).toLocaleString('zh-CN',{minimumFractionDigits:c%100?2:0,maximumFractionDigits:2});
 const paths={arrow:'M5 12h14m-5-5 5 5-5 5',chevron:'m9 5 7 7-7 7',back:'m15 5-7 7 7 7',plus:'M12 5v14M5 12h14',minus:'M5 12h14',close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7',cup:'M5 5h12v10a6 6 0 0 1-12 0V5Zm12 2h2a3 3 0 0 1 0 6h-2M3 22h17',bag:'M5 7h14l2 14H3L5 7ZM8 8V6a4 4 0 0 1 8 0v2',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 6 0 0 1 16 0v2',orders:'M6 3h12v19l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3',pin:'M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',search:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6',clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',print:'M6 8V2h12v6M6 17H3V8h18v9h-3M6 14h12v8H6v-8Zm11-3h1',grid:'M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',chart:'M4 3v18h18M8 17v-5M13 17V7M18 17V3',store:'M3 9l2-6h14l2 6M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v9h14v-9M10 21v-6h4v6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',more:'M4 12h.01M12 12h.01M20 12h.01',wifi:'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0M12 20h.01',refresh:'M20 7V2l-4 4M4 17v5l4-4M20 7A9 9 0 0 0 4 8m0 9a9 9 0 0 0 16-1',leaf:'M20 3C8 2 2 8 5 15s15 4 15-12ZM5 20 15 9',package:'m3 7 9-5 9 5v11l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v11M7 4l10 6',info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 11v6M12 7h.01',bell:'M5 17V9a7 7 0 0 1 14 0v8l2 2H3l2-2ZM10 22h4',shield:'m12 2 9 4v7c0 5-9 9-9 9S3 18 3 13V6l9-4Z',download:'M12 3v12m-5-5 5 5 5-5M4 17v5h16v-5',wallet:'M3 7h18v13H3V7Zm0 0 2-4h14l2 4M16 12h3M3 11h18',lock:'M6 11V7a6 6 0 0 1 12 0v4M5 11h14v11H5V11Z',flow:'M5 4h6v5H5V4Zm8 11h6v5h-6v-5ZM8 9v3a3 3 0 0 0 3 3h3M17 15V9',alert:'M12 3 2 21h20L12 3Zm0 6v7m0 3h.01',scan:'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16',qr:'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3h3m3-3v6h-6M14 14h.01M20 14h.01M14 20h.01'};
 function icon(name,size=19){return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]||paths.cup}"/></svg>`;}
 function btn(label,action,cls='btn',data='',disabled=false){return `<button type="button" class="${cls}" data-action="${action}" ${data} ${disabled?'disabled':''}>${label}</button>`;}
 function motif(series){const shape={xing:'M20 49a18 18 0 0 1 36 0M12 50h53M38 13v9M13 27l7 7M63 27l-7 7M24 60h28',song:'M8 30c12-18 18 18 30 0s18 18 30 0M8 44c12-18 18 18 30 0s18 18 30 0M8 58c12-18 18 18 30 0s18 18 30 0',qing:'m16 20 20 7-7 23c-3 8-20 3-18-5l5-25Zm34 0-18 9 10 21c4 7 18 0 15-7l-7-23ZM20 54l-3 11m-8-3 17 5M47 54l5 11m-6 4 15-8',mian:'M53 15C32 17 33 46 55 46A25 25 0 1 1 53 15ZM58 6v8m-4-4h8'}[series];return `<svg class="motif" viewBox="0 0 76 76" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="${shape}"/></svg>`;}
 function art(p,cls='product-thumb'){
 if(p.imageData)return `<div class="${cls}"><img src="${esc(p.imageData)}" alt="${esc(pname(p))}"></div>`;
 if(p.kind==='retail')return `<div class="${cls} retail-art ${p.category==='boxes'?'rose':p.category==='bags'?'apricot':'sage'}"><svg viewBox="0 0 130 140" role="img" aria-label="${esc(pname(p))}"><path d="M25 31 39 20h61l8 11v84H25Z" fill="#fffefa" stroke="#a99a85"/><path d="M25 31h83M91 31v84" stroke="#a99a85"/><rect x="37" y="44" width="42" height="56" rx="3" fill="${p.category==='boxes'?'#edd9cf':p.category==='bags'?'#f1deca':'#dde5d9'}"/><text x="58" y="68" text-anchor="middle" fill="#352f2b" font-size="18" font-family="serif">${D.SERIES.find(s=>s.id===p.series)?.name||'茶'}</text><text x="58" y="84" text-anchor="middle" fill="#352f2b" font-size="5">TEA HOUR</text><path d="M44 108h29" stroke="#a99a85"/></svg></div>`;
 const ser=D.SERIES.find(s=>s.id===p.series)||D.SERIES[0];
 if(p.kind==='bottle')return `<div class="${cls}"><img src="assets/celebration.jpg" alt="${t('瓶装茶概念图，非最终包装','Bottle concept, not final packaging')}"></div>`;
 const liquid=['#b88355','#c29849','#9b985c','#96714b','#c6b789'][p.flavor||0];
 const drawing=p.kind==='retail'?`<ellipse cx="65" cy="116" rx="35" ry="5" fill="#352f2b" opacity=".08"/><path d="M28 47h73l-8 65H36Z" fill="#fffdf6" stroke="#b7b0a2"/><ellipse cx="65" cy="47" rx="37" ry="12" fill="#faf8f0" stroke="#b7b0a2"/><ellipse cx="65" cy="47" rx="24" ry="7" fill="${liquid}"/><path d="M20 39h15v27H18l2-27Zm76 0h15l2 27H96Z" fill="#e7deca" stroke="#b7b0a2"/><text x="65" y="83" text-anchor="middle" fill="#694b3d" font-size="17" font-family="serif">${ser.name}</text><text x="65" y="98" text-anchor="middle" fill="#706b65" font-size="5" letter-spacing="1">TEA HOUR</text>`:`<ellipse cx="65" cy="119" rx="28" ry="5" fill="#352f2b" opacity=".08"/><path d="M34 22h62l-6 90q-25 12-50 0Z" fill="#fffefa" opacity=".8" stroke="#b4ac9c"/><path d="M38 48h54l-4 61q-23 9-46 0Z" fill="${liquid}" opacity=".83"/><ellipse cx="65" cy="48" rx="27" ry="6" fill="${liquid}"/><ellipse cx="65" cy="22" rx="31" ry="7" fill="#fffcf4" stroke="#b4ac9c"/><path d="M39 56h52l-2 31H41Z" fill="#f7f1e4"/><text x="65" y="75" text-anchor="middle" fill="#694b3d" font-size="17" font-family="serif">${ser.name}</text><text x="65" y="83" text-anchor="middle" fill="#706b65" font-size="4" letter-spacing="1">TEA HOUR</text><path d="M44 31 48 105" stroke="#fff" stroke-width="3" opacity=".6"/>`;
 return `<div class="${cls} ${ser.color}"><svg viewBox="0 0 130 140" role="img" aria-label="${esc(pname(p))} ${t('包装示意','packaging concept')}">${drawing}</svg></div>`;
 }
 function store(id=ui.store){return S.stores[id];}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch{toast('浏览器存储不可用，当前演示仅保留在本页');}try{sessionStorage.setItem(KEY+'-ui',JSON.stringify(ui));}catch{}}
 let toastTimer;
 function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
 let modalType='',modalData={};
 function modal(title,body,{wide=false,type='',data={}}={}){const el=document.getElementById('sheet');modalType=type;modalData=data;el.className=wide?'wide':'';el.innerHTML=`<div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2>${btn(icon('close',18),'close','icon-btn',`aria-label="${t('关闭弹窗','Close dialog')}"`)}</div><div class="sheet-body">${body}</div>`;if(!el.open)el.showModal();}
 function close(){document.getElementById('sheet').close();modalType='';}
 const t=(zh,en)=>ui.locale==='en'&&ui.surface==='mini'?en:zh;
 const pname=p=>t(p.name,p.nameEn||p.name);
 const storeName=st=>t(st.name,st.nameEn);
 const spec=v=>t(v,({'热':'Hot','冰':'Iced','冰镇':'Chilled','标准冰':'Regular ice','少冰':'Less ice','杯':'cup','瓶':'bottle','枚':'pack','盒':'box','袋':'bag'})[v]||v.replace('吧台','Counter ').replace('窗边','Window ').replace('桌',' Table'));
 const status=o=>t(({pending:'待出餐',ready:'已出餐',awaiting:'待领取',delivered:'已交付',refunded:'已退款'})[o.status],({pending:'Preparing',ready:'Ready',awaiting:'To collect',delivered:'Collected',refunded:'Refunded'})[o.status]);
 function orderLabel(o){return o.business==='retail'?t('任意门店领取','Pickup at any store'):o.type==='dine'?spec(o.seat):o.type==='takeaway'?t('现场外带','Takeaway'):o.platformNo;}
 function elapsed(o){return Math.max(0,Math.floor((Date.now()-o.createdAt)/60000));}
 function dateTime(n){return new Date(n).toLocaleTimeString(t('zh-CN','en-GB'),{hour:'2-digit',minute:'2-digit'});}
 function empty(title,sub,action=''){return `<div class="empty">${icon('cup',35)}<h3>${title}</h3><p class="small">${sub}</p>${action}</div>`;}
 const LOGO_SRC={zh:'assets/logo-zh.png',en:'assets/logo-en.png'};
 const logo=(lang='zh',cls='mini-logo')=>`<img class="${cls} ${lang}" src="${LOGO_SRC[lang]||LOGO_SRC.zh}" alt="Full愈·时叙 TEA HOUR">`;
 const DAY=864e5;
 function bounds(kind='today',from='',to=''){
  const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  if(kind==='7')return {from:start-6*DAY,to:start+DAY};
  if(kind==='30')return {from:start-29*DAY,to:start+DAY};
  if(kind==='custom'){
   const f=from?new Date(from+'T00:00:00').getTime():start,t=to?new Date(to+'T00:00:00').getTime():start;
   if(!Number.isFinite(f)||!Number.isFinite(t))return {from:start,to:start+DAY};
   return {from:Math.min(f,t),to:Math.max(f,t)+DAY};
  }
  return {from:start,to:start+DAY};
 }
 const inRange=(n,r)=>Number.isFinite(n)&&n>=r.from&&n<r.to;
 function rangeLabel(kind,from='',to=''){return kind==='7'?'近7天':kind==='30'?'近30天':kind==='custom'?(from&&to?from+' 至 '+to:'自定义日期'):'今天';}
 function stamp(n){const d=new Date(n);return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
 return {D,KEY,t,pname,storeName,spec,status,get S(){return S;},set S(v){S=v;},ui,esc,money,icon,btn,motif,art,store,persist,toast,modal,close,get modalType(){return modalType;},get modalData(){return modalData;},orderLabel,elapsed,dateTime,empty,logo,bounds,inRange,rangeLabel,stamp,me,can,myStores,pageAllowed,firstPage,STORE_PAGES,HQ_PAGES};
})();
