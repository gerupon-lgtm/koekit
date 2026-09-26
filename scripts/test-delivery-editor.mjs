import assert from 'node:assert/strict';
import { createDraft, duplicateDraft, placePiece, resizeDraft, classifyDraft, reorderStages, parseEditorUtterance, mountEditor } from '../delivery/editor.js';

let count = 0;
function check(name, test) { test(); count++; console.log(`OK ${name}`); }
check('new and duplicate timestamps are UTC and original timestamps are preserved', () => {
  const draft = createDraft(3, 'original');
  assert.match(draft.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(draft.createdAt, draft.updatedAt);
  const older = { ...draft, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-02T00:00:00.000Z' };
  const copied = duplicateDraft(older, 'copy');
  assert.equal(copied.id, 'copy'); assert.equal(copied.revision, 0);
  assert.equal(copied.createdAt, copied.updatedAt);
  assert.notEqual(copied.createdAt, older.createdAt);
  assert.equal(older.createdAt, '2000-01-01T00:00:00.000Z');
  copied.blocked.push(3); assert.deepEqual(older.blocked, []);
});
check('placement keeps source unchanged and rejects overlap', () => {
  const draft = createDraft(3, 'a');
  const result = placePiece(draft, 0, 'robot');
  assert.equal(draft.start, null); assert.equal(result.stage.start, 0);
  assert.equal(placePiece(result.stage, 0, 'package').code, 'OCCUPIED');
  assert.equal(placePiece(result.stage, -1, 'obstacle').ok, false);
  assert.equal(placePiece(result.stage, 9, 'destination').ok, false);
});
check('four packages maximum; erase then reuse a unique string ID', () => {
  let stage = createDraft();
  for (let n = 0; n < 4; n++) stage = placePiece(stage, n, 'package').stage;
  assert.equal(placePiece(stage, 5, 'package').code, 'PACKAGE_FULL');
  stage = placePiece(stage, 1, 'erase').stage;
  stage = placePiece(stage, 5, 'package').stage;
  assert.equal(new Set(stage.packages.map(p => p.id)).size, 4);
  assert.ok(stage.packages.every(p => typeof p.id === 'string'));
});
check('resize preserves coordinates and removes only outside pieces', () => {
  let stage = createDraft(5);
  stage = placePiece(stage, 6, 'robot').stage;
  stage = placePiece(stage, 24, 'destination').stage;
  stage = placePiece(stage, 2, 'package').stage;
  stage = placePiece(stage, 12, 'obstacle').stage;
  const small = resizeDraft(stage, 3);
  assert.equal(small.start, 4); assert.equal(small.destination, null);
  assert.deepEqual(small.blocked, [8]); assert.equal(small.packages[0].cell, 2);
  assert.equal(resizeDraft(small, 9).start, 10);
});
const complete = { ...createDraft(3, 'complete'), start: 0, destination: 8, packages: [{ id: 'p', cell: 2 }], stepLimit: 4 };
check('readiness rejects incomplete, unsolved and insufficient budgets', () => {
  assert.equal(classifyDraft(createDraft(), { status: 'solved', minSteps: 0 }), 'incomplete');
  assert.equal(classifyDraft(complete, { status: 'no-solution' }), 'unsolvable');
  assert.equal(classifyDraft(complete, { status: 'solved', minSteps: 5 }), 'limit-insufficient');
  assert.equal(classifyDraft(complete, { status: 'solved', minSteps: 4 }), 'ready');
  assert.equal(classifyDraft(complete, { status: 'timeout' }), 'error');
});
check('order moves are bounded and source is immutable', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(reorderStages(order, 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(reorderStages(order, 0, -1), order);
  assert.deepEqual(order, ['a', 'b', 'c']);
});
check('whole utterance coordinate parser rejects numeric and multiple commands', () => {
  assert.equal(parseEditorUtterance('1', 3), null);
  assert.equal(parseEditorUtterance('A1 ロボット', 3), null);
  assert.equal(parseEditorUtterance('A1 B2', 3), null);
  assert.equal(parseEditorUtterance('D1', 3), null);
  assert.equal(parseEditorUtterance('えー いち', 9).cell, 0);
  assert.equal(parseEditorUtterance('いー に', 9).column, 4);
  assert.equal(parseEditorUtterance('エッチ はち', 9).cell, 70);
  assert.deepEqual(parseEditorUtterance('オッケー'), { type: 'confirm' });
});

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this.style = { setProperty() {} }; this.classList = { add() {} }; this.ownerDocument = { createElement: tag => new Node(tag) }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, action) { this.events[type] = action; }
}
function nodes(host) { return [host, ...host.children.flatMap(nodes)]; }
function click(host, text) { const node = nodes(host).find(n => n.tagName === 'button' && n.textContent === text); assert.ok(node, text); assert.ok(!node.disabled, text); node.events.click(); }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let saved = { stages: [complete] }, revision = 2, deny = false;
const storage = {
  load() { return { ok: true, value: structuredClone(saved), revision }; },
  save(kind, value, expectedRevision) { assert.equal(kind, 'library'); assert.equal(expectedRevision, revision); if (deny) return { ok: false, code: 'STORAGE_UNAVAILABLE' }; saved = structuredClone(value); return { ok: true, value: saved, revision: ++revision }; },
};
const host = new Node();
const pending = [];
const controller = mountEditor(host, { storage, search: () => new Promise(resolve => pending.push(resolve)), onPlay() {}, onClose() {} });
click(host, 'へんしゅう');
assert.ok(nodes(host).some(n => n.tagName === 'img' && n.src.endsWith('/assets/delivery/robot-empty.webp')));
assert.equal(nodes(host).find(n => n.attributes['aria-label'] === 'A1 ロボット').attributes['aria-pressed'], 'false');
controller.handleCommand({ type: 'coordinate', cell: 4 });
controller.handleCommand({ type: 'piece', piece: 'obstacle' });
controller.handleCommand({ type: 'confirm' });
assert.equal(pending.length, 3);
pending[1]({ status: 'solved', minSteps: 999 }); await tick();
assert.equal(controller.getState().analysis.status, 'searching');
pending[2]({ status: 'solved', minSteps: 7 }); await tick();
assert.equal(controller.getState().analysis.minSteps, 7);
deny = true; controller.handleCommand({ type: 'save' });
assert.deepEqual(controller.getState().current.blocked, [4]);
assert.deepEqual(saved.stages[0].blocked, []);
controller.handleCommand({ type: 'close' });
assert.equal(controller.getState().mode, 'edit');
deny = false; controller.handleCommand({ type: 'save' });
controller.handleCommand({ type: 'close' });
assert.deepEqual(saved.stages[0].blocked, [4]);
assert.match(saved.stages[0].updatedAt, /Z$/);
assert.equal(saved.stages[0].createdAt, complete.createdAt);
click(host, '削除'); deny = true; click(host, '削除する');
assert.equal(controller.getState().library.stages.length, 1);
deny = false; click(host, '削除する');
assert.equal(controller.getState().library.stages.length, 0);
controller.dispose();
console.log('OK stale search results ignored; save failures retain edits and failed delete retains library');

const failedHost = new Node();
const failedController = mountEditor(failedHost, { storage: { load: () => ({ ok: true, value: null, revision: 0 }), save: () => ({ ok: false, code: 'STORAGE_UNAVAILABLE' }) }, search: async () => ({ status: 'solved', minSteps: 4 }), onPlay() {}, onClose() {} });
click(failedHost, 'あたらしく つくる');
assert.equal(failedController.getState().dirty, true);
click(failedHost, '一覧へ もどる');
assert.equal(failedController.getState().mode, 'edit');
failedController.dispose();
console.log('OK failed initial draft save cannot be silently discarded by back');

const fullHost = new Node();
const full = mountEditor(fullHost, { storage: { load: () => ({ ok: true, value: { stages: Array.from({ length: 10 }, (_, n) => createDraft(3, `stage-${n}`)) } }), save() { throw new Error('should not save'); } }, search: async () => ({ status: 'solved', minSteps: 4 }), onPlay() {}, onClose() {} });
assert.ok(nodes(fullHost).find(n => n.textContent === 'あたらしく つくる').disabled);
assert.ok(nodes(fullHost).filter(n => n.textContent === 'ふくせい').every(n => n.disabled));
click(fullHost, 'へんしゅう'); assert.equal(full.getState().mode, 'edit');
full.dispose();
console.log('OK ten drafts disable only new and duplication; existing edit remains available');

const multiHost = new Node();
const multiPending = [];
const multi = mountEditor(multiHost, { storage: { load: () => ({ ok: true, value: { stages: [complete, { ...complete, id: 'second' }] } }) }, search: () => new Promise(resolve => multiPending.push(resolve)), onPlay() {}, onClose() {} });
assert.equal(multiPending.length, 1);
multiPending[0]({ status: 'solved', minSteps: 4 }); await tick();
assert.equal(multiPending.length, 2);
multi.dispose();
console.log('OK library searches are sequential for the cancellable single Worker client');

const previewHost = new Node(); let playCall;
const preview = mountEditor(previewHost, { storage: { load: () => ({ ok: true, value: { stages: [complete] }, revision: 0 }) }, search: async () => ({ status: 'solved', minSteps: 4 }), onPlay(stages, options) { playCall = { stages, options }; }, onClose() {} });
await tick(); click(previewHost, 'へんしゅう'); await tick();
preview.handleCommand({ type: 'coordinate', cell: 3 });
click(previewHost, 'ためしに あそぶ');
assert.equal(playCall.options.preview, true);
playCall.stages[0].start = 7;
assert.equal(preview.getState().current.start, 0);
playCall.options.onReturn(); await tick();
assert.equal(preview.getState().selected, 3);
assert.equal(preview.getState().mode, 'edit');
preview.dispose();
console.log('OK preview gets independent snapshots and restores original editor selection');
console.log(`${count + 5} editor checks passed`);
