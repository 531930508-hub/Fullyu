"""Verify the actual annotation SQL only in tou_mall_test; all synthetic records roll back."""
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import uuid

root = pathlib.Path(__file__).resolve().parent.parent
statements = {}
for prefix, filename in [('notice', 'AdminApprovalNoticeMapper.java'), ('binding', 'AdminNoticeBindingMapper.java')]:
    source = (root / 'main/java/com/macro/mall/mapper' / filename).read_text(encoding='utf-8')
    for match in re.finditer(r'@(Select|Insert|Update|Delete)\((.*?")\)\s*(?:[\w<>?, ]+)\s+(\w+)\(', source, re.S):
        fragments = re.findall(r'"(?:\\.|[^"\\])*"', match.group(2))
        statements[prefix + '.' + match.group(3)] = ''.join(json.loads(fragment) for fragment in fragments)
assert len(statements) == 27, ('Unexpected mapper interface', sorted(statements))

class Raw(str):
    pass

def literal(value):
    if isinstance(value, Raw):
        return str(value)
    if value is None:
        return 'NULL'
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"

def sql(name, **params):
    return re.sub(r'#\{(\w+)\}', lambda m: literal(params[m.group(1)]), statements[name])

ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'root@121.40.119.57', 'mysql -N -B tou_mall_test']
key = uuid.uuid4().hex
base = 910000000000 + int(key[:8], 16) * 10
owner, other, cc = base + 1, base + 2, base + 3
approval = base + 4
creator_node, first_node, next_node, cc_node = base + 5, base + 6, base + 7, base + 8
app, identity = 'synthetic-' + key, 'synthetic-open-' + key
hash_value = hashlib.sha256(key.encode()).hexdigest()
time = '2026-11-08 12:00:00'
commands, checks = ['START TRANSACTION;'], []

def execute(statement):
    commands.append(statement + ';')

def check(name, expression):
    checks.append(name)
    execute(f'SELECT {literal(name)}, IF({expression},1,0)')

check('fixture namespace initially empty', f'(SELECT COUNT(*) FROM ums_admin WHERE id IN({owner},{other},{cc}))=0 AND (SELECT COUNT(*) FROM f_approval WHERE id={approval})=0')
for admin, status in [(owner, 1), (other, 1), (cc, 0)]:
    execute(f'INSERT INTO ums_admin(id,username,status) VALUES({admin},{literal("synthetic-" + str(admin))},{status})')
check('active administrator SQL accepts current account', f'({sql("notice.activeAdmin", adminId=owner)})=1')
check('disabled administrator SQL rejects account', f'({sql("binding.activeAdmin", adminId=cc)})=0')
execute(f'INSERT INTO f_approval(id,state,create_user,create_time) VALUES({approval},2,{owner},{literal(time)})')
for detail, admin, role, level, state in [(creator_node, owner, 1, 0, 3), (first_node, owner, 2, 1, 2), (next_node, other, 2, 2, 1), (cc_node, cc, 3, 0, None)]:
    execute(f'INSERT INTO f_approval_detail(id,approval_id,target_user_id,flow_user_type,level,state,start_time) VALUES({detail},{approval},{admin},{role},{level},{literal(state)},{literal(time)})')
execute(sql('notice.capture', approvalId=approval))
execute(sql('notice.capture', approvalId=approval))
check('initial capture contains current approver and cc once', f'(SELECT COUNT(*) FROM n_admin_approval_notice WHERE approval_id={approval})=2')
check('future approver not queued early', f'({sql("notice.count", adminId=other)})=0')
execute(f'SET @old_notice=(SELECT id FROM n_admin_approval_notice WHERE detail_id={first_node} AND kind="PENDING")')
check('pending notice matches current node', f'({sql("notice.current", id=Raw("@old_notice"))})=1')
execute(f'UPDATE f_approval_detail SET state=3 WHERE id={first_node}')
execute(f'UPDATE f_approval_detail SET state=2 WHERE id={next_node}')
execute(sql('notice.capture', approvalId=approval))
check('progress queues next person without repeating cc', f'(SELECT COUNT(*) FROM n_admin_approval_notice WHERE approval_id={approval})=3')
check('previous pending node is superseded', f'({sql("notice.current", id=Raw("@old_notice"))})=0')
check('next owner scoped count is one', f'({sql("notice.count", adminId=other)})=1')
execute(f'UPDATE f_approval SET state=0 WHERE id={approval}')
execute(sql('notice.capture', approvalId=approval))
check('rejection queues creator and cc results', f'(SELECT COUNT(*) FROM n_admin_approval_notice WHERE approval_id={approval} AND kind="RESULT")=2')
execute(sql('notice.advanceGeneration', approvalId=approval))
execute(f'UPDATE f_approval SET state=2 WHERE id={approval}')
execute(f'UPDATE f_approval_detail SET state=2 WHERE id={first_node}')
execute(f'UPDATE f_approval_detail SET state=1 WHERE id={next_node}')
execute(sql('notice.capture', approvalId=approval))
execute(sql('notice.capture', approvalId=approval))
check('same second resubmit has distinct persistent generation', f'(SELECT COUNT(*) FROM n_admin_approval_notice WHERE approval_id={approval})=7 AND (SELECT COUNT(*) FROM n_admin_approval_notice WHERE approval_id={approval} AND generation=1)=2')
check('old generation cannot become current again', f'({sql("notice.current", id=Raw("@old_notice"))})=0')
execute(f'SET @new_notice=(SELECT id FROM n_admin_approval_notice WHERE detail_id={first_node} AND generation=1 AND kind="PENDING")')
check('new generation is current', f'({sql("notice.current", id=Raw("@new_notice"))})=1')
execute(sql('notice.attempt', id=Raw('@new_notice'), attempt=1, status='NOT_BOUND', templateId='synthetic-template'))
execute(sql('notice.defer', id=Raw('@new_notice'), state='NOT_BOUND'))
check('retry deferred one hour with recorded attempt count', '(SELECT attempts=1 AND TIMESTAMPDIFF(MINUTE,NOW(),next_attempt_at) BETWEEN 59 AND 60 FROM n_admin_approval_notice WHERE id=@new_notice)=1')
def lock_count(variable, target):
    execute(f'SET {variable}=-1')
    statement = sql('notice.lock', id=Raw(target))
    head = statement[:statement.index(' FROM ')]
    execute(statement.replace(head, f'SELECT COUNT(*) INTO {variable}', 1))
lock_count('@lock_future', '@new_notice')
check('lock skips row claimed by another instance until due', '@lock_future=0')
# 退避梯度单独用一条已被取代的行测，不影响上面的结算断言。
for expected in (1, 2, 4, 6, 6):
    execute(f'UPDATE n_admin_approval_notice SET next_attempt_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=@old_notice')
    execute(sql('notice.defer', id=Raw('@old_notice'), state='NOT_CONFIGURED'))
    check(f'backoff reaches {expected} hours', f'(SELECT TIMESTAMPDIFF(MINUTE,NOW(),next_attempt_at) BETWEEN {expected * 60 - 1} AND {expected * 60} FROM n_admin_approval_notice WHERE id=@old_notice)=1')
execute('UPDATE n_admin_approval_notice SET next_attempt_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=@old_notice')
lock_count('@lock_due', '@old_notice')
check('lock claims row once due again', '@lock_due=1')
execute(sql('notice.attempt', id=Raw('@new_notice'), attempt=2, status='MOCK', templateId='synthetic-template'))
execute(sql('notice.finish', id=Raw('@new_notice'), state='MOCK'))
check('mock settlement and append only attempts', '(SELECT attempts=2 AND state="MOCK" AND finish_time IS NOT NULL FROM n_admin_approval_notice WHERE id=@new_notice)=1 AND (SELECT COUNT(*) FROM n_admin_approval_notice_attempt WHERE notice_id=@new_notice)=2 AND (SELECT status FROM n_admin_approval_notice_attempt WHERE notice_id=@new_notice AND attempt_no=1)="NOT_BOUND"')
execute(sql('notice.finish', id=Raw('@new_notice'), state='LIVE_BLOCKED'))
check('terminal mock cannot be overwritten', '(SELECT state FROM n_admin_approval_notice WHERE id=@new_notice)="MOCK"')
check('owner logs paginate without identity fields', f'(SELECT COUNT(*) FROM ({sql("notice.logs", adminId=owner, offset=0, size=1)}) page)=1')
execute(sql('binding.insertChallenge', hash=hash_value, adminId=owner, appId=app, expires='2099-01-01 00:00:00'))
execute(sql('binding.candidate', hash=hash_value, openId=identity, eventAt=time))
check('verified candidate awaits confirmation', f'(SELECT consumed_at IS NULL AND candidate_following=1 FROM n_admin_mp_challenge WHERE token_hash={literal(hash_value)})=1')
execute(sql('binding.revokeCandidates', appId=app, openId=identity, eventAt='2026-11-08 12:01:00'))
check('unsubscribe revokes pending candidate', f'(SELECT candidate_following FROM n_admin_mp_challenge WHERE token_hash={literal(hash_value)})=0')
execute(sql('binding.candidate', hash=hash_value, openId=identity, eventAt='2026-11-08 12:02:00'))
execute(sql('binding.insertBinding', adminId=owner, appId=app, openId=identity, eventAt='2026-11-08 12:02:00'))
execute(sql('binding.consume', hash=hash_value))
execute(sql('binding.audit', adminId=owner, action='BOUND'))
check('confirmation consumes challenge and clears candidate identity', f'(SELECT consumed_at IS NOT NULL AND candidate_open_id IS NULL AND candidate_following=0 FROM n_admin_mp_challenge WHERE token_hash={literal(hash_value)})=1')
check('bound current administrator can be evaluated', f'({sql("notice.boundAndFollowing", adminId=owner, appId=app)})=1')
execute(sql('binding.following', appId=app, openId=identity, following=0, eventAt='2026-11-08 12:03:00'))
execute(sql('binding.following', appId=app, openId=identity, following=1, eventAt='2026-11-08 12:02:30'))
check('older subscribe cannot undo newer unsubscribe', f'({sql("notice.boundAndFollowing", adminId=owner, appId=app)})=0')
execute(sql('binding.unlink', adminId=owner, appId=app))
execute(sql('binding.following', appId=app, openId=identity, following=1, eventAt='2026-11-08 12:04:00'))
check('subscribe cannot restore locally unlinked identity', f'(SELECT open_id IS NULL AND following=0 FROM n_admin_mp_binding WHERE admin_id={owner} AND app_id={literal(app)})=1')
execute(sql('binding.expireChallenges', adminId=owner))
stale, recent = hashlib.sha256((key + ':stale').encode()).hexdigest(), hashlib.sha256((key + ':recent').encode()).hexdigest()
execute(sql('binding.insertChallenge', hash=stale, adminId=owner, appId=app, expires=Raw('DATE_SUB(NOW(),INTERVAL 2 DAY)')))
execute(sql('binding.insertChallenge', hash=recent, adminId=owner, appId=app, expires=Raw('DATE_SUB(NOW(),INTERVAL 1 HOUR)')))
execute(sql('binding.purgeExpiredChallenges'))
check('purge removes challenge expired over one day', f'(SELECT COUNT(*) FROM n_admin_mp_challenge WHERE token_hash={literal(stale)})=0')
check('purge keeps recently expired and consumed audit window', f'(SELECT COUNT(*) FROM n_admin_mp_challenge WHERE token_hash IN({literal(recent)},{literal(hash_value)}))=2')
check('binding audit contains only action and owner', f'(SELECT COUNT(*) FROM n_admin_mp_binding_audit WHERE admin_id={owner} AND action="BOUND")=1')
execute('ROLLBACK')
for table, predicate in [('ums_admin', f'id IN({owner},{other},{cc})'), ('f_approval', f'id={approval}'), ('f_approval_detail', f'approval_id={approval}'), ('n_admin_approval_notice', f'approval_id={approval}'), ('n_admin_approval_generation', f'approval_id={approval}'), ('n_admin_mp_binding', f'admin_id={owner}'), ('n_admin_mp_challenge', f'admin_id={owner}'), ('n_admin_mp_binding_audit', f'admin_id={owner}')]:
    check(table + ' fixtures rolled back', f'(SELECT COUNT(*) FROM {table} WHERE {predicate})=0')
result = subprocess.run(ssh, input='\n'.join(commands), text=True, capture_output=True)
assert result.returncode == 0, result.stderr
rows = [line.split('\t') for line in result.stdout.splitlines()]
assert len(rows) == len(checks), (len(rows), len(checks))
assert all(len(row) == 2 and row[1] == '1' for row in rows), rows

# Deliberately provoke the real unique constraint in a separate transaction. mysql aborts,
# its connection closes, and InnoDB rolls both inserts back; never use --force.
conflict = ['START TRANSACTION;']
for admin in (owner, other):
    conflict.append(sql('binding.insertBinding', adminId=admin, appId=app, openId=identity, eventAt=time) + ';')
failed = subprocess.run(ssh, input='\n'.join(conflict), text=True, capture_output=True)
assert failed.returncode != 0 and 'ERROR 1062' in failed.stderr, 'Identity conflict must be rejected by MySQL'
remaining = subprocess.run(ssh, input=f'SELECT COUNT(*) FROM n_admin_mp_binding WHERE app_id={literal(app)};', text=True, capture_output=True, check=True)
assert remaining.stdout.strip() == '0', 'Failed transaction left a binding behind'
checks += ['same service account identity cannot bind two administrators', 'identity conflict transaction rolled back']
print(json.dumps({'checks': len(checks), 'passed': checks, 'database': 'tou_mall_test', 'fixtures': 'rolled back', 'realMessages': 0}, ensure_ascii=False, indent=2))
