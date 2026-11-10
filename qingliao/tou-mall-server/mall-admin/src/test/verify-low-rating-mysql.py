"""Low-rating feedback contract on tou_mall_test only; every synthetic record rolls back.

The service uses MyBatis-Plus wrappers, so the statements below are the column-level
equivalents of those wrappers (retry scan, per-order locks, batch link, state change).
"""
import json
import pathlib
import subprocess
import threading
import time
import uuid

root = pathlib.Path(__file__).resolve().parents[3]  # tou-mall-server
host = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'root@121.40.119.57']
ssh = host + ['mysql -N -B tou_mall_test']
NOT_SUBMIT, APPROVING, REJECTED, PASSED, WITHDRAW = 1, 2, 0, 3, 4
key = uuid.uuid4().hex
base = 920000000000 + int(key[:8], 16) * 10
order_a, order_b, order_c = base + 1, base + 2, base + 3
approval, prior = base + 4, base + 5
customer = base + 6
low3, low4, high5, odd45, linked_b, legacy_c = (base * 10 + i for i in range(1, 7))
commands, checks = ['START TRANSACTION;'], []

# 与 LowRatingApprovalScheduled.retryPending 的 LambdaQueryWrapper 等价。
RETRY = (f'SELECT id,order_id FROM s_massagist_rate WHERE (rating <= 4 AND review_state = {NOT_SUBMIT} '
         'AND approval_id IS NULL) ORDER BY id ASC LIMIT 100')

def execute(statement):
    commands.append(statement + ';')

def check(name, expression):
    checks.append(name)
    execute(f"SELECT '{name}', IF({expression},1,0)")

def enqueue(order, approval_id):
    """MassagistRateService.enqueueLowRatings: lock order, lock its ratings, link once."""
    execute('SET @locked=NULL, @linked=NULL')
    execute(f'SELECT id INTO @locked FROM s_order WHERE (id = {order}) FOR UPDATE')
    execute(f'SELECT COUNT(approval_id) INTO @linked FROM s_massagist_rate WHERE (order_id = {order}) FOR UPDATE')
    execute(f'SET @run=(@locked IS NOT NULL AND @linked=0 AND (SELECT COUNT(*) FROM s_massagist_rate '
            f'WHERE order_id={order} AND rating<=4 AND review_state={NOT_SUBMIT})>0)')
    execute(f"INSERT INTO f_approval(id,state,create_user,create_time) SELECT {approval_id},{APPROVING},0,NOW() FROM DUAL WHERE @run")
    execute(f'UPDATE s_massagist_rate SET approval_id={approval_id},review_state={APPROVING} '
            f'WHERE @run AND order_id={order} AND rating<=4 AND review_state={NOT_SUBMIT}')

def change(approval_id, state):
    """LowRatingApprovalRelationService.changeRelateRecordState."""
    execute(f'UPDATE s_massagist_rate SET review_state={state} WHERE (approval_id = {approval_id})')
    execute('SET @changed=ROW_COUNT()')

check('fixture namespace initially empty',
      f'(SELECT COUNT(*) FROM s_order WHERE id IN({order_a},{order_b},{order_c}))=0 AND (SELECT COUNT(*) FROM f_approval WHERE id IN({approval},{prior}))=0')
for order in (order_a, order_b, order_c):
    execute(f'INSERT INTO s_order(id,customer_id) VALUES({order},{customer})')
execute(f'INSERT INTO f_approval(id,state,create_user,create_time) VALUES({prior},{APPROVING},0,NOW())')
for rid, order, rating, state, linked, text in [
        (low3, order_a, '3.00', NOT_SUBMIT, None, 'synthetic low 3'),
        (low4, order_a, '4.00', NOT_SUBMIT, None, 'synthetic boundary 4'),
        (high5, order_a, '5.00', None, None, 'synthetic high'),
        (odd45, order_a, '4.50', NOT_SUBMIT, None, 'synthetic above boundary'),
        (linked_b, order_b, '2.00', APPROVING, prior, 'synthetic already linked'),
        (legacy_c, order_c, '1.00', None, None, 'synthetic legacy history')]:
    execute('INSERT INTO s_massagist_rate(id,order_id,massagist_id,rating,customer_id,create_time,comment,review_state,approval_id) '
            f"VALUES({rid},{order},{base},{rating},{customer},NOW(),'{text}',{'NULL' if state is None else state},{'NULL' if linked is None else linked})")

check('retry picks only unlinked low ratings with boundary 4 included',
      f'(SELECT GROUP_CONCAT(id ORDER BY id) FROM ({RETRY}) t WHERE order_id IN({order_a},{order_b},{order_c}))="{low3},{low4}"')
check('retry ignores legacy history without review state (no backfill)',
      f'(SELECT COUNT(*) FROM ({RETRY}) t WHERE order_id={order_c})=0')
check('retry ignores order already in approval', f'(SELECT COUNT(*) FROM ({RETRY}) t WHERE order_id={order_b})=0')

enqueue(order_a, approval)
check('enqueue links both low ratings to one approval',
      f'(SELECT COUNT(*) FROM s_massagist_rate WHERE order_id={order_a} AND approval_id={approval} AND review_state={APPROVING})=2')
check('enqueue never touches high or above-boundary ratings',
      f'(SELECT COUNT(*) FROM s_massagist_rate WHERE id IN({high5},{odd45}) AND approval_id IS NULL)=2 AND (SELECT review_state FROM s_massagist_rate WHERE id={high5}) IS NULL')
check('retry no longer returns the enqueued order', f'(SELECT COUNT(*) FROM ({RETRY}) t WHERE order_id={order_a})=0')
enqueue(order_a, approval + 100)
check('second enqueue for same order creates no new approval',
      f'(SELECT COUNT(*) FROM f_approval WHERE id={approval + 100})=0 AND (SELECT COUNT(DISTINCT approval_id) FROM s_massagist_rate WHERE order_id={order_a})=1')
enqueue(order_b, approval + 200)
check('already-linked order keeps its original approval',
      f'(SELECT approval_id FROM s_massagist_rate WHERE id={linked_b})={prior} AND (SELECT COUNT(*) FROM f_approval WHERE id={approval + 200})=0')
enqueue(base + 9, approval + 300)
check('missing order is a no-op', f'(SELECT COUNT(*) FROM f_approval WHERE id={approval + 300})=0')

change(approval, REJECTED)
check('reject updates both linked feedback states', f'@changed=2 AND (SELECT COUNT(*) FROM s_massagist_rate WHERE approval_id={approval} AND review_state={REJECTED})=2')
check('reject keeps original rating and comment',
      f"(SELECT CONCAT(rating,'|',comment) FROM s_massagist_rate WHERE id={low3})='3.00|synthetic low 3'")
change(approval, WITHDRAW)
check('withdraw keeps customer rating rows', f'@changed=2 AND (SELECT COUNT(*) FROM s_massagist_rate WHERE order_id={order_a})=4')
check('withdrawn feedback is not re-queued', f'(SELECT COUNT(*) FROM ({RETRY}) t WHERE order_id={order_a})=0')
change(approval, PASSED)
check('pass updates state by approval only', f'@changed=2 AND (SELECT review_state FROM s_massagist_rate WHERE id={linked_b})={APPROVING}')
change(base + 8, PASSED)
check('unknown approval updates nothing (service throws)', '@changed=0')
execute('ROLLBACK')
for table, predicate in [('s_order', f'id IN({order_a},{order_b},{order_c})'),
                         ('s_massagist_rate', f'id BETWEEN {low3} AND {legacy_c}'),
                         ('f_approval', f'id BETWEEN {approval} AND {approval + 300}')]:
    check(table + ' fixtures rolled back', f'(SELECT COUNT(*) FROM {table} WHERE {predicate})=0')

result = subprocess.run(ssh, input='\n'.join(commands), text=True, capture_output=True)
assert result.returncode == 0, result.stderr
rows = [line.split('\t') for line in result.stdout.splitlines()]
assert len(rows) == len(checks), (len(rows), len(checks), result.stdout)
assert all(len(row) == 2 and row[1] == '1' for row in rows), [r for r in rows if r[-1] != '1']

plan = subprocess.run(ssh, input=f"EXPLAIN {RETRY};", text=True, capture_output=True, check=True).stdout
assert 'idx_rating_pending' in plan, plan
checks.append('retry scan can use idx_rating_pending')

# Two sessions: while one enqueue holds the order lock, a second enqueue on that order waits.
existing = subprocess.run(ssh, input='SELECT MAX(id) FROM s_order;', text=True, capture_output=True, check=True).stdout.strip()
holder = threading.Thread(target=lambda: subprocess.run(ssh, input=(
    f'START TRANSACTION; SELECT id FROM s_order WHERE (id = {existing}) FOR UPDATE; DO SLEEP(4); ROLLBACK;'),
    text=True, capture_output=True))
holder.start(); time.sleep(1.5)
waiter = subprocess.run(ssh, input=(f'SET SESSION innodb_lock_wait_timeout=1; START TRANSACTION; '
                                    f'SELECT id FROM s_order WHERE (id = {existing}) FOR UPDATE; ROLLBACK;'),
                        text=True, capture_output=True)
holder.join()
assert waiter.returncode != 0 and 'ERROR 1205' in waiter.stderr, waiter.stderr
checks.append('concurrent enqueue on same order is serialized by the order row lock')

guard = subprocess.run(host + ['mysql -N -B sys'], input=(root / 'sql/2026-11-08-low-rating-approval.sql').read_text(encoding='utf-8'),
                       text=True, capture_output=True)
assert guard.returncode != 0 and 'fullyu_low_rating_migration_requires_tou_mall_test' in guard.stderr, guard.stderr
rerun = subprocess.run(ssh, input=(root / 'sql/2026-11-08-low-rating-approval.sql').read_text(encoding='utf-8'),
                       text=True, capture_output=True)
assert rerun.returncode == 0, rerun.stderr
checks += ['migration refuses any database other than tou_mall_test', 'migration rerun on tou_mall_test is idempotent']
print(json.dumps({'checks': len(checks), 'passed': checks, 'database': 'tou_mall_test', 'fixtures': 'rolled back', 'realMessages': 0}, ensure_ascii=False, indent=2))
