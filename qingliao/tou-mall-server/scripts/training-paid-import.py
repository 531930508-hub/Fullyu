#!/usr/bin/env python3
"""把历史《疗愈师培训考核表》导入 s_massagist_training_cert，并标记「已计发」。

背景：培训补贴需要严格的「考核通过日」才能按第 N 单计发；历史表里同时存在
      「通过时间」和「已发放月」两类信息。只补通过时间会把系统外已经发过的钱
      再算一遍，所以已发放的格子必须写成 paid_month，计算器据此不再计发。

用法（默认只看不动，只打印诊断）：

  ./scripts/training-paid-import.py --excel 考核表.xlsx
  ./scripts/training-paid-import.py --excel 考核表.xlsx --report out/report.md --sql out/patch.sql

支持两种表头版式：
  A. 一行表头：门店 / 姓名 + 每个项目两列（通过时间、已发放月）
  B. 三行表头：项目名在上一行、下一行是「考核通过时间 / 满30次计算月份」，
     姓名在第一列、英文名在第二列，没有门店列（按姓名在全库唯一匹配）

生成 SQL 后务必先在测试库执行，再核对：

  SELECT project_key, COUNT(*) FROM s_massagist_training_cert
  WHERE paid_month IS NOT NULL GROUP BY project_key;

口径（与页面一致）：
  * 只有「通过时间」的格子 → 普通认证，导入 passed_at，按月正常累计、达标当月计发。
  * 有「已发放月」的格子     → passed_at + paid_month，页面显示「已计发」，不再计发。
  * 只有「已发放月」没有通过时间 → 无法导入，脚本列入待补清单：不能编造考核日。
  * 表头里系统没有配置的项目 → 不导入，单独列出，等配置后再补。
    （「耳」已于 2026-12-04 配成项目 ear：全感悦耳 · 耳部，达标 30 次 / 500 元）
"""

import argparse
import datetime as dt
import json
import os
import re
import sys

try:
    from openpyxl import load_workbook
except ImportError:  # pragma: no cover - 运行环境提示
    sys.exit('缺少 openpyxl：pip3 install openpyxl')

# 表头关键字 -> 培训项目编码（与 IncentiveDefaults.trainingProjects() 一致）
PROJECTS = [
    ('sujin_face', ('面部', '脸部', '脸'), ()),
    ('sujin_hand', ('手部', '手臂', '手'), ()),
    ('sujin_head', ('头部', '头'), ('水疗', '头疗')),
    ('sujin_shoulder', ('肩部', '肩颈', '肩'), ()),
    ('sujin_eye', ('眼部', '眼睛', '眼'), ()),
    ('sujin_leg', ('腿部', '腿疗', '腿'), ()),
    ('head_spa_60', ('水疗60', '水疗 60', '60头疗', '60 头疗', '60分钟', '60 分钟'), ()),
    ('head_spa_90', ('水疗90', '水疗 90', '90头疗', '90 头疗', '90分钟', '90 分钟'), ()),
    ('ear', ('耳部', '采耳', '耳'), ()),
]

_NOT_HEADER = ('序号', '门店', '姓名', '系统名称')
NOT_EXAM = ('无', '未', '未考', '未通过', '/', '-', '—')
MONTH_RE = re.compile(r'(\d{4})\s*[-/.年]\s*(\d{1,2})')
MONTH_ONLY_RE = re.compile(r'(\d{1,2})\s*月')
DATE_RE = re.compile(r'(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})')


def norm(value):
    if value is None:
        return ''
    if isinstance(value, dt.datetime):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, dt.date):
        return value.strftime('%Y-%m-%d')
    return str(value).strip()


def col_letter(index):
    """1 -> A, 27 -> AA。"""
    letters = ''
    while index > 0:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def parse_date(value, default_year):
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = norm(value)
    match = DATE_RE.search(text)
    if match:
        year, month, day = (int(part) for part in match.groups())
        try:
            return dt.date(year, month, day)
        except ValueError:
            return None
    match = MONTH_ONLY_RE.search(text)
    if match and default_year:
        try:
            return dt.date(default_year, int(match.group(1)), 1)
        except ValueError:
            return None
    return None


def parse_paid_month(value, default_year):
    """「已发放月」列只要非空就视为已发：返回 (是否已发, yyyy-MM 或 None, 原始文本)。"""
    text = norm(value)
    if not text or text in ('-', '/', '—', '无'):
        return False, None, ''
    match = MONTH_RE.search(text)
    if match:
        year, month = int(match.group(1)), int(match.group(2))
        if 1 <= month <= 12:
            return True, f'{year:04d}-{month:02d}', text
        return True, None, text
    match = MONTH_ONLY_RE.search(text)
    if match and default_year:
        month = int(match.group(1))
        if 1 <= month <= 12:
            return True, f'{default_year:04d}-{month:02d}', text
    return True, None, text


def project_of(text):
    """表头文字 -> (项目编码, 命中关键字长度)；按最长关键字取最具体的项目。"""
    best = (0, None)
    if not text:
        return None
    for key, keywords, exclude in PROJECTS:
        if any(word in text for word in exclude):
            continue
        for word in keywords:
            if word in text and len(word) > best[0]:
                best = (len(word), key)
    return best[1]


def header_groups(ws, group_row):
    """在项目名所在行找 8 个项目，返回 ([项目, 列下标], [(未识别表头, 列下标)])。

    「60 头疗」同时命中「头」和「头疗」，按关键字长度取最具体的一组，
    并允许项目声明排除词；未识别的表头（如系统未配置的「耳」）单独返回。
    """
    found, unmatched = [], []
    for index, cell in enumerate(ws[group_row]):
        text = norm(cell.value)
        if not text or text in _NOT_HEADER or any(text.startswith(token) for token in _NOT_HEADER):
            continue
        key = project_of(text)
        if key:
            found.append((key, index))
        else:
            unmatched.append((text, index))
    return found, unmatched


def locate_header(ws):
    """识别两种表头版式，返回 dict；识别不了返回 None。"""
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 10)):
        texts = [norm(cell.value) for cell in row]
        row_no = row[0].row
        if '姓名' in texts and any('门店' in text for text in texts):
            return {'form': 'A', 'header_row': row_no, 'group_row': row_no,
                    'name_col': texts.index('姓名') + 1,
                    'shop_col': texts.index('门店') + 1}
        if any('考核通过时间' in text for text in texts):
            return {'form': 'B', 'header_row': row_no, 'group_row': max(row_no - 1, 1),
                    'name_col': 1, 'shop_col': None}
    return None


def build_layout(ws, info):
    """返回 (layout, unmatched)。layout 元素为 (项目编码, 通过时间列, 已发月列/None)。"""
    matched, unmatched = header_groups(ws, info['group_row'])
    layout = []
    for key, index in matched:
        if info['form'] == 'A':
            layout.append((key, index, index + 1))
            continue
        paid_header = norm(ws.cell(info['header_row'], index + 2).value)
        paid_col = index + 1 if any(word in paid_header for word in ('计', '发', '月')) else None
        layout.append((key, index, paid_col))
    return layout, unmatched


def name_predicate(name, shop):
    """姓名匹配：真实姓名优先，回退到系统昵称；带门店时再收敛到门店。"""
    alias = name.replace("'", "''")
    cond = "((m.real_name = '%s') OR (m.name = '%s'))" % (alias, alias)
    if shop:
        shop_alias = shop.replace("'", "''")
        cond += " AND s.name = '%s'" % shop_alias
    return cond


def main():
    ap = argparse.ArgumentParser(description='历史培训考核表导入诊断 / SQL 生成')
    ap.add_argument('--excel', required=True)
    ap.add_argument('--sheet', default=None, help='默认第一张工作表')
    ap.add_argument('--header-row', type=int, default=None,
                    help='表头所在行；版式 B 指「考核通过时间」那一行')
    ap.add_argument('--default-year', type=int, default=2025,
                    help='仅「M月/已发」格子的年份归属，默认 2025，需人工确认')
    ap.add_argument('--layout-json', default=None,
                    help='列映射 JSON：[{"key":"sujin_face","dateCol":5,"paidCol":6}]（1 基）')
    ap.add_argument('--report', default=None, help='诊断报告输出路径（Markdown）')
    ap.add_argument('--sql', default=None, help='生成 SQL 的路径；不传只打印')
    ap.add_argument('--paid-amount', default=None, help='已计发金额；默认留空按配置金额展示')
    ap.add_argument('--dump', action='store_true', help='打印每行每格原始值，便于核对列')
    args = ap.parse_args()

    workbook = load_workbook(args.excel, data_only=True)
    ws = workbook[args.sheet] if args.sheet else workbook.worksheets[0]

    info = locate_header(ws)
    if args.header_row:
        info = info or {'form': 'B', 'group_row': max(args.header_row - 1, 1),
                        'name_col': 1, 'shop_col': None}
        info['header_row'] = args.header_row
    if info is None:
        sys.exit('找不到表头（需包含「门店」「姓名」或「考核通过时间」），请用 --header-row 指定')

    header_row, name_col, shop_col = info['header_row'], info['name_col'], info['shop_col']

    if args.layout_json:
        layout = [(item['key'], int(item['dateCol']) - 1,
                   int(item['paidCol']) - 1 if item.get('paidCol') else None)
                  for item in json.load(open(args.layout_json, encoding='utf-8'))]
        unmatched = []
    else:
        layout, unmatched = build_layout(ws, info)
        if len(layout) < 1:
            sys.exit('表头一个项目都没识别到，请用 --layout-json 明确列位')

    paid_amount = args.paid_amount
    today_month = dt.date.today().strftime('%Y-%m')
    rows, problems, same_month, unsupported = [], [], [], []
    for row in ws.iter_rows(min_row=header_row + 1):
        name = norm(row[name_col - 1].value) if len(row) >= name_col else ''
        shop = norm(row[shop_col - 1].value) if shop_col and len(row) >= shop_col else ''
        if not name or (shop_col and not shop):
            continue
        for label, index in unmatched:
            date_value = row[index].value if len(row) > index else None
            paid_index = index + 1
            paid_value = row[paid_index].value if len(row) > paid_index else None
            if norm(date_value) or norm(paid_value):
                unsupported.append({'row': row[0].row, 'shop': shop, 'name': name,
                                    'label': label,
                                    'date': norm(date_value) or '（空）',
                                    'paid': norm(paid_value) or '（空）'})
        for key, date_index, paid_index in layout:
            date_value = row[date_index].value if len(row) > date_index else None
            paid_value = row[paid_index].value if paid_index is not None and len(row) > paid_index else None
            if args.dump:
                print('%s!%s%s 通过=%r 已发=%r' % (ws.title, col_letter(date_index + 1),
                                                 row[0].row, date_value, paid_value))
            date_text = norm(date_value)
            if not date_text and not norm(paid_value):
                continue
            if date_text in NOT_EXAM:
                continue
            passed_at = parse_date(date_value, args.default_year)
            paid, paid_month, paid_text = parse_paid_month(paid_value, args.default_year)
            record = {
                'row': row[0].row,
                'shop': shop,
                'name': name,
                'key': key,
                'passed_at': passed_at.isoformat() if passed_at else None,
                'paid': paid,
                'paid_month': paid_month,
                'paid_text': paid_text,
                'paid_raw': norm(paid_value),
                'date_raw': date_text,
                'reason': None,
            }
            if passed_at is None:
                record['reason'] = '缺通过时间'
            elif paid and not paid_month:
                record['reason'] = '已发但缺月份'
            elif paid and paid_month < passed_at.strftime('%Y-%m'):
                record['reason'] = '计发月早于考核月'
            elif paid and paid_month > today_month:
                record['reason'] = '计发月晚于当前月'
            rows.append(record)
            if record['reason']:
                problems.append(record)
            elif paid and paid_month == passed_at.strftime('%Y-%m'):
                same_month.append(record)

    sql = []
    for record in rows:
        if record['passed_at'] is None or record['reason']:
            continue
        paid_month = "NULL"
        if record['paid'] and record['paid_month']:
            paid_month = "'%s'" % record['paid_month']
        elif record['paid']:
            continue
        # 金额只跟着「已计发」走：没发放的证书不该带 paid_amount。
        amount = 'NULL' if (paid_amount is None or not record['paid']) else str(paid_amount)
        predicate = name_predicate(record['name'], record['shop'])
        sql.append(
            "INSERT INTO s_massagist_training_cert\n"
            "  (massagist_id, shop_id, project_key, passed_at, source, paid_month, paid_amount,\n"
            "   create_time, update_time)\n"
            "SELECT m.id, m.shop_id, '%s', '%s', 'LEGACY', %s, %s, NOW(), NOW()\n"
            "FROM s_massagist m LEFT JOIN s_shop s ON s.id = m.shop_id\n"
            "WHERE %s\n"
            "  AND (SELECT COUNT(*) FROM s_massagist m2 LEFT JOIN s_shop s2 ON s2.id = m2.shop_id\n"
            "       WHERE %s) = 1\n"
            "ON DUPLICATE KEY UPDATE\n"
            "  passed_at  = IFNULL(passed_at, VALUES(passed_at)),\n"
            # 先落金额再落月份：MySQL 的赋值从左到右生效，反过来金额会被当成已存在。
            "  paid_amount = IF(paid_month IS NULL, VALUES(paid_amount), paid_amount),\n"
            "  paid_month = IF(paid_month IS NULL OR paid_month = VALUES(paid_month),\n"
            "                  VALUES(paid_month), paid_month),\n"
            "  update_time = NOW();\n"
            % (record['key'], record['passed_at'], paid_month, amount,
               predicate, predicate.replace('m.', 'm2.').replace('s.', 's2.')))

    paid_cells = [r for r in rows if r['paid'] and r['paid_month'] and not r['reason']]
    date_only = [r for r in rows if r['passed_at'] and not r['paid']]
    by_project = {}
    for record in paid_cells:
        by_project[record['key']] = by_project.get(record['key'], 0) + 1

    lines = ['# 培训考核表导入诊断', '',
             '- 工作表：`%s`，版式 %s，表头第 %d 行' % (ws.title, info['form'], header_row),
             '- 有效格子：%d（已计发 %d，仅通过时间 %d，待确认 %d）'
             % (len(rows), len(paid_cells), len(date_only), len(problems)),
             '- 已计发按项目：' + '，'.join('%s=%d' % item for item in sorted(by_project.items())),
             '']
    if problems:
        lines += ['## 待补：缺通过时间 / 月份有疑问', '',
                  '| 行 | 门店 | 姓名 | 项目 | 通过时间原文 | 已发原文 | 问题 |',
                  '| --- | --- | --- | --- | --- | --- | --- |']
        for record in problems:
            lines.append('| %d | %s | %s | %s | %s | %s | %s |'
                         % (record['row'], record['shop'] or '—', record['name'], record['key'],
                            record['date_raw'] or '（空）', record['paid_raw'] or '（空）',
                            record['reason']))
        lines.append('')
    if same_month:
        lines += ['## 计发月与考核月同月（照常按已计发导入，请确认）', '',
                  '考核次日起才累计订单，同月达标理论上不成立；历史补录常见此写法。', '',
                  '| 行 | 姓名 | 项目 | 通过时间 | 已发月 |',
                  '| --- | --- | --- | --- | --- |']
        for record in same_month:
            lines.append('| %d | %s | %s | %s | %s |'
                         % (record['row'], record['name'], record['key'],
                            record['passed_at'], record['paid_month']))
        lines.append('')
    if unsupported:
        lines += ['## 系统未配置的项目（未导入）', '',
                  '| 行 | 门店 | 姓名 | 表头 | 通过时间 | 已发月 |',
                  '| --- | --- | --- | --- | --- | --- |']
        for item in unsupported:
            lines.append('| %d | %s | %s | %s | %s | %s |'
                         % (item['row'], item['shop'] or '—', item['name'], item['label'],
                            item['date'], item['paid']))
        lines.append('')
    report = '\n'.join(lines)
    print(report)
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        open(args.report, 'w', encoding='utf-8').write(report)
    if args.sql:
        os.makedirs(os.path.dirname(os.path.abspath(args.sql)), exist_ok=True)
        header = ('-- 由 scripts/training-paid-import.py 生成，请先在测试库执行并核对。\n'
                  '-- 同名多人/同名多店的行已用 COUNT(*)=1 保护，不会误改。\n\n')
        open(args.sql, 'w', encoding='utf-8').write(header + '\n'.join(sql))
        print('SQL 已写入 %s（%d 条）' % (args.sql, len(sql)))
    elif sql:
        print('\n'.join(sql))


if __name__ == '__main__':
    main()
