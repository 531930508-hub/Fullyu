# 生成单文件 crm-admin.html：把 crm.css 与 index.html 中的脚本按原顺序内联。用法：python3 build-single.py
import re, pathlib
d = pathlib.Path(__file__).resolve().parent  # 与本脚本同目录
html = (d/'index.html').read_text()
css = (d/'crm.css').read_text()
html = html.replace('<link rel="stylesheet" href="crm.css">', '<style>\n' + css + '\n</style>')
def inline(m):
    src = m.group(1)
    js = (d/src).read_text()
    assert '</script' not in js.lower()
    return f'<script>/* ==== {src} ==== */\n{js}\n</script>'
html, n = re.subn(r'<script src="([\w.-]+)"></script>', inline, html)
html = html.replace('<!-- 脚本顺序：数据 → 外壳 → 各页面；合并版 crm-admin.html 按同一顺序内联 -->',
  '<!-- 单文件合并版：由 index.html + crm.css + 各 js 按原顺序内联生成，修改请改源文件后重新合并 -->')
assert 'src=' not in html and 'href="crm.css"' not in html
(d/'crm-admin.html').write_text(html)
print('inlined', n, 'scripts,', len(html.encode()), 'bytes')
