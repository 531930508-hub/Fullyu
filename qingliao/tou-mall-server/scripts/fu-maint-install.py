#!/usr/bin/env python3
"""给指定的 nginx server 块接入维护页（P0-3），幂等。
用法: fu-maint-install.py --dry-run|--apply <conf> <server_name> <api_location_prefix>
"""
import sys, re, os, shutil, time

HTML = r"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>系统维护中 · 轻疗</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f6f4f1;color:#2b2b2b;font:16px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.card{max-width:34rem;padding:2.5rem 2rem;text-align:center}
h1{margin:0 0 .75rem;font-size:1.375rem;font-weight:600}
p{margin:.5rem 0;color:#5c5c5c;font-size:.95rem}
.bar{height:3px;width:6rem;margin:1.5rem auto;background:#d8cfc4;border-radius:2px;overflow:hidden}
.bar::after{content:"";display:block;height:100%;width:40%;background:#8a7f72;
animation:s 1.6s ease-in-out infinite}
@keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
.tip{margin-top:2rem;font-size:.8rem;color:#8a8a8a}
</style></head>
<body><div class="card">
<h1>系统正在维护</h1>
<p>我们正在升级系统，预计几分钟内恢复。</p>
<p>本页每 30 秒自动刷新，恢复后无需重新操作。</p>
<div class="bar"></div>
<p class="tip">如需紧急处理，请联系门店前台或您的专属顾问。</p>
</div></body></html>
"""

API_JSON = '{"code":503,"message":"系统维护中，请稍后重试","data":null}\n'

BLOCK_TMPL = """
	# >>> fu-maint (P0-3) 维护页：502/503/504 自动兜底；手动开关见 fu-maint.sh
	include /etc/nginx/snippets/mall-maint.inc;
	error_page 502 503 504 =503 @mall_maint;
	location @mall_maint {
		root /server/www/mall-maint;
		try_files /__maintenance.html =503;
	}
	location = /__maint_api.json {
		internal;
		root /server/www/mall-maint;
		default_type application/json;
	}
	# <<< fu-maint
"""


def patch(path, host, api_prefix, apply):
    src = open(path, encoding="utf-8").read()
    if ">>> fu-maint" in src:
        print(f"[skip] {path} 已接入")
        return False
    # 1) server_name 之后插入 error_page / location 块
    m = re.search(rf"^[ \t]*server_name[ \t]+{re.escape(host)};.*$", src, re.M)
    if not m:
        sys.exit(f"[fail] {path}: 找不到 server_name {host};")
    new = src[: m.end()] + "\n" + BLOCK_TMPL + src[m.end() :]
    # 2) /api/ 的 location 里加 JSON 兜底
    am = re.search(rf"^([ \t]*)location {re.escape(api_prefix)} \{{[^\n]*\n", new, re.M)
    if am:
        ins = f"{am.group(1)}\terror_page 502 503 504 =503 /__maint_api.json;\n"
        new = new[: am.end()] + ins + new[am.end() :]
    else:
        print(f"[warn] {path}: 没找到 location {api_prefix}，API 兜底未加")
    if not apply:
        print(f"=== DRY-RUN diff for {path} ===")
        import difflib
        sys.stdout.writelines(
            difflib.unified_diff(src.splitlines(True), new.splitlines(True),
                                 fromfile=path, tofile=path + ".new", n=2)
        )
        return True
    bak = f"{path}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, bak)
    open(path, "w", encoding="utf-8").write(new)
    print(f"[ok] {path} 已写入，备份 {bak}")
    return True


def ensure_assets():
    os.makedirs("/server/www/mall-maint", exist_ok=True)
    for name, body in (("__maintenance.html", HTML), ("__maint_api.json", API_JSON)):
        p = os.path.join("/server/www/mall-maint", name)
        if not os.path.exists(p):
            open(p, "w", encoding="utf-8").write(body)
            print(f"[ok] 生成 {p}")
    os.makedirs("/etc/nginx/snippets", exist_ok=True)
    inc = "/etc/nginx/snippets/mall-maint.inc"
    if not os.path.exists(inc):
        open(inc, "w").write("# 内容为空 = 正常运行；fu-maint.sh on 会写入 return 503;\n")
        print(f"[ok] 生成 {inc}")


if __name__ == "__main__":
    args = sys.argv[1:]
    apply = "--apply" in args
    args = [a for a in args if a not in ("--apply", "--dry-run")]
    if len(args) != 3:
        sys.exit(__doc__)
    if apply:
        ensure_assets()
    patch(args[0], args[1], args[2], apply)