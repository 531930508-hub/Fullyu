"""Execute actual MyBatis-bound SQL against temporary synthetic tables on the isolated host.
No base table writes, no credentials, no production host. EXPLAIN only on real isolated schema.
"""
import json
import re
import subprocess
from pathlib import Path

queries = json.loads(Path('/tmp/fullyu-duration-sql.json').read_text())
assert len(queries) == 12

def bind(query):
    parts = query['sql'].split('?')
    assert len(parts) == len(query['values']) + 1
    sql = parts[0]
    for value, part in zip(query['values'], parts[1:]):
        if isinstance(value, int):
            literal = str(value)
        else:
            assert isinstance(value, str) and re.fullmatch(r'[0-9 :\-]+', value)
            literal = "'" + value + "'"
        sql += literal + part
    return sql

statements = ["SET @guard=IF(DATABASE()='tou_mall_test','SELECT 1','SELECT * FROM fullyu_duration_requires_test_db'); PREPARE guard_stmt FROM @guard; EXECUTE guard_stmt; DEALLOCATE PREPARE guard_stmt;"]
for query in queries[:2]:
    statements += ["SELECT 'PLAN|" + query['name'] + "';", 'EXPLAIN ' + bind(query) + ';']
statements += [
    'CREATE TEMPORARY TABLE s_massagist(id BIGINT PRIMARY KEY,status INT);',
    'CREATE TEMPORARY TABLE oms_order_detail(id BIGINT PRIMARY KEY,massagist_id BIGINT,shop_id BIGINT,state INT,end_time DATETIME);',
    'INSERT INTO s_massagist VALUES(7,1),(8,1),(9,0),(10,2);',
    "INSERT INTO oms_order_detail VALUES (1,7,5,2,'2026-11-01 00:00:00'),(2,7,5,2,'2026-11-30 23:59:59'),(3,8,5,2,'2026-11-08 10:00:00'),(4,9,5,2,'2026-11-08 10:00:00'),(5,10,5,2,'2026-11-08 10:00:00'),(6,7,6,2,'2026-11-08 10:00:00'),(7,7,5,1,'2026-11-08 10:00:00'),(8,7,5,2,'2026-10-31 23:59:59'),(9,7,5,2,'2026-12-01 00:00:00'),(10,999,5,2,'2026-11-08 10:00:00');",
]
for query in queries:
    statements += ["SELECT 'CASE|" + query['name'] + "';", bind(query) + ';']
run = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','root@121.40.119.57',
                      'mysql --batch --raw --skip-column-names tou_mall_test'],
                     input='\n'.join(statements),text=True,capture_output=True,check=True)
blocks = {}
current = None
for line in run.stdout.splitlines():
    if line.startswith(('CASE|','PLAN|')):
        current = line
        blocks[current] = []
    elif current:
        blocks[current].append(line)
expected = {'count-1':['2'],'keys-1':['7\t2026-11'],'count-0':['1'],'keys-0':['9\t2026-11'],
            'count--1':['4'],'keys--1':['7\t2026-11'],'count-2':['1'],'keys-2':['10\t2026-11'],
            'next-page':['8\t2026-11'],
            'selected-details':['1\t7\t5\t2\t2026-11-01 00:00:00','2\t7\t5\t2\t2026-11-30 23:59:59'],
            'empty-details':[],'self-across-shops':['7\t2026-11']}
checks = []
for name, rows in expected.items():
    actual = blocks['CASE|' + name]
    checks.append({'name':name,'passed':actual == rows})
    assert actual == rows, (name, actual, rows)
for name in ['PLAN|count-1', 'PLAN|keys-1']:
    assert any('idx_duration_page' in row for row in blocks[name]), (name, 'missing date-range index', blocks[name])
report = {'host':'isolated-test','baseTableWrites':0,'temporaryTables':2,'checks':checks,
          'plans':{name:rows for name,rows in blocks.items() if name.startswith('PLAN|')},
          'scope':'MyBatis SQL + MySQL temporary synthetic contract; not Spring HTTP or production data'}
Path('/tmp/fullyu-duration-mysql-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'checks':len(checks),'failed':[],'baseTableWrites':0}))
