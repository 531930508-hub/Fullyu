#!/usr/bin/env python3
"""sql/ 目录与**运行库**对账：找出「脚本里有、库里没有」的表和列，以及排序规则漂移。

为什么需要它：deploy-test.sh 只做 rsync + mvn package + 重启，不执行 sql/。
2026-11-11 两次事故都从这里漏过去：

1) birthday（缺列）：Customer 实体加了字段、DDL 脚本也写了，但库没执行 →
   MyBatis-Plus 把 birthday 拼进每条 SQL → 搜手机号/首页今日安排/定时任务一起
   报 `Unknown column 'birthday' in 'field list'`。
2) 激励中心 500（排序规则漂移）：测试库 11-11 13:44 由 RDS 导出重建，导入表是
   utf8mb4_0900_ai_ci，而 sql/ 脚本显式声明 utf8mb4_general_ci →
   `ia.phone = TRIM(c.phone)` 抛 1267 Illegal mix of collations。
   「表/列都在」挡不住这一种，所以额外体检**用在 `=` 比较里的同名列排序规则**：
   本批脚本建的表与库内其它表不一致 → 报警。

只做只读核对（只查 information_schema），不改库。
退出码：缺表/缺列 → 1；排序规则漂移 → 默认只告警，加 --strict-collations 才返回 1。

用法：
  ./scripts/sql-audit.py                      # 默认查 mall-test:tou_mall_test
  ./scripts/sql-audit.py --db other_db
  ./scripts/sql-audit.py --host 8.133.6.18 --db tou_mall_current
  ./scripts/sql-audit.py --sql-dir ../sql     # 换脚本目录
  ./scripts/sql-audit.py --mysql-opts=--defaults-extra-file=/opt/xxx/.db.cnf
  ./scripts/sql-audit.py --strict-collations  # 排序规则漂移也算失败
"""

import argparse
import glob
import os
import re
import subprocess
import sys

# 一次性备份表、临时表不算缺失（脚本按需建、用完删）
IGNORE_TABLE = re.compile(r'(_bak_|_backup_|_tmp$|_temp$)', re.I)
# ADD INDEX/KEY/PRIMARY/UNIQUE/CONSTRAINT/FOREIGN 不是列
NOT_A_COLUMN = re.compile(r'^(KEY|INDEX|PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|FULLTEXT|SPATIAL)$', re.I)
# 形如 ia.phone = ... / cc.nickname = ... 里被比较的列名（!= 不算）
COMPARED_COL = re.compile(r'[a-zA-Z_]\w*\s*\.\s*([a-zA-Z_]\w*)\s*=(?!=)')


def strip_comments(sql: str) -> str:
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.S)
    sql = re.sub(r'--[^\n]*', '', sql)
    sql = re.sub(r'^\s*#[^\n]*', '', sql, flags=re.M)
    return sql


def candidates(path: str):
    """返回 {(kind, name)}，kind 为 table / col。"""
    raw = open(path, encoding='utf-8', errors='ignore').read()
    sql = strip_comments(raw)
    found = set()
    for m in re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?', sql, re.I):
        found.add(('table', m.group(1).lower()))
    # ALTER TABLE `t` ... ADD ...;  语句体截到分号，兼容多列
    for m in re.finditer(r'ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?([\s\S]{0,600}?);', sql, re.I):
        table, body = m.group(1), m.group(2)
        for c in re.finditer(
            r'ADD\s+(?:COLUMN\s+)?`?([a-zA-Z0-9_]+)`?\s+'
            r'(?![A-Z]*(?:KEY|INDEX|PRIMARY|UNIQUE|CONSTRAINT|FOREIGN))',
            body, re.I,
        ):
            col = c.group(1)
            if NOT_A_COLUMN.match(col):
                continue
            found.add(('col', f'{table}.{col}'.lower()))
    return found


def compared_columns(mapper_dir: str):
    """mapper XML 里以 `别名.列 = ` 形式参与比较的列名集合（排序规则体检用）。"""
    if not mapper_dir or not os.path.isdir(mapper_dir):
        return set()
    names = set()
    for path in glob.glob(os.path.join(mapper_dir, '**', '*.xml'), recursive=True):
        text = open(path, encoding='utf-8', errors='ignore').read()
        for m in COMPARED_COL.finditer(text):
            names.add(m.group(1).lower())
    return names


def remote_mysql(host: str, mysql_opts: str, sql: str) -> str:
    """在远端跑一段只读查询，返回不带表头的输出。"""
    # mysql_opts 只用于 --defaults-extra-file=... 这类客户端参数，拒绝重定向/管道字符
    if mysql_opts and re.search(r'[;&|`$><\n]', mysql_opts):
        raise SystemExit(f'--mysql-opts 含非法字符：{mysql_opts}')
    cmd = f'mysql {mysql_opts} -N -e "{sql}"\n'
    proc = subprocess.run(
        ['ssh', host, 'bash -s'],
        input=cmd,
        text=True, capture_output=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f'读取 {host} 的库结构失败：{proc.stderr.strip()}')
    return proc.stdout


def read_schema(host: str, db: str, mysql_opts: str):
    sql = (
        "SELECT CONCAT('T:',table_name) FROM information_schema.tables "
        f"WHERE table_schema='{db}';"
        "SELECT CONCAT(table_name,'.',column_name) FROM information_schema.columns "
        f"WHERE table_schema='{db}';"
    )
    tables, cols = set(), set()
    for line in remote_mysql(host, mysql_opts, sql).splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('T:'):
            tables.add(line[2:].lower())
        else:
            cols.add(line.lower())
    return tables, cols


def read_collations(host: str, db: str, mysql_opts: str, names):
    """返回 {列名: [(表, 排序规则)]}，只看字符串类型的列。"""
    if not names:
        return {}
    in_list = ','.join("'" + re.sub(r'[^a-z0-9_]', '', n) + "'" for n in sorted(names))
    # mysql 批量模式会把制表符转义成字面量 \t，这里用 '~' 作分隔符
    sql = (
        "SELECT CONCAT_WS('~',column_name,table_name,collation_name) "
        'FROM information_schema.columns '
        f"WHERE table_schema='{db}' AND collation_name IS NOT NULL AND column_name IN ({in_list});"
    )
    out = {}
    for line in remote_mysql(host, mysql_opts, sql).splitlines():
        parts = line.strip().split('~')
        if len(parts) != 3:
            continue
        col, table, coll = (p.lower() for p in parts)
        out.setdefault(col, []).append((table, coll))
    return out


def collation_drift(collations, our_tables):
    """本批脚本建的表 vs 库内其它表：同名比较列排序规则不同 → `=` 会抛 1267。"""
    drift = []
    for col, rows in sorted(collations.items()):
        ours = [(t, c) for t, c in rows if t in our_tables]
        others = [(t, c) for t, c in rows if t not in our_tables]
        if not ours or not others:
            continue
        for our_coll in sorted({c for _, c in ours}):
            clash = sorted({c for _, c in others if c != our_coll})
            if not clash:
                continue
            our_tabs = sorted({t for t, c in ours if c == our_coll})
            for other_coll in clash:
                drift.append({
                    'column': col,
                    'our_collation': our_coll,
                    'our_tables': our_tabs,
                    'other_collation': other_coll,
                    'other_tables': sorted({t for t, c in others if c == other_coll}),
                })
    return drift


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default=os.environ.get('DEPLOY_HOST', 'mall-test'))
    ap.add_argument('--db', default='tou_mall_test')
    ap.add_argument('--sql-dir', default=None)
    ap.add_argument('--mysql-opts', default='',
                    help='透传给远端 mysql 客户端的参数，如 --defaults-extra-file=/path/.rds.cnf')
    ap.add_argument('--mapper-dir', default=None,
                    help='mapper XML 目录；缺省用 ../mall-admin/src/main/resources')
    ap.add_argument('--strict-collations', action='store_true',
                    help='排序规则漂移也返回 1（默认只告警）')
    ap.add_argument('--skip-collations', action='store_true', help='只查表/列，不查排序规则')
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    sql_dir = args.sql_dir or os.path.join(here, '..', 'sql')
    mapper_dir = args.mapper_dir or os.path.join(here, '..', 'mall-admin', 'src', 'main', 'resources')
    files = sorted(glob.glob(os.path.join(sql_dir, '*.sql')))
    if not files:
        print(f'未找到 SQL 脚本：{sql_dir}')
        return 1

    tables, cols = read_schema(args.host, args.db, args.mysql_opts)
    missing, total, our_tables = {}, 0, set()
    for f in files:
        for kind, name in candidates(f):
            total += 1
            if kind == 'table':
                our_tables.add(name)
                if IGNORE_TABLE.search(name):
                    continue
                ok = name in tables
            else:
                ok = name in cols
            if not ok:
                missing.setdefault(os.path.basename(f), []).append(
                    ('表' if kind == 'table' else '列', name)
                )

    print(f'对账 {len(files)} 个脚本 / {total} 个对象 → {args.host}:{args.db}')

    drift = []
    if not args.skip_collations:
        drift = collation_drift(
            read_collations(args.host, args.db, args.mysql_opts, compared_columns(mapper_dir)),
            our_tables,
        )

    failed = False
    if missing:
        failed = True
        bad = sum(len(v) for v in missing.values())
        print(f'❌ 发现 {bad} 个「脚本里有、库里没有」的对象：')
        for f, items in sorted(missing.items()):
            print(f'  {f}')
            for kind, name in items:
                print(f'    - {kind}: {name}')
        print('\n处理：ssh ' + args.host + f' "mysql {args.db} < sql/<上面的文件>"（脚本均带幂等守卫）')
    else:
        print('✅ 表/列与脚本一致')

    if drift:
        print(f'\n{"❌" if args.strict_collations else "⚠️ "} 排序规则漂移 {len(drift)} 处'
              '（本批脚本建的表 vs 库内其它表，同名比较列排序规则不同 → `=` 比较会抛 1267）：')
        for d in drift:
            print(f"  - {d['column']}: {','.join(d['our_tables'])}={d['our_collation']}"
                  f"  ⇄  {','.join(d['other_tables'])}={d['other_collation']}")
        print('    处理：SQL 里对该比较显式收敛，如 '
              '`ia.phone = CONVERT(TRIM(c.phone) USING utf8mb4) COLLATE utf8mb4_general_ci`；'
              '或把两侧排序规则统一（需 DBA 决定，测试库当前是混合的）。')
        if args.strict_collations:
            failed = True
    elif not args.skip_collations:
        print('✅ 比较列排序规则一致')

    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())