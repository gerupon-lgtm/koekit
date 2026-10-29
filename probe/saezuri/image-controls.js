import {GENRES,CHORD_INTERVALS} from '../../saezuri/music/catalog.js?v=v0.1.0-20261029110808-9b7f849';
import {RHYTHMS,PROGRESSIONS,PRESETS,SOUNDS,accompanimentSounds,soundLabel,harmonicSegments,recommendProgressions} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261029110808-9b7f849';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261029110808-9b7f849';
import {ImageModeControls} from './image-mode-controls.js?v=v0.1.0-20261029110808-9b7f849';
import {readChordSlots,writeChordSlots} from './chord-slots.js?v=v0.1.0-20261029110808-9b7f849';
import {ChordMetronome} from './chord-metronome.js?v=v0.1.0-20261029110808-9b7f849';
const pitches=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
export const chordPitches=pitches;
const suffix={major:'',minor:'m'};
export const chordLabel=c=>`${pitches[c.root]}${suffix[c.quality]??c.quality}${c.bass===c.root?'':`/${pitches[c.bass]}`}`;
const fallback={enabled:false,genre:'nursery',rhythm:'quarters',progression:'home'};
const $=id=>document.getElementById(id);
function fill(node,items){node.replaceChildren(...items.map(([id,label])=>{const o=document.createElement('option');o.value=id;o.textContent=label;return o;}));}
export class ImageControls {
 constructor({editor,onNew,onTempo,onPreview,onChordPreview,prepareMetronome,onStop,onNavigate,onRecord,compact=false,engine='classic'}) {
  Object.assign(this,{editor,onTempo,onPreview,onChordPreview,prepareMetronome,onStop,onNavigate,engine});this.inlineChords=compact;this.chordSlots=readChordSlots();this.selectedSlot=null;
  const source=document.querySelector('.source-actions');if(!source)return;
  this.create=document.createElement('button');this.create.id='new-image';this.create.textContent='イメージからつくる';this.create.onclick=onNew;source.prepend(this.create);
  const panel=document.createElement('details');panel.id='image-settings';
  panel.innerHTML='<summary>伴奏のイメージ</summary><label class="composer-replace"><input id="image-enabled" type="checkbox">伴奏といっしょに聴く</label><div class="composer-values"><label>ジャンル<select id="image-genre"></select></label><label>リズム<select id="image-rhythm"></select></label></div><label>進行<select id="image-progression"></select></label><div id="image-chords" aria-label="小節ごとのコード"></div><div class="image-more"><button id="image-suggest">進行のおすすめ</button><button id="image-sounds">パートの音色</button></div><div id="image-suggestions" hidden></div><button id="image-tempo"></button><p class="image-hint">コードをタッチで変更。聴いて、オッケーで決めよう。</p>';
  $('composer-panel').before(panel);this.panel=panel;this.$=id=>$(`image-${id}`);
  this.fill=(id,entries)=>fill(this.$(id),entries.map(v=>[v.id,v.label]));
  this.fill('genre',GENRES);this.fill('rhythm',RHYTHMS);
  for(const id of ['enabled','genre','rhythm','progression'])this.$(id).onchange=()=>{
   const old=this.value(),value={...old,enabled:this.$('enabled').checked,genre:this.$('genre').value,rhythm:this.$('rhythm').value,progression:this.$('progression').value||old.progression};
   if(id==='genre')Object.assign(value,{rhythm:PRESETS[value.genre].rhythm,progression:PRESETS[value.genre].progression});
   if(value.imageChoice)value.manualSettings={...value.manualSettings,[id]:true,...(id==='genre'?{rhythm:true,progression:true}:{})};
   if(value.imageChoice&&id==='progression'&&!this.$('progression').value)value.manualSettings.progression=false;
   editor.changeStructure({type:'accompaniment',value});
  };
  this.$('tempo').onclick=()=>onTempo(PRESETS[this.$('genre').value].tempo);
  this.$('suggest').onclick=()=>{
   this.$('suggestions').replaceChildren();this.$('suggestions').hidden=false;
   recommendProgressions(editor.previewPattern).forEach((value,i)=>{
    const row=document.createElement('div');row.className='suggestion-row';row.dataset.progression=value.progression;row.dataset.progressionIndex=i;const label=document.createElement('p');label.textContent=`${i+1} ${i?'くらべる':'おすすめ'}：${PROGRESSIONS[this.key].find(p=>p.id===value.progression).label}`;
    const listen=document.createElement('button');listen.textContent='▶ 聴く';listen.dataset.progressionListen=value.progression;listen.onclick=()=>this.onPreview?.({...structuredClone(editor.previewPattern),accompaniment:value},true);
    const b=document.createElement('button');b.textContent='この候補を つかう';b.dataset.progressionUse=value.progression;b.onclick=()=>{editor.changeStructure({type:'accompaniment',value});this.suggestionsSheet?.close();};row.append(label,listen,b);this.$('suggestions').append(row);
   });
  };this.createSheets();
  const loop=document.createElement('div');loop.className='loop-actions';loop.innerHTML='<button id="backing-loop">▶ 伴奏をループ</button><button id="loop-record" disabled>次の先頭から ハナウタ</button><p id="loop-hint" role="status"></p>';this.$('chords').after(loop);
  if(compact){
   const settings=document.createElement('dialog');settings.id='backing-settings';settings.className='backing-sheet';settings.setAttribute('aria-label','伴奏の設定');settings.innerHTML='<div class="screen-heading"><h2>伴奏の設定</h2><button id="backing-settings-close">とじる</button></div>';
   const settingsActions=document.createElement('div');settingsActions.className='backing-setting-actions';settingsActions.append(this.$('tempo'),this.$('sounds'));
   settings.append(this.$('enabled').closest('label'),this.$('genre').closest('.composer-values'),this.$('progression').closest('label'),settingsActions);
   document.querySelector('main').append(settings);this.settingsSheet=settings;
   const open=document.createElement('button');open.id='image-settings-open';open.textContent='伴奏の設定';open.onclick=()=>this.show(settings);this.$('suggest').before(open);
   const summary=document.createElement('p');summary.id='image-summary';this.$('chords').before(summary);
   $('backing-settings-close').onclick=()=>{this.onStop?.();settings.close();};settings.addEventListener('close',()=>this.onNavigate?.());
   const suggestions=document.createElement('dialog');suggestions.id='progression-suggestions';suggestions.className='backing-sheet';suggestions.setAttribute('aria-label','進行のおすすめ');suggestions.innerHTML='<div class="screen-heading"><h2>進行を くらべよう</h2><button id="progression-close">とじる</button></div>';const guidance=document.createElement('p');guidance.id='progression-guide';guidance.hidden=true;guidance.setAttribute('role','status');const hint=document.createElement('p');hint.id='progression-voice-hint';hint.hidden=true;hint.textContent='声：1ばんをきく／1ばんをつかう／とじる';suggestions.append(guidance,hint,this.$('suggestions'));
   const stopRow=document.createElement('div');stopRow.className='sheet-stop';const stop=document.createElement('button');stop.id='progression-stop';stop.textContent='■ とめる';stop.onclick=()=>this.onStop?.();stopRow.append(stop);suggestions.append(stopRow);
   suggestions.addEventListener('close',()=>this.onNavigate?.());document.querySelector('main').append(suggestions);$('progression-close').onclick=()=>{this.onStop?.();suggestions.close();};this.suggestionsSheet=suggestions;
   const suggest=this.$('suggest').onclick;this.$('suggest').onclick=()=>{suggest();this.show(suggestions);};
   setupPlaybackSheet(settings,{closeId:'backing-settings-close',stopId:'backing-settings-stop',onStop:()=>this.onStop?.()});
   setupPlaybackSheet(suggestions,{closeId:'progression-close',stopId:'progression-stop',onStop:()=>this.onStop?.()});
  }
  this.imageMode=new ImageModeControls({editor,onTempo,onRecord,compact});
  (this.settingsSheet??this.panel).append(this.imageMode.reset);
 }
 handleVoice(command){
  if(['backing-genre','backing-rhythm'].includes(command?.type)){
   const genre=command.type==='backing-genre',target=this.$(genre?'genre':'rhythm'),value=genre?command.genre:command.rhythm;
   if(target&&!target.disabled&&target.getClientRects().length&&[...target.options].some(o=>o.value===value)){target.value=value;target.dispatchEvent(new Event('change'));}return true;
  }
  if(command?.type==='backing-navigation'){
   const image=this.imageMode.active,target=command.action==='open'?(image?this.imageMode.reopen:document.querySelector('[data-mode="backing"]')):this.$('suggest');
   if(target&&!target.disabled&&(target.getClientRects().length||image&&command.action==='suggestions'))target.click();return true;
  }
  if(command?.type!=='progression-choice')return false;
  if(!this.suggestionsSheet?.open)return true;
  if(command.action==='close'){$('progression-close').click();return true;}
  if(command.action==='stop'){$('progression-stop').click();return true;}
  const target=this.$('suggestions').querySelector(`[data-progression-index="${command.index}"] [data-progression-${command.action}]`);
  if(target&&!target.disabled)target.click();return true;
 }
 value(){return structuredClone(this.editor.previewPattern?.accompaniment??fallback);}
 follow(tick){
  if(!this.panel)return;
  const bar=tick==null?null:Math.floor(tick/16),row=this.$('chords');
  for(const b of row.children){const playing=Number(b.dataset.chordBar)===bar;b.toggleAttribute('data-playing',playing);if(playing)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
  if(bar!==this.playingBar&&bar!==null){const current=row.querySelector('[data-playing]');if(current)row.scrollLeft+=current.getBoundingClientRect().left-row.getBoundingClientRect().left-(row.clientWidth-current.offsetWidth)/2;}
  this.playingBar=bar;
 }
 show(dialog){this.onStop?.();dialog.showModal();this.onNavigate?.();}
 createSheets(){
  const d=document.createElement('dialog');d.id='chord-sheet';d.className='backing-sheet';d.setAttribute('aria-labelledby','chord-title');
  d.innerHTML=`<div class="screen-heading chord-heading"><div class="heading-actions heading-actions-end"><button id="chord-close">とじる</button></div><h2 id="chord-title"></h2><button id="chord-previous" aria-label="まえの小節">←</button><button id="chord-next" aria-label="つぎの小節">→</button></div>
   <div class="chord-picker-tabs" role="tablist" aria-label="コードのえらびかた"><button id="chord-basic-mode" role="tab" aria-controls="chord-basic">よくつかう</button><button id="chord-all-mode" role="tab" aria-controls="chord-detail">すべて</button></div>
   <div class="chord-picker"><div id="chord-basic" role="tabpanel" aria-label="プリセットと自分のコード"><div id="chord-grid"></div><p class="chord-slot-guide">黄色の枠：＋で登録・長押しでクリア</p></div>
    <div id="chord-detail" role="tabpanel" hidden><div class="chord-fields"><label>ルート<select id="chord-root"></select></label><label>種類<select id="chord-quality"></select></label><label>ベース<select id="chord-bass"></select></label></div>
     <div class="chord-slot-register"><span id="chord-slot-target"></span><button id="chord-slot-add">よくつかうに登録</button></div><p class="chord-slot-guide">黄色の枠に保存します。曲がかわっても使えます。</p>
    </div></div>
   <p id="chord-candidate" role="status"></p>
   <div class="sheet-actions"><button id="chord-single-preview">▶ このコードをきく</button><button id="chord-use">つかう</button><button id="chord-preview">▶ 曲をはじめから聴く</button><button id="chord-stop">■ とめる</button><button id="chord-confirm">オッケー</button></div>`;
  document.querySelector('main').append(d);this.chordSheet=d;
  this.metronome=new ChordMetronome({parent:d,tempoInput:$('tempo'),prepareTrack:()=>this.prepareMetronome(),onError:message=>{$('chord-candidate').textContent=message;}});
  d.querySelector('.chord-picker-tabs').after(this.metronome.row);
  for(const id of ['chord-root','chord-bass'])fill($(id),pitches.map((p,i)=>[i,p]));
  fill($('chord-quality'),Object.keys(CHORD_INTERVALS).map(q=>[q,q==='major'?'メジャー':q==='minor'?'マイナー':q]));
  for(const id of ['chord-root','chord-quality','chord-bass'])$(id).onchange=()=>{
   if(id==='chord-root'&&this.bassLinked)$('chord-bass').value=$('chord-root').value;
   if(id==='chord-bass')this.bassLinked=$('chord-bass').value===$('chord-root').value;
   this.selectedSlot=null;this.slotNotice='';this.onNavigate?.();this.updateChordChoice();
  };
  $('chord-slot-add').onclick=()=>this.registerChordSlot();
  const menu=document.createElement('dialog');menu.id='chord-slot-menu';menu.setAttribute('role','alertdialog');menu.setAttribute('aria-labelledby','chord-slot-menu-title');menu.setAttribute('aria-describedby','chord-slot-menu-description');
  menu.innerHTML='<div class="chord-slot-heading"><h2 id="chord-slot-menu-title"></h2><button id="chord-slot-menu-close" autofocus>とじる</button></div><p id="chord-slot-menu-description"></p><button id="chord-slot-clear">この枠をクリア</button>';
  document.querySelector('main').append(menu);this.slotMenu=menu;
  $('chord-slot-menu-close').onclick=()=>menu.close();$('chord-slot-clear').onclick=()=>{const i=this.slotMenuIndex;menu.close();this.clearChordSlot(i);};
  menu.addEventListener('close',()=>{this.slotMenuIndex=null;});
  // A touch release can send its compatibility click to a button in the new
  // dialog. Consume that gesture; a fresh press or key always remains usable.
  document.addEventListener('pointerdown',e=>{if(e.isPrimary)this.slotReleaseGuard=false;},true);
  document.addEventListener('keydown',()=>{this.slotReleaseGuard=false;},true);
  document.addEventListener('click',e=>{if(this.slotReleaseGuard&&e.isTrusted&&e.detail>0){this.slotReleaseGuard=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){this.cancelSlotPress();if(menu.open)menu.close();}});
  for(const mode of ['basic','all'])$(`chord-${mode}-mode`).onclick=()=>this.setChordPicker(mode);
  $('chord-previous').onclick=()=>this.openChord(this.bar-1);$('chord-next').onclick=()=>this.openChord(this.bar+1);
  $('chord-close').onclick=()=>d.close();d.addEventListener('close',()=>{this.metronome.stop();this.cancelSlotPress();if(menu.open)menu.close();document.body.classList.remove('chord-editing');this.onNavigate?.();});
  $('chord-single-preview').onclick=()=>this.onChordPreview?.(this.sheetChord());
  $('chord-preview').onclick=()=>this.onPreview?.();$('chord-stop').onclick=()=>this.onStop?.();
  $('chord-use').onclick=()=>{this.onNavigate?.();this.stageChord();this.updateChordChoice();};
  $('chord-confirm').onclick=()=>{this.editor.command('confirm');d.close();};
  const s=document.createElement('dialog');s.id='sounds-sheet';s.className='backing-sheet';s.setAttribute('aria-label','パートの音色');s.innerHTML='<div class="screen-heading"><h2>パートの音色</h2><button id="sounds-close">とじる</button></div><div class="sound-fields"><label>コード<select id="sound-chord"></select></label><label>ベース<select id="sound-bass"></select></label><label>ドラム<select id="sound-drums"></select></label></div><p>アコースティック風と電子音を、組み合わせて使えます。</p><p>とじて聴き、オッケーで決めよう。</p>';
  document.querySelector('main').append(s);this.soundSheet=s;
   for(const part of ['chord','bass'])fill($(`sound-${part}`),SOUNDS.map(v=>[v.id,soundLabel(v.id,this.engine)]));fill($('sound-drums'),[['acoustic','アコースティック風'],['electronic','電子ドラム'],['none','なし']]);
  for(const part of ['chord','bass','drums'])$(`sound-${part}`).onchange=()=>{const value=this.value();value.sounds={...value.sounds,[part]:$(`sound-${part}`).value};this.editor.changeStructure({type:'accompaniment',value});};
  $('sounds-close').onclick=()=>s.close();s.addEventListener('close',()=>this.onNavigate?.());
  this.$('sounds').onclick=()=>{const sounds=accompanimentSounds(this.value());for(const part of ['chord','bass','drums'])$(`sound-${part}`).value=sounds[part];this.show(s);};
  setupPlaybackSheet(d,{closeId:'chord-close',stopId:'chord-stop',onStop:()=>this.onStop?.()});
  if(this.inlineChords)d.classList.add('inline-chord-editor');
  setupPlaybackSheet(s,{closeId:'sounds-close',stopId:'sounds-stop',onStop:()=>this.onStop?.()});
 }
 sheetChord(){return {startTick:this.bar*16,durationTick:16,root:Number($('chord-root').value),quality:$('chord-quality').value,bass:Number($('chord-bass').value),manual:true};}
 chooseChord(chord,slot=null){
  for(const part of ['root','quality','bass'])$(`chord-${part}`).value=chord[part];
  this.bassLinked=chord.bass===chord.root;this.selectedSlot=slot;this.slotNotice='';this.onNavigate?.();this.updateChordChoice();this.onChordPreview?.(this.sheetChord());
 }
 renderChordButtons(){
  this.cancelSlotPress();
  const grid=$('chord-grid');grid.replaceChildren();
  for(const [root,quality] of this.basicChords){const chord={root,quality,bass:root},b=document.createElement('button');b.textContent=chordLabel(chord);b.dataset.root=root;b.dataset.quality=quality;b.dataset.bass=root;b.onclick=()=>this.chooseChord(chord);grid.append(b);}
  this.chordSlots.forEach((chord,i)=>{
   const b=document.createElement('button');b.dataset.chordSlot=i;b.className='chord-user-slot';b.textContent=chord?chordLabel(chord):'＋';b.title=chord?chordLabel(chord):`追加枠 ${i+1} に登録`;
   b.setAttribute('aria-label',chord?`自分のコード ${i+1}：${chordLabel(chord)} を選んで聴く`:`空き枠 ${i+1}：コードを登録`);
   if(chord){
    b.dataset.root=chord.root;b.dataset.quality=chord.quality;b.dataset.bass=chord.bass;b.title+='（長押しで枠をクリア）';b.setAttribute('aria-haspopup','dialog');
    b.onclick=e=>{if(e.detail>0&&this.consumedSlotPress===b)return;this.consumedSlotPress=null;this.chooseChord(chord,i);};
    b.onpointerdown=e=>{
     this.cancelSlotPress();this.consumedSlotPress=null;if(e.button!==0||!e.isPrimary||this.busy)return;
     const press={button:b,x:e.clientX,y:e.clientY,pointer:e.pointerId};this.slotPress=press;b.toggleAttribute('data-holding',true);
     press.timer=setTimeout(()=>{this.cancelSlotPress();this.consumedSlotPress=b;this.slotReleaseGuard=true;this.openSlotMenu(i);},550);
    };
    b.onpointermove=e=>{const press=this.slotPress;if(press?.pointer===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)this.cancelSlotPress();};
    for(const event of ['pointerup','pointercancel','pointerleave'])b.addEventListener(event,()=>this.cancelSlotPress());
    b.oncontextmenu=e=>{e.preventDefault();this.cancelSlotPress();this.consumedSlotPress=b;this.slotReleaseGuard=true;this.openSlotMenu(i);};
    b.onkeydown=e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();this.openSlotMenu(i);}};
   }
   else {b.classList.add('chord-empty-slot');b.onclick=()=>{this.slotTarget=i;this.slotNotice='';this.onNavigate?.();this.setChordPicker('all');$('chord-root').focus({preventScroll:true});};}
   b.disabled=!!this.busy;grid.append(b);
  });
 }
 cancelSlotPress(){const press=this.slotPress;if(press){clearTimeout(press.timer);press.button.removeAttribute('data-holding');this.slotPress=null;}}
 openSlotMenu(i){
  if(this.busy||!this.chordSheet.open||!this.chordSlots[i]||this.slotMenu.open)return;
  this.onNavigate?.();this.slotMenuIndex=i;$('chord-slot-menu-title').textContent=`追加枠 ${i+1}`;
  $('chord-slot-menu-description').textContent=`${chordLabel(this.chordSlots[i])} を、この枠から外しますか？ 曲のコードは変わりません。`;this.slotMenu.showModal();
 }
 availableChordSlot(){return this.chordSlots[this.slotTarget]===null?this.slotTarget:this.chordSlots.indexOf(null);}
 registerChordSlot(){
  if(this.busy)return;const i=this.availableChordSlot();if(i<0)return;
  this.onNavigate?.();const {root,quality,bass}=this.sheetChord();this.chordSlots[i]={root,quality,bass};this.selectedSlot=i;this.slotTarget=null;
  this.slotNotice=writeChordSlots(this.chordSlots)?'':'この画面のみ：端末に保存できませんでした。';
  this.renderChordButtons();this.setChordPicker('basic');$('chord-grid').querySelector(`[data-chord-slot="${i}"]`)?.focus({preventScroll:true});
 }
 clearChordSlot(i){
  if(this.busy||!Number.isInteger(i)||!this.chordSlots[i])return;
  this.onNavigate?.();this.chordSlots[i]=null;if(this.selectedSlot===i)this.selectedSlot=null;this.slotTarget=i;
  this.slotNotice=writeChordSlots(this.chordSlots)?'':'この画面のみ：端末に保存できませんでした。';
  this.renderChordButtons();this.updateChordChoice();$('chord-grid').querySelector(`[data-chord-slot="${i}"]`)?.focus({preventScroll:true});
 }
 setChordPicker(mode){
  this.chordPickerMode=mode;$('chord-basic').hidden=mode!=='basic';$('chord-detail').hidden=mode!=='all';
  for(const kind of ['basic','all'])$(`chord-${kind}-mode`).setAttribute('aria-selected',String(kind===mode));
  this.updateChordChoice();
 }
 revealChordBar(){
  const row=this.$('chords'),button=row.querySelector(`[data-chord-bar="${this.bar}"]`);if(!button)return;
  const bounds=row.getBoundingClientRect(),selected=button.getBoundingClientRect();if(selected.left<bounds.left||selected.right>bounds.right)row.scrollLeft+=selected.left-bounds.left-(row.clientWidth-selected.width)/2;
 }
 updateChordChoice(){
  const chord=this.sheetChord(),current=harmonicSegments(this.editor.previewPattern).find(c=>c.startTick===this.bar*16);
  const same=current&&['root','quality','bass'].every(k=>current[k]===chord[k]);
  $('chord-candidate').textContent=this.slotNotice||(same?`いま ${chordLabel(current)}${current.manual?'（この小節に入っています）':''}`:`いま ${chordLabel(current)} → 候補 ${chordLabel(chord)}`);
  $('chord-candidate').setAttribute('aria-label',`${this.bar+1}小節目。${$('chord-candidate').textContent}。「つかう」で入れて、最後に「オッケー」。`);
  for(const button of $('chord-grid').children)button.setAttribute('aria-pressed',String(button.dataset.chordSlot!==undefined?Number(button.dataset.chordSlot)===this.selectedSlot&&!!this.chordSlots[this.selectedSlot]:this.selectedSlot===null&&Number(button.dataset.root)===chord.root&&button.dataset.quality===chord.quality&&chord.bass===chord.root));
  const target=this.availableChordSlot();$('chord-slot-add').disabled=!!this.busy||target<0;
  $('chord-slot-target').textContent=target<0?'9枠とも登録ずみ':`追加枠 ${target+1} / ${this.chordSlots.length}`;
  $('chord-use').disabled=!!this.busy||!!(same&&current.manual);$('chord-previous').disabled=!!this.busy||this.bar===0;$('chord-next').disabled=!!this.busy||this.bar>=this.editor.previewPattern.bars-1;
 }
 stageChord(){const before=this.value(),value=structuredClone(before),start=this.bar*16;value.enabled=true;value.chords=[...(value.chords??[]).filter(c=>c.startTick+c.durationTick<=start||c.startTick>=start+16),this.sheetChord()].sort((a,b)=>a.startTick-b.startTick);if(JSON.stringify(value)!==JSON.stringify(before))this.editor.changeStructure({type:'accompaniment',value});}
 openChord(bar){
  if(this.busy||this.editor.entry||!this.editor.isOpen)return;
  this.cancelSlotPress();if(this.slotMenu.open)this.slotMenu.close();
  bar=Math.max(0,Math.min(this.editor.previewPattern.bars-1,bar));
  if(!this.chordSheet.open)this.onStop?.();else this.onNavigate?.();
  this.bar=bar;const chord=harmonicSegments(this.editor.previewPattern).find(c=>c.startTick===bar*16);
  $('chord-title').textContent=`${bar+1} / ${this.editor.previewPattern.bars} 小節`;$('chord-title').setAttribute('aria-label',`${bar+1}小節目のコード`);
  for(const part of ['root','quality','bass'])$(`chord-${part}`).value=chord[part];this.bassLinked=chord.root===chord.bass;
  const chords=this.key==='Am'?[[9,'minor'],[11,'m7♭5'],[0,'major'],[2,'minor'],[4,'major'],[5,'major'],[7,'major']]:[[0,'major'],[2,'minor'],[4,'minor'],[5,'major'],[7,'major'],[9,'minor'],[11,'m7♭5']];
  this.basicChords=chords;this.selectedSlot=this.chordSlots.findIndex(c=>c&&['root','quality','bass'].every(k=>c[k]===chord[k]));if(this.selectedSlot<0)this.selectedSlot=null;this.slotTarget=null;this.slotNotice='';this.renderChordButtons();
  this.setChordPicker(this.chordPickerMode==='all'||this.selectedSlot===null&&!chords.some(([root,quality])=>root===chord.root&&quality===chord.quality&&chord.bass===root)?'all':'basic');
  this.updateChordChoice();
  if(!this.chordSheet.open){
   if(this.inlineChords){this.$('chords').after(this.chordSheet);document.body.classList.add('chord-editing');this.chordSheet.show();}
   else this.chordSheet.showModal();
  }
  this.onNavigate?.();this.updateChordChoice();this.revealChordBar();
  const score=$('capture-score'),staff=score.querySelector(`[data-bar="${bar}"]`);
  if(staff)score.scrollTop+=staff.getBoundingClientRect().top-score.getBoundingClientRect().top-2;
 }
 render(busy=false){
  if(!this.panel)return;this.busy=busy;const pattern=this.editor.previewPattern;
  if(busy||!this.editor.isOpen){this.cancelSlotPress();if(this.slotMenu.open)this.slotMenu.close();}
  if((!this.editor.isOpen||this.bar>=pattern.bars)&&this.chordSheet.open)this.chordSheet.close();
  this.create.disabled=busy||this.editor.pending;this.panel.hidden=!this.editor.isOpen;if(this.panel.hidden){this.imageMode.render(busy);return;}
  const value=this.value(),key=pattern.key?.mode==='minor'?'Am':'C';this.fill('progression',PROGRESSIONS[key]);this.key=key;
  this.fill('rhythm',RHYTHMS.filter(r=>r.id!=='tutorial'||value.genre==='pop'||value.rhythm===r.id));
  if(value.imageChoice){const automatic=document.createElement('option');automatic.value='';automatic.textContent='イメージに おまかせ';this.$('progression').prepend(automatic);}
  this.$('tempo').onclick=()=>this.onTempo?.(PRESETS[this.$('genre').value].tempo);
  this.$('enabled').checked=value.enabled;for(const id of ['genre','rhythm','progression'])this.$(id).value=value[id];this.$('tempo').textContent=`おすすめのBPM ${PRESETS[value.genre].tempo} にする`;
  if(value.imageChoice&&!value.manualSettings?.progression)this.$('progression').value='';
  if($('image-summary'))$('image-summary').textContent=`${GENRES.find(g=>g.id===value.genre).label}・${RHYTHMS.find(r=>r.id===value.rhythm).label}・${value.enabled?'伴奏ON':'伴奏OFF'}`;
  const row=this.$('chords');row.replaceChildren();const segments=harmonicSegments(pattern);
  for(let bar=0;bar<pattern.bars;bar++){const chord=segments.find(c=>c.startTick===bar*16),b=document.createElement('button');b.dataset.chordBar=bar;b.textContent=`${bar+1}：${chordLabel(chord)}`;b.disabled=busy||!!this.editor.entry;b.setAttribute('aria-label',`${bar+1}小節目 ${chordLabel(chord)} を変更`);b.onclick=()=>this.openChord(bar);row.append(b);}
  for(const control of this.panel.querySelectorAll('input,select,button'))control.disabled=busy||!!this.editor.entry;
  if(this.settingsSheet)for(const control of this.settingsSheet.querySelectorAll('input,select,button'))control.disabled=['backing-settings-close','backing-settings-stop'].includes(control.id)?false:busy||!!this.editor.entry;
  for(const control of this.$('suggestions').querySelectorAll('button'))control.disabled=busy;
  for(const control of this.chordSheet.querySelectorAll('input,select,button'))control.disabled=['chord-close','chord-stop'].includes(control.id)?false:busy;
  this.metronome.render(busy);
  for(const button of row.children)button.setAttribute('aria-pressed',String(this.chordSheet.open&&Number(button.dataset.chordBar)===this.bar));
  if(this.chordSheet.open&&this.bar<pattern.bars){this.updateChordChoice();this.revealChordBar();}
  this.imageMode.render(busy);
 }
}
