import fs from 'fs'
import path from 'path'


const roots = ['pages', 'components', 'App.vue', 'main.js', 'utils']
const files = []
function walk(p) {
  const st = fs.statSync(p)
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)) }
  else if (/\.(vue|js)$/.test(p)) files.push(p)
}
roots.forEach(walk)

const dictSrc = fs.readFileSync('utils/i18n.dict.js', 'utf8')
const keys = new Set()
const body = dictSrc.slice(dictSrc.indexOf('const dict = {'))
const re = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm
let m
while ((m = re.exec(body))) keys.add(m[1] ?? m[2])

const missing = {}
const used = new Set()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const calls = /(?<![\w.])t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
  let c
  while ((c = calls.exec(src))) {
    const k = c[1] ?? c[2]
    if (!/[\u4e00-\u9fa5]/.test(k)) continue
    used.add(k)
    if (!keys.has(k)) (missing[f] ||= []).push(k)
  }
}
let total = 0
for (const [f, arr] of Object.entries(missing)) {
  total += arr.length
  console.log('### ' + f)
  for (const k of arr) console.log('  ' + JSON.stringify(k))
}
console.log('MISSING TOTAL', total, 'DICT KEYS', keys.size)
const unused = [...keys].filter(k => !used.has(k))
console.log('UNUSED', unused.length)
fs.writeFileSync('/tmp/unused.json', JSON.stringify(unused, null, 0))
