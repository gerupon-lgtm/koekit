import {EIGHT_BEAT_RHYTHMS,applyEightBeatSet,eightBeatSet} from '../../saezuri/music/eight-beat.js?v=v0.1.0-20261101044249-ec316a9';
import {GENRES} from '../../saezuri/music/catalog.js?v=v0.1.0-20261101044249-ec316a9';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261101044249-ec316a9';
import {formatActionLabels} from './action-labels.js?v=v0.1.0-20261101044249-ec316a9';
const $=id=>document.getElementById(id);
export class EightBeatControls{
 constructor({editor,onPreview,onStop,onNavigate,readAccompaniment}){
  Object.assign(this,{editor,onPreview,onStop,onNavigate,readAccompaniment});
  const dialog=document.createElement('dialog');dialog.id='eight-beat-sheet';dialog.className='backing-sheet';dialog.setAttribute('aria-labelledby','eight-beat-title');
  dialog.innerHTML='<div class="screen-heading"><h2 id="eight-beat-title">8ビートをえらぶ</h2><button id="eight-beat-close">とじる</button></div><p class="image-hint">コード・ベース・ドラムのセットです。コードの並び・空白・メロディーは残します。</p><label>音楽のタイプ<select id="eight-beat-genre"></select></label><label>パターン<select id="eight-beat-pattern"></select></label><p id="eight-beat-description"></p><p class="image-hint">音色を自分で決めている場合は、その音色で鳴らします。つかうと伴奏がONになります。</p><div class="progression-listen"><button id="eight-beat-current">▶ いまを聴く</button><button id="eight-beat-preview">▶ 候補を聴く</button></div><p id="eight-beat-hint" class="image-hint" role="status"></p><button id="eight-beat-stop">■ とめる</button>';
  document.querySelector('main').append(dialog);this.dialog=dialog;
  for(const [id,items]of [['genre',GENRES],['pattern',EIGHT_BEAT_RHYTHMS]])for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=item.label;$('eight-beat-'+id).append(o);}
  setupPlaybackSheet(dialog,{closeId:'eight-beat-close',footerCloseId:'eight-beat-close-bottom',onStop});
  const use=document.createElement('button');use.id='eight-beat-use';use.textContent='この伴奏をつかう';dialog.querySelector('.sheet-stop').append($('eight-beat-stop'),use);
  $('eight-beat-close').onclick=()=>dialog.close();$('eight-beat-stop').onclick=()=>onStop?.();
  dialog.addEventListener('close',()=>{this.base=null;onNavigate?.();});
  for(const id of ['genre','pattern'])$('eight-beat-'+id).onchange=()=>{if(!this.busy){onStop?.();this.select();}};
  $('eight-beat-current').onclick=()=>{if(!this.busy&&this.base)onPreview?.(structuredClone(this.base),true);};
  $('eight-beat-preview').onclick=()=>{if(!this.busy&&this.candidate)onPreview?.(structuredClone(this.candidate),true);};
  use.onclick=()=>{if(this.busy||!this.base||this.editor.entry||!this.changed)return;if(JSON.stringify(editor.previewPattern)!==this.baseKey){$('eight-beat-hint').textContent='パーツが変わりました。とじて、もう一度選んでね。';return;}editor.changeStructure({type:'accompaniment',value:structuredClone(this.candidate.accompaniment)});dialog.close();};
 }
 open(){
  if(this.busy||this.editor.entry||!this.editor.isOpen)return;this.onStop?.();this.base=structuredClone(this.editor.previewPattern);this.baseKey=JSON.stringify(this.base);this.base.accompaniment=structuredClone(this.readAccompaniment());
  $('eight-beat-genre').value=this.base.accompaniment.genre;$('eight-beat-pattern').value=eightBeatSet(this.base.accompaniment.genre,this.base.accompaniment.rhythm)?this.base.accompaniment.rhythm:'eight-basic';
  this.select();this.dialog.showModal();this.onNavigate?.();
 }
 select(){
  this.candidate=applyEightBeatSet(this.base,$('eight-beat-genre').value,$('eight-beat-pattern').value);this.changed=JSON.stringify(this.candidate.accompaniment)!==JSON.stringify(this.base.accompaniment);
  const genre=$('eight-beat-genre').selectedOptions[0].textContent,kind=$('eight-beat-pattern').value;
  $('eight-beat-description').textContent=genre+'：'+(kind==='eight-light'?'コードとベースを少なめに、ドラムも軽く。':kind==='eight-motion'?'コードとベースに動きをつけたパターン。':'使いやすい基本のパターン。')+' ハットは8分音符、スネアは2・4拍目です。';this.render(this.busy);
 }
 render(busy=false){this.busy=busy;if(!this.base)return;if(!this.editor.isOpen){this.dialog.close();return;}
  for(const id of ['genre','pattern','current','preview'])$('eight-beat-'+id).disabled=busy;
  $('eight-beat-use').disabled=busy||!this.changed;$('eight-beat-use').textContent=this.changed?'この伴奏をつかう':'いまと同じ';$('eight-beat-hint').textContent=this.changed?'聴き比べてから「つかう」。最後に「オッケー」で決めます。':'いまの伴奏と同じです。';formatActionLabels(this.dialog);
 }
}
