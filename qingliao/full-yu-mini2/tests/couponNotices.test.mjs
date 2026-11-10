import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
let rules={}
try { const code=await readFile(new URL('../utils/couponNotices.js',import.meta.url),'utf8'); rules=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')) } catch {}
function available(name) { assert.equal(typeof rules[name],'function',`缺少${name}`); return rules[name] }
const state=()=>available('newNoticeState')()
for (const file of ['pages/mall/my-card/my-card.vue', 'pages/user/index.vue']) {
 test(`${file} exposes notices only for signed-in customers`,async()=>{
   const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
   assert.match(source,/import CouponNoticePanel/);assert.match(source,/<CouponNoticePanel/);assert.match(source,/noticePanel\.value\?\.refresh\(\)/)
   const gate=file.includes('my-card')?'noticeLoggedIn':'userInfo.token';
   assert.ok(source.includes(`v-if="${gate}"`), '通知入口必须受登录状态控制');
   assert.match(source,/:key="noticePanelKey"/);assert.match(source,/noticePanelKey\.value\+\+/)
 })
}
test('notice pages default to ten and anonymous state can be cleared',()=>{
 const s=state();assert.equal(s.size,10);s.items=[{id:1}];s.unreadCount=9;available('resetNotices')(s);assert.deepEqual(s.items,[]);assert.equal(s.unreadCount,0)
})
test('list errors remain visible and release loading',async()=>{
 const s=state();await available('loadNotices')(s,{page:async()=>{throw new Error('offline')}},1);assert.equal(s.loading,false);assert.match(s.error,/暂时/);assert.deepEqual(s.items,[])
})
test('old request cannot overwrite newer page',async()=>{
 const s=state();let release;const api={page:async({page})=>page===1?new Promise(r=>release=r):({list:[{id:2}],total:2,unreadCount:1})};
 const first=available('loadNotices')(s,api,1);await available('loadNotices')(s,api,2);release({list:[{id:1}],total:1,unreadCount:0});await first;assert.equal(s.items[0].id,2);assert.equal(s.page,2)
})
test('logging out invalidates pending requests',async()=>{
 const s=state();let release;const pending=available('loadNotices')(s,{page:()=>new Promise(r=>release=r)},1);available('resetNotices')(s);release({list:[{id:1}],total:1,unreadCount:1});await pending;assert.deepEqual(s.items,[])
})
test('failed read keeps unread message and permits retry',async()=>{
 const s=state();s.items=[{id:1,readAt:null}];s.unreadCount=1;await assert.rejects(()=>available('readNotice')(s,{read:async()=>{throw new Error('offline')}},s.items[0]));assert.equal(s.items[0].readAt,null);assert.equal(s.unreadCount,1);assert.deepEqual(s.readingIds,[])
})
test('double read is submitted once and only changes after success',async()=>{
 const s=state();const row={id:1,readAt:null};s.items=[row];s.unreadCount=1;let release;let count=0;const api={read:()=>{count++;return new Promise(r=>release=r)}};
 const first=available('readNotice')(s,api,row);await available('readNotice')(s,api,row);assert.equal(row.readAt,null);release();await first;assert.equal(count,1);assert.equal(s.unreadCount,0);assert.ok(row.readAt)
})
test('no template never invokes WeChat authorization',async()=>{
 let count=0;const result=await available('subscribeCouponNotice')({config:async()=>({available:false})},()=>{count++});assert.equal(count,0);assert.equal(result.status,'not-configured')
})
test('accepted platform response records exact configured template once',async()=>{
 const calls=[];const api={config:async()=>({available:true,templateId:'synthetic'}),consent:async data=>calls.push(data)};
 const result=await available('subscribeCouponNotice')(api,async ids=>{assert.deepEqual(ids,['synthetic']);return {synthetic:'accept'}},'request-1234');assert.equal(result.status,'accept');assert.equal(calls.length,1);assert.equal(calls[0].requestId,'request-1234');assert.equal(calls[0].decision,'accept')
})
test('rejected authorization is recorded but never called success',async()=>{
 const calls=[];const result=await available('subscribeCouponNotice')({config:async()=>({available:true,templateId:'synthetic'}),consent:async data=>calls.push(data)},async()=>({synthetic:'reject'}),'request-1234');assert.equal(result.status,'reject');assert.equal(calls[0].decision,'reject')
})
test('unknown platform response is not fabricated as acceptance',async()=>{
 let count=0;await assert.rejects(()=>available('subscribeCouponNotice')({config:async()=>({available:true,templateId:'synthetic'}),consent:async()=>count++},async()=>({}),'request-1234'));assert.equal(count,0)
})
test('cached template preserves user gesture without a pre-authorization network request',async()=>{
 let called=false;const api={config:async()=>{throw new Error('must not fetch during gesture')},consent:async()=>{}};
 const pending=available('subscribeCouponNotice')(api,ids=>{called=true;return Promise.resolve({synthetic:'accept'})},'request-1234',{available:true,templateId:'synthetic'});assert.equal(called,true);await pending
})
test('save failure never reports subscription success',async()=>{
 await assert.rejects(()=>available('subscribeCouponNotice')({config:async()=>({available:true,templateId:'synthetic'}),consent:async()=>{throw new Error('offline')}},async()=>({synthetic:'accept'}),'request-1234'))
})
