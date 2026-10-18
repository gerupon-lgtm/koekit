import {CHORD_INTERVALS} from '../../saezuri/music/catalog.js?v=v0.1.0-20261018095008-c27f217';
import {automaticEndingChord,endingDescription,endingEvents} from '../../saezuri/music/ending.js?v=v0.1.0-20261018095008-c27f217';
import {proposeSequence} from './sequence-session.js?v=v0.1.0-20261018095008-c27f217';
import {chordLabel,chordPitches} from './image-controls.js?v=v0.1.0-20261018095008-c27f217';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261018095008-c27f217';
const $=id=>document.getElementById(id);
const normalized=e=>({enabled:e?.enabled??false,bars:e?.bars||1,mode:e?.mode??'auto',bassMode:e?.bassMode??'root',customChord:e?.customChord??null});
export class EndingWorkflow {
 constructor(shell){
  this.shell=shell;
  const open=document.createElement('button');open.id='ending-open';open.className='ending-open';open.onclick=()=>this.open();
  $('melody-connect').querySelector('.sequence-actions').after(open);
  const dialog=this.dialog=document.createElement('dialog');dialog.id='ending-sheet';dialog.className='backing-sheet';
  dialog.innerHTML='<h2>おわりの和音</h2><button data-close>とじる</button><p>メロディーはふやさず、さいごに和音を一度ならします。</p><label>追加する長さ<select id="ending-length"><option value="0">追加なし</option><option value="1">1小節</option><option value="2">2小節</option><option value="4">4小節</option></select></label><p id="ending-recommendation" role="status"></p><div class="ending-chord-fields"><label>コードの音<select id="ending-root"></select></label><label>コードの種類<select id="ending-quality"></select></label></div><details id="ending-bass-detail"><summary>低い音もえらぶ</summary><label>ベースの音<select id="ending-bass"></select></label></details><button id="ending-auto">おすすめに戻す</button><p id="ending-candidate" role="status"></p><div class="sheet-actions"><button id="ending-preview">▶ 聴く</button><button id="ending-confirm">オッケー</button><button id="ending-cancel">もとにもどす</button></div>';
  document.querySelector('main').append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  setupPlaybackSheet(dialog,{closeId:'ending-close',stopId:'ending-stop',onStop:()=>shell.onStop()});dialog.addEventListener('close',()=>shell.onNavigate());
  const fill=(node,entries)=>{for(const [value,label] of entries){const option=document.createElement('option');option.value=value;option.textContent=label;node.append(option);}};
  fill($('ending-root'),chordPitches.map((name,i)=>[i,name]));fill($('ending-quality'),Object.keys(CHORD_INTERVALS).map(q=>[q,q==='major'?'メジャー':q==='minor'?'マイナー':q]));
  fill($('ending-bass'),[['','コードと同じ（ふつう）'],...chordPitches.map((name,i)=>[i,name])]);
  $('ending-length').onchange=()=>{const value=this.value(),bars=Number($('ending-length').value);value.enabled=bars>0;if(bars)value.bars=bars;this.stage(value);};
  for(const id of ['ending-root','ending-quality','ending-bass'])$(id).onchange=()=>{
   const value=this.value(),root=Number($('ending-root').value);value.mode='custom';value.bassMode=$('ending-bass').value===''?'root':'custom';
   value.customChord={root,quality:$('ending-quality').value,bass:value.bassMode==='root'?root:Number($('ending-bass').value)};this.stage(value);
  };
  $('ending-auto').onclick=()=>this.stage({...this.value(),mode:'auto',bassMode:'root'});
  $('ending-preview').onclick=()=>{
   const draft=shell.proposal?.next??shell.sequence,ending=endingDescription(draft);if(!ending||ending.code)return;
   shell.onAudition({pattern:{bars:ending.bars,notes:[]},backing:endingEvents(draft),ending});
  };
  $('ending-confirm').onclick=()=>{if(this.ownsCandidate()&&shell.confirmSequence())dialog.close();};
  $('ending-cancel').onclick=()=>{if(shell.busy)return;if(this.ownsCandidate())shell.proposal=null;dialog.close();shell.renderSequence();};
 }
 ownsCandidate(){
  const candidate=this.shell.proposal;if(!candidate)return false;
  return JSON.stringify(candidate.base.placements)===JSON.stringify(candidate.next.placements)&&JSON.stringify(candidate.base.patterns)===JSON.stringify(candidate.next.patterns)&&JSON.stringify(candidate.base.ending)!==JSON.stringify(candidate.next.ending);
 }
 value(){return {enabled:false,bars:1,mode:'auto',bassMode:'root',...structuredClone((this.shell.proposal?.next??this.shell.sequence).ending??{})};}
 stage(value){
  const shell=this.shell;if(shell.busy||shell.placementWorkflow.active||shell.proposal&&!this.ownsCandidate())return;
  if(JSON.stringify(normalized(value))===JSON.stringify(normalized(shell.sequence.ending)))shell.proposal=null;
  else {const candidate=proposeSequence(shell.sequence,{type:'ending',value});if(candidate.code){$('ending-candidate').textContent='和音と長さをたしかめてね。';return;}shell.proposal=candidate;}
  shell.renderSequence();
 }
 open(){
  const shell=this.shell;if(shell.busy||shell.placementWorkflow.active||!shell.sequence.placements.length||shell.proposal&&!this.ownsCandidate())return;
  shell.onStop();this.dialog.showModal();shell.onNavigate();
 }
 render(draft,playback){
  const shell=this.shell,value=this.value(),automatic=automaticEndingChord(draft),chord=value.mode==='custom'?value.customChord:automatic;
  const ending=playback.ending,blocked=shell.busy||shell.placementWorkflow.active||!!shell.proposal&&!this.ownsCandidate();
  $('ending-open').disabled=blocked||!draft.placements.length;$('ending-open').textContent=ending?`おわり：${ending.bars}小節・${chordLabel(ending.chord)}`:'おわり：追加なし';
  $('ending-length').value=value.enabled?String(value.bars):'0';
  if(chord&&!chord.code){$('ending-root').value=chord.root;$('ending-quality').value=chord.quality;$('ending-bass').value=value.mode==='custom'&&(value.bassMode==='custom'||chord.bass!==chord.root)?String(chord.bass):'';}
  $('ending-recommendation').textContent=automatic.code?'調をたしかめるか、和音をえらんでね。':`おすすめ：${chordLabel(automatic)}。あとから自由に変えられます。`;
  $('ending-candidate').textContent=chord?.code?'和音をえらんでね。':`${value.enabled?`${value.bars}小節・${chordLabel(chord)}`:'追加なし'}${this.ownsCandidate()?' の候補です。聴いてからオッケー。':''}`;
  for(const id of ['ending-length','ending-root','ending-quality','ending-bass','ending-auto'])$(id).disabled=blocked;
  $('ending-preview').disabled=blocked||!ending||!!playback.code;$('ending-confirm').disabled=blocked||!this.ownsCandidate();$('ending-cancel').disabled=shell.busy;
  if(ending){const tile=document.createElement('button');tile.type='button';tile.dataset.ending='ending';tile.textContent=`おわり ${ending.bars}小節・${chordLabel(ending.chord)}`;tile.disabled=blocked;tile.onclick=()=>this.open();$('sequence-line').append(tile);}
 }
}
