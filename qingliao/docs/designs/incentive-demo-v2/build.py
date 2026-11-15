from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
style = (SOURCE / 'styles.css').read_text()
script = (SOURCE / 'engine.js').read_text() + '\n' + (SOURCE / 'ui.js').read_text()
for surface, title, filename in [
    ('admin', 'Full愈 · 当月激励管理', 'Full愈-激励管理-PC端Demo.html'),
    ('mobile', 'Full愈 · 我的服务与收入', 'Full愈-当月激励-手机端Demo.html'),
]:
    document = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light"><title>''' + title + '''</title><style>''' + style + '''</style></head>
<body data-surface="''' + surface + '''"><div id="app"></div>
<dialog id="settingsDialog" aria-labelledby="settingsTitle"><header class="dialog-head"><div><h2 id="settingsTitle">激励参数设置</h2><p>仅修改本机演示配置，不写入正式系统</p></div><button class="icon-btn" data-close="settingsDialog" aria-label="关闭设置">×</button></header><div class="dialog-body"><nav class="settings-nav" id="settingsNav" aria-label="参数类别"></nav><div class="settings-content" id="settingsContent"></div></div><footer class="dialog-footer"><label class="field"><span>生效月份</span><input id="effective" type="month" value="2026-10" min="2026-10"></label><div><p id="settingsError" class="form-error" role="alert"></p><div class="toolbar"><button class="btn" data-close="settingsDialog">取消</button><button class="btn primary" id="saveSettings">保存演示版本</button></div></div></footer></dialog>
<dialog class="drawer" id="detailDialog" aria-labelledby="detailTitle"><header class="dialog-head"><div><h2 id="detailTitle">伙伴明细</h2><p>当月激励与原结算明细整合</p></div><button class="icon-btn" data-close="detailDialog" aria-label="关闭明细">×</button></header><div class="drawer-body" id="detailBody"></div></dialog>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div><script>''' + script + '''</script></body></html>'''
    path = ROOT / filename
    path.write_text(document)
    print(f'{path}: {path.stat().st_size} bytes')
