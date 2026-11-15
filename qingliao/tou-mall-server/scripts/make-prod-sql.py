#!/usr/bin/env python3
"""由 sql/ 生成 sql/prod/：把「仅测试库执行 / 非测试库就报错」的守卫改成无条件执行。

只改守卫表达式，DDL 与数据语句一个字不动，生成物逐文件可 diff 核对。

  ./scripts/make-prod-sql.py            # 生成/覆盖 sql/prod/
  ./scripts/make-prod-sql.py --check    # 只检查 sql/prod/ 是否与 sql/ 同步

为什么单独一层：sql/ 里的脚本是测试环境的历史记录，守卫是给测试环境兜底的
（防止误在生产跑）。生产要有自己的入口，且必须能重复执行、能被 sql-audit 校验。
"""

import argparse
import glob
import os
import re
import sys

SKIP = {
    '2026-11-26-member-card-advance-only.sql',  # 未来版本，含业务口径变更（same_day_rate 固定 1.0）
}

# 守卫的三种写法都要覆盖：DATABASE()='x' / DATABASE() = 'x' / DATABASE()!='x'
GUARD_EQ = re.compile(r"DATABASE\(\)\s*=\s*'tou_mall_test'")
GUARD_NE = re.compile(r"DATABASE\(\)\s*!=\s*'tou_mall_test'")

HEADER = (
    '-- 【生产版】由 sql/{name} 自动生成（scripts/make-prod-sql.py）。\n'
    '-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。\n'
    '-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。\n'
)


def convert(text: str) -> str:
    text = GUARD_NE.sub('1=0', text)          # IF(非测试库 → 报错, DDL)  → 永远走 DDL
    text = GUARD_EQ.sub("DATABASE()<>''", text)  # IF(仅测试库 → DDL, 报错) → 永远走 DDL
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sql')
    out_dir = os.path.join(root, 'prod')
    os.makedirs(out_dir, exist_ok=True)

    files = [f for f in sorted(glob.glob(os.path.join(root, '2026-*.sql')))]
    stale, written, leftover = [], [], []
    for f in files:
        name = os.path.basename(f)
        if name in SKIP:
            continue
        body = convert(open(f, encoding='utf-8').read())
        if GUARD_EQ.search(body) or GUARD_NE.search(body):
            leftover.append(name)
        out = HEADER.format(name=name) + body
        target = os.path.join(out_dir, name)
        old = open(target, encoding='utf-8').read() if os.path.exists(target) else None
        if old != out:
            stale.append(name)
            if not args.check:
                open(target, 'w', encoding='utf-8').write(out)
                written.append(name)

    if leftover:
        print('❌ 仍有未转换的测试库守卫：' + ', '.join(leftover))
        return 1
    if args.check:
        if stale:
            print('❌ sql/prod/ 落后于 sql/：' + ', '.join(stale))
            return 1
        print('✅ sql/prod/ 与 sql/ 一致')
        return 0
    print(f'已生成 {len(written)} 个（跳过 {len(SKIP)} 个：{", ".join(sorted(SKIP))}）')
    return 0


if __name__ == '__main__':
    sys.exit(main())