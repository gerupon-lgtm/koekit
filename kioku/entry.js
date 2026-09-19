// 場所と順番は同じタイトルから選び、コントローラの状態は共有しない。
const sequence = new URLSearchParams(location.search).get('mode') === 'sequence';
document.querySelector(sequence ? '#mode-sequence' : '#mode-place').setAttribute('aria-current', 'page');
if (sequence) await import('./sequence.js');
else await import('./app.js');
