import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const line = await readFile(new URL('../src/views/home/SchedulesLine.vue', import.meta.url), 'utf8');
const board = await readFile(new URL('../src/views/home/Board.vue', import.meta.url), 'utf8');
const lineTemplate = line.slice(0, line.indexOf('<script>'));
const lineScript = line.match(/<script>([\s\S]*?)<\/script>/)[1];

//队序文案是纯函数，直接拿 methods 跑，不用挂组件
function lineMethods() {
  const context = vm.createContext({mapGetters: () => ({}), console: {log() {}}});
  for (const [, name] of lineScript.matchAll(/import\s+(\w+)\s+from/g)) if (!(name in context)) context[name] = {};
  vm.runInContext(lineScript.replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options ='), context);
  return context.options.methods;
}

test('疗愈师卡片只讲队序和今日接单数，旧的轮次口径不再出现', () => {
  assert.match(lineTemplate, /服务队序：/);
  assert.match(lineTemplate, /接待队序：/);
  assert.match(lineTemplate, /今日已接：服务/);
  assert.doesNotMatch(lineTemplate, /当前轮次|已排轮次|预估排班优先级/);
});

test('队序按「队里有位置才有号」显示，不在队里不显示成第 0 位', () => {
  const {queueNoText} = lineMethods();
  assert.equal(queueNoText(3), '第 3 位');
  assert.equal(queueNoText(1), '第 1 位');
  assert.equal(queueNoText(null), '未在队');
  assert.equal(queueNoText(undefined), '未在队');
});

test('头像圆圈显示服务队序，不在队里就不挂圆圈', () => {
  assert.match(lineTemplate, /v-if="queuePosition && queuePosition\.serviceNo"[\s\S]*?\{\{ queuePosition\.serviceNo \}\}/);
});

test('看板把队序数据整份传给卡片，且不再走轮次接口', () => {
  assert.match(board, /:queue-position="getQueuePosition\(item\.id\)"/);
  assert.match(board, /roundScheduleApi\.queuePositions\(this\.searchForm\)/);
  assert.doesNotMatch(board, /findMassagistRound|massagistRound/);
});