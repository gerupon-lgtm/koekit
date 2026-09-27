// Reuse the same controls and handlers; only their presentation changes.
// ?view=full keeps the original technical layout for regression comparisons.
export function setupEditorLayout() {
  if (new URLSearchParams(location.search).get('view') === 'full') return false;
  const $=id=>document.getElementById(id);
  const main=document.querySelector('main'), sections=[...main.querySelectorAll(':scope > section')];
  document.body.classList.add('editor-focus');
  document.title='サエズリズム 編集テスト';
  const header=main.querySelector('header');
  header.innerHTML='<h1>サエズリズム <small>作成・編集テスト v21</small></h1><p>音を選ぶ → 直す → 聴く → オッケー</p>';
  const source=document.createElement('details');source.id='editor-source';
  source.innerHTML='<summary>新しくつくる・音列を開く</summary><p id="source-hint">仮の変更があるときは、確定するか取り消してから開けます。</p><div class="source-actions"></div>';
  const workspace=document.createElement('section');workspace.id='edit-workspace';
  workspace.setAttribute('aria-label','音列の編集');
  workspace.innerHTML='<div class="listen-settings" aria-label="試聴設定"></div><div id="editor-standby"><p>確定した音列を、もう一度編集できます。</p></div>';
  const technical=document.createElement('details');technical.id='technical-tools';
  technical.innerHTML='<summary>録音・解析・入力の詳細検証</summary>';
  main.append(source,workspace,technical);
  technical.append(...sections);
  const move=(id,parent,label=false)=>parent.append(label?$(id).closest('label'):$(id));
  const sound=workspace.querySelector('.listen-settings');
  for(const id of ['tempo','instrument','play-count-style','count-volume','play-count']) move(id,sound,true);
  // Keep labels short without replacing the existing form controls.
  const label=(id,text)=>{const node=$(id).closest('label');for(const child of [...node.childNodes]) if(child.nodeType===3) child.remove();node.prepend(document.createTextNode(text));};
  label('tempo','BPM');label('instrument','音色');label('play-count-style','ドンカマ');label('count-volume','音量');label('play-count','鳴らす');
  for(const option of $('count-volume').options) option.textContent=({'.5':'小','0.5':'小','1':'中','2':'大'})[option.value];
  for(const option of $('play-count-style').options) option.textContent=({rim:'リムショット',stick:'スティック',tambourine:'タンバリン',shaker:'シェーカー'})[option.value];
  const sourceActions=source.querySelector('.source-actions');
  move('capture',sourceActions);move('edit-score',$('editor-standby'));
  source.append($('capture-import-text').closest('details'));
  move('capture-position',source);
  // Recording progress must remain visible even when the source drawer is shut.
  const review=$('review'), leftovers=document.createElement('details');leftovers.id='editor-more';
  leftovers.innerHTML='<summary>全体の高さ・譜面表示・詳しい編集</summary>';
  const oldChildren=[...review.children];leftovers.append(...oldChildren);
  review.append(leftovers);
  const panel=$('capture-note-panel'), toolbar=panel.querySelector('.edit-toolbar');
  const listen=document.createElement('div');listen.className='listen-actions';
  toolbar.append(listen);
  for(const id of ['preview','capture-edit-confirm','capture-edit-undo']) move(id,listen);
  $('preview').textContent='▶ 聴く';$('capture-edit-confirm').textContent='オッケー';$('capture-edit-undo').textContent='もどす';
  toolbar.append(listen);
  // Status is adjacent to the confirmation buttons, including voice results.
  move('capture-edit-status',toolbar);
  const voice=document.createElement('div');voice.className='editor-voice';
  review.append(voice);
  move('edit-voice',voice,true);label('edit-voice','声で操作');move('mic',voice);move('edit-voice-status',voice);
  const transpose=document.createElement('div');transpose.className='quick-transpose';
  for(const step of [12,-12]) {
    const button=leftovers.querySelector(`[data-transpose="${step}"]`);
    button.textContent=step>0?'全体 ＋1オクターブ':'全体 −1オクターブ';transpose.append(button);
  }
  const finish=document.createElement('div');finish.className='editor-finish fields';
  review.append(finish);
  for(const id of ['capture-edit-cancel','adopt','discard','copy-capture-report']) move(id,finish);
  $('capture-edit-cancel').textContent='仮の変更を戻す';
  review.append(voice,transpose,panel,leftovers,finish);
  // The number selector is redundant with the block list; retain it in details.
  workspace.append(voice,review);
  // Copy feedback/fallback must be available without opening diagnostics.
  for(const id of ['copy-status','copy-fallback']) move(id,workspace);
  return true;
}

export function syncEditorLayout({open,pending,phase}) {
  if(!document.body.classList.contains('editor-focus')) return;
  document.getElementById('editor-standby').hidden=open || phase!=='idle';
  document.getElementById('edit-workspace').classList.toggle('has-editor',open);
  const source=document.getElementById('editor-source');
  const recording=['count-in','recording','analyzing'].includes(phase);
  if(recording) source.open=true;
  document.getElementById('source-hint').textContent=pending
    ? '仮の変更があります。オッケーで確定するか、仮の変更を戻してから開いてください。'
    : '空から作るか、記録やハナウタから編集できます。読み込み・録音で編集セッションを切り替えます。';
}

export function focusEditor() {
  if(!document.body.classList.contains('editor-focus')) return;
  document.getElementById('editor-source').open=false;
  document.getElementById('edit-workspace').scrollIntoView({block:'start',behavior:'instant'});
}
