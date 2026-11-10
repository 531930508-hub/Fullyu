"""Actual queue annotation SQL + isolated MySQL transaction/unique-key contracts.
No app HTTP, payment, messages, or production access. Static fixtures roll back;
concurrent fixtures use a unique high-ID namespace and are deleted in finally.
"""
import concurrent.futures
import json
import pathlib
import queue
import re
import subprocess
import threading
import uuid

root = pathlib.Path(__file__).resolve().parent.parent
source = (root / 'main/java/com/macro/mall/mapper/PrepaidMemberRewardMapper.java').read_text(encoding='utf-8')
statements = {}
for match in re.finditer(r'@(Select|Insert|Update)\((.*?)\)\s*\n\s*(?:int|String|List<Long>)\s+(\w+)\(', source, re.S):
    statements[match.group(3)] = ''.join(json.loads(fragment) for fragment in re.findall(r'"(?:\\.|[^"\\])*"', match.group(2)))
assert set(statements) == {'queue', 'due', 'lock', 'finish', 'defer'}, sorted(statements)
assert 'FROM sms_customer_coupon c' in statements['queue']
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'root@121.40.119.57', 'mysql --unbuffered -N -B tou_mall_test']
key = uuid.uuid4().hex
base = 950000000000 + int(key[:8], 16) * 20
customer, product, purchase, usage, coupon = [base + n for n in range(1, 6)]
checks = []


def sql(name, **params):
    return re.sub(r'#\{(\w+)\}', lambda m: str(int(params[m.group(1)])), statements[name])


def run(text, expected=0):
    result = subprocess.run(ssh, input=text, text=True, capture_output=True, timeout=120)
    assert result.returncode == expected, (result.returncode, result.stderr)
    return result


def checked(name, value):
    assert value, name
    checks.append({'name': name, 'passed': True})


commands = ['START TRANSACTION;']
static_checks = []


def execute(text):
    commands.append(text + ';')


def check(name, expression):
    static_checks.append(name)
    execute("SELECT '" + name + "', IF(" + expression + ',1,0)')


def card_insert(card_id, order_id, begin, end, condition='1'):
    return f"INSERT INTO c_customer_member_card(id,card_no,customer_id,period_no,start_time,end_time,advance_rate,same_day_rate,amount,channel,status,card_type,reward_source_order_id) SELECT {card_id},'synthetic-{card_id}',{customer},1,{begin},{end},0.8,0.9,0,3,0,'month',{order_id} WHERE {condition}"


check('namespace initially empty', f'(SELECT COUNT(*) FROM s_order WHERE id BETWEEN {base} AND {base + 19})=0 AND (SELECT COUNT(*) FROM c_customer WHERE id={customer})=0 AND (SELECT COUNT(*) FROM c_customer_member_card WHERE id BETWEEN {base} AND {base + 19})=0')
execute(f"INSERT INTO c_customer(id,nickname) VALUES({customer},'synthetic-prepaid-{key}')")
execute(f"INSERT INTO s_product(id,title,type,reward_member_months) VALUES({product},'synthetic-prepaid-{key}',1,2)")
execute(f'INSERT INTO s_order(id,customer_id,state,appointment_state,type,pay_amount,reward_member_months) VALUES({purchase},{customer},1,2,1,1000,2),({usage},{customer},1,1,0,0,0)')
execute(f'INSERT INTO sms_customer_coupon(id,order_id,customer_id,use_type,state,use_order,use_time) VALUES({coupon},{purchase},{customer},0,0,{usage},NOW())')
execute(sql('queue', orderId=usage))
check('unfinished consumption cannot create queue task', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=0')
execute(f'UPDATE s_order SET appointment_state=2 WHERE id={usage}')
execute(sql('queue', orderId=usage)); execute(sql('queue', orderId=usage))
check('completion queues purchase once despite repeat', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=1')
execute(f'UPDATE s_product SET reward_member_months=3 WHERE id={product}')
check('purchase snapshot does not follow later product edits', f'(SELECT reward_member_months FROM s_order WHERE id={purchase})=2')
execute(sql('defer', sourceOrderId=purchase))
check('failed task retains pending state and retry', f'(SELECT state="PENDING" AND attempts=1 AND next_attempt_at>NOW() FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=1')
check('deferred source is absent from due page', f'(SELECT COUNT(*) FROM ({sql("due")}) page WHERE source_order_id={purchase})=0')
execute(sql('queue', orderId=usage))
check('later completion reactivates deferred evaluation', f'(SELECT next_attempt_at<=NOW() AND state="PENDING" FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=1')
execute(sql('finish', sourceOrderId=purchase))
check('successful evaluation completes durable task', f'(SELECT state FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})="DONE"')
execute(sql('finish', sourceOrderId=purchase)); execute(sql('defer', sourceOrderId=purchase))
check('done task is neither deferred nor overwritten', f'(SELECT state="DONE" AND attempts=1 FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=1')
execute(sql('queue', orderId=usage))
check('new completion can recheck same purchase without new task', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase} AND state="PENDING")=1')
execute(f'UPDATE s_order SET reward_member_months=0 WHERE id={purchase}'); execute(f'DELETE FROM n_prepaid_member_reward_task WHERE source_order_id={purchase}'); execute(sql('queue', orderId=usage))
check('historical default zero cannot queue gift', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=0')
execute(f'UPDATE s_order SET reward_member_months=2,is_gift=1 WHERE id={purchase}'); execute(sql('queue', orderId=usage))
check('gifted source cannot queue gift', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=0')
execute(f'UPDATE s_order SET is_gift=0,state=6 WHERE id={purchase}'); execute(sql('queue', orderId=usage))
check('refunded purchase cannot queue gift', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=0')
execute(f'UPDATE s_order SET state=1 WHERE id={purchase}'); execute(f'UPDATE s_order SET state=6 WHERE id={usage}'); execute(sql('queue', orderId=usage))
check('refunded consumption cannot queue gift', f'(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id={purchase})=0')
execute(card_insert(base + 6, purchase, "'2027-01-31 12:00:00'", "DATE_ADD('2027-01-31 12:00:00',INTERVAL 1 MONTH)"))
check('calendar month follows actual month end', f'(SELECT end_time FROM c_customer_member_card WHERE id={base + 6})="2027-02-28 12:00:00"')
check('gift remains zero amount and traceable to source', f'(SELECT amount=0 AND channel=3 AND reward_source_order_id={purchase} FROM c_customer_member_card WHERE id={base + 6})=1')
execute('ROLLBACK')
check('static fixtures rolled back', f'(SELECT COUNT(*) FROM c_customer WHERE id={customer})=0 AND (SELECT COUNT(*) FROM s_product WHERE id={product})=0 AND (SELECT COUNT(*) FROM s_order WHERE id BETWEEN {base} AND {base + 19})=0 AND (SELECT COUNT(*) FROM sms_customer_coupon WHERE id BETWEEN {base} AND {base + 19})=0 AND (SELECT COUNT(*) FROM c_customer_member_card WHERE id BETWEEN {base} AND {base + 19})=0 AND (SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id BETWEEN {base} AND {base + 19})=0')
output = run('\n'.join(commands)).stdout.splitlines()
for name in static_checks:
    checked(name, f'{name}\t1' in output)

# A real unique constraint negative test; both inserts roll back on connection exit.
negative = 'START TRANSACTION;\n' + card_insert(base + 6, purchase, "'2027-01-01'", "'2027-02-01'") + ';\n' + card_insert(base + 7, purchase, "'2027-02-01'", "'2027-03-01'") + ';'
conflict = run(negative, expected=1)
checked('same purchase cannot create two member gifts', 'ERROR 1062' in conflict.stderr and 'uk_member_reward_source_order' in conflict.stderr)
checked('unique-conflict transaction leaves no gift', run(f'SELECT COUNT(*) FROM c_customer_member_card WHERE id IN({base + 6},{base + 7});').stdout.strip() == '0')


class Session:
    def __init__(self):
        self.proc = subprocess.Popen(ssh, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.lines = queue.Queue()
        def reader():
            for line in self.proc.stdout:
                self.lines.put(line.rstrip('\n'))
            self.lines.put(None)
        threading.Thread(target=reader, daemon=True).start()
        checked('session is restricted to isolated test database', self.execute('SELECT DATABASE()') == ['tou_mall_test'])
    def execute(self, text):
        marker = '__END_' + uuid.uuid4().hex
        self.proc.stdin.write(text.rstrip(';') + ";\nSELECT '" + marker + "';\n"); self.proc.stdin.flush()
        result = []
        while True:
            line = self.lines.get(timeout=90)
            if line is None:
                raise RuntimeError(self.proc.stderr.read())
            if line == marker:
                return result
            result.append(line)
    def begin(self, isolation):
        self.execute('SET SESSION TRANSACTION ISOLATION LEVEL ' + isolation + '; START TRANSACTION')
    def close(self):
        if self.proc.poll() is None:
            self.proc.stdin.close()
            self.proc.wait(timeout=15)
        assert self.proc.returncode == 0, self.proc.stderr.read()


sessions = []
cleanup = f'DELETE FROM n_prepaid_member_reward_task WHERE source_order_id BETWEEN {base} AND {base + 19}; DELETE FROM c_customer_member_card WHERE id BETWEEN {base} AND {base + 19}; DELETE FROM sms_customer_coupon WHERE id BETWEEN {base} AND {base + 19}; DELETE FROM s_order WHERE id BETWEEN {base} AND {base + 19}; DELETE FROM s_product WHERE id={product}; DELETE FROM c_customer WHERE id={customer};'
try:
    run(f"START TRANSACTION; INSERT INTO c_customer(id,nickname) VALUES({customer},'synthetic-prepaid-{key}'); INSERT INTO s_order(id,customer_id,state,appointment_state,type,pay_amount,reward_member_months) VALUES({purchase},{customer},1,2,1,1000,2),({usage},{customer},1,1,0,0,0); INSERT INTO sms_customer_coupon(id,order_id,customer_id,use_type,state,use_order,use_time) VALUES({coupon},{purchase},{customer},0,0,{usage},NOW()); COMMIT;")
    first, second = Session(), Session(); sessions.extend([first, second])
    first.begin('REPEATABLE READ')
    checked('old completion snapshot initially sees unfinished service', first.execute(f'SELECT appointment_state FROM s_order WHERE id={usage}') == ['1'])
    second.begin('REPEATABLE READ'); second.execute(f'UPDATE s_order SET appointment_state=2 WHERE id={usage}; {sql("queue", orderId=usage)}; COMMIT')
    first.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE')
    checked('customer lock alone does not refresh repeatable-read snapshot', first.execute(f'SELECT appointment_state FROM s_order WHERE id={usage}') == ['1'])
    first.execute('ROLLBACK'); first.begin('READ COMMITTED')
    checked('post-commit evaluator observes completed consumption', first.execute(f'SELECT appointment_state FROM s_order WHERE id={usage}') == ['2'])
    checked('first evaluator locks one pending source', first.execute(sql('lock', sourceOrderId=purchase)) == ['PENDING'])
    first.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE; SELECT id FROM s_order WHERE id={purchase} FOR UPDATE')
    first.execute(card_insert(base + 6, purchase, "'2027-01-31 12:00:00'", "DATE_ADD('2027-01-31 12:00:00',INTERVAL 2 MONTH)"))
    second.begin('READ COMMITTED')
    started = threading.Event()
    def wait_for_same_task():
        started.set()
        return second.execute(sql('lock', sourceOrderId=purchase))
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        waiting = pool.submit(wait_for_same_task); assert started.wait(10)
        first.execute(sql('finish', sourceOrderId=purchase) + '; COMMIT')
        checked('second evaluator sees DONE after serialized queue lock', waiting.result(timeout=90) == ['DONE'])
    second.execute('COMMIT')
    checked('concurrent evaluators produce exactly one gift', run(f'SELECT COUNT(*) FROM c_customer_member_card WHERE reward_source_order_id={purchase};').stdout.strip() == '1')
    # A failed evaluator rolls back both gift and task status; the next one can retry.
    other_purchase = base + 8
    run(f'INSERT INTO n_prepaid_member_reward_task(source_order_id,state,next_attempt_at,create_time,update_time) VALUES({other_purchase},"PENDING",NOW(),NOW(),NOW());')
    first.begin('READ COMMITTED'); first.execute(sql('lock', sourceOrderId=other_purchase)); first.execute(card_insert(base + 9, other_purchase, "'2027-03-31'", "'2027-04-30'")); first.execute('ROLLBACK')
    checked('failed evaluator leaves pending task and no partial member period', run(f'SELECT (SELECT COUNT(*) FROM c_customer_member_card WHERE reward_source_order_id={other_purchase})=0 AND (SELECT state FROM n_prepaid_member_reward_task WHERE source_order_id={other_purchase})="PENDING";').stdout.strip() == '1')
    # 券包发券幂等：RR旧快照下"先count再发"会重复，订单行条件更新领取只成功一次。
    order_entity = (root / 'main/java/com/macro/mall/entity/Order.java').read_text(encoding='utf-8')
    checked('Order entity does not map coupon_issued so updateById cannot reset the claim', 'couponIssued' not in order_entity and 'coupon_issued' not in order_entity)
    claim = f'UPDATE s_order SET coupon_issued = 1 WHERE id={purchase} AND coupon_issued = 0; SELECT ROW_COUNT()'
    first.begin('REPEATABLE READ'); second.begin('REPEATABLE READ')
    first.execute(f'SELECT COUNT(*) FROM sms_customer_coupon WHERE order_id={purchase} AND id<>{coupon}')
    checked('stale second callback snapshot sees no coupons yet', second.execute(f'SELECT COUNT(*) FROM sms_customer_coupon WHERE order_id={purchase} AND id<>{coupon}') == ['0'])
    checked('first callback claims issuance', first.execute(claim) == ['1'])
    started = threading.Event()
    def second_claim():
        started.set()
        return second.execute(claim)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        waiting = pool.submit(second_claim); assert started.wait(10)
        first.execute(f'INSERT INTO sms_customer_coupon(id,order_id,customer_id,use_type,state,type) VALUES({base + 10},{purchase},{customer},0,1,0),({base + 11},{purchase},{customer},0,1,0); COMMIT')
        checked('second concurrent callback waits then claims nothing', waiting.result(timeout=90) == ['0'])
    checked('naive repeatable-read count would still report 0 (why the claim is needed)', second.execute(f'SELECT COUNT(*) FROM sms_customer_coupon WHERE order_id={purchase} AND id<>{coupon}') == ['0'])
    second.execute('ROLLBACK')
    checked('coupon pack issued exactly once', run(f'SELECT COUNT(*) FROM sms_customer_coupon WHERE order_id={purchase} AND id<>{coupon};').stdout.strip() == '2')
    rollback_order = base + 12
    run(f'INSERT INTO s_order(id,customer_id,state,appointment_state,type,pay_amount,reward_member_months) VALUES({rollback_order},{customer},1,2,1,10,0);')
    first.begin('READ COMMITTED')
    checked('failing issuer claims', first.execute(f'UPDATE s_order SET coupon_issued = 1 WHERE id={rollback_order} AND coupon_issued = 0; SELECT ROW_COUNT()') == ['1'])
    first.execute('ROLLBACK')
    checked('rolled-back issuance releases claim for retry', run(f'UPDATE s_order SET coupon_issued = 1 WHERE id={rollback_order} AND coupon_issued = 0; SELECT ROW_COUNT();').stdout.strip() == '1')
    checked('unknown order claims nothing', run(f'UPDATE s_order SET coupon_issued = 1 WHERE id={base + 19} AND coupon_issued = 0; SELECT ROW_COUNT();').stdout.strip() == '0')
    # 两来源同客户接续：后台发卡/购买为RR事务，加客户锁前的普通读已建立快照；
    # 另一来源赠卡在此期间提交，普通读看不到它，只有加锁当前读(lockedPeriods)能接在其后。
    member_source = (root / 'main/java/com/macro/mall/service/MemberCardService.java').read_text(encoding='utf-8')
    writers = re.findall(r'lockCustomer\((?:customerId|source\.getCustomerId\(\))\);\s*\n(?:.*\n){0,4}?.*List<CustomerMemberCard> periods = (\w+)\(', member_source)
    checked('all three period writers chain from the locked current read', writers == ['lockedPeriods'] * 3)
    checked('locked period read really issues FOR UPDATE', re.search(r'lockedPeriods\(Long customerId\) \{[^}]*\.last\("FOR UPDATE"\)', member_source) is not None)
    second_source = base + 13
    periods_locked = f'SELECT end_time FROM c_customer_member_card WHERE customer_id={customer} AND status IN (0,1) ORDER BY start_time FOR UPDATE'
    first.begin('REPEATABLE READ')
    first.execute(f'SELECT COUNT(*) FROM c_customer WHERE id={customer}')  # 相当于getConfigByType/getById：先建立快照
    second.begin('READ COMMITTED')
    second.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE')
    tail = max(second.execute(periods_locked))
    checked('second source sees first source gift as current tail', tail == '2027-03-31 12:00:00')
    second.execute(card_insert(base + 14, second_source, f"'{tail}'", f"DATE_ADD('{tail}',INTERVAL 1 MONTH)") + '; COMMIT')
    checked('second source gift starts exactly at first source end', run(f'SELECT start_time="2027-03-31 12:00:00" AND end_time="2027-04-30 12:00:00" FROM c_customer_member_card WHERE reward_source_order_id={second_source};').stdout.strip() == '1')
    first.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE')
    checked('plain read under customer lock still misses concurrent gift (old listByCustomer bug)', max(first.execute(f'SELECT end_time FROM c_customer_member_card WHERE customer_id={customer} AND status IN (0,1)')) == '2027-03-31 12:00:00')
    checked('locked current read sees concurrent gift so next writer chains after it', max(first.execute(periods_locked)) == '2027-04-30 12:00:00')
    first.execute('ROLLBACK')
    checked('two sources produce two gifts for one customer', run(f'SELECT COUNT(*) FROM c_customer_member_card WHERE customer_id={customer} AND reward_source_order_id IN ({purchase},{second_source});').stdout.strip() == '2')
    checked('gift periods do not overlap', run(f'SELECT COUNT(*) FROM c_customer_member_card a JOIN c_customer_member_card b ON a.customer_id=b.customer_id AND a.id<b.id WHERE a.customer_id={customer} AND a.start_time<b.end_time AND b.start_time<a.end_time;').stdout.strip() == '0')
    # 退款竞争：判定在RC事务里先锁客户、再FOR UPDATE锁来源订单，之后读券与消费单。
    refund_source, refund_usage, refund_coupon, refund_gift = base + 15, base + 16, base + 17, base + 18
    run(f'INSERT INTO s_order(id,customer_id,state,appointment_state,type,pay_amount,reward_member_months) VALUES({refund_source},{customer},1,2,1,1000,2),({refund_usage},{customer},1,2,0,0,0); INSERT INTO sms_customer_coupon(id,order_id,customer_id,use_type,state,use_order,use_time) VALUES({refund_coupon},{refund_source},{customer},0,0,{refund_usage},NOW());')
    source_locked = f'SELECT state FROM s_order WHERE id={refund_source} FOR UPDATE'
    # A. 来源退款未提交时持有来源行锁：判定必须等待，并在提交后看到已退款状态而放弃赠送。
    second.begin('READ COMMITTED'); second.execute(f'UPDATE s_order SET state=6 WHERE id={refund_source}')
    first.begin('READ COMMITTED'); first.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE')
    started = threading.Event()
    def grant_reads_source():
        started.set()
        return first.execute(source_locked)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        waiting = pool.submit(grant_reads_source); assert started.wait(10)
        blocked = True
        try:
            waiting.result(timeout=2)
            blocked = False
        except concurrent.futures.TimeoutError:
            pass
        checked('grant waits on uncommitted source refund row lock', blocked)
        second.execute('COMMIT')
        checked('grant sees committed source refund after waiting', waiting.result(timeout=90) == ['6'])
    first.execute('ROLLBACK')
    checked('source refund racing the grant leaves no gift', run(f'SELECT COUNT(*) FROM c_customer_member_card WHERE reward_source_order_id={refund_source};').stdout.strip() == '0')
    # B. 消费单退款(券恢复EFFECTIVE、消费单已退)先提交：RC判定读到券未耗尽而放弃赠送。
    run(f'UPDATE s_order SET state=1 WHERE id={refund_source};')
    first.begin('REPEATABLE READ'); first.execute(f'SELECT COUNT(*) FROM s_order WHERE id={refund_source}')
    run(f'UPDATE sms_customer_coupon SET state=1 WHERE id={refund_coupon}; UPDATE s_order SET state=6 WHERE id={refund_usage};')
    checked('old repeatable-read snapshot would still see coupon consumed (why process uses RC)', first.execute(f'SELECT state FROM sms_customer_coupon WHERE id={refund_coupon}') == ['0'])
    first.execute('ROLLBACK'); first.begin('READ COMMITTED')
    first.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE'); first.execute(source_locked)
    checked('RC grant sees refunded consumption restored coupon to effective', first.execute(f'SELECT state FROM sms_customer_coupon WHERE order_id={refund_source} AND use_type=0') == ['1'])
    checked('RC grant sees consumption order refunded', first.execute(f'SELECT state FROM s_order WHERE id={refund_usage}') == ['6'])
    first.execute('ROLLBACK')
    # C. 赠送已提交后才退消费单：赠送保留、不自动撤销——这是需验收确认的策略项，不是并发漏洞。
    run(f'UPDATE sms_customer_coupon SET state=0 WHERE id={refund_coupon}; UPDATE s_order SET state=1 WHERE id={refund_usage};')
    first.begin('READ COMMITTED'); first.execute(f'SELECT id FROM c_customer WHERE id={customer} FOR UPDATE'); first.execute(source_locked)
    checked('grant before refund sees depleted coupon and finished service', first.execute(f'SELECT (SELECT state FROM sms_customer_coupon WHERE id={refund_coupon})=0 AND (SELECT state=1 AND appointment_state=2 FROM s_order WHERE id={refund_usage})') == ['1'])
    first.execute(card_insert(refund_gift, refund_source, "'2027-04-30 12:00:00'", "DATE_ADD('2027-04-30 12:00:00',INTERVAL 2 MONTH)") + '; COMMIT')
    run(f'UPDATE sms_customer_coupon SET state=1 WHERE id={refund_coupon}; UPDATE s_order SET state=6 WHERE id={refund_usage};')
    checked('POLICY: consumption refunded after grant keeps the gift (no auto-revoke)', run(f'SELECT COUNT(*) FROM c_customer_member_card WHERE reward_source_order_id={refund_source};').stdout.strip() == '1')
finally:
    for session in sessions:
        if session.proc.poll() is None:
            session.execute('ROLLBACK')
        session.close()
    run('START TRANSACTION; ' + cleanup + ' COMMIT;')
    checked('concurrent fixture namespace fully removed', run(f'SELECT (SELECT COUNT(*) FROM c_customer WHERE id={customer})+(SELECT COUNT(*) FROM s_order WHERE id BETWEEN {base} AND {base + 19})+(SELECT COUNT(*) FROM sms_customer_coupon WHERE id BETWEEN {base} AND {base + 19})+(SELECT COUNT(*) FROM c_customer_member_card WHERE id BETWEEN {base} AND {base + 19})+(SELECT COUNT(*) FROM n_prepaid_member_reward_task WHERE source_order_id BETWEEN {base} AND {base + 19});').stdout.strip() == '0')

result = {'checks': len(checks), 'passed': True, 'evidence': 'actual queue Mapper SQL plus MySQL two-connection transaction/unique-key contract; not app HTTP or Spring integration', 'staticFixtures': 'rolled back', 'concurrentFixtures': 'unique namespace removed', 'realPayments': 0, 'realMessages': 0, 'results': checks}
path = pathlib.Path('/tmp/fullyu-prepaid-mysql-results.json')
path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'passed': True, 'report': str(path)}, ensure_ascii=False))
