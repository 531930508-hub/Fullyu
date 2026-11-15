import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

// utils/image.js 是 ESM，项目没有 "type": "module"，用 data URL 方式加载
const code = await readFile(new URL('../utils/image.js', import.meta.url), 'utf8')
const {img, shareImg, isOssImage} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

const OSS = 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/'
const PROCESS = '?x-oss-process=image/resize,w_750,limit_1/format,webp/quality,q_80'

test('只存了 object key 的头像/图片会补全 OSS 域名', () => {
  const key = 'fully/file/avatars/20251130/d0e875e7-9083-4440-818e-525192b01ca8(._.)avatar_1764505621396.jpg'
  const out = img(key)
  assert.ok(out.startsWith(OSS), out)
  assert.ok(out.endsWith(PROCESS), out)
  // 括号属于合法路径字符，不做转义即可
  assert.ok(out.includes('(._.)'), out)
})

test('以 / 开头的 object key 同样能补全域名', () => {
  assert.ok(img('/fully/file/massagist/a(._.)b.jpg').startsWith(OSS + 'fully/file/massagist/'))
})

test('已转义过的地址不会再被二次编码（%28 -> %2528 会让 OSS 404）', () => {
  const url = OSS + 'fully/file/miniImage/20260409/a4e460f6%28._.%29banner1%20%281%29.png?Expires=1&Signature=x'
  const out = img(url, 750)
  assert.ok(!out.includes('%25'), out)
  assert.ok(out.includes('%28._.%29banner1%20%281%29.png'), out)
  assert.ok(!out.includes('Signature'), '预签名参数应被丢弃')
})

test('未转义的中文/空格只编码一次', () => {
  const out = img(OSS + 'fully/icon/分享礼品卡 6.jpg', 300)
  assert.ok(out.includes('%E5%88%86%E4%BA%AB%E7%A4%BC%E5%93%81%E5%8D%A1%206.jpg'), out)
  assert.ok(!out.includes('%25'), out)
})

test('本地图 / data 图不受影响', () => {
  assert.equal(img('/static/icons/logo.png', 200), '/static/icons/logo.png')
  assert.equal(img('data:image/png;base64,AAA'), 'data:image/png;base64,AAA')
  assert.equal(img(''), '')
})

test('width 传 0 时只去签名不压缩', () => {
  const out = img(OSS + 'fully/a%20b.png?Expires=1', 0)
  assert.equal(out, OSS + 'fully/a%20b.png')
})

test('非 OSS 域名原样返回', () => {
  assert.equal(img('https://example.com/a.png', 200), 'https://example.com/a.png')
  assert.equal(isOssImage('https://example.com/a.png'), false)
})

test('分享图同样补域名且只编码一次', () => {
  const out = shareImg('fully/icon/分享礼品卡 6.jpg')
  assert.ok(out.startsWith(OSS), out)
  assert.ok(out.includes('m_pad') && out.includes('format,jpg'), out)
  assert.ok(!out.includes('%25'), out)
})