#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
轻疗小程序埋点周报。

数据源：tou_mall_test.n_page_event（小程序 utils/tracking.js 上报的页面停留明细）
周期  ：默认上一个完整自然周（周一 00:00 ~ 下周一 00:00，Asia/Shanghai）
产出  ：HTML 邮件；--dry-run 时只落文件不发信
配置  ：同目录 mail.env（600），见文件头注释

用法：
  ./page_event_weekly.py                 # 发上周周报
  ./page_event_weekly.py --dry-run       # 只生成报告文件
  ./page_event_weekly.py --week 2026-11-09   # 指定某周（周一日期）
"""

import argparse
import html
import os
import smtplib
import subprocess
import sys
from datetime import datetime, timedelta
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(os.path.dirname(BASE_DIR), "mail.env")
REPORT_DIR = os.path.join(os.path.dirname(BASE_DIR), "reports")
DB_DEFAULTS = "/opt/fullyu-mall-test/.db.cnf"
DB_NAME = "tou_mall_test"

SCENE_NAMES = {
    "1001": "发现栏入口",
    "1005": "微信搜索",
    "1006": "发现栏搜索",
    "1007": "聊天分享（单聊）",
    "1008": "群聊分享",
    "1011": "扫二维码",
    "1012": "长按识别二维码",
    "1013": "相册识别二维码",
    "1014": "小程序订阅消息",
    "1017": "小程序跳转",
    "1019": "微信钱包",
    "1020": "公众号关联小程序",
    "1022": "聊天置顶入口",
    "1023": "安卓顶部搜索",
    "1024": "小程序资料页",
    "1025": "扫一维码",
    "1026": "附近的小程序",
    "1027": "顶部搜索入口",
    "1028": "我的卡包",
    "1029": "长按识别小程序码",
    "1030": "小程序卡片",
    "1031": "小程序跳小程序",
    "1032": "群聊会话",
    "1034": "微信支付完成页",
    "1035": "公众号菜单",
    "1036": "App 分享卡片",
    "1037": "小程序打开小程序",
    "1038": "从其他小程序返回",
    "1042": "添加好友搜索",
    "1043": "公众号模板消息",
    "1044": "带 shareTicket 的卡片",
    "1045": "朋友圈广告",
    "1046": "朋友圈广告",
    "1047": "扫小程序码",
    "1048": "长按识别小程序码",
    "1049": "聊天主界面下拉",
    "1050": "我的小程序下拉",
    "1052": "视频号",
    "1053": "搜一搜",
    "1054": "搜一搜结果页",
    "1058": "视频号直播",
    "1089": "微信广告",
    "1090": "朋友圈广告",
}


def load_env(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def q(sql):
    """执行查询，返回 list[dict]。用 mysql CLI，避免额外依赖。"""
    cmd = [
        "mysql", "--defaults-extra-file=" + DB_DEFAULTS, DB_NAME,
        "--default-character-set=utf8mb4", "-B", "--raw", "-e", sql,
    ]
    out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
    text = out.decode("utf-8", "replace").rstrip("\n")
    if not text:
        return []
    lines = text.split("\n")
    headers = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        values = line.split("\t")
        if len(values) != len(headers):
            continue
        rows.append(dict(zip(headers, values)))
    return rows


def to_int(value):
    if value is None or value == "" or value == "NULL":
        return 0
    return int(value)


def window(week_start):
    start = week_start.strftime("%Y-%m-%d 00:00:00")
    end = (week_start + timedelta(days=7)).strftime("%Y-%m-%d 00:00:00")
    return start, end


def summary(start, end):
    sql = (
        "SELECT COUNT(*) pv, COUNT(DISTINCT session_id) sessions,"
        " COUNT(DISTINCT customer_id) users,"
        " COALESCE(SUM(stay_duration),0) stay_ms"
        " FROM n_page_event WHERE create_time >= '%s' AND create_time < '%s'"
    ) % (start, end)
    rows = q(sql)
    row = rows[0] if rows else {}
    pv = to_int(row.get("pv"))
    sessions = to_int(row.get("sessions"))
    users = to_int(row.get("users"))
    stay_ms = to_int(row.get("stay_ms"))
    return {
        "pv": pv,
        "sessions": sessions,
        "users": users,
        "pages_per_session": round(pv / sessions, 1) if sessions else 0,
        "stay_per_session": round(stay_ms / 1000 / sessions, 0) if sessions else 0,
    }


def page_rank(start, end, limit=15):
    sql = (
        "SELECT page_path, COALESCE(MAX(page_title), page_path) title,"
        " COUNT(*) pv, COUNT(DISTINCT session_id) sessions,"
        " ROUND(AVG(stay_duration)/1000, 1) avg_sec"
        " FROM n_page_event WHERE create_time >= '%s' AND create_time < '%s'"
        " GROUP BY page_path ORDER BY pv DESC LIMIT %d"
    ) % (start, end, limit)
    return q(sql)


def scene_rank(start, end, limit=15):
    sql = (
        "SELECT COALESCE(scene,'') scene, COUNT(*) pv,"
        " COUNT(DISTINCT session_id) sessions, COUNT(DISTINCT customer_id) users"
        " FROM n_page_event WHERE create_time >= '%s' AND create_time < '%s'"
        " GROUP BY COALESCE(scene,'') ORDER BY sessions DESC LIMIT %d"
    ) % (start, end, limit)
    return q(sql)


def path_flow(start, end, limit=10):
    sql = (
        "SELECT from_page, page_path, COUNT(*) cnt"
        " FROM n_page_event WHERE create_time >= '%s' AND create_time < '%s'"
        " AND from_page IS NOT NULL AND from_page <> ''"
        " GROUP BY from_page, page_path ORDER BY cnt DESC LIMIT %d"
    ) % (start, end, limit)
    return q(sql)


def daily(start, end):
    sql = (
        "SELECT DATE(create_time) d, COUNT(DISTINCT session_id) sessions, COUNT(*) pv"
        " FROM n_page_event WHERE create_time >= '%s' AND create_time < '%s'"
        " GROUP BY DATE(create_time) ORDER BY d"
    ) % (start, end)
    return q(sql)


def fade_stats(start, end):
    sql = (
        "SELECT COUNT(*) total,"
        " SUM(CASE WHEN pages = 1 THEN 1 ELSE 0 END) single_page,"
        " SUM(CASE WHEN pages = 1 AND has_index = 1 THEN 1 ELSE 0 END) index_bounce"
        " FROM (SELECT session_id, COUNT(DISTINCT page_path) pages,"
        " MAX(CASE WHEN page_path = 'pages/index/index' THEN 1 ELSE 0 END) has_index"
        " FROM n_page_event WHERE create_time >= '%s' AND create_time < '%s'"
        " GROUP BY session_id) t"
    ) % (start, end)
    rows = q(sql)
    row = rows[0] if rows else {}
    total = to_int(row.get("total"))
    single = to_int(row.get("single_page"))
    bounce = to_int(row.get("index_bounce"))
    return {
        "sessions": total,
        "single_rate": round(single * 100.0 / total, 1) if total else 0,
        "index_bounce_rate": round(bounce * 100.0 / total, 1) if total else 0,
    }


def fmt_delta(cur, prev):
    if prev == 0:
        return "—" if cur == 0 else "新增"
    delta = (cur - prev) * 100.0 / prev
    sign = "+" if delta >= 0 else ""
    return "%s%.1f%%" % (sign, delta)


def table(headers, rows, aligns=None):
    if not rows:
        return "<p class='muted'>本周暂无数据</p>"
    aligns = aligns or ["left"] * len(headers)
    out = ["<table><thead><tr>"]
    for h in headers:
        out.append("<th>%s</th>" % html.escape(h))
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>")
        for i, cell in enumerate(row):
            out.append("<td class='%s'>%s</td>" % (aligns[i], html.escape(str(cell))))
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def build_html(week_start, cur, prev, fade, pages, scenes, flows, days):
    end = week_start + timedelta(days=7)
    title = "轻疗小程序埋点周报"
    period = "%s ~ %s" % (week_start.strftime("%Y-%m-%d"), (end - timedelta(days=1)).strftime("%Y-%m-%d"))

    cards = [
        ("访问会话", cur["sessions"], fmt_delta(cur["sessions"], prev["sessions"])),
        ("页面浏览", cur["pv"], fmt_delta(cur["pv"], prev["pv"])),
        ("登录访客", cur["users"], fmt_delta(cur["users"], prev["users"])),
        ("人均浏览页数", cur["pages_per_session"], fmt_delta(cur["pages_per_session"], prev["pages_per_session"])),
        ("人均停留(秒)", cur["stay_per_session"], fmt_delta(cur["stay_per_session"], prev["stay_per_session"])),
        ("只看一页就走", "%.1f%%" % fade["single_rate"], "占会话比"),
        ("首页直接跳出", "%.1f%%" % fade["index_bounce_rate"], "占会话比"),
    ]
    card_html = "".join(
        "<div class='card'><div class='k'>%s</div><div class='v'>%s</div><div class='d'>%s</div></div>"
        % (html.escape(k), html.escape(str(v)), html.escape(str(d)))
        for k, v, d in cards
    )

    page_rows = [
        (r["title"] or r["page_path"], r["page_path"], r["pv"], r["sessions"], r["avg_sec"] + "s")
        for r in pages
    ]
    scene_rows = []
    for r in scenes:
        key = r["scene"] or ""
        name = SCENE_NAMES.get(key, ("其他场景 %s" % key) if key else "未带场景值")
        scene_rows.append((name, r["sessions"], r["pv"], r["users"]))
    flow_rows = [
        ((r["from_page"] or "") + " → " + (r["page_path"] or ""), r["cnt"])
        for r in flows
    ]
    day_rows = [(r["d"], r["sessions"], r["pv"]) for r in days]

    # 数据健康：整周有数据，但最后两天归零，通常是埋点中断而不是没人来
    stale = ""
    if cur["sessions"] > 0:
        by_day = {r["d"]: to_int(r["sessions"]) for r in days}
        last_two = [(week_start + timedelta(days=5)).strftime("%Y-%m-%d"),
                    (week_start + timedelta(days=6)).strftime("%Y-%m-%d")]
        earlier = sum(v for k, v in by_day.items() if k not in last_two)
        if earlier > 0 and not any(by_day.get(d, 0) for d in last_two):
            stale = ("<div class='note'>最近两天没有采集到数据，但更早有数据，"
                     "埋点可能中断（小程序版本回退或接口异常）。建议检查 n_page_event 最新记录时间。</div>")

    if cur["sessions"] == 0:
        note = ("<div class='note'>本周没有采集到任何埋点数据。常见原因："
                "小程序尚未更新到包含埋点的版本，或接口未生效。可先检查 n_page_event 是否有新记录。</div>")
    else:
        note = ""

    return """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>%s</title>
<style>
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#222;background:#f6f6f6;margin:0;padding:24px}
.wrap{max-width:760px;margin:0 auto;background:#fff;border-radius:12px;padding:28px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#888;font-size:13px;margin-bottom:20px}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}
.card{flex:1 1 30%%;min-width:160px;background:#faf8f3;border:1px solid #eee3cc;border-radius:10px;padding:12px 14px}
.card .k{font-size:12px;color:#8a6d3b}
.card .v{font-size:22px;font-weight:600;margin:4px 0 2px}
.card .d{font-size:12px;color:#999}
h2{font-size:15px;margin:24px 0 8px;padding-left:8px;border-left:3px solid #8a6d3b}
table{width:100%%;border-collapse:collapse;font-size:13px}
th,td{padding:7px 8px;border-bottom:1px solid #eee;text-align:left}
th{color:#888;font-weight:500;background:#fcfcfc}
td.right,th.right{text-align:right}
.muted{color:#999;font-size:13px}
.note{background:#fff7e6;border:1px solid #ffe0a3;border-radius:8px;padding:10px 12px;font-size:13px;color:#7a5a00;margin-bottom:18px}
.foot{color:#aaa;font-size:12px;margin-top:26px;border-top:1px solid #eee;padding-top:12px}
</style></head><body><div class="wrap">
<h1>%s</h1>
<div class="sub">周期：%s ｜ 数据源：小程序页面埋点 ｜ 生成时间：%s</div>
%s
<div class="cards">%s</div>
<h2>每日趋势</h2>
%s
<h2>页面排行</h2>
%s
<h2>来源渠道</h2>
%s
<h2>流失与路径</h2>
%s
<div class="foot">口径说明：会话=一次冷启动；登录访客=带登录态的顾客；人均停留=该周所有页面停留之和÷会话数；首页直接跳出=只浏览了首页一个页面的会话占比。对比列为较上周变化。</div>
</div></body></html>""" % (
        title, title, period, datetime.now().strftime("%Y-%m-%d %H:%M"), note + stale, card_html,
        table(["日期", "会话", "浏览"], day_rows, ["left", "right", "right"]),
        table(["页面", "路径", "浏览", "会话", "平均停留"], page_rows, ["left", "left", "right", "right", "right"]),
        table(["渠道", "会话", "浏览", "登录访客"], scene_rows, ["left", "right", "right", "right"]),
        table(["页面跳转", "次数"], flow_rows, ["left", "right"]) + "<p class='muted'>只看一页就走的会话占 %.1f%%，其中从首页直接离开占 %.1f%%。</p>" % (fade["single_rate"], fade["index_bounce_rate"]),
    )


def send_mail(subject, html_body, dry_run):
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "465"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user)
    to_list = [x.strip() for x in os.environ.get("REPORT_TO", "").split(",") if x.strip()]
    use_ssl = os.environ.get("SMTP_SSL", "1") != "0"

    if dry_run or not host or not to_list:
        os.makedirs(REPORT_DIR, exist_ok=True)
        path = os.path.join(REPORT_DIR, "page-event-%s.html" % datetime.now().strftime("%Y%m%d-%H%M"))
        with open(path, "w", encoding="utf-8") as f:
            f.write(html_body)
        print("[dry-run] 报告已生成: %s" % path)
        return

    msg = MIMEMultipart()
    msg["From"] = formataddr((str(Header("轻疗数据", "utf-8")), sender))
    msg["To"] = ", ".join(to_list)
    msg["Subject"] = Header(subject, "utf-8")
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if use_ssl:
        server = smtplib.SMTP_SSL(host, port, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
        server.starttls()
    try:
        if user:
            server.login(user, password)
        server.sendmail(sender, to_list, msg.as_string())
    finally:
        server.quit()
    print("已发送: %s -> %s" % (subject, ", ".join(to_list)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", help="周一日期 YYYY-MM-DD，默认上一个完整自然周")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--test", action="store_true", help="只发一封通道测试邮件")
    args = parser.parse_args()

    load_env(ENV_FILE)

    if args.test:
        body = ("<p>这是一封通道测试邮件。</p>"
                "<p>轻疗小程序埋点周报已配置完成，此后每周一 09:00 自动发送上一周的报告。</p>"
                "<p>收到即表示邮件通道正常，无需回复。</p>")
        send_mail("【轻疗小程序】埋点周报邮件通道测试", body, False)
        return

    if args.week:
        week_start = datetime.strptime(args.week, "%Y-%m-%d")
    else:
        today = datetime.now()
        this_monday = today - timedelta(days=today.weekday())
        week_start = this_monday - timedelta(days=7)

    start, end = window(week_start)
    prev_start, prev_end = window(week_start - timedelta(days=7))

    cur = summary(start, end)
    prev = summary(prev_start, prev_end)
    pages = page_rank(start, end)
    scenes = scene_rank(start, end)
    flows = path_flow(start, end)
    fade = fade_stats(start, end)
    days = daily(start, end)

    body = build_html(week_start, cur, prev, fade, pages, scenes, flows, days)
    subject = "【轻疗小程序】埋点周报 %s ~ %s" % (
        week_start.strftime("%m/%d"),
        (week_start + timedelta(days=6)).strftime("%m/%d"),
    )
    send_mail(subject, body, args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.stderr.write("mysql 查询失败: %s\n" % e.output.decode("utf-8", "replace"))
        sys.exit(1)
