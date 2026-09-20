import { FIELDS, DEFAULTS, normalize } from './layout.js';

const $ = id => document.getElementById(id);
const KEY = 'koekit.menu-preview.v1';
const MODES = ['doubutsu', 'kioku-place', 'kioku-sequence'];
let stored = {};
try { stored = JSON.parse(location.hash.slice(1) ? decodeURIComponent(location.hash.slice(1)) : localStorage.getItem(KEY) || '{}'); } catch {}
if (!stored || typeof stored !== 'object') stored = {};
let settings = normalize(stored.settings);
let mode = MODES.includes(stored.mode) ? stored.mode : 'doubutsu';
let record = ['empty','partial','complete'].includes(stored.record) ? stored.record : 'partial';
let ready = false, loadId = 0, metrics = null;
$('game').value = mode;
$('record').value = record;

function savedState() { return { version: 1, settings, mode, record }; }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(savedState())); }
  catch { $('message').textContent = 'この端末では保存できません。「この設定をコピー」で残してください。'; }
  try { history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(savedState()))); } catch {}
}
function apply() {
  if (!ready) return;
  metrics = null; $('copy').disabled = true;
  $('copy-fallback').hidden = true;
  $('preview').contentWindow.postMessage({ type: 'menu-config', settings, record, original: $('original').checked }, location.origin);
}
function syncInputs() {
  for (const f of FIELDS) {
    $(f.key).value = settings[f.key];
    $(`${f.key}-value`).value = `${settings[f.key]}px`;
  }
}
for (const f of FIELDS) {
  const label = document.createElement('label'); label.className = 'slider-row'; label.htmlFor = f.key;
  const row = document.createElement('span'); row.textContent = f.label;
  const output = document.createElement('output'); output.id = `${f.key}-value`; output.htmlFor = f.key;
  row.append(output);
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', id: f.key, min: f.min, max: f.max, step: 1 });
  input.addEventListener('input', () => {
    settings[f.key] = Number(input.value); syncInputs(); persist(); apply();
  });
  label.append(row, input); $('sliders').append(label);
}
syncInputs();

async function load() {
  const id = ++loadId;
  ready = false; metrics = null;
  $('load-error').hidden = true; $('fit').textContent = '読み込み中…';
  try {
    const base = new URL(mode === 'doubutsu' ? '../doubutsu/' : '../kioku/', location.href);
    const response = await fetch(base, { cache: 'no-store' });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (id !== loadId) return;
    // 実際のHTML/CSSと部品を使用するが、ゲーム・音声・SWのスクリプトは起動しない。
    doc.querySelectorAll('script, base, link[rel="manifest"]').forEach(el => el.remove());
    doc.querySelectorAll('body > :not(#title)').forEach(el => el.remove());
    const baseTag = doc.createElement('base'); baseTag.href = base.href; doc.head.prepend(baseTag);
    doc.body.dataset.previewMode = mode;
    const script = doc.createElement('script'); script.type = 'module';
    script.src = new URL('./frame.js', location.href).href; doc.body.append(script);
    $('preview').srcdoc = '<!doctype html>\n' + doc.documentElement.outerHTML;
  } catch {
    if (id !== loadId) return;
    $('load-error').textContent = '画面を読み込めませんでした。通信を確認して再読み込みしてください。';
    $('load-error').hidden = false;
  }
}
addEventListener('message', event => {
  if (event.source !== $('preview').contentWindow || event.origin !== location.origin) return;
  const data = event.data;
  if (data?.type === 'menu-ready') { ready = true; apply(); }
  if (data?.type === 'menu-measure') {
    metrics = data;
    $('copy').disabled = $('original').checked;
    $('fit').textContent = `${data.width} × ${data.height}px · ` + (data.overflow ? `下に${data.overflow}pxはみ出しています。高さや間隔を小さくしてください。` : '一画面に収まっています');
    $('fit').classList.toggle('overflow', data.overflow > 0);
  }
  if (data?.type === 'menu-mode' && MODES.includes(data.mode)) {
    mode = data.mode; $('game').value = mode; persist(); load();
  }
  if (data?.type === 'menu-note') $('message').textContent = data.text;
});
function panel(open) {
  $('settings').hidden = !open; $('open-settings').hidden = open;
  $('open-settings').setAttribute('aria-expanded', String(open));
  (open ? $('close-settings') : $('open-settings')).focus();
}
$('open-settings').onclick = () => panel(true);
$('close-settings').onclick = () => panel(false);
addEventListener('keydown', event => { if (event.key === 'Escape') panel(false); });
$('game').onchange = () => { mode = $('game').value; persist(); load(); };
$('record').onchange = () => { record = $('record').value; persist(); apply(); };
$('original').onchange = () => { $('sliders').disabled = $('original').checked; $('copy').disabled = $('original').checked; apply(); };
$('reset').onclick = () => { settings = { ...DEFAULTS }; $('original').checked = false; $('sliders').disabled = false; $('copy').disabled = false; syncInputs(); persist(); apply(); };
$('copy').onclick = async () => {
  if (!ready || !metrics) { $('message').textContent = '画面の読み込み後にコピーしてください。'; return; }
  persist();
  const state = { ...savedState(), viewport: { width: metrics.width, height: metrics.height }, measured: metrics };
  const text = 'コエキット メニュー調整\n' + JSON.stringify(state, null, 2) + '\n同じ設定で開く：\n' + location.href;
  try { await navigator.clipboard.writeText(text); $('copy-fallback').hidden = true; $('message').textContent = 'コピーしました。このチャットに貼ってください。'; }
  catch { $('copy-fallback').value = text; $('copy-fallback').hidden = false; $('copy-fallback').focus(); $('copy-fallback').select(); $('message').textContent = '下の設定を選択してコピーしてください。'; }
};
load();
