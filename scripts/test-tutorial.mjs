import assert from 'node:assert/strict';
import { Tutorial } from '../irodori/tutorial.js';

const t = new Tutorial();
const action = () => ({ type: 'paint', tool: t.lesson.tool, color: t.lesson.color, cells: t.lesson.cells });
assert.equal(t.base.length, 81);
assert.equal(t.next(), false, '未達成では進まない');
t.record({ ...action(), color: 0 }, t.target);
assert.equal(t.passed, false, '違う色は不合格');
for (let step = 0; step < 3; step++) {
  const extra = t.target; extra[80] = 0;
  t.record(action(), extra);
  assert.equal(t.passed, false, '余分な着色があると不合格');
  if (step > 0) {
    t.record({ ...action(), tool: 'single' }, t.target);
    assert.equal(t.passed, false, '範囲・線の操作を使う');
    t.record({ ...action(), cells: [t.lesson.cells[0]] }, t.target);
    assert.equal(t.passed, false, '一部だけの着色では進まない');
  }
  const painted = t.target;
  t.record(action(), painted);
  assert.equal(t.passed, true);
  assert.equal(t.next(), true);
  assert.deepEqual(t.base, painted, '同じ9×9盤面の絵を次へ引き継ぐ');
}
assert.equal(t.base[0], 2);
assert.equal(t.base[20], 7, '青の上にオレンジのななめ線');
t.record({ type: 'undo' }, t.base);
assert.equal(t.passed, false, '黒に塗る前の取り消しでは完了しない');
t.record(action(), t.target);
assert.equal(t.undoReady, true);
assert.equal(t.passed, false, '黒に塗っただけでは完了しない');
t.record({ type: 'paint', tool: 'single', color: null, cells: [43] }, t.base);
assert.equal(t.passed, false, '消しゴムではなくUndoを練習');
t.record({ type: 'undo' }, t.base);
assert.equal(t.passed, true);
assert.equal(t.next(), false, '最後は終了');
assert.deepEqual(t.retry(), t.base);
assert.equal(t.undoReady, false);
assert.equal(t.passed, false);
console.log('PASS tutorial: 4 lessons, wrong input, cumulative board, undo and retry');
