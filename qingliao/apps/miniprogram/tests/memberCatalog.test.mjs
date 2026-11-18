import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

let catalog = {}
try {
  const code = await readFile(new URL('../utils/memberCatalog.js', import.meta.url), 'utf8')
  catalog = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
} catch {}

function available(name) {
  assert.equal(typeof catalog[name], 'function', `缺少${name}`)
  return catalog[name]
}

const normalizeCatalog = (payload) => available('normalizeCatalog')(payload)
const discountText = (product, locale) => available('discountText')(product, locale)
const priceLabel = (product) => available('priceLabel')(product)
const entryPrice = (products) => available('entryPrice')(products)

test('server catalog keeps CRM price/days and settlement discount', () => {
  const out = normalizeCatalog({
    defaultProductCode: 'FY_ANNUAL',
    products: [
      { code: 'FY_MONTH', name: 'Full愈月卡', priceCents: 9900, validDays: 90, advanceRate: 0.94, advanceDiscountText: '9.4 折' },
      { code: 'FY_ANNUAL', name: 'Full愈大会员', priceCents: 36500, validDays: 365, advanceRate: 0.755, advanceDiscountText: '7.55 折' }
    ]
  })
  assert.equal(out.defaultProductCode, 'FY_ANNUAL')
  const annual = out.products.find((item) => item.code === 'FY_ANNUAL')
  assert.equal(annual.priceCents, 36500)
  assert.equal(annual.validDays, 365)
  assert.equal(priceLabel(annual), '¥365')
  assert.equal(discountText(annual, 'zh'), '7.55 折')
  assert.equal(discountText(annual, 'en'), '24.5% off')
})

test('default code falls back to annual then first product', () => {
  const withAnnual = normalizeCatalog([
    { code: 'FY_TRIAL', name: '体验卡', priceCents: 1000, validDays: 7 },
    { code: 'FY_ANNUAL', name: 'Full愈大会员', priceCents: 36500, validDays: 365 }
  ])
  assert.equal(withAnnual.defaultProductCode, 'FY_ANNUAL')

  const withoutAnnual = normalizeCatalog([{ code: 'FY_TRIAL', name: '体验卡', priceCents: 1000, validDays: 7 }])
  assert.equal(withoutAnnual.defaultProductCode, 'FY_TRIAL')

  assert.equal(normalizeCatalog(null).defaultProductCode, '')
})

test('missing directory yields no invented price or discount', () => {
  const out = normalizeCatalog(undefined)
  assert.deepEqual(out.products, [])
  assert.equal(priceLabel(null), '')
  assert.equal(discountText(null, 'zh'), '')
  assert.equal(discountText({ code: 'FY_ANNUAL', priceCents: 36500 }, 'zh'), '')
  assert.equal(discountText({ code: 'FY_ANNUAL', priceCents: 36500 }, 'en'), '')
})

test('rows without code or with junk numbers are not rendered as prices', () => {
  const out = normalizeCatalog([
    { name: '无名卡', priceCents: 100 },
    { code: 'FY_MONTH', name: 'Full愈月卡', priceCents: 'n/a', validDays: '90' }
  ])
  assert.equal(out.products.length, 1)
  assert.equal(out.products[0].priceCents, null)
  assert.equal(out.products[0].validDays, 90)
  assert.equal(priceLabel(out.products[0]), '')
})

test('entry price reports the cheapest plan and marks 起 only when there are several', () => {
  const { products } = normalizeCatalog([
    { code: 'FY_MONTH', name: 'Full愈月卡', priceCents: 9900, validDays: 90 },
    { code: 'FY_ANNUAL', name: 'Full愈大会员', priceCents: 36500, validDays: 365 }
  ])
  // 入口不能拿默认档（年卡 ¥365）的价再手写「起」：最低一档是 90 天 ¥99。
  assert.deepEqual(entryPrice(products), { amountCents: 9900, validDays: 90, from: true })
})

test('single plan is quoted without 起, and order does not matter', () => {
  const single = normalizeCatalog([{ code: 'FY_ANNUAL', name: 'Full愈大会员', priceCents: 36500, validDays: 365 }]).products
  assert.deepEqual(entryPrice(single), { amountCents: 36500, validDays: 365, from: false })
  const reversed = normalizeCatalog([
    { code: 'FY_ANNUAL', name: 'Full愈大会员', priceCents: 36500, validDays: 365 },
    { code: 'FY_MONTH', name: 'Full愈月卡', priceCents: 9900, validDays: 90 }
  ]).products
  assert.deepEqual(entryPrice(reversed), { amountCents: 9900, validDays: 90, from: true })
})

test('entry price stays null when the directory has no usable price', () => {
  assert.equal(entryPrice([]), null)
  assert.equal(entryPrice(null), null)
  // 两档里只有一档有价：报有价的那一档，但只有一档可选，不写「起」。
  assert.deepEqual(
    entryPrice([
      { code: 'FY_MONTH', name: 'Full愈月卡', priceCents: null, validDays: 90 },
      { code: 'FY_ANNUAL', name: 'Full愈大会员', priceCents: 36500, validDays: 365 }
    ]),
    { amountCents: 36500, validDays: 365, from: false }
  )
})