const names=['ド','レ','ミ','ファ','ソ','ラ','シ'];
const pitches=[0,2,4,5,7,9,11];
export class ComposerControls {
  constructor({editor,onNew}) {
    this.editor=editor;
    const source=document.querySelector('.source-actions');
    if(!source) return;
    const create=document.createElement('button');create.id='new-manual';create.textContent='じゆうにつくる（空の4小節）';source.prepend(create);create.onclick=onNew;
    const panel=document.createElement('div');panel.id='composer-panel';panel.hidden=true;
    panel.innerHTML=`<p id="composer-position" role="status"></p>
      <details><summary>入力する位置・小節数・キー</summary>
       <label>表示<select id="composer-view"><option value="both">譜面とカード</option><option value="score">譜面</option><option value="blocks">カード</option></select></label>
       <label>小節 <select id="composer-bar"></select></label><div id="composer-beats" aria-label="入力位置"></div>
       <div class="fields"><label>キー<select id="composer-key"><option>C</option><option>Am</option></select></label>
       <button id="composer-extend">8小節に延ばす</button><button id="composer-copy">前半をコピーして8小節</button><button id="composer-shorten">4小節にする候補</button></div>
       <p>短縮は後半を外した候補です。聴いてオッケーで確定します。「もどす」で戻せます。</p>
      </details>
      <div class="composer-values"><label>高さ<select id="composer-octave"><option value="0">ふつう</option><option value="1">うえ</option><option value="2">うえうえ（ド）</option></select></label>
       <label>長さ（拍）<input id="composer-duration" type="number" min="0.5" max="32" step="0.5" value="1"></label></div>
      <div id="composer-keys" aria-label="音の候補を作る"></div>
      <label class="composer-replace"><input id="composer-replace" type="checkbox">選んだ音を置き換える</label>
      <p id="composer-candidate" role="status">音または休符を選んで、オッケーで置きます。</p><p class="composer-voice-hint">声でも「ド1」「うえミ2」「やすみ はんぱく」→「オッケー」</p>`;
    document.querySelector('.listen-actions').before(panel);
    this.panel=panel;this.create=create;
    this.$=id=>document.getElementById(`composer-${id}`);
    for(const [i,name] of [...names,'やすみ'].entries()) {
      const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.pitch=String(i);this.$('keys').append(b);
      b.onclick=()=>editor.inputNote({midi:i===7?null:60+Number(this.$('octave').value)*12+pitches[i],durationTick:Number(this.$('duration').value)*4,
        ...(this.$('replace').checked?{replaceNoteId:editor.selectedNoteId}:{} )});
    }
    this.$('duration').onchange=()=>{if(editor.entry) editor.inputNote({...editor.entry.input,durationTick:Number(this.$('duration').value)*4});};
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
    if(this.panel.hidden) return;
    const cursor=editor.cursor, entry=editor.entry;
    if(this.previousEntry && !entry) this.$('replace').checked=false;
    this.previousEntry=entry;
    if(entry) this.$('duration').value=entry.input.durationTick/4;
    const bar=Math.min(pattern.bars,Math.floor(cursor/16)+1);
    const displayTick=entry?.input.replaceNoteId?pattern.notes.find(n=>n.id===entry.input.replaceNoteId)?.startTick??cursor:cursor;
    if(!busy && this.displayTick!==displayTick) {
      const score=document.getElementById('capture-score'),staff=score.querySelector(`[data-bar="${Math.min(pattern.bars-1,Math.floor(displayTick/16))}"]`);
      if(staff) score.scrollTop+=staff.getBoundingClientRect().top-score.getBoundingClientRect().top-2;
      this.displayTick=displayTick;
    }
    this.$('position').textContent=`入力：${cursor===pattern.bars*16?'曲の終わり':`${bar}小節・${(cursor%16)/4+1}拍目`} ／ あと${(pattern.bars*16-cursor)/4}拍`;
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
      ? `${entry.input.midi===null?'休符':['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'][entry.input.midi%12]} ${entry.input.durationTick/4}拍の候補${entry.proposal.code?'（置けません。位置・長さを直してください）':' → オッケーで確定'}`
      : draft?'仮の編集をオッケーで確定すると、次の音を入力できます。':'音または休符を選んで、オッケーで置きます。';
  }
}
