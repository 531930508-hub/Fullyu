"""Actual MyBatis queries on temporary synthetic tables, isolated host only; no base writes."""
import json
import subprocess
from pathlib import Path
queries = json.loads(Path('/tmp/fullyu-training-sql.json').read_text())
assert len(queries) == 18

def bind(query):
    parts = query['sql'].split('?')
    assert len(parts) == len(query['values']) + 1
    sql = parts[0]
    for value, part in zip(query['values'], parts[1:]):
        assert isinstance(value, (int, str))
        literal = str(value) if isinstance(value, int) else "CONVERT(0x" + value.encode().hex() + " USING utf8mb4)"
        sql += ' ' + literal + ' ' + part
    return sql

statements = ["SET NAMES utf8mb4; SET @guard=IF(DATABASE()='tou_mall_test','SELECT 1','SELECT * FROM fullyu_training_requires_test_db'); PREPARE guard_stmt FROM @guard; EXECUTE guard_stmt; DEALLOCATE PREPARE guard_stmt;"]
for query in [queries[0], queries[1], queries[14]]:
    statements += ["SELECT 'PLAN|" + query['name'] + "';", 'EXPLAIN ' + bind(query) + ';']
statements += [
    'CREATE TEMPORARY TABLE s_massagist(id BIGINT PRIMARY KEY,name VARCHAR(100),shop_id BIGINT,status INT,entry_day DATE);',
    'CREATE TEMPORARY TABLE s_shop(id BIGINT PRIMARY KEY,name VARCHAR(100));',
    'CREATE TEMPORARY TABLE oms_order_detail(id BIGINT PRIMARY KEY,order_id BIGINT,massagist_id BIGINT,shop_id BIGINT,state INT,end_time DATETIME,duration INT,project_id BIGINT);',
    'CREATE TEMPORARY TABLE s_order(id BIGINT PRIMARY KEY,customer_id BIGINT,state INT,appointment_state INT,type INT,pay_time DATETIME,product_title VARCHAR(100),parts VARCHAR(100));',
    'CREATE TEMPORARY TABLE c_customer(id BIGINT PRIMARY KEY,phone VARCHAR(100));',
    'CREATE TEMPORARY TABLE s_project(id BIGINT PRIMARY KEY,title VARCHAR(100));',
    'CREATE TEMPORARY TABLE s_stat_internal_account(id BIGINT PRIMARY KEY,phone VARCHAR(100),enabled INT);',
    "INSERT INTO s_shop VALUES(5,'A合成门店'),(6,'B合成门店');",
    "INSERT INTO s_massagist VALUES(7,'A合成甲',5,1,'2020-01-01'),(8,'B合成乙',5,1,'2020-01-01'),(9,'D合成结束',5,0,'2020-01-01'),(10,'E合成暂停',5,2,'2020-01-01'),(11,'C合成%_伙伴',5,1,'2020-01-01'),(12,'D合成异店',6,1,'2020-01-01');",
    "INSERT INTO c_customer VALUES(1,'synthetic-customer'),(2,'synthetic-internal'),(3,''),(4,NULL);",
    "INSERT INTO s_stat_internal_account VALUES(1,'synthetic-internal',1);",
    "INSERT INTO s_project VALUES(101,'合成项目');",
]
for order_id in range(1, 9):
    state = 0 if order_id == 2 else 1
    appointment = 0 if order_id == 3 else 2
    kind = 1 if order_id == 4 else 0
    pay = 'NULL' if order_id == 5 else "'2026-01-01 10:00:00'"
    customer = {6: 2, 7: 3, 8: 4}.get(order_id, 1)
    statements.append(f"INSERT INTO s_order VALUES({order_id},{customer},{state},{appointment},{kind},{pay},'合成订单','合成部位');")
details = [(1,1,7,5,2,'2026-01-02'),(2,1,8,5,2,'2026-01-03'),(3,1,7,6,2,'2026-01-04'),
           (4,1,7,5,2,'2026-01-01'),(5,1,7,5,2,'2026-02-01'),(6,1,7,5,1,'2026-01-05'),
           (7,1,9,5,2,'2026-01-05')]
for order_id in range(2, 9):
    details.append((order_id + 6, order_id, 7, 5, 2, '2026-01-06'))
for row in details:
    statements.append("INSERT INTO oms_order_detail VALUES(%d,%d,%d,%d,%d,'%s',60,101);" % row)
for query in queries:
    statements += ["SELECT 'CASE|" + query['name'] + "';", bind(query) + ';']
run = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','root@121.40.119.57',
                      'mysql --batch --raw --skip-column-names tou_mall_test'],
                     input='\n'.join(statements),text=True,capture_output=True)
if run.returncode:
    raise RuntimeError(run.stderr)
blocks, current = {}, None
for line in run.stdout.splitlines():
    if line.startswith(('CASE|','PLAN|')):
        current = line; blocks[current] = []
    elif current: blocks[current].append(line)
person = lambda id, name, shop, status: f'{id}\t{name}\t{shop}\t{status}\t2020-01-01'
p7, p8, p11 = person(7,'A合成甲',5,1), person(8,'B合成乙',5,1), person(11,'C合成%_伙伴',5,1)
detail = lambda id, mid, shop, date: f'{id}\t1\t{mid}\t{shop}\t{date}\t60\t101\t合成项目\t合成部位'
d1, d2, d3 = detail(1,7,5,'2026-01-02'), detail(2,8,5,'2026-01-03'), detail(3,7,6,'2026-01-04')
expected = {'count-1':['3'],'people-1':[p7],'count-0':['1'],'people-0':[person(9,'D合成结束',5,0)],
            'count-2':['1'],'people-2':[person(10,'E合成暂停',5,2)],'count-null':['5'],'people-null':[p7],
            'count-甲':['1'],'people-甲':[p7],'count-%_':['1'],'people-%_':[p11],
            'next-page':[p8],'all-shops':[p7,p8,p11,person(12,'D合成异店',6,1)],
            'page-orders':[d1,d2],'all-shop-orders':[d1,d3,d2],'empty-ids':[],'empty-shops':[]}
checks = []
for name, rows in expected.items():
    actual = blocks['CASE|' + name]
    checks.append({'name':name,'passed':actual == rows})
    assert actual == rows, (name, actual, rows)
report = {'host':'isolated-test','baseTableWrites':0,'temporaryTables':7,'checks':checks,
          'plans':{name:rows for name,rows in blocks.items() if name.startswith('PLAN|')},
          'scope':'actual MyBatis + MySQL synthetic SQL contract, not Spring HTTP'}
Path('/tmp/fullyu-training-mysql-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'checks':len(checks),'failed':[],'baseTableWrites':0}))
