import {formatActionLabels} from './action-labels.js';
import {recommendProgressions,harmonicSegments} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261031231907-35a39bd';
import {chordChangesInBar} from '../../saezuri/music/chord-timing.js?v=v0.1.0-20261031231907-35a39bd';
import {chordLabel,sameChord} from '../../saezuri/music/catalog.js?v=v0.1.0-20261031231907-35a39bd';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261031231907-35a39bd';
const clone=value=>structuredClone(value);
const $=id=>document.getElementById(id);
function changedBars(before,after){
 const a=harmonicSegments(before),b=harmonicSegments(after),changed=[];
 for(let bar=0;bar<before.bars;bar++)for(let beat=0;beat<4;beat++){
  const tick=bar*16+beat*4,at=items=>items.find(c=>c.startTick<=tick&&tick<c.startTick+c.durationTick);
  if(!sameChord(at(a),at(b))){changed.push(bar+1);break;}
 }
 return changed;
}
function chordStrip(target,pattern,changed=[]){
 target.replaceChildren();
 for(let bar=0;bar<pattern.bars;bar++){
  const cell=document.createElement('div');cell.className='progression-bar';cell.toggleAttribute('data-changed',changed.includes(bar+1));
  const heading=document.createElement('small');heading.textContent=`${bar+1}小節`;
  const value=document.createElement('span');value.textContent=chordChangesInBar(pattern,bar).map(chordLabel).join(' → ');cell.append(heading,value);target.append(cell);
 }
}
// Selecting or listening never changes the editor; only Use creates its candidate.
export class ProgressionControls{
 constructor({editor,onPreview,onStop,onNavigate,readAccompaniment}){
  Object.assign(this,{editor,onPreview,onStop,onNavigate,readAccompaniment});
  const dialog=document.createElement('dialog');dialog.id='progression-suggestions';dialog.className='backing-sheet';dialog.setAttribute('aria-labelledby','progression-title');
  dialog.innerHTML='<div class="screen-heading"><h2 id="progression-title">コードの並びを変える</h2><button id="progression-close">とじる</button></div><p id="progression-guide" hidden role="status"></p><p class="image-hint">このパーツのコードを変えます。手で指定したコード・空白は残します。</p><h3>いまの並び</h3><div id="progression-current" class="progression-strip"></div><label>別の並び<select id="progression-choice"></select></label><div id="progression-candidate" class="progression-strip"></div><p id="progression-change-hint" class="image-hint" role="status"></p><div class="progression-listen"><button id="progression-listen-current">▶ いまを聴く</button><button id="progression-listen-candidate">▶ 候補を聴く</button></div><p id="progression-voice-hint" class="image-hint" hidden>声：1ばんをきく／1ばんをつかう／とじる</p><button id="progression-stop">■ とめる</button>';
  document.querySelector('main').append(dialog);this.dialog=dialog;
  setupPlaybackSheet(dialog,{closeId:'progression-close',footerCloseId:'progression-close-bottom',onStop});
  const use=document.createElement('button');use.id='progression-use';use.textContent='この並びをつかう';dialog.querySelector('.sheet-stop').append($('progression-stop'),use);
  $('progression-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{this.base=null;this.onStop?.();this.onNavigate?.();});
  $('progression-choice').onchange=()=>{if(this.busy)return;this.onStop?.();this.select(Number($('progression-choice').value));};
  $('progression-listen-current').onclick=()=>this.listen(this.base);
  $('progression-listen-candidate').onclick=()=>this.listen(this.candidate);
  $('progression-stop').onclick=()=>this.onStop?.();use.onclick=()=>this.use();
 }
 open(){
  if(!this.editor.isOpen||this.busy||this.editor.entry)return;
  this.onStop?.();this.base=clone(this.editor.previewPattern);this.baseKey=JSON.stringify(this.base);this.adding=!this.base.accompaniment;const enabled=this.base.accompaniment?.enabled??true;this.base.accompaniment=clone(this.readAccompaniment());
  this.choices=recommendProgressions(this.base).map(value=>({...value,enabled}));
  const select=$('progression-choice');select.replaceChildren();
  this.choices.forEach((value,index)=>{const option=document.createElement('option');option.value=index;option.dataset.progression=value.progression;option.textContent=`${index+1}：${Array.from({length:this.base.bars},(_,bar)=>chordChangesInBar({...this.base,accompaniment:value},bar).map(chordLabel).join('/')).join(' → ')}`;select.append(option);});
  chordStrip($('progression-current'),this.base);this.select(0);this.dialog.showModal();this.onNavigate?.();
 }
 select(index){
  if(!this.base||!this.choices[index])return;this.index=index;$('progression-choice').value=String(index);
  this.candidate={...clone(this.base),accompaniment:clone(this.choices[index])};this.changed=changedBars(this.base,this.candidate);
  chordStrip($('progression-candidate'),this.candidate,this.changed);this.render(this.busy);
 }
 listen(pattern){
  if(!pattern||this.busy)return;
  this.onPreview?.({...clone(pattern),accompaniment:{...clone(pattern.accompaniment),enabled:true}},true);
 }
 use(){
  if(this.busy||!this.base||!(this.changed.length||this.adding)||this.editor.entry)return;
  if(JSON.stringify(this.editor.previewPattern)!==this.baseKey){$('progression-change-hint').textContent='パーツが変わりました。とじて、もう一度選んでね。';return;}
  this.editor.changeStructure({type:'accompaniment',value:clone(this.candidate.accompaniment)});this.dialog.close();
 }
 render(busy){
  this.busy=busy;if(!this.base||!this.dialog.open&&this.index===undefined)return;
  $('progression-choice').disabled=busy;
  for(const id of ['progression-listen-current','progression-listen-candidate'])$(id).disabled=busy;
  $('progression-use').disabled=busy||!(this.changed?.length||this.adding);$('progression-use').textContent=this.changed?.length||this.adding?'この並びをつかう':'いまと同じ';
  formatActionLabels(this.dialog);
  $('progression-change-hint').textContent=this.changed?.length?`変わる小節：${this.changed.join('・')}。つかった後、オッケーで決めます。`:this.adding?'このコードの伴奏を追加します。つかった後、オッケーで決めます。':'いまの並びと同じです。';
 }
 handleVoice(command){
  if(!this.dialog.open||command?.type!=='progression-choice')return false;
  if(command.action==='close'){$('progression-close').click();return true;}
  if(command.action==='stop'){$('progression-stop').click();return true;}
  if(this.busy||!this.choices[command.index])return false;this.select(command.index);
  if(command.action==='listen')this.listen(this.candidate);else if(command.action==='use')this.use();else return false;
  return true;
 }
}
