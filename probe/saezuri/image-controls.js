import {GENRES,CHORD_INTERVALS} from '../../saezuri/music/catalog.js?v=v0.1.0-20261010122649-d4089c8';
import {RHYTHMS,PROGRESSIONS,PRESETS,SOUNDS,SOUND_PRESETS,soundLabel,harmonicSegments,recommendProgressions} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261010122649-d4089c8';
import {setupPlaybackSheet} from './sheet-controls.js?v=v0.1.0-20261010122649-d4089c8';
import {ImageModeControls} from './image-mode-controls.js?v=v0.1.0-20261010122649-d4089c8';
const pitches=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const suffix={major:'',minor:'m'};
export const chordLabel=c=>`${pitches[c.root]}${suffix[c.quality]??c.quality}${c.bass===c.root?'':`/${pitches[c.bass]}`}`;
const fallback={enabled:false,genre:'nursery',rhythm:'quarters',progression:'home'};
const $=id=>document.getElementById(id);
function fill(node,items){node.replaceChildren(...items.map(([id,label])=>{const o=document.createElement('option');o.value=id;o.textContent=label;return o;}));}
export class ImageControls {
 constructor({editor,onNew,onTempo,onPreview,onStop,onNavigate,compact=false,engine='classic'}) {
  Object.assign(this,{editor,onTempo,onPreview,onStop,onNavigate,engine});
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
    const row=document.createElement('div');row.className='suggestion-row';const label=document.createElement('p');label.textContent=`${i?'くらべる':'おすすめ'}：${PROGRESSIONS[this.key].find(p=>p.id===value.progression).label}`;
    const listen=document.createElement('button');listen.textContent='▶ 聴く';listen.onclick=()=>this.onPreview?.({...structuredClone(editor.previewPattern),accompaniment:value},true);
    const b=document.createElement('button');b.textContent='この候補を つかう';b.onclick=()=>{editor.changeStructure({type:'accompaniment',value});this.suggestionsSheet?.close();};row.append(label,listen,b);this.$('suggestions').append(row);
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
   const suggestions=document.createElement('dialog');suggestions.id='progression-suggestions';suggestions.className='backing-sheet';suggestions.setAttribute('aria-label','進行のおすすめ');suggestions.innerHTML='<div class="screen-heading"><h2>進行を くらべよう</h2><button id="progression-close">とじる</button></div>';suggestions.append(this.$('suggestions'));
   const stopRow=document.createElement('div');stopRow.className='sheet-stop';const stop=document.createElement('button');stop.id='progression-stop';stop.textContent='■ とめる';stop.onclick=()=>this.onStop?.();stopRow.append(stop);suggestions.append(stopRow);
   suggestions.addEventListener('close',()=>this.onNavigate?.());document.querySelector('main').append(suggestions);$('progression-close').onclick=()=>{this.onStop?.();suggestions.close();};this.suggestionsSheet=suggestions;
   const suggest=this.$('suggest').onclick;this.$('suggest').onclick=()=>{suggest();this.show(suggestions);};
   setupPlaybackSheet(settings,{closeId:'backing-settings-close',stopId:'backing-settings-stop',onStop:()=>this.onStop?.()});
   setupPlaybackSheet(suggestions,{closeId:'progression-close',stopId:'progression-stop',onStop:()=>this.onStop?.()});
  }
  this.imageMode=new ImageModeControls({editor,onTempo,compact});
  (this.settingsSheet??this.panel).append(this.imageMode.reset);
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
  d.innerHTML='<div class="screen-heading"><h2 id="chord-title"></h2><button id="chord-close">とじる</button></div><div id="chord-basic" aria-label="キーに合うコード"></div><details id="chord-detail"><summary>くわしく選ぶ</summary><div class="chord-fields"><label>ルート<select id="chord-root"></select></label><label>コードの種類<select id="chord-quality"></select></label><label>ベース<select id="chord-bass"></select></label></div></details><p id="chord-candidate" role="status"></p><div class="sheet-actions"><button id="chord-preview">▶ 聴く</button><button id="chord-stop">■ とめる</button><button id="chord-confirm">オッケー</button></div>';
  document.querySelector('main').append(d);this.chordSheet=d;
  for(const id of ['chord-root','chord-bass'])fill($(id),pitches.map((p,i)=>[i,p]));
  fill($('chord-quality'),Object.keys(CHORD_INTERVALS).map(q=>[q,q==='major'?'メジャー':q==='minor'?'マイナー':q]));
  const update=()=>{$('chord-candidate').textContent=`${chordLabel(this.sheetChord())} の候補・${this.bar+1}小節目`;};
  for(const id of ['chord-root','chord-quality','chord-bass'])$(id).onchange=update;
  $('chord-close').onclick=()=>d.close();d.addEventListener('close',()=>this.onNavigate?.());
  $('chord-preview').onclick=()=>{this.stageChord();this.onPreview?.();};$('chord-stop').onclick=()=>this.onStop?.();
  $('chord-confirm').onclick=()=>{this.stageChord();this.editor.command('confirm');d.close();};
  const s=document.createElement('dialog');s.id='sounds-sheet';s.className='backing-sheet';s.setAttribute('aria-label','パートの音色');s.innerHTML='<div class="screen-heading"><h2>パートの音色</h2><button id="sounds-close">とじる</button></div><div class="sound-fields"><label>コード<select id="sound-chord"></select></label><label>ベース<select id="sound-bass"></select></label><label>ドラム<select id="sound-drums"></select></label></div><p>アコースティック風と電子音を、組み合わせて使えます。</p><p>とじて聴き、オッケーで決めよう。</p>';
  document.querySelector('main').append(s);this.soundSheet=s;
   for(const part of ['chord','bass'])fill($(`sound-${part}`),SOUNDS.map(v=>[v.id,soundLabel(v.id,this.engine)]));fill($('sound-drums'),[['acoustic','アコースティック風'],['electronic','電子ドラム'],['none','なし']]);
  for(const part of ['chord','bass','drums'])$(`sound-${part}`).onchange=()=>{const value=this.value();value.sounds={...value.sounds,[part]:$(`sound-${part}`).value};this.editor.changeStructure({type:'accompaniment',value});};
  $('sounds-close').onclick=()=>s.close();s.addEventListener('close',()=>this.onNavigate?.());
  this.$('sounds').onclick=()=>{const value=this.value(),sounds={...SOUND_PRESETS[value.genre],...value.imageArrangement?.sounds,...value.sounds};for(const part of ['chord','bass','drums'])$(`sound-${part}`).value=sounds[part];this.show(s);};
  setupPlaybackSheet(d,{closeId:'chord-close',stopId:'chord-stop',onStop:()=>this.onStop?.()});
  setupPlaybackSheet(s,{closeId:'sounds-close',stopId:'sounds-stop',onStop:()=>this.onStop?.()});
 }
 sheetChord(){return {startTick:this.bar*16,durationTick:16,root:Number($('chord-root').value),quality:$('chord-quality').value,bass:Number($('chord-bass').value),manual:true};}
 stageChord(){const value=this.value(),start=this.bar*16;value.enabled=true;value.chords=[...(value.chords??[]).filter(c=>c.startTick+c.durationTick<=start||c.startTick>=start+16),this.sheetChord()].sort((a,b)=>a.startTick-b.startTick);this.editor.changeStructure({type:'accompaniment',value});}
 openChord(bar){
  this.bar=bar;const chord=harmonicSegments(this.editor.previewPattern).find(c=>c.startTick===bar*16);
  $('chord-title').textContent=`${bar+1}小節目のコード`;for(const part of ['root','quality','bass'])$(`chord-${part}`).value=chord[part];$('chord-candidate').textContent=`いまは ${chordLabel(chord)}`;
  const basic=$('chord-basic');basic.replaceChildren();
  const chords=this.key==='Am'?[[9,'minor'],[11,'m7♭5'],[0,'major'],[2,'minor'],[4,'major'],[5,'major'],[7,'major']]:[[0,'major'],[2,'minor'],[4,'minor'],[5,'major'],[7,'major'],[9,'minor'],[11,'m7♭5']];
  for(const [root,quality] of chords){const b=document.createElement('button');b.textContent=chordLabel({root,quality,bass:root});b.onclick=()=>{for(const [part,v] of [['root',root],['quality',quality],['bass',root]])$(`chord-${part}`).value=v;$('chord-root').onchange();};basic.append(b);}
  this.show(this.chordSheet);
  const score=$('capture-score'),staff=score.querySelector(`[data-bar="${bar}"]`);
  if(staff)score.scrollTop+=staff.getBoundingClientRect().top-score.getBoundingClientRect().top-2;
 }
 render(busy=false){
  if(!this.panel)return;const pattern=this.editor.previewPattern;
  this.create.disabled=busy||this.editor.pending;this.panel.hidden=!this.editor.isOpen;if(this.panel.hidden){this.imageMode.render(busy);return;}
  const value=this.value(),key=pattern.key?.mode==='minor'?'Am':'C';this.fill('progression',PROGRESSIONS[key]);this.key=key;
  if(value.imageChoice){const automatic=document.createElement('option');automatic.value='';automatic.textContent='イメージに おまかせ';this.$('progression').prepend(automatic);}
  this.$('tempo').onclick=()=>this.onTempo?.(PRESETS[this.$('genre').value].tempo);
  this.$('enabled').checked=value.enabled;for(const id of ['genre','rhythm','progression'])this.$(id).value=value[id];this.$('tempo').textContent=`おすすめのBPM ${PRESETS[value.genre].tempo} にする`;
  if(value.imageChoice&&!value.manualSettings?.progression)this.$('progression').value='';
  if($('image-summary'))$('image-summary').textContent=`${GENRES.find(g=>g.id===value.genre).label}・${value.enabled?'伴奏ON':'伴奏OFF'}`;
  const row=this.$('chords');row.replaceChildren();const segments=harmonicSegments(pattern);
  for(let bar=0;bar<pattern.bars;bar++){const chord=segments.find(c=>c.startTick===bar*16),b=document.createElement('button');b.dataset.chordBar=bar;b.textContent=`${bar+1}：${chordLabel(chord)}`;b.setAttribute('aria-label',`${bar+1}小節目 ${chordLabel(chord)} を変更`);b.onclick=()=>this.openChord(bar);row.append(b);}
  for(const control of this.panel.querySelectorAll('input,select,button'))control.disabled=busy||!!this.editor.entry;
  if(this.settingsSheet)for(const control of this.settingsSheet.querySelectorAll('input,select,button'))control.disabled=['backing-settings-close','backing-settings-stop'].includes(control.id)?false:busy||!!this.editor.entry;
  for(const control of this.$('suggestions').querySelectorAll('button'))control.disabled=busy;
  for(const control of this.chordSheet.querySelectorAll('input,select,button'))control.disabled=['chord-close','chord-stop'].includes(control.id)?false:busy;
  this.imageMode.render(busy);
 }
}
