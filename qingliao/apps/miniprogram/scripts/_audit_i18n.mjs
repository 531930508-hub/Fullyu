import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

const roots = ['pages', 'components', 'App.vue', 'main.js']
const files = []
function walk(p) {
  const st = fs.statSync(p)
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f))
  else if (/\.(vue|js)$/.test(p)) files.push(p)
}
roots.forEach(walk)

const CJK = /[\u4e00-\u9fa5]/
const report = {}

for (const f of files) {
  if (f.includes('副本')) continue
  const src = fs.readFileSync(f, 'utf8')
  const hits = []
  if (f.endsWith('.vue')) {
    const { descriptor } = parse(src, { filename: f })
    // strip all t('...') / tt('a','b') occurrences and comments from the whole source for a first pass
    let s = src
    for (const block of ['template', 'script', 'scriptSetup']) {
      const b = descriptor[block]
      if (!b) continue
      let content = b.content
      const offset = src.slice(0, b.loc.start.offset).split('\n').length - 1
      // remove t( ... ) / tt( ... ) calls (non-greedy, handles nested parens poorly but ok)
      content = content.replace(/\btt?\(\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)[^)]*\)/g, '')
      content = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
      content.replace(/^\s*\/\/.*$/gm, '')
      content.split('\n').forEach((line, i) => {
        const noComment = line.replace(/\/\/.*$/, '')
        if (CJK.test(noComment)) hits.push({ block, line: offset + i + 1, text: noComment.trim() })
      })
    }
  }
  if (hits.length) report[f] = hits
}
let total = 0
for (const [f, hits] of Object.entries(report)) {
  total += hits.length
  console.log('### ' + f + ' (' + hits.length + ')')
}
console.log('TOTAL', total)
fs.writeFileSync('/tmp/audit_i18n.json', JSON.stringify(report, null, 1))
