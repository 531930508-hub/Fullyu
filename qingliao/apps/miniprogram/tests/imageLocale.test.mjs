import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'

const file = new URL('../utils/imageLocale.js', import.meta.url)
const base = 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/'
const enAssets = base + 'fully/icon/i18n/en/'
const source = readFileSync(new URL('../utils/image.js', import.meta.url), 'utf8')
const { img: optimizeImage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

function session(initial = 'en') {
  assert.ok(existsSync(file), 'localized image resolver exists')
  const lang = { value: initial }
  const context = vm.createContext({ optimizeImage, useLocale: () => ({ lang }) })
  const code = readFileSync(file, 'utf8').replace(/^import .+$/gm, '').replace(/\bexport /g, '')
  vm.runInContext(code + '\nthis.api = { img, englishImages };', context)
  return { ...context.api, lang }
}

test('known image follows current language in both directions', () => {
  const api = session('zh')
  const url = base + 'fully/icon/v2.0/headdetail.jpg'
  assert.equal(api.img(url, 600), optimizeImage(url, 600))
  api.lang.value = 'en'
  assert.equal(api.img(url, 600), enAssets + 'head-detail-v1.jpg')
  api.lang.value = 'zh'
  assert.equal(api.img(url, 600), optimizeImage(url, 600))
})

test('known object keys and processed URLs match the same image', () => {
  const api = session()
  for (const url of [
    'fully/icon/v2.0/headdetail.jpg', '/fully/icon/v2.0/headdetail.jpg',
    base + 'fully/icon/v2.0/headdetail.jpg?x-oss-process=image/resize,w_600',
    '//fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/headdetail.jpg'
  ]) assert.equal(api.img(url), enAssets + 'head-detail-v1.jpg')
})

test('unrecognized and other-host images keep existing optimization and fallback', () => {
  const api = session()
  for (const url of [undefined, '', base + 'fully/new.jpg', '/static/icons/logo.png', 'https://example.com/fully/icon/v2.0/headdetail.jpg']) {
    assert.equal(api.img(url, 300), optimizeImage(url, 300))
  }
})

test('english images live on the OSS bucket, not in the package', () => {
  const api = session()
  assert.ok(Object.keys(api.englishImages).length >= 28)
  for (const [key, value] of Object.entries(api.englishImages)) {
    // 本地图会顶穿微信主包 2MB 上限，英文图一律走 OSS。
    assert.ok(value.startsWith(enAssets), `${key} -> ${value}`)
    const url = key.startsWith('/static/') ? key : base + key
    assert.equal(api.img(url), value)
    if (!key.startsWith('/static/')) assert.equal(api.img(encodeURI(url) + '?Expires=1&Signature=old'), value)
  }
  assert.equal(existsSync(new URL('../static/i18n/en', import.meta.url)), false, '本地不再保留英文图，否则包体超 2MB')
})

test('lottery rewards retain their original point amounts', () => {
  const api = session()
  for (const n of [1, 3, 6, 10]) {
    for (const state of ['', '-highlight']) {
      assert.equal(api.img(`/static/icons/lottery/prize-${n}${state}.png`), `${enAssets}prize-${n}${state}-v1.png`)
    }
  }
})
