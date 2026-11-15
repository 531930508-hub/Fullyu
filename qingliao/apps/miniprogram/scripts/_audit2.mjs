import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

const dictSrc = fs.readFileSync('utils/i18n.dict.js', 'utf8')
const dictKeys = new Set()
for (const m of dictSrc.matchAll(/^\s*(['"])((?:\\.|(?!\1).)*)\1\s*:/gm)) dictKeys.add(m[2])

const files = []
function walk(p) {
  const st = fs.statSync(p)
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) { if (f === 'node_modules') continue; walk(path.join(p, f)) } }
  else if (/\.(vue|js)$/.test(p)) files.push(p)
}
;['pages', 'components', 'utils', 'consts', 'filters', 'api'].forEach(walk)

const rows = []
for (const f of files) {
  if (f.includes('副本') || f.includes('i18n.dict')) continue
  const raw = fs.readFileSync(f, 'utf8')
  let blocks = []
  if (f.endsWith('.vue')) {
    const { descriptor } = parse(raw, { filename: f })
    for (const b of ['template', 'script', 'scriptSetup']) {
      const blk = descriptor[b]
      if (blk) blocks.push({ type: b, content: blk.content, startLine: raw.slice(0, blk.loc.start.offset).split('\n').length })
    }
  } else blocks.push({ type: 'js', content: raw, startLine: 1 })

  for (const b of blocks) {
    // strip comments
    let c = b.content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    c = c.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
    const lines = c.split('\n')
    lines.forEach((line, i) => {
      const lits = [...line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)]
      for (const lit of lits) {
        const val = lit[2]
        if (!/[\u4e00-\u9fa5]/.test(val)) continue
        if (/\$\{/.test(val)) { // template literal: keep parts
        }
        const before = line.slice(0, lit.index)
        const isT = /(?:^|[^A-Za-z0-9_$])(?:t|tt)\(\s*$/.test(before)
        // tt's second arg: check for tt('..','..'
        const isTtSecond = /(?:^|[^A-Za-z0-9_$])tt\(\s*(['"`])(?:\\.|(?!\1)[^\\])*\1\s*,\s*$/.test(before)
        const isLog = /console\.(log|error|warn|info)\(/.test(before)
        let inDict = dictKeys.has(val)
        // for template literals with vars, check static prefix in dict
        const staticPart = val.split('${')[0]
        if (!inDict && staticPart && staticPart !== val) inDict = dictKeys.has(staticPart)
        rows.push({ f, line: b.startLine + i, type: b.type, val, isT, isTtSecond, isLog, inDict, ctx: line.trim().slice(0, 120) })
      }
    })
  }
}
// report untranslated
const un = rows.filter(r => !r.isT && !r.isTtSecond && !r.isLog && !r.inDict)
console.log('total CJK literals:', rows.length, '| in-dict:', rows.filter(r=>r.inDict).length, '| t()-wrapped:', rows.filter(r=>r.isT||r.isTtSecond).length, '| suspicious:', un.length)
const byFile = {}
for (const r of un) (byFile[r.f] ||= []).push(r)
for (const [f, list] of Object.entries(byFile)) {
  console.log('\n### ' + f)
  for (const r of list) console.log('  ' + r.line + ' ' + JSON.stringify(r.val).slice(0, 90) + '   << ' + r.ctx.slice(0, 80))
}
fs.writeFileSync('/tmp/audit2.json', JSON.stringify({rows, un}, null, 1))
