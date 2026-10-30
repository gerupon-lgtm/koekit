import {renderTutorialView,highlightTutorialView} from './tutorial-view.js?v=v0.1.0-20261030201633-6a8c11c';
const $=id=>document.getElementById(id),storageKey='saezuri.creationDisplays.v1';

// Display preferences never enter the song, candidate, cursor or undo history.
export class CreationDisplays{
 constructor({editor,shell,keyboard,onChange}){
  Object.assign(this,{editor,shell,keyboard,onChange});let saved;
  try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
  this.note=saved?.note==='cards'?'cards':'score';this.input=saved?.input==='cards'?'cards':'keyboard';
  this.row=document.createElement('div');this.row.id='creation-displays';
  this.row.innerHTML='<label>見る<select id="creation-note-display" aria-label="ノート表示"><option value="cards">カード</option><option value="score">五線譜</option></select></label><label>入力<select id="creation-input-display" aria-label="入力表示"><option value="cards">カード</option><option value="keyboard">鍵盤</option></select></label>';
  $('creation-tabs').after(this.row);
  this.cards=document.createElement('div');this.cards.id='composition-cards';this.cards.setAttribute('aria-label','メロディーのカード');$('capture-score').before(this.cards);
  this.voiceHint=document.createElement('p');this.voiceHint.id='creation-voice-hint';this.voiceHint.textContent='声：「きく」「もういちど」で聴く。';document.querySelector('.listen-actions').after(this.voiceHint);
  $('creation-note-display').onchange=()=>this.choose('note',$('creation-note-display').value);
  $('creation-input-display').onchange=()=>this.choose('input',$('creation-input-display').value);
  $('tap-record').addEventListener('click',()=>{if(!$('tap-record').disabled)this.choose('input','keyboard');},true);
  this.apply();
 }
 apply(){document.body.dataset.noteDisplay=this.note;document.body.dataset.inputDisplay=this.input;$('creation-note-display').value=this.note;$('creation-input-display').value=this.input;if(this.input==='cards')$('step-entry').open=true;}
 choose(kind,value){
  if(kind==='input'&&this.phase!=='idle')return;
  if(kind==='input')this.keyboard.release();
  this[kind]=value;this.apply();try{localStorage.setItem(storageKey,JSON.stringify({note:this.note,input:this.input}));}catch{}
  this.onChange();
 }
 render(phase){
  this.phase=phase;const learning=this.shell.learning?.active,pattern=this.editor.previewPattern;
  const imageReady=!!pattern?.accompaniment?.imageChoice&&!this.editor.imageCandidate&&!learning;
  if(imageReady&&!this.imageReady){this.input='keyboard';this.apply();}
  this.imageReady=imageReady;
  this.syncVoice();
  document.body.dataset.entryPending=String(!!this.editor.entry);
  this.row.hidden=learning||!this.editor.isOpen||this.shell.screen!=='create';
  const manual=pattern?.source==='manual';$('creation-input-display').querySelector('[value="cards"]').disabled=!manual;
  if(!manual&&this.input==='cards'&&this.editor.isOpen&&this.shell.screen==='create'&&!learning){this.input='keyboard';this.apply();}
  $('creation-input-display').disabled=phase!=='idle';
  this.cards.hidden=learning||this.note!=='cards'||!pattern;
  if(!pattern||learning)return;
  if(this.input==='cards'&&phase==='idle')$('keyboard-status').textContent='1音ずつ入力';
  const key=JSON.stringify([pattern,this.editor.selectedNoteId]);
  if(this.key!==key){this.key=key;renderTutorialView(this.cards,pattern,{display:'cards',selectedId:this.editor.selectedNoteId,onSelect:id=>{if(this.phase!=='idle'||this.editor.entry)return;const index=pattern.notes.findIndex(n=>n.id===id);this.editor.command(`select:${index+1}`);this.shell.setMode('edit');this.onChange();}});}
  for(const button of this.cards.querySelectorAll('button'))button.disabled=phase!=='idle'||!!this.editor.entry;
  if(phase==='idle'){
   highlightTutorialView(this.cards,null);
   for(const card of this.cards.querySelectorAll('.tutorial-card'))card.toggleAttribute('data-input-cursor',this.shell.mode==='input'&&Number(card.dataset.startTick)<=this.editor.cursor&&this.editor.cursor<Number(card.dataset.startTick)+Number(card.dataset.durationTick));
   if(!this.cards.hidden){const tick=this.shell.mode==='input'?this.editor.cursor:pattern.notes.find(n=>n.id===this.editor.selectedNoteId)?.startTick??0;this.reveal(tick);}
  }else for(const card of this.cards.querySelectorAll('[data-input-cursor]'))card.removeAttribute('data-input-cursor');
 }
 syncVoice(){this.voiceHint.hidden=this.phase!=='idle'||this.shell.learning?.active||!$('edit-voice').checked||$('mic').getAttribute('aria-pressed')!=='true'||$('edit-voice-status').textContent!=='声を受け付けています';this.voiceHint.textContent=this.shell.mode==='edit'?'声：「音をまえへ」「音をうしろへ」で16分ずつ。':'声：「きく」「もういちど」で聴く。';}
 reveal(tick){const bar=Math.min(this.editor.previewPattern.bars-1,Math.floor(tick/16)),node=this.cards.querySelector(`[data-bar="${bar}"]`);if(node)this.cards.scrollTop+=node.getBoundingClientRect().top-this.cards.getBoundingClientRect().top;}
 follow(tick,{notes=true}={}){
  if(this.cards.hidden)return;
  highlightTutorialView(this.cards,notes?tick:null);
  if(tick!==null){const bar=Math.floor(tick/16);if(bar!==this.playBar){this.reveal(tick);this.playBar=bar;}}else this.playBar=null;
 }
}
