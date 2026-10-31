import {createInputHelp} from './input-help.js?v=v0.1.0-20261031144007-3fbf8da';
const names=['ド','レ','ミ','ファ','ソ','ラ','シ'];
const pitches=[0,2,4,5,7,9,11];
const lengthLabel=value=>{const whole=Math.floor(value);return value%1?whole?`${whole}拍半`:'半拍':`${whole}拍`;};
const noteIcon=value=>`<svg viewBox="0 0 32 40" aria-hidden="true" focusable="false"><ellipse cx="${value===4?16:11}" cy="30" rx="7" ry="4.5" transform="rotate(-20 ${value===4?16:11} 30)" fill="${value>=2?'none':'currentColor'}" stroke="currentColor" stroke-width="2"/>${value===4?'':'<path d="M18 29V6" fill="none" stroke="currentColor" stroke-width="2"/>'}${value===1.5?'<circle cx="25" cy="28" r="2" fill="currentColor"/>':''}${value===.5?'<path d="M18 6c0 7 13 8 6 17 1-7-5-7-6-11" fill="currentColor"/>':''}</svg>`;
export class ComposerControls {
  constructor({editor,onNew,onPitch=()=>{},onNavigate=()=>{}}) {
    this.editor=editor;
    const source=document.querySelector('.source-actions');
    if(!source) return;
    const create=document.createElement('button');create.id='new-manual';create.textContent='じゆうにつくる（空の4小節）';source.prepend(create);create.onclick=onNew;
    const panel=document.createElement('div');panel.id='composer-panel';panel.hidden=true;
    panel.innerHTML=`<button id="composer-help" type="button">音の置き方・声の使い方</button><button id="composer-position" type="button" aria-controls="composer-location" aria-expanded="false"></button>
      <details><summary>入力する位置・小節数・キー</summary>
       <label>表示<select id="composer-view"><option value="both">譜面とカード</option><option value="score">譜面</option><option value="blocks">カード</option></select></label>
       <label>小節 <select id="composer-bar"></select></label><div id="composer-beats" aria-label="入力位置"></div>
       <div class="fields"><label>キー<select id="composer-key"><option>C</option><option>Am</option></select></label>
       <button id="composer-extend">8小節に延ばす</button><button id="composer-copy">前半をコピーして8小節</button><button id="composer-shorten">4小節にする候補</button></div>
       <p>短縮は後半を外した候補です。聴いてオッケーで確定します。「もどす」で戻せます。</p>
      </details>
      <div class="composer-values"><label>高さ<select id="composer-octave"><option value="0">ふつう</option><option value="1">うえ</option><option value="2">うえうえ（ド）</option></select></label>
       <label class="duration-number">長さ（拍）<input id="composer-duration" type="number" min="0.5" max="32" step="0.5" value="1"></label></div>
      <fieldset id="composer-lengths"><legend>① 音の長さ</legend><div id="composer-length-buttons"></div><details id="composer-other-lengths"><summary>ほかの長さ</summary><label>長さ<select id="composer-other-duration"></select></label></details></fieldset>
      <div id="composer-keys" aria-label="② 音の高さをえらぶ"></div>
      <label class="composer-replace"><input id="composer-replace" type="checkbox">選んだ音を置き換える</label>
      <p id="composer-candidate" role="status">音または休符を選んで、オッケーで置きます。</p><p class="composer-voice-hint">声でも「ド1」「うえミ2」「やすみ はんぱく」→「オッケー」</p>`;
    document.querySelector('.listen-actions').before(panel);
    this.panel=panel;this.create=create;
    this.$=id=>document.getElementById(`composer-${id}`);
    const help=createInputHelp();this.$('help').onclick=()=>{help.showModal();onNavigate();};help.addEventListener('close',onNavigate);
    const position=document.createElement('div');position.id='composer-position-controls';
    position.innerHTML='<div class="composer-position-row"><button id="composer-position-previous" type="button" aria-label="入力位置を半拍前へ">← 半拍</button><div></div><button id="composer-position-next" type="button" aria-label="入力位置を半拍先へ">半拍 →</button></div><details id="composer-location"><summary>小節と拍をえらぶ</summary></details><p class="composer-position-hint">オッケーで次へ。場所は中央でえらべます。</p>';
    position.querySelector('.composer-position-row>div').append(this.$('position'));
    position.querySelector('#composer-location').append(this.$('bar').closest('label'),this.$('beats'));
    document.getElementById('capture-score').before(position);this.positionControls=position;
    this.$('position').onclick=()=>{this.$('location').open=!this.$('location').open;};
    this.$('location').ontoggle=()=>this.$('position').setAttribute('aria-expanded',String(this.$('location').open));
    for(const [name,step] of [['previous',-1],['next',1]])this.$(`position-${name}`).onclick=()=>{if(!this.busy&&!editor.pending)editor.moveCursor(editor.cursor+step*editor.previewPattern.gridStep);};
    for(const [i,name] of [...names,'やすみ'].entries()) {
      const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.pitch=String(i);this.$('keys').append(b);
      b.onclick=()=>{
       const midi=i===7?null:60+Number(this.$('octave').value)*12+pitches[i];
       editor.inputNote({midi,durationTick:Number(this.$('duration').value)*4,...(this.$('replace').checked?{replaceNoteId:editor.selectedNoteId}:{})});
       if(editor.entry?.input.midi===midi)onPitch(midi);
      };
    }
    this.$('duration').onchange=()=>{if(editor.entry) editor.inputNote({...editor.entry.input,durationTick:Number(this.$('duration').value)*4});else this.render(this.busy);};
    const chooseLength=value=>{if(this.busy||editor.pending&&!editor.entry)return;this.$('duration').value=value;this.$('duration').dispatchEvent(new Event('change'));};
    for(const [value,label,kind] of [[.5,'はんぱく','八分音符'],[1,'1ぱく','四分音符'],[1.5,'1ぱく半','付点四分音符'],[2,'2はく','二分音符'],[4,'4はく','全音符']]){
      const b=document.createElement('button');b.type='button';b.dataset.duration=String(value);b.setAttribute('aria-label',`${lengthLabel(value)}・${kind}`);b.innerHTML=noteIcon(value)+`<span>${label}</span>`;b.onclick=()=>chooseLength(value);this.$('length-buttons').append(b);
    }
    this.$('other-duration').replaceChildren(...Array.from({length:64},(_,i)=>{const o=document.createElement('option');o.value=(i+1)/2;o.textContent=lengthLabel((i+1)/2);return o;}));
    this.$('other-duration').onchange=()=>chooseLength(this.$('other-duration').value);
    this.$('octave').onchange=()=>this.render(this.busy);
    this.$('bar').onchange=()=>editor.moveCursor((Number(this.$('bar').value)-1)*16);
    this.$('view').onchange=()=>{document.body.dataset.composerView=this.$('view').value;};
    for(let tick=0;tick<16;tick+=2) {
      const b=document.createElement('button');b.textContent=String(1+tick/4);b.dataset.tick=tick;this.$('beats').append(b);
      b.onclick=()=>editor.moveCursor((Number(this.$('bar').value)-1)*16+tick);
    }
    this.$('extend').onclick=()=>editor.changeStructure({type:'resize',bars:8});
    this.$('copy').onclick=()=>editor.changeStructure({type:'resize',bars:8,copy:true});
    this.$('shorten').onclick=()=>editor.changeStructure({type:'resize',bars:4});
    this.$('key').onchange=()=>editor.changeStructure({type:'key',key:this.$('key').value});
  }
  render(busy=false) {
    if(!this.panel) return;
    this.busy=busy;
    const editor=this.editor,pattern=editor.previewPattern;
    this.create.disabled=busy || editor.pending;
    this.panel.hidden=!editor.isOpen || pattern?.source!=='manual';
    this.positionControls.hidden=this.panel.hidden;
    this.$('key').value=pattern?.key?.mode==='minor'?'Am':'C';this.$('key').disabled=busy||!editor.isOpen||!!editor.entry;
    if(this.panel.hidden) return;
    const cursor=editor.cursor, entry=editor.entry;
    if(this.previousEntry && !entry) this.$('replace').checked=false;
    this.previousEntry=entry;
    if(entry) this.$('duration').value=entry.input.durationTick/4;
    const duration=Number(this.$('duration').value);this.$('other-duration').value=String(duration);
    for(const b of this.$('length-buttons').children)b.setAttribute('aria-pressed',String(Number(b.dataset.duration)===duration));
    this.$('other-lengths').querySelector('summary').textContent=[.5,1,1.5,2,4].includes(duration)?'ほかの長さ':`ほかの長さ：${lengthLabel(duration)}`;
    const bar=Math.min(pattern.bars,Math.floor(cursor/16)+1);
    const displayTick=entry?.input.replaceNoteId?pattern.notes.find(n=>n.id===entry.input.replaceNoteId)?.startTick??cursor:cursor;
    if(busy)this.displayTick=null;
    if(!busy) {
      const score=document.getElementById('capture-score'),staff=score.querySelector(`[data-bar="${Math.min(pattern.bars-1,Math.floor(displayTick/16))}"]`);
      if(staff) score.scrollTop+=staff.getBoundingClientRect().top-score.getBoundingClientRect().top-2;
      this.displayTick=displayTick;
    }
    this.$('position').textContent=`入力：${cursor===pattern.bars*16?'曲の終わり':`${bar}小節・${(cursor%16)/4+1}拍目`} ／ あと${(pattern.bars*16-cursor)/4}拍 ▾`;
    this.$('position').disabled=busy||editor.pending;
    for(const [name,edge] of [['previous',cursor<=0],['next',cursor>=pattern.bars*16]])this.$(`position-${name}`).disabled=busy||editor.pending||edge;
    this.$('bar').disabled=busy||editor.pending;for(const b of this.$('beats').children)b.disabled=busy||editor.pending;
    const score=document.getElementById('capture-score');for(const node of score.querySelectorAll('[data-entry-cursor]'))node.remove();
    const staff=score.querySelector(`[data-bar="${Math.min(pattern.bars-1,Math.floor(cursor/16))}"]`);
    if(staff&&!busy&&!editor.pending){
      const x=Number(staff.dataset.entryLeft)+Number(staff.dataset.entrySpacing)*(cursor===pattern.bars*16?16:cursor%16),ns='http://www.w3.org/2000/svg';
      const marker=document.createElementNS(ns,'g');marker.dataset.entryCursor='true';
      const line=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:x,x2:x,y1:44,y2:104,stroke:'#16816e','stroke-width':3,'stroke-dasharray':'4 3'}))line.setAttribute(k,v);
      const label=document.createElementNS(ns,'text');for(const [k,v] of Object.entries({x:x-4,y:120,fill:'#126252','font-size':14,'font-weight':700,'text-anchor':cursor===pattern.bars*16?'end':'middle'}))label.setAttribute(k,v);label.textContent='ここ';marker.append(line,label);staff.append(marker);
    }
    if(this.$('bar').options.length!==pattern.bars) {
      this.$('bar').replaceChildren(...Array.from({length:pattern.bars},(_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=`${i+1}小節`;return o;}));
    }
    this.$('bar').value=bar;this.$('key').value=pattern.key?.mode==='minor'?'Am':'C';
    for(const b of this.$('beats').children) b.setAttribute('aria-pressed',String((bar-1)*16+Number(b.dataset.tick)===cursor));
    const draft=editor.pending&&!entry;
    for(const control of this.panel.querySelectorAll('button,input,select')) control.disabled=busy||draft;
    this.$('extend').disabled=this.$('copy').disabled=busy||pattern.bars===8||!!entry;
    this.$('shorten').disabled=busy||pattern.bars===4||!!entry;
    this.$('replace').disabled=busy||draft||!!entry||!editor.selectedNoteId;
    for(const b of this.$('keys').children) b.disabled=busy||draft||(Number(this.$('octave').value)===2 && !['0','7'].includes(b.dataset.pitch));
    this.$('candidate').textContent=entry
      ? `${entry.input.midi===null?'休符':['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'][entry.input.midi%12]} ${lengthLabel(entry.input.durationTick/4)}の候補${entry.proposal.code?'（置けません。位置・長さを直してください）':' → オッケーで確定'}`
      : draft?'仮の編集をオッケーで確定すると、次の音を入力できます。':'音または休符を選んで、オッケーで置きます。';
  }
}
