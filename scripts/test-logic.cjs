// 決定的な処理のロジックテスト（implementation-guide 10節）
// 対象: 語彙照合(T-009) / CSVエスケープ・JST変換(T-013) / 合格ライン判定(T-014) / 区間遷移(T-010)
//
// 実行:
//   node scripts/test-logic.cjs
//   TZ=UTC node scripts/test-logic.cjs   ← JST依存の混入検出（時刻テストはこれで固定）
//
// ESモジュールを動的 import で読み込む（.cjs から）。

'use strict';

let passed = 0, failed = 0;
const fails = [];
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; fails.push(`  ✗ ${name}\n      期待: ${e}\n      実際: ${a}`); }
}
function ok(cond, name) { eq(!!cond, true, name); }

(async () => {
  const url = p => require('url').pathToFileURL(require('path').join(__dirname, '..', p)).href;

  const vocab   = await import(url('src/speech/vocabulary.js'));
  const csv     = await import(url('src/log/csv.js'));
  const metrics = await import(url('src/log/metrics.js'));
  const phase   = await import(url('src/game/phase.js'));
  const judgeM  = await import(url('src/game/judge.js'));
  const roul    = await import(url('src/game/roulette.js'));
  const dealM   = await import(url('src/game/deal.js'));

  // ---- T-009 語彙照合 ----
  eq(vocab.match('みぎ'), 'right', 'みぎ → right');
  eq(vocab.match('ミギ'), 'right', 'ミギ（カタカナ）→ right');
  eq(vocab.match('右'),   'right', '右（漢字）→ right');
  eq(vocab.match(' 右 '), 'right', '前後空白つき 右 → right');
  eq(vocab.match('道'),   '',      '道 → 一致なし');
  eq(vocab.match('みぎがわ'), '',  'みぎがわ → 一致なし（部分一致にしない）');
  eq(vocab.match(''),     '',      '空文字 → 一致なし');
  eq(vocab.match('スタート'), 'start', 'スタート → start');
  eq(vocab.match('停止'), 'stop',  '停止 → stop（同義語）');
  eq(vocab.match('オッケー'), 'confirm', 'オッケー → confirm');
  // 区間ごとの絞り込み
  eq(vocab.match('みぎ', ['left', 'right']), 'right', '許可語内 みぎ → right');
  eq(vocab.match('みぎ', ['left']), '', '区間外 みぎ → 一致なし');
  // コードを触らず同義語を追加できる（データ編集 + rebuild）
  vocab.SYNONYMS.right.push('みぎがわ');
  vocab.rebuildLookup();
  eq(vocab.match('みぎがわ'), 'right', 'データ追加後 みぎがわ → right（ロジック不変）');
  vocab.SYNONYMS.right.pop();
  vocab.rebuildLookup();

  // ---- T-013 CSV: エスケープ ----
  const tricky = 'あ,"い"\nう'; // カンマ・ダブルクォート・改行を含む
  eq(csv.escapeField(tricky), '"あ,""い""\nう"', 'カンマ/引用符/改行を1フィールドに閉じ込める');
  const rows = csv.toCSV([{
    at: new Date('2026-09-16T12:03:11Z'), method: 'vosk', level: '1',
    phase: 'await_position', expected: 'right', rawText: tricky,
    matchedKey: '', elapsedMs: 0, outcome: 'ignored', sessionRestart: 0,
  }]);
  const lines = rows.split('\r\n');
  eq(lines[0], '"時刻","方式","レベル","区間","期待語","認識文字列","照合結果","所要ms","成否","再開回数"', 'ヘッダ行');
  ok(lines[1].startsWith('"2026-09-16 21:03:11","vosk","1"'), 'UTC12:03→JST21:03 かつ列が崩れない');
  ok(lines[1].includes('"あ,""い""\nう"'), '認識文字列の特殊文字が1フィールドに収まる');

  // ---- T-013 CSV: JSTの日付境界 ----
  // UTC 2026-09-16T15:30:00Z = JST 2026-09-17 00:30:00（日付がJSTで進む）
  eq(csv.formatJst(new Date('2026-09-16T15:30:00Z')), '2026-09-17 00:30:00', 'JST日付境界(0:30)');
  // UTC 2026-09-16T14:59:59Z = JST 2026-09-16 23:59:59
  eq(csv.formatJst(new Date('2026-09-16T14:59:59Z')), '2026-09-16 23:59:59', 'JST日付境界(23:59)');
  // 月末月初: UTC 2026-09-30T15:00:00Z = JST 2026-10-01 00:00:00
  eq(csv.formatJst(new Date('2026-09-30T15:00:00Z')), '2026-10-01 00:00:00', 'JST月末月初');

  // ---- T-014 合格ライン判定 ----
  const mk = (outcome, opt = {}) => ({
    at: new Date(), method: 'vosk', level: '0', phase: 'await_stop',
    expected: opt.expected ?? 'stop', rawText: '', matchedKey: opt.matchedKey ?? '',
    elapsedMs: opt.elapsedMs ?? 0, outcome, sessionRestart: opt.sessionRestart ?? 0,
  });
  // 8 correct(認識・所要あり) + 2 unrecognized(期待語あるが一致なし) → successRate 0.8
  const logs = [];
  for (let i = 0; i < 8; i++) logs.push(mk('correct', { matchedKey: 'stop', elapsedMs: 700 + i * 10 }));
  for (let i = 0; i < 2; i++) logs.push(mk('ignored', { expected: 'stop' }));
  logs.push(mk('spurious', { expected: '' }));
  const m = metrics.computeMetrics(logs);
  eq(Math.round(m.successRate * 100) / 100, 0.8, 'successRate = 0.8');
  eq(m.counts.unrecognized, 2, '認識されなかった発話 = 2');
  eq(m.spuriousCount, 1, '誤発動 = 1');
  eq(m.elapsedMedian, 735, '所要中央値 = 735ms');
  eq(m.elapsedMax, 770, '所要最大 = 770ms');
  const j = metrics.judge(m);
  eq(j.items.successRate, true, '成功率 0.8 は合格');
  eq(j.items.elapsedMedian, true, '中央値 735ms は合格');
  // 連続使用: 25件すべて sessionRestart=0 → maxRun 25 → run 合格
  eq(metrics.computeMetrics(Array.from({ length: 25 }, () => mk('correct', { matchedKey: 'stop', elapsedMs: 700 }))).maxRunWithoutDrop, 25, '連続25で maxRun=25');
  // ログ0件でゼロ除算しない
  const zero = metrics.computeMetrics([]);
  eq(zero.successRate, null, 'ログ0件 successRate=null');
  eq(metrics.judge(zero).hasData, false, 'ログ0件 hasData=false（データなし）');

  // ---- T-010 区間の受け付け語 ----
  eq(phase.vocabForPhase(phase.PHASES.AWAIT_START), ['start'], 'スタート待ちは start のみ');
  eq(phase.vocabForPhase(phase.PHASES.AWAIT_STOP), ['stop'], 'ストップ待ちは stop のみ');
  eq(phase.vocabForPhase(phase.PHASES.AWAIT_POSITION, ['left', 'right']), ['left', 'right'], '位置語待ちはレベルの位置語');
  eq(phase.vocabForPhase(phase.PHASES.AWAIT_CONFIRM, ['left', 'right']), ['confirm', 'left', 'right'], '確定待ちは confirm＋位置語（言い直し）');
  eq(phase.vocabForPhase(phase.PHASES.RESULT), [], 'result は認識停止（受け付け語なし）');
  // ステートマシン: result では stopListening、他では startListening(keys)
  const calls = [];
  const pm = new phase.PhaseMachine({
    startListening: keys => calls.push(['start', keys]),
    stopListening: () => calls.push(['stop']),
  });
  pm.to(phase.PHASES.AWAIT_STOP);
  eq(calls.at(-1), ['start', ['stop']], 'await_stop で start(["stop"])');
  pm.to(phase.PHASES.RESULT);
  eq(calls.at(-1), ['stop'], 'result で stopListening');
  // await_stop で「みぎ」は区間外 → ignored、「ストップ」は match
  pm.to(phase.PHASES.AWAIT_STOP);
  let matched = null, ignored = null;
  pm.on('match', k => { matched = k; }).on('ignored', r => { ignored = r; });
  pm.handleRaw('みぎ');
  eq(ignored, 'みぎ', 'await_stop で みぎ は ignored（区間外）');
  pm.handleRaw('ストップ');
  eq(matched, 'stop', 'await_stop で ストップ は match');

  // ---- T-020 成否判定と回数管理 ----
  {
    const J = judgeM.Judge;
    // 3回正解で即クリア（4・5回目を待たない）
    let j = new J();
    eq(j.record('correct'), 'playing', '1正解: playing');
    eq(j.record('wrong'), 'playing', '1正解1失敗: playing');
    eq(j.record('correct'), 'playing', '2正解: playing');
    eq(j.record('correct'), 'clear', '3正解で即クリア');
    eq(j.attempts, 4, 'クリア時の試行数は4（5を待たない）');
    // ignored はカウントしない
    j = new J();
    j.record('ignored'); j.record('ignored');
    eq(j.attempts, 0, 'ignored はカウントしない');
    // 2正解3失敗でゲームオーバー
    j = new J();
    ['correct','wrong','correct','wrong','wrong'].forEach(o => j.record(o));
    eq(j.status, 'gameover', '2正解3失敗でゲームオーバー');
    // 認識なしが何回あってもカウントが増えない → 決着しない
    j = new J();
    for (let i=0;i<10;i++) j.record('ignored');
    eq(j.status, 'playing', 'ignoredのみでは決着しない');
    // 決着後は二重遷移しない
    j = new J();
    ['correct','correct','correct'].forEach(o=>j.record(o));
    eq(j.record('correct'), 'clear', 'クリア後にrecordしてもclearのまま');
    eq(j.attempts, 3, 'クリア後にattemptsが増えない');

    // continueAfterClear（きおくめくり）: 規定回数到達でも即クリアにせず5回まで続行
    j = new J({ clearHits: 1, continueAfterClear: true });
    eq(j.record('correct'), 'playing', '1正解でも playing（続行可）');
    eq(j.cleared, true, 'ただし cleared フラグは立つ');
    eq(j.record('wrong'), 'playing', '続行中は playing');
    ['wrong','wrong','wrong'].forEach(o=>j.record(o)); // 計5回
    eq(j.status, 'clear', 'クリア済のまま5回到達で clear');
    // continueAfterClear で一度も規定回数に達しなければ5回でゲームオーバー
    j = new J({ clearHits: 2, continueAfterClear: true });
    ['correct','wrong','wrong','wrong','wrong'].forEach(o=>j.record(o));
    eq(j.status, 'gameover', '規定未達で5回→ゲームオーバー');
  }

  // ---- KM-010 配置デール（絵→セル・対象選定） ----
  {
    for (let t = 0; t < 20; t++) {
      const keys = ['upleft','up','upright','left','center','right','downleft','down','downright'];
      const d = dealM.deal(keys);
      const letters = keys.map(k => d.map[k]);
      eq(new Set(letters).size, keys.length, '9セルすべて別の絵（重複なし）');
      ok(keys.includes(d.targetKey), '対象は盤面のいずれかの位置');
      eq(d.targetLetter, d.map[d.targetKey], 'targetLetter は対象位置の絵と一致');
    }
    // 2枚レベルでも成立
    const d2 = dealM.deal(['left','right']);
    eq(Object.keys(d2.map).length, 2, '2枚レベルは2セル');
    eq(new Set(Object.values(d2.map)).size, 2, '2枚も別の絵');
  }

  // ---- T-016 フェイント停止（必ず有限回で止まる） ----
  {
    // now を毎フレーム大きく進め、raf をキューで同期駆動して決定的に検証
    const drive = (opts) => {
      let now = 0; const q = [];
      const r = new roul.Roulette({ now: () => now, raf: cb => q.push(cb), ...opts });
      let fakeouts = 0, stopped = false;
      r.on('fakeout', () => fakeouts++);
      r.on('stop', () => { stopped = true; });
      r.start(); r.stop();
      let guard = 0;
      while (q.length && guard++ < 200000) { const cb = q.shift(); now += 1000; cb(); if (stopped) break; }
      return { fakeouts, stopped };
    };
    const a = drive({ fakeoutProb: 1, fakeoutMax: 2 });
    eq(a.stopped, true, 'フェイント有でも必ず停止する');
    eq(a.fakeouts, 2, 'フェイント回数は上限(2)で打ち止め');
    const b = drive({ fakeoutProb: 0, fakeoutMax: 0 });
    eq(b.stopped, true, 'フェイント無効でも停止する');
    eq(b.fakeouts, 0, 'フェイント無効なら再加速しない');
  }

  // レベル境界でも、指定された語だけを受ける。
  {
    const { PHASES: P, PhaseMachine } = phase;
    let active = [], stopped = 0;
    const machine = new PhaseMachine({ startListening: k => active = k, stopListening: () => { active = []; stopped++; } });
    machine.setLevelVocab(['left', 'right']);
    machine.to(P.AWAIT_INTRO);
    eq(machine.handleRaw('オーケー'), 'confirm', '紹介を声で閉じる');
    eq(machine.handleRaw('オッケー'), 'confirm', '紹介でオッケーも受ける');
    eq(machine.handleRaw('つぎ'), '', '紹介ではつぎを無視');
    machine.to(P.AWAIT_NEXT);
    eq(active, ['next'], '認定書は次だけを認識');
    eq(machine.handleRaw('次'), 'next', '漢字の次を照合');
    eq(machine.handleRaw('つぎ'), 'next', 'ひらがなのつぎを照合');
    eq(machine.handleRaw('オーケー'), '', '結果確定の発話で次へ飛ばない');
    machine.to(P.RESULT);
    eq(active, [], '演出中は受付停止');
    eq(machine.handleRaw('つぎ'), '', '効果音中のつぎを無視');
    machine.to(P.AWAIT_CONFIRM);
    eq(machine.handleRaw('つぎ'), '', '回答をつぎで飛ばせない');
    eq(machine.handleRaw('オーケー'), 'confirm', '回答の2段階確定を維持');
  }

  // Voskの初期化待ち中に区間が変わっても、古い文法で認識を始めない。
  {
    const { VoskAdapter } = await import(url('src/speech/vosk.js'));
    const a = new VoskAdapter();
    let finish, created = [], handlers = [];
    a._init = () => new Promise(resolve => { finish = resolve; });
    a._model = { KaldiRecognizer: class {
      constructor(rate, grammar) { created.push(JSON.parse(grammar)); }
      on(type, fn) { if (type === 'result') handlers.push(fn); }
      remove() {}
    }};
    const first = a.start(['オーケー']);
    a.stop(); finish(); await first;
    eq(created.length, 0, '停止後に初期化が完了しても認識器を作らない');
    a._init = async () => {};
    await a.start(['つぎ']);
    let results = 0; a.on('result', () => results++);
    a.stop(); await a.start(['オーケー']);
    handlers[0]({ result: { text: '次' } });
    eq(results, 0, '前区間の遅延結果を破棄');
    handlers[1]({ result: { text: 'オーケー' } });
    eq(results, 1, '現区間の結果は通知');
    a.dispose(); await a.start(['つぎ']);
    eq(created.length, 2, '破棄後は再開しない');
  }

  // 効果音終了待ちの予約は、移動先で置き換え・取り消しできる。
  {
    const { LevelNavigation } = await import(url('src/ui/levelnavigation.js'));
    const savedSet = global.setTimeout, savedClear = global.clearTimeout;
    const queue = new Map(); let id = 0, states = [];
    try {
      global.setTimeout = fn => { queue.set(++id, fn); return id; };
      global.clearTimeout = key => queue.delete(key);
      const nav = new LevelNavigation(), p = { to: state => states.push(state) };
      nav.afterSound(); nav.listen(p, phase.PHASES.AWAIT_NEXT);
      eq(states, ['result'], '効果音中に認識を再開しない');
      nav.listen(p, phase.PHASES.AWAIT_INTRO);
      eq(queue.size, 1, 'タッチで移動したら旧画面の予約を置換');
      [...queue.values()][0]();
      eq(states.at(-1), 'await_intro', '音の終了後は移動先の語彙で再開');
      nav.cancel();
      eq(queue.size, 0, 'タイトルへ戻ると予約を解除');
    } finally { global.setTimeout = savedSet; global.clearTimeout = savedClear; }
  }

  // 正解表示の先送り語は専用区間だけで受ける。
  {
    const keys = phase.vocabForPhase(phase.PHASES.AWAIT_RESULT_NEXT);
    eq(vocab.match('つぎ', keys), 'next', '正解表示のつぎ');
    eq(vocab.match('オッケー', keys), 'confirm', '正解表示のオッケー');
    eq(vocab.match('オーケー', keys), 'confirm', '正解表示のオーケー');
    eq(vocab.match('みぎ', keys), '', '正解表示中に位置は変えない');
  }
  // Screen Wake Lock: 復帰、解除、取得待ち中の終了、非対応・拒否。
  {
    const { ScreenAwake } = await import(url('src/ui/screenawake.js'));
    const listeners = {};
    const doc = { visibilityState: 'visible', addEventListener: (t, fn) => listeners[t] = fn };
    let locks = [], requests = 0;
    const newLock = () => { const l = { released: false, addEventListener(t, fn) { this.onrelease = fn; }, async release() { this.released = true; this.onrelease?.(); } }; locks.push(l); return l; };
    const manager = new ScreenAwake({ doc, wakeLock: { async request() { requests++; return newLock(); } } });
    manager.setActive(true); await Promise.resolve();
    eq(requests, 1, '開始で画面維持を取得');
    manager.setActive(true); await Promise.resolve();
    eq(requests, 1, '画面遷移で二重取得しない');
    doc.visibilityState = 'hidden'; listeners.visibilitychange();
    eq(locks[0].released, true, '非表示で解除');
    doc.visibilityState = 'visible'; listeners.visibilitychange(); await Promise.resolve();
    eq(requests, 2, '復帰時に再取得');
    manager.setActive(false);
    eq(locks[1].released, true, 'タイトルで解除');
    listeners.visibilitychange(); await Promise.resolve();
    eq(requests, 2, 'タイトルでは再取得しない');
    let resolve;
    const pending = new ScreenAwake({ doc, wakeLock: { request: () => new Promise(r => resolve = r) } });
    pending.setActive(true); pending.setActive(false);
    const late = newLock(); resolve(late); await Promise.resolve(); await Promise.resolve();
    eq(late.released, true, '終了後に届いたロックも解除');
    const unsupported = new ScreenAwake({ doc, wakeLock: null });
    unsupported.setActive(true); await unsupported.acquire();
    eq(unsupported.lock, null, '非対応でも継続');
    const denied = new ScreenAwake({ doc, wakeLock: { request: async () => { throw Error('denied'); } } });
    denied.active = true; await denied.acquire();
    eq(denied.pending, false, '拒否で待機を解除');
    eq(denied.lock, null, '拒否でもゲームを妨げない');
  }

  // ---- 結果 ----
  console.log(`\nテスト: ${passed} 通過 / ${failed} 失敗`);
  if (failed) { console.log(fails.join('\n')); process.exit(1); }
  console.log('全テスト通過');
})().catch(e => { console.error(e); process.exit(1); });
