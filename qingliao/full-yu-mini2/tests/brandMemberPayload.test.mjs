import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
let rules={}
try {
  const code=await readFile(new URL('../utils/brandMemberPayload.js',import.meta.url),'utf8')
  rules=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
} catch {}
function available(name) { assert.equal(typeof rules[name],'function',`缺少${name}`); return rules[name] }
const normalize=(raw,fallback)=>available('normalizeBrandMember')(raw,fallback)
const identity=raw=>available('hasBrandIdentity')(raw)

test('complete CRM payload keeps every value the page renders',()=>{
  const raw={
    member:{memberNo:'FY-2611-009867',name:'林小满',phoneMasked:'139****1111'},
    card:{state:'ACTIVE',productCode:'FY_ANNUAL',remainingDays:120},
    points:{balance:66,expiring:10,expireAt:'2028-01-01',spend:{retreat:'1_point_1_yuan'}},
    dice:{balance:3,station:2,monthlyEarned:5},
    prizes:{pending:1},
    savedCents:8600,
    benefits:[{business:'retreat',title:'轻疗',desc:'会员价'}],
    businessCards:[],
    game:{enabled:true,dice:3}
  }
  const out=normalize(raw,[])
  assert.equal(out.member.name,'林小满')
  assert.equal(out.card.state,'ACTIVE')
  assert.equal(out.points.balance,66)
  assert.equal(out.dice.balance,3)
  assert.equal(out.prizes.pending,1)
  assert.equal(out.savedCents,8600)
  assert.equal(out.benefits.length,1)
  assert.equal(out.game.enabled,true)
})

test('partial payload cannot leave the member page blank',()=>{
  const out=normalize({member:{memberNo:'FY-1'},card:{state:'NONE'},points:{balance:0}},[{business:'retreat',title:'轻疗',desc:'会员价'}])
  assert.equal(out.dice.balance,0)
  assert.equal(out.prizes.pending,0)
  assert.deepEqual(out.game,{enabled:false,dice:0})
  assert.equal(out.savedCents,0)
  assert.equal(out.benefits.length,1,'权益为空时回退到页面内置说明')
  assert.equal(out.points.expiring,0)
  assert.equal(out.member.name,'Full愈会员')
})

test('null or non-object payload never throws',()=>{
  for (const raw of [null,undefined,'x',42]) {
    const out=normalize(raw,[])
    assert.equal(out.card.state,'NONE')
    assert.equal(out.points.balance,0)
    assert.equal(out.dice.balance,0)
    assert.equal(out.prizes.pending,0)
  }
})

test('identity check rejects responses that would be misread as 未开通',()=>{
  assert.equal(identity({member:{memberNo:'FY-1'},card:{state:'NONE'},points:{balance:0}}),true)
  assert.equal(identity(null),false)
  assert.equal(identity({}),false)
  assert.equal(identity({member:{memberNo:'FY-1'},card:{state:'NONE'}}),false)
  assert.equal(identity({member:null,card:{state:'NONE'},points:{balance:0}}),false)
  assert.equal(identity({member:{memberNo:'FY-1'},card:{state:'NONE'},points:{balance:'0'}}),false)
})

test('dice progress, renewal and vouchers survive normalization and bad values are dropped',()=>{
  const out=normalize({
    member:{memberNo:'FY-1'},card:{state:'EXPIRING',remainingDays:12},points:{balance:0},
    dice:{balance:1,progress:{perDieCents:30000,progressCents:24000,remainingCents:6000,percent:180,headline:'再消费 ¥60 可再得一次游戏机会',tip:{business:'ql',external:'retreat',title:'提前一天约轻疗',text:'提前一天预约享会员价'}}},
    renewal:{show:true,savedCents:8600,remainingDays:12,text:'这张卡已经帮你省下 ¥86'},
    vouchers:[{code:'FYG8K2QM',title:'年卡茶礼',status:'ISSUED'},null,{title:'无码'}]
  },[])
  assert.equal(out.dice.progress.percent,100,'百分比夹到 0–100')
  assert.equal(out.dice.progress.remainingCents,6000)
  assert.equal(out.dice.progress.tip.external,'retreat')
  assert.equal(out.renewal.show,true)
  assert.equal(out.renewal.savedCents,8600)
  assert.deepEqual(out.vouchers.map(v=>v.code),['FYG8K2QM'],'无提货码的礼券不展示')
})

test('missing or malformed progress never renders a broken bar',()=>{
  const base={member:{memberNo:'FY-1'},card:{state:'ACTIVE'},points:{balance:0}}
  assert.equal(normalize(base,[]).dice.progress,null)
  assert.equal(normalize({...base,dice:{progress:{perDieCents:0,headline:'x'}}},[]).dice.progress,null)
  assert.equal(normalize({...base,dice:{progress:'bad'}},[]).dice.progress,null)
  const noPct=normalize({...base,dice:{progress:{perDieCents:30000,progressCents:7500,remainingCents:22500}}},[]).dice.progress
  assert.equal(noPct.percent,25,'缺 percent 时按进度推算')
  assert.equal(noPct.headline,'再消费 ¥225 可再得一次游戏机会')
  assert.deepEqual(normalize(base,[]).renewal,{show:false})
  assert.deepEqual(normalize(base,[]).vouchers,[])
})

test('refund quote shows CRM breakdown and blocks submit when not allowed or zero',()=>{
  const quote=available('normalizeRefundQuote')
  const after=quote({paidCents:29900,savedCents:8600,redeemedGiftCents:3000,refundCents:18300,within7Days:false,allowed:true,deadline:'2026-11-15 10:00:00',policy:'可退 ¥183'})
  assert.equal(after.paidCents,29900)
  assert.equal(after.savedCents,8600)
  assert.equal(after.redeemedGiftCents,3000)
  assert.equal(after.refundCents,18300)
  assert.equal(after.canSubmit,true)
  assert.equal(after.showSaved,true)
  assert.equal(after.blockText,'')

  const within=quote({paidCents:29900,savedCents:8600,redeemedGiftCents:0,refundCents:29900,within7Days:true,allowed:true})
  assert.equal(within.showSaved,false,'7 天内不扣已享优惠，不展示该行')
  assert.equal(within.canSubmit,true)

  const zero=quote({paidCents:4500,savedCents:6000,refundCents:0,within7Days:false,allowed:false,policy:'已享优惠超过实付，不可退款'})
  assert.equal(zero.canSubmit,false)
  assert.equal(zero.blockText,'已享优惠超过实付，不可退款')

  const sync=quote({paidCents:29900,refundCents:0,allowed:false,reasonCode:'SAVINGS_SYNC_PENDING',policy:'会员优惠记录正在同步，暂不能在线退款，请联系工作人员核对'})
  assert.equal(sync.canSubmit,false)
  assert.match(sync.blockText,/正在同步/)

  const allowedButZero=quote({paidCents:4500,refundCents:0,allowed:true})
  assert.equal(allowedButZero.canSubmit,false,'可退 ≤0 时绝不提交')
  assert.ok(allowedButZero.blockText)
})

test('refund quote errors and garbage never enable submit',()=>{
  const quote=available('normalizeRefundQuote')
  const failed=quote({paidCents:29900,allowed:false,refundQuoteError:'会员服务暂时不可用'})
  assert.equal(failed.canSubmit,false)
  assert.equal(failed.blockText,'会员服务暂时不可用')
  const junk=quote({paidCents:'abc',refundCents:-5,allowed:'yes'})
  assert.equal(junk.paidCents,0)
  assert.equal(junk.refundCents,0)
  assert.equal(junk.canSubmit,false)
  assert.equal(quote(null).canSubmit,false)
  const capped=quote({paidCents:4500,refundCents:9900,allowed:true})
  assert.equal(capped.canSubmit,false,'可退大于实付属于数据异常')
})
