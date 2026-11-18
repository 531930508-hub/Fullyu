#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Full愈 · 三小程序（时叙 / 在场 / 轻疗）生产流量周报。

数据源：微信小程序「数据分析」官方接口（datacube），即小程序后台"数据分析"里的同一份数据；
只反映线上小程序的真实访问，与业务库、埋点表、测试环境无关。

周期  ：默认上一个完整自然周（周一 ~ 周日，Asia/Shanghai）
产出  ：HTML 邮件；--dry-run 只落文件不发信；--check 打印一致性核验
配置  ：/etc/miniprogram-weekly/weekly.env（600）
        - SMTP_*、REPORT_TO
        - MP_<brand>_APPID / MP_<brand>_NAME
        - WX_SECRETS_ENV：存放 WX_SECRET_<brand> 的 env 文件（默认 /etc/fullyu-crm/crm.env）
        微信接口有 IP 白名单：必须在白名单机器（生产 CRM 121.40）上运行。

用法：
  ./miniprogram_weekly.py                    # 发上周周报
  ./miniprogram_weekly.py --dry-run          # 只生成报告文件
  ./miniprogram_weekly.py --check            # 只做数据核验（周汇总 vs 日明细）
  ./miniprogram_weekly.py --week 2026-11-09  # 指定某周（周一日期）
"""

import argparse
import html
import json
import os
import smtplib
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

ENV_FILE = os.environ.get("WEEKLY_ENV", "/etc/miniprogram-weekly/weekly.env")
STATE_DIR = os.environ.get("WEEKLY_STATE_DIR", "/var/lib/miniprogram-weekly")
API = "https://api.weixin.qq.com"

# 品牌顺序按业务方习惯，与周报阅读顺序一致
APPS = [
    {"slot": "SX", "name": "时叙", "appid": "wxd9e4e4568d1bc8bb"},
    {"slot": "ZC", "name": "在场", "appid": "wxa7572dea26f5f4e4"},
    {"slot": "QL", "name": "轻疗", "appid": "wxeb4e8a99b7eeebf8"},
]

# 访问来源：getweanalysisappidvisitdistribution -> access_source_session_cnt
# key 定义见官方文档「访问来源 key 对应关系」（每个 key 对应一组场景值）
SOURCE_KEYS = {
    1: "小程序历史列表", 2: "搜索", 3: "会话", 4: "扫一扫二维码", 5: "公众号主页",
    6: "聊天顶部", 7: "系统桌面", 8: "小程序主页", 9: "附近的小程序", 10: "其他",
    11: "模板消息", 12: "客服消息", 13: "公众号菜单", 14: "APP分享",
    15: "支付完成页", 16: "长按识别二维码", 17: "相册选取二维码", 18: "公众号文章",
    19: "钱包", 20: "卡包", 21: "小程序内卡券", 22: "其他小程序",
    23: "其他小程序返回", 24: "卡券适用门店列表", 25: "搜索框快捷入口",
    26: "小程序客服消息", 27: "公众号下发", 28: "系统会话菜单",
    29: "任务栏-最近使用", 30: "长按小程序菜单圆点", 31: "连wifi成功页",
    32: "城市服务", 33: "微信广告", 34: "其他移动应用", 35: "发现入口-我的小程序",
    36: "任务栏-我的小程序", 37: "微信圈子", 38: "手机充值", 39: "H5", 40: "插件",
    41: "大家在用", 42: "发现页", 43: "浮窗", 44: "附近的人", 45: "看一看",
    46: "朋友圈", 47: "企业微信", 48: "视频", 49: "收藏", 50: "微信红包",
    51: "微信游戏中心", 52: "摇一摇", 53: "公众号导购消息", 54: "识物",
    55: "小程序订单", 56: "小程序直播", 57: "群工具",
}

# 停留时长分布（单位：秒）
STAY_KEYS = {
    1: "0-2s", 2: "3-5s", 3: "6-10s", 4: "11-20s", 5: "20-30s",
    6: "30-50s", 7: "50-100s", 8: ">100s",
}

# 访问深度分布（单位：页）
DEPTH_KEYS = {1: "1页", 2: "2页", 3: "3页", 4: "4页", 5: "5页", 6: "6-10页", 7: ">10页"}


def load_env(path, override=False):
    if not path or not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'\"")
            if override:
                os.environ[key] = value
            else:
                os.environ.setdefault(key, value)


class WeChatError(RuntimeError):
    pass


RETRYABLE = {"-1", "61504", "45009", "45011"}


def _open(url, data=None, retries=3):
    last = None
    for attempt in range(retries + 1):
        time.sleep(0.4)  # datacube 接口有 QPS 限制（61504 system busy）
        try:
            req = urllib.request.Request(
                url, data=data, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = json.loads(resp.read().decode("utf-8", "replace"))
            code = str(body.get("errcode") or "")
            if code:
                if code in RETRYABLE and attempt < retries:
                    time.sleep(2 * (attempt + 1))
                    continue
                raise WeChatError("%s %s" % (code, body.get("errmsg", "")))
            return body
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise WeChatError("请求失败：%s" % last)


def api_post(path, token, payload, retries=3):
    url = "%s%s?access_token=%s" % (API, path, token)
    return _open(url, json.dumps(payload).encode("utf-8"), retries)


def api_get(path, token, retries=3):
    return _open("%s%s?access_token=%s" % (API, path, token), None, retries)


def basic_info(token):
    data = api_get("/cgi-bin/account/getaccountbasicinfo", token)
    return {"nickname": data.get("nickname", ""), "principal": data.get("principal_name", "")}


def get_token(appid, secret):
    body = api_post(
        "/cgi-bin/stable_token",
        "",
        {"grant_type": "client_credential", "appid": appid, "secret": secret},
    )
    token = body.get("access_token")
    if not token:
        raise WeChatError("未取得 access_token")
    return token


def weekly_metrics(token, monday):
    end = monday + timedelta(days=6)
    body = api_post(
        "/datacube/getweanalysisappidweeklyvisittrend",
        token,
        {"begin_date": monday.strftime("%Y%m%d"), "end_date": end.strftime("%Y%m%d")},
    )
    rows = body.get("list") or []
    return rows[0] if rows else {}


def daily_metrics(token, monday):
    out = []
    for offset in range(7):
        day = monday + timedelta(days=offset)
        body = api_post(
            "/datacube/getweanalysisappiddailyvisittrend",
            token,
            {"begin_date": day.strftime("%Y%m%d"), "end_date": day.strftime("%Y%m%d")},
        )
        rows = body.get("list") or []
        if rows:
            out.append(rows[0])
    return out


def distribution(token, monday):
    """7 天逐日拉取并汇总；返回 {index: {key: value}}。"""
    agg = {}
    for offset in range(7):
        day = monday + timedelta(days=offset)
        body = api_post(
            "/datacube/getweanalysisappidvisitdistribution",
            token,
            {"begin_date": day.strftime("%Y%m%d"), "end_date": day.strftime("%Y%m%d")},
        )
        for group in body.get("list") or []:
            index = group.get("index")
            if not index:
                continue
            bucket = agg.setdefault(index, {})
            for item in group.get("item_list") or []:
                key = str(item.get("key"))
                bucket[key] = bucket.get(key, 0) + int(item.get("value") or 0)
    return agg


def fetch_app(app, monday):
    result = {
        "name": app["name"],
        "appid": app["appid"],
        "nickname": "",
        "principal": "",
        "weekly": {},
        "prev": {},
        "history": [],
        "daily": [],
        "dist": {},
        "error": None,
    }
    try:
        secret_key = os.environ.get("MP_%s_SECRET" % app["slot"], "WX_SECRET_%s" % app["slot"])
        secret = os.environ.get(secret_key, "")
        if not secret:
            raise WeChatError("缺少密钥 %s" % secret_key)
        token = get_token(app["appid"], secret)
        info = basic_info(token)
        result["nickname"] = info["nickname"]
        result["principal"] = info["principal"]
        # 近 5 周（含本周）周趋势，用于看走势/上线时点
        for offset in range(4, -1, -1):
            week = monday - timedelta(days=7 * offset)
            result["history"].append((week, weekly_metrics(token, week)))
        result["weekly"] = result["history"][-1][1]
        result["prev"] = result["history"][-2][1]
        result["daily"] = daily_metrics(token, monday)
        result["dist"] = distribution(token, monday)
    except WeChatError as exc:
        result["error"] = str(exc)
    return result


def num(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def fmt_int(value):
    return "{:,}".format(int(num(value)))


def fmt_sec(value):
    seconds = num(value)
    if seconds <= 0:
        return "0s"
    if seconds < 60:
        return "%.0fs" % seconds
    return "%d分%02ds" % (int(seconds // 60), int(round(seconds % 60)))


def fmt_delta(cur, prev):
    cur, prev = num(cur), num(prev)
    if prev <= 0:
        return "—", "flat"
    diff = cur - prev
    pct = diff / prev * 100.0
    if abs(pct) < 0.5:
        return "持平", "flat"
    arrow = "▲" if diff > 0 else "▼"
    cls = "up" if diff > 0 else "down"
    return "%s %.0f%%" % (arrow, abs(pct)), cls


def top_rows(bucket, names):
    rows = []
    for key, value in bucket.items():
        if not value:
            continue
        try:
            label = names.get(int(key), "其他")
        except (TypeError, ValueError):
            label = "其他"
        rows.append((label, value))
    rows.sort(key=lambda item: item[1], reverse=True)
    return rows


def build_html(monday, apps, generated_at):
    sunday = monday + timedelta(days=6)
    period = "%s – %s" % (monday.strftime("%m/%d"), sunday.strftime("%m/%d"))
    active = [a for a in apps if not a["error"]]
    total_sessions = sum(int(num(a["weekly"].get("session_cnt"))) for a in active)

    parts = []
    parts.append(
        """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Full愈 小程序流量周报</title>
<style>
body{margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2933}
.wrap{max-width:820px;margin:0 auto;padding:24px 16px 40px}
.head{background:linear-gradient(135deg,#0f6b5c,#1f9c83);border-radius:14px;padding:22px 24px;color:#fff}
.head h1{margin:0 0 6px;font-size:21px;letter-spacing:.5px}
.head p{margin:0;font-size:13px;opacity:.92}
.card{background:#fff;border-radius:12px;padding:18px 20px;margin-top:16px;box-shadow:0 1px 3px rgba(15,23,42,.06)}
.card h2{margin:0 0 4px;font-size:16px;color:#0f6b5c}
.card .sub{margin:0 0 14px;font-size:12px;color:#7b8794}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 6px;text-align:right;border-bottom:1px solid #eef1f4;white-space:nowrap}
th{font-size:12px;color:#7b8794;font-weight:600;text-align:right}
th:first-child,td:first-child{text-align:left}
tr:last-child td{border-bottom:none}
.up{color:#0b8457}.down{color:#c0392b}.flat{color:#9aa5b1}
.kpis{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 2px}
.kpi{flex:1 1 120px;background:#f8fafb;border-radius:9px;padding:10px 12px}
.kpi .k{font-size:11px;color:#7b8794;margin-bottom:4px}
.kpi .v{font-size:17px;font-weight:600;color:#1f2933}
.kpi .d{font-size:11px;margin-top:3px}
.two{display:flex;gap:16px;flex-wrap:wrap}
.two>div{flex:1 1 300px;min-width:260px}
.empty{background:#fff8e6;border-left:3px solid #e6a23c;padding:10px 12px;font-size:12.5px;color:#8a6d3b;border-radius:6px}
.note{font-size:12px;color:#7b8794;line-height:1.7;margin-top:18px}
.tag{display:inline-block;font-size:11px;border:1px solid #cfe5df;color:#0f6b5c;border-radius:10px;padding:1px 7px;margin-left:6px;vertical-align:2px}
.foot{margin-top:22px;font-size:11px;color:#9aa5b1;text-align:center}
@media(max-width:520px){.wrap{padding:12px}th,td{padding:7px 3px;font-size:12px}}
</style></head><body><div class="wrap">"""
    )
    parts.append(
        '<div class="head"><h1>Full愈 · 三小程序流量周报</h1>'
        '<p>%s（周一–周日）· 生产环境 · 周会话合计 %s</p></div>' % (period, fmt_int(total_sessions))
    )

    # 概览
    parts.append(
        '<div class="card"><h2>概览</h2><p class="sub">微信官方数据 · 上周 vs 前一周</p>'
        "<table><tr><th>小程序</th><th>周会话</th><th>访问人数</th><th>新增用户</th>"
        "<th>浏览量 PV</th><th>人均停留</th><th>人均页数</th><th>会话环比</th></tr>"
    )
    for app in apps:
        if app["error"]:
            parts.append(
                '<tr><td>%s</td><td colspan="7" style="text-align:left;color:#c0392b">数据获取失败：%s</td></tr>'
                % (html.escape(app["name"]), html.escape(app["error"]))
            )
            continue
        weekly = app["weekly"]
        delta, cls = fmt_delta(weekly.get("session_cnt"), app["prev"].get("session_cnt"))
        parts.append(
            "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%.1f</td>"
            '<td class="%s">%s</td></tr>'
            % (
                html.escape(app["name"]),
                fmt_int(weekly.get("session_cnt")),
                fmt_int(weekly.get("visit_uv")),
                fmt_int(weekly.get("visit_uv_new")),
                fmt_int(weekly.get("visit_pv")),
                fmt_sec(weekly.get("stay_time_uv")),
                num(weekly.get("visit_depth")),
                cls,
                delta,
            )
        )
    parts.append("</table>")

    # 分品牌
    for app in apps:
        if app["error"]:
            continue
        weekly, prev = app["weekly"], app["prev"]
        sessions = int(num(weekly.get("session_cnt")))
        tag = app["nickname"] or app["appid"]
        meta = "appid %s" % app["appid"]
        if app["principal"]:
            meta += " · %s" % app["principal"]
        meta += " · %s" % period
        parts.append('<div class="card"><h2>%s<span class="tag">%s</span></h2>'
                     '<p class="sub">%s</p>' % (html.escape(app["name"]), html.escape(tag), html.escape(meta)))
        if sessions == 0 and int(num(weekly.get("visit_uv"))) == 0:
            series = " / ".join(fmt_int(w.get("session_cnt")) for _, w in app["history"])
            parts.append(
                '<div class="empty">本周该小程序没有任何访问数据（近 5 周会话：%s）。常见原因：尚未提交审核/发布、'
                "未投放（无二维码/分享入口），或线上 appid 与本报告配置不一致。</div></div>" % series
            )
            continue

        kpis = [
            ("周会话", fmt_int(weekly.get("session_cnt")), weekly.get("session_cnt"), prev.get("session_cnt")),
            ("访问人数 UV", fmt_int(weekly.get("visit_uv")), weekly.get("visit_uv"), prev.get("visit_uv")),
            ("新增用户", fmt_int(weekly.get("visit_uv_new")), weekly.get("visit_uv_new"), prev.get("visit_uv_new")),
            ("浏览量 PV", fmt_int(weekly.get("visit_pv")), weekly.get("visit_pv"), prev.get("visit_pv")),
        ]
        parts.append('<div class="kpis">')
        for label, value, cur, old in kpis:
            delta, cls = fmt_delta(cur, old)
            parts.append(
                '<div class="kpi"><div class="k">%s</div><div class="v">%s</div>'
                '<div class="d %s">%s</div></div>' % (label, value, cls, delta)
            )
        parts.append(
            '<div class="kpi"><div class="k">人均停留</div><div class="v">%s</div>'
            '<div class="d">次均 %s</div></div>' % (
                fmt_sec(weekly.get("stay_time_uv")), fmt_sec(weekly.get("stay_time_session")))
        )
        parts.append(
            '<div class="kpi"><div class="k">人均页数</div><div class="v">%.1f</div>'
            '<div class="d">页/人</div></div></div>' % num(weekly.get("visit_depth"))
        )
        hist_head = "".join("<th>%s</th>" % week.strftime("%m/%d") for week, _ in app["history"])
        hist_body = "".join(
            "<td>%s</td>" % fmt_int(week_row.get("session_cnt")) for _, week_row in app["history"]
        )
        parts.append(
            '<div style="margin-top:6px;font-size:11px;color:#7b8794">近 5 周会话（含本周）</div>'
            '<table class="hist" style="margin-top:2px;font-size:12px"><tr>%s</tr><tr>%s</tr></table>'
            % (hist_head, hist_body)
        )
        if sessions < 10:
            series = " / ".join(fmt_int(w.get("session_cnt")) for _, w in app["history"])
            parts.append(
                '<div class="empty" style="margin-top:10px">本周仅 %d 次会话（近 5 周：%s），基本等同于未投放：'
                "若小程序已上线，请检查是否缺少入口/二维码/分享，或是否只有测试人员访问。</div>"
                % (sessions, series)
            )

        # 日趋势
        parts.append('<h2 style="margin-top:16px">每日趋势</h2><p class="sub">按自然日，微信统计口径</p>'
                     "<table><tr><th>日期</th><th>会话</th><th>访问人数</th><th>新增</th><th>PV</th>"
                     "<th>人均停留</th><th>页/人</th></tr>")
        for offset, day in enumerate(app["daily"]):
            raw = str(day.get("ref_date", ""))
            label = raw[4:6] + "/" + raw[6:8] if len(raw) == 8 else raw
            label += " " + "一二三四五六日"[offset % 7]
            parts.append(
                "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%.1f</td></tr>"
                % (
                    label,
                    fmt_int(day.get("session_cnt")),
                    fmt_int(day.get("visit_uv")),
                    fmt_int(day.get("visit_uv_new")),
                    fmt_int(day.get("visit_pv")),
                    fmt_sec(day.get("stay_time_uv")),
                    num(day.get("visit_depth")),
                )
            )
        parts.append("</table>")

        # 来源 + 停留/深度
        sources = top_rows(app["dist"].get("access_source_session_cnt", {}), SOURCE_KEYS)[:8]
        stay = top_rows(app["dist"].get("access_staytime_info", {}), STAY_KEYS)
        depth = top_rows(app["dist"].get("access_depth_info", {}), DEPTH_KEYS)
        parts.append('<div class="two" style="margin-top:18px">')
        parts.append('<div><h2>访问来源</h2><p class="sub">7 日合计，按会话数</p>'
                     "<table><tr><th>来源</th><th>会话</th><th>占比</th></tr>")
        for name, value in sources:
            share = value / sessions * 100 if sessions else 0
            parts.append("<tr><td>%s</td><td>%s</td><td>%.0f%%</td></tr>"
                         % (html.escape(name), fmt_int(value), share))
        parts.append("</table></div>")
        parts.append('<div><h2>停留时长 / 访问深度</h2><p class="sub">7 日合计</p>'
                     "<table><tr><th>停留</th><th>次数</th><th>深度</th><th>次数</th></tr>")
        for idx in range(max(len(stay), len(depth))):
            left = stay[idx] if idx < len(stay) else ("", None)
            right = depth[idx] if idx < len(depth) else ("", None)
            parts.append(
                "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>"
                % (
                    html.escape(left[0]),
                    fmt_int(left[1]) if left[1] is not None else "",
                    html.escape(right[0]),
                    fmt_int(right[1]) if right[1] is not None else "",
                )
            )
        parts.append("</table></div></div>")
        parts.append("</div>")

    parts.append(
        '<div class="note">口径说明'
        "<br>· 数据取自微信小程序「数据分析」官方接口（周趋势 / 日趋势 / 访问分布），"
        "与小程序后台同名报表一致；不包含 H5、公众号、管理后台的访问。"
        "<br>· 会话＝打开小程序次数；访问人数 UV＝周内去重人数；新增用户＝周内首次访问人数；"
        "人均停留＝停留总时长 / 访问人数。"
        "<br>· 微信日数据存在 T+1 延迟，周一取上周整周数据不受影响。"
        '<br>· 生成时间 %s（Asia/Shanghai）</div>' % generated_at.strftime("%Y-%m-%d %H:%M")
    )
    parts.append('<div class="foot">Full愈 · 自动周报 · 数据源 api.weixin.qq.com/datacube</div>')
    parts.append("</div></body></html>")
    return "".join(parts)


def build_text(monday, apps):
    sunday = monday + timedelta(days=6)
    lines = ["Full愈 · 三小程序流量周报 %s – %s（生产）" % (monday.strftime("%m/%d"), sunday.strftime("%m/%d")), ""]
    for app in apps:
        if app["error"]:
            lines.append("%s：数据获取失败（%s）" % (app["name"], app["error"]))
            continue
        weekly = app["weekly"]
        lines.append(
            "%s：会话 %s ｜ 访问人数 %s ｜ 新增 %s ｜ PV %s ｜ 人均停留 %s ｜ 人均页数 %.1f"
            % (
                app["name"],
                fmt_int(weekly.get("session_cnt")),
                fmt_int(weekly.get("visit_uv")),
                fmt_int(weekly.get("visit_uv_new")),
                fmt_int(weekly.get("visit_pv")),
                fmt_sec(weekly.get("stay_time_uv")),
                num(weekly.get("visit_depth")),
            )
        )
    lines.append("")
    lines.append("详见 HTML 版。数据源：微信小程序数据分析官方接口。")
    return "\n".join(lines)


def send_mail(subject, html_body, text_body):
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "465"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user)
    sender_name = os.environ.get("SMTP_FROM_NAME", "Full愈数据")
    recipients = [r.strip() for r in os.environ.get("REPORT_TO", "").split(",") if r.strip()]
    if not (host and user and password and recipients):
        raise RuntimeError("SMTP 配置不完整：检查 SMTP_HOST/USER/PASS/REPORT_TO")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header(sender_name, "utf-8")), sender))
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if os.environ.get("SMTP_SSL", "1") == "1":
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=30, context=context) as server:
            server.login(user, password)
            server.sendmail(sender, recipients, msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(user, password)
            server.sendmail(sender, recipients, msg.as_string())
    return recipients


def resolve_monday(value):
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    today = datetime.now()  # 服务器时区为 Asia/Shanghai
    this_monday = (today - timedelta(days=today.weekday())).date()
    return this_monday - timedelta(days=7)


def check(apps, monday):
    print("核验：周趋势汇总 vs 日趋势合计（%s ~ %s）" % (monday, monday + timedelta(days=6)))
    ok = True
    for app in apps:
        if app["error"]:
            print("  %s: 失败 %s" % (app["name"], app["error"]))
            ok = False
            continue
        weekly = app["weekly"]
        daily_sum = sum(int(num(d.get("session_cnt"))) for d in app["daily"])
        dist_sum = sum(int(num(v)) for v in app["dist"].get("access_source_session_cnt", {}).values())
        rows = len(app["daily"])
        mark = "OK" if int(num(weekly.get("session_cnt"))) == daily_sum else "MISMATCH"
        if mark != "OK":
            ok = False
        print(
            "  %-4s %-10s 周会话 %-6s 日合计 %-6s 来源合计 %-6s 天数 %d  %s"
            % (
                app["name"],
                app["nickname"] or "-",
                fmt_int(weekly.get("session_cnt")),
                fmt_int(daily_sum),
                fmt_int(dist_sum),
                rows,
                mark,
            )
        )
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description="Full愈三小程序生产流量周报")
    parser.add_argument("--week", help="周一日期 YYYY-MM-DD，默认上一个完整自然周")
    parser.add_argument("--dry-run", action="store_true", help="只生成 HTML，不发信")
    parser.add_argument("--check", action="store_true", help="只做数据一致性核验")
    parser.add_argument("--out", help="报告输出目录，默认 %s" % STATE_DIR)
    args = parser.parse_args()

    load_env(os.environ.get("WX_SECRETS_ENV", "/etc/fullyu-crm/crm.env"))
    load_env(ENV_FILE, override=True)

    monday = resolve_monday(args.week)
    apps = []
    for app in APPS:
        slot = app["slot"]
        merged = dict(app)
        merged["name"] = os.environ.get("MP_%s_NAME" % slot, app["name"])
        merged["appid"] = os.environ.get("MP_%s_APPID" % slot, app["appid"])
        apps.append(fetch_app(merged, monday))

    if args.check:
        return check(apps, monday)

    generated_at = datetime.now()
    html_body = build_html(monday, apps, generated_at)
    text_body = build_text(monday, apps)

    out_dir = args.out or STATE_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "miniprogram-weekly-%s.html" % monday.strftime("%Y%m%d"))
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(html_body)
    print("报告已生成：%s" % path)

    failures = [a for a in apps if a["error"]]
    for app in failures:
        print("警告：%s 数据获取失败 - %s" % (app["name"], app["error"]), file=sys.stderr)
    if len(failures) == len(apps):
        print("全部小程序取数失败，不发信。", file=sys.stderr)
        return 2

    if not args.dry_run:
        sunday = monday + timedelta(days=6)
        subject = "【Full愈·小程序】生产流量周报 %s–%s" % (monday.strftime("%m/%d"), sunday.strftime("%m/%d"))
        recipients = send_mail(subject, html_body, text_body)
        print("已发送：%s" % ", ".join(recipients))
    return 0


if __name__ == "__main__":
    sys.exit(main())
