from pathlib import Path
import re

SOURCE = Path(__file__).resolve().parent
V3 = SOURCE.parent / 'incentive-demo-v3'
ROOT = SOURCE.parents[2]
# Reuse the approved shell and calculation sources without changing V3 files.
template = (ROOT / 'Full愈-接单奖励-手机端Demo-V3.html').read_text()
style = (V3 / 'styles.css').read_text() + '\n' + (SOURCE / 'styles.css').read_text()
views = '\n'.join([(SOURCE / 'mobile.js').read_text(), (V3 / 'admin.js').read_text(), (V3 / 'settings.js').read_text()])
ui = (V3 / 'ui.js').read_text().replace('Full愈-接单奖励-手机端Demo-V3.html', 'Full愈-接单奖励-手机端Demo-V4.html')
script = (V3 / 'engine.js').read_text() + '\n' + (SOURCE / 'milestones.js').read_text() + '\n' + ui.replace('/* V3_VIEWS */', views)
document = re.sub(r'<style>.*?</style>', lambda _: '<style>' + style + '</style>', template, count=1, flags=re.S)
document = re.sub(r'<script>.*?</script>', lambda _: '<script>' + script + '</script>', document, count=1, flags=re.S)
document = document.replace('<title>Full愈 · 我的接单奖励 V3</title>', '<title>Full愈 · 我的接单奖励 V4</title>')
path = ROOT / 'Full愈-接单奖励-手机端Demo-V4.html'
path.write_text(document)
print(f'{path}: {path.stat().st_size} bytes')
