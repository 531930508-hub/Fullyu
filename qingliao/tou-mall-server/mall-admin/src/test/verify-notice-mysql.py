"""Execute actual mapper SQL against authorized tou_mall_test; fixtures are rolled back."""
import datetime
import json
import pathlib
import re
import subprocess
import uuid

root = pathlib.Path(__file__).resolve().parent.parent
mapper = root / 'main/java/com/macro/mall/mapper/CustomerNoticeMapper.java'
source = mapper.read_text(encoding='utf-8')
statements = {}
for match in re.finditer(r'@(Select|Insert|Update|Delete)\((.*?")\)\s*(?:[\w<>?, ]+)\s+(\w+)\(', source, re.S):
    fragments = re.findall(r'"(?:\\.|[^"\\])*"', match.group(2))
    statements[match.group(3)] = ''.join(json.loads(fragment) for fragment in fragments)
expected = {'insertNotice', 'logSubscription', 'insertConsent', 'count', 'unread', 'ownedNotice', 'markRead', 'readAll', 'page', 'claimableConsent', 'claimConsent', 'loggedSubscription', 'dueCoupons', 'lockCoupon'}
assert expected <= statements.keys(), f'Missing mapper SQL: {expected - statements.keys()}'

def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"

def sql(name, **params):
    return re.sub(r'#\{(\w+)\}', lambda m: literal(params[m.group(1)]), statements[name])

key = 'db-test-' + uuid.uuid4().hex
owner, other = 900000000001, 900000000003
plan = dict(noticeKey=key, customerId=owner, couponId=900000000002, endTime='2026-11-13', days=5, title='synthetic notice', body='synthetic original content')
checks = []
commands = ['START TRANSACTION;']

def execute(statement):
    commands.append(statement + ';')

def check(name, expression):
    checks.append(name)
    execute(f'SELECT {literal(name)}, IF({expression},1,0)')

execute(sql('insertNotice', **plan))
execute(sql('insertNotice', **dict(plan, body='should not replace original')))
check('event inserted exactly once', f'(SELECT COUNT(*) FROM c_customer_notice WHERE notice_key={literal(key)})=1')
check('original content retained', f'(SELECT body FROM c_customer_notice WHERE notice_key={literal(key)})={literal(plan["body"])}')
check('customer scoped count', f'({sql("count", customerId=owner)})=1')
check('other customer cannot read', f'({sql("count", customerId=other)})=0')
check('unread before acknowledgement', f'({sql("unread", customerId=owner)})=1')
execute(f'SET @notice_test_id=(SELECT id FROM c_customer_notice WHERE notice_key={literal(key)})')
execute(sql('markRead', customerId=other, id=0).replace('id=0', 'id=@notice_test_id'))
check('wrong owner cannot acknowledge', f'({sql("unread", customerId=owner)})=1')
execute(sql('markRead', customerId=owner, id=0).replace('id=0', 'id=@notice_test_id'))
execute(f'SET @notice_first_read=(SELECT read_at FROM c_customer_notice WHERE notice_key={literal(key)})')
execute(sql('markRead', customerId=owner, id=0).replace('id=0', 'id=@notice_test_id'))
check('repeated read preserves timestamp', f'(SELECT read_at FROM c_customer_notice WHERE notice_key={literal(key)})=@notice_first_read')
check('unread after acknowledgement', f'({sql("unread", customerId=owner)})=0')
consent = dict(customerId=owner, templateId='synthetic-template', decision='accept', requestId=key)
execute(sql('insertConsent', **consent))
execute(sql('insertConsent', **dict(consent, decision='reject')))
check('consent request recorded once', f'(SELECT COUNT(*) FROM c_notice_subscription_consent WHERE request_id={literal(key)})=1')
check('authorization receipt append only', f'(SELECT decision FROM c_notice_subscription_consent WHERE request_id={literal(key)})=\'accept\'')
template = 'synthetic-template'
def claim(variable):
    # 真实FOR UPDATE语句原样执行，只把结果写入会话变量供断言。
    execute(f'SET {variable}=NULL')
    execute(sql('claimableConsent', customerId=owner, templateId=template).replace('SELECT a.id FROM', f'SELECT a.id INTO {variable} FROM', 1))
claim('@claim_first')
check('accepted receipt is claimable', f'@claim_first=(SELECT id FROM c_notice_subscription_consent WHERE request_id={literal(key)})')
execute(sql('claimConsent', id=0, noticeKey=key).replace('id=0', 'id=@claim_first'))
execute('SET @first_claim_rows=ROW_COUNT()')
execute(sql('claimConsent', id=0, noticeKey=key + ':again').replace('id=0', 'id=@claim_first'))
execute('SET @second_claim_rows=ROW_COUNT()')
check('one accept claimed exactly once', '@first_claim_rows=1 AND @second_claim_rows=0')
check('claim keeps first event key', f'(SELECT used_notice_key FROM c_notice_subscription_consent WHERE id=@claim_first)={literal(key)}')
claim('@claim_used')
check('used accept is no longer claimable', '@claim_used IS NULL')
execute(sql('insertConsent', customerId=owner, templateId=template, decision='accept', requestId=key + ':b'))
execute(sql('insertConsent', customerId=owner, templateId=template, decision='reject', requestId=key + ':c'))
claim('@claim_after_reject')
check('later reject invalidates earlier accept', '@claim_after_reject IS NULL')
execute(sql('insertConsent', customerId=owner, templateId=template, decision='accept', requestId=key + ':d'))
claim('@claim_after_reaccept')
check('accept after reject is claimable', f'@claim_after_reaccept=(SELECT id FROM c_notice_subscription_consent WHERE request_id={literal(key + ":d")})')
execute(sql('insertConsent', customerId=owner, templateId=template, decision='ban', requestId=key + ':e'))
claim('@claim_after_ban')
check('later ban invalidates accept', '@claim_after_ban IS NULL')
check('other customer has no claimable receipt', f'(SELECT COUNT(*) FROM c_notice_subscription_consent WHERE customer_id={other} AND request_id LIKE {literal(key + "%")})=0')
check('unlogged event reports no status', f'({sql("loggedSubscription", noticeKey=key)}) IS NULL')
log = dict(noticeKey=key, customerId=owner, status='MOCK', templateId=template)
execute(sql('logSubscription', **log))
execute(sql('logSubscription', **dict(log, status='NO_CONSENT')))
check('one mock log per event and channel', f'(SELECT COUNT(*) FROM c_notice_delivery_log WHERE notice_key={literal(key)})=1')
check('mock log never overwritten as delivery', f'(SELECT status FROM c_notice_delivery_log WHERE notice_key={literal(key)})=\'MOCK\'')
check('rescan sees logged status', f'({sql("loggedSubscription", noticeKey=key)})=\'MOCK\'')
# 真实券表end_time是DATETIME，存量里有非零点到期时间；按到期“日”匹配，不能只命中00:00:00。
today = datetime.date.today()
due_ids = (990000000001, 990000000002, 990000000003)
for coupon_id, end in zip(due_ids, [f'{today + datetime.timedelta(days=3)} 18:00:00', f'{today + datetime.timedelta(days=5)} 00:00:00', f'{today + datetime.timedelta(days=4)} 23:59:59']):
    execute(f'INSERT INTO sms_customer_coupon(id,customer_id,state,end_time,create_time) VALUES({coupon_id},{owner},1,{literal(end)},NOW())')
due_sql = sql('dueCoupons', afterId=990000000000, today=str(today), fiveDays=str(today + datetime.timedelta(days=5)), threeDays=str(today + datetime.timedelta(days=3)), size=100)
check('due scan matches non-midnight expiry day', f'(SELECT COUNT(*) FROM ({due_sql}) due WHERE due.id={due_ids[0]})=1')
check('due scan matches midnight expiry day', f'(SELECT COUNT(*) FROM ({due_sql}) due WHERE due.id={due_ids[1]})=1')
check('due scan skips other days', f'(SELECT COUNT(*) FROM ({due_sql}) due WHERE due.id={due_ids[2]})=0')
execute('ROLLBACK')
for table, column in [('c_customer_notice','notice_key'), ('c_notice_delivery_log','notice_key'), ('c_notice_subscription_consent','request_id')]:
    check(table + ' fixtures rolled back', f'(SELECT COUNT(*) FROM {table} WHERE {column} LIKE {literal(key + "%")})=0')
check('sms_customer_coupon fixtures rolled back', f'(SELECT COUNT(*) FROM sms_customer_coupon WHERE id IN {due_ids})=0')
command = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'root@121.40.119.57', 'mysql -N -B tou_mall_test']
result = subprocess.run(command, input='\n'.join(commands), text=True, capture_output=True, check=True)
rows = [line.split('\t') for line in result.stdout.splitlines()]
assert len(rows) == len(checks), (len(rows), len(checks))
assert all(len(row) == 2 and row[1] == '1' for row in rows), rows
print(json.dumps({'checks': len(rows), 'passed': checks, 'database': 'tou_mall_test', 'fixtures': 'rolled back', 'realMessages': 0}, ensure_ascii=False, indent=2))
