import {GENRES} from '../../saezuri/music/catalog.js';
import {RHYTHMS,PROGRESSIONS,PRESETS} from '../../saezuri/music/accompaniment.js';
export class ImageControls {
 constructor({editor,onNew,onTempo}) {
  this.editor=editor;
  const source=document.querySelector('.source-actions');if(!source)return;
  this.create=document.createElement('button');this.create.id='new-image';this.create.textContent='イメージからつくる';this.create.onclick=onNew;source.prepend(this.create);
  const panel=document.createElement('details');panel.id='image-settings';
  panel.innerHTML='<summary>伴奏のイメージ</summary><label class="composer-replace"><input id="image-enabled" type="checkbox">伴奏といっしょに聴く</label><div class="composer-values"><label>ジャンル<select id="image-genre"></select></label><label>リズム<select id="image-rhythm"></select></label></div><label>進行<select id="image-progression"></select></label><button id="image-tempo"></button><p>ジャンルを変えるとリズムと進行がおすすめに替わります。メロディはそのまま。「聴く」で比べて、オッケーで確定します。</p>';
  document.getElementById('composer-panel').before(panel);this.panel=panel;this.$=id=>document.getElementById(`image-${id}`);
  const fill=(id,entries)=>this.$(id).replaceChildren(...entries.map(v=>{const o=document.createElement('option');o.value=v.id;o.textContent=v.label;return o;}));
  fill('genre',GENRES);fill('rhythm',RHYTHMS);this.fill=fill;
  for(const id of ['enabled','genre','rhythm','progression']) this.$(id).onchange=()=>{
   const genre=this.$('genre').value,value={enabled:this.$('enabled').checked,genre,rhythm:this.$('rhythm').value,progression:this.$('progression').value};
   if(id==='genre') Object.assign(value,{rhythm:PRESETS[genre].rhythm,progression:PRESETS[genre].progression});
   editor.changeStructure({type:'accompaniment',value});
  };
  this.$('tempo').onclick=()=>onTempo(PRESETS[this.$('genre').value].tempo);
 }
 render(busy=false) {
  if(!this.panel)return;
  const pattern=this.editor.previewPattern;
  this.create.disabled=busy||this.editor.pending;
  this.panel.hidden=!this.editor.isOpen||pattern?.source!=='manual';if(this.panel.hidden)return;
  const value=pattern.accompaniment??{enabled:false,genre:'nursery',rhythm:'quarters',progression:'home'};
  const key=pattern.key.mode==='minor'?'Am':'C';
  if(this.key!==key){this.fill('progression',PROGRESSIONS[key]);this.key=key;}
  this.$('enabled').checked=value.enabled;
  for(const id of ['genre','rhythm','progression'])this.$(id).value=value[id];
  this.$('tempo').textContent=`おすすめのBPM ${PRESETS[value.genre].tempo} にする`;
  for(const input of this.panel.querySelectorAll('input,select,button'))input.disabled=busy||!!this.editor.entry;
 }
}
