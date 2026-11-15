from pathlib import Path
import re

SOURCE = Path(__file__).resolve().parent
V3 = SOURCE.parent / 'incentive-demo-v3'
V4 = SOURCE.parent / 'incentive-demo-v4'
ROOT = SOURCE.parents[2]
style = '\n'.join((p / 'styles.css').read_text() for p in (V3, V4, SOURCE))
views = '\n'.join((SOURCE / name).read_text() for name in ['mobile.js', 'admin.js', 'settings.js'])
script = (SOURCE / 'engine.js').read_text() + '\n' + (SOURCE / 'milestones.js').read_text() + '\n' + (SOURCE / 'ui.js').read_text().replace('/* V5_VIEWS */', views)
shell = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light"><meta name="theme-color" content="#6B463C"><title>__TITLE__</title><style>__STYLE__</style></head>
<body data-surface="__SURFACE__"><div id="app"></div>
<dialog id="settingsDialog" aria-labelledby="settingsTitle"><header class="dialog-head"><div><h2 id="settingsTitle">接单奖励参数</h2><p>仅修改本机演示配置，不写入正式系统</p></div><button class="icon-btn" data-close="settingsDialog" aria-label="关闭设置">×</button></header><div class="dialog-body"><nav class="settings-nav" id="settingsNav" aria-label="参数类别"></nav><div class="settings-content" id="settingsContent"></div></div><footer class="dialog-footer"><label class="field"><span>生效月份</span><input id="effective" type="month" value="2026-10" min="2026-10"></label><div><p id="settingsError" class="form-error" role="alert"></p><div class="toolbar"><button class="btn" data-close="settingsDialog">取消</button><button class="btn primary" id="saveSettings">保存演示版本</button></div></div></footer></dialog>
<dialog class="drawer" id="detailDialog" aria-labelledby="detailTitle"><header class="dialog-head"><div><h2 id="detailTitle">伙伴明细</h2><p>接单奖励与合作结算</p></div><button class="icon-btn" data-close="detailDialog" aria-label="关闭明细">×</button></header><div class="drawer-body" id="detailBody"></div></dialog>
<dialog id="trainingDialog" aria-labelledby="trainingTitle"><header class="dialog-head"><div><h2 id="trainingTitle">登记培训考核</h2><p>通过日期决定累计起点；次日起计算</p></div><button class="icon-btn" data-close="trainingDialog" aria-label="关闭考核登记">×</button></header><div class="dialog-body training-dialog-body" id="trainingFormBody"></div></dialog>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div><script>__SCRIPT__</script></body></html>'''
for surface, title, filename in [
    ('admin', 'Full愈 · 接单奖励管理 V5', 'Full愈-激励管理-PC端Demo-V5.html'),
    ('mobile', 'Full愈 · 我的接单奖励 V5', 'Full愈-接单奖励-手机端Demo-V5.html'),
]:
    document = shell.replace('__TITLE__', title).replace('__STYLE__', style).replace('__SURFACE__', surface).replace('__SCRIPT__', script)
    path = ROOT / filename
    path.write_text(document)
    print(f'{path}: {path.stat().st_size} bytes')
