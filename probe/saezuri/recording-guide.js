import {harmonicSegments} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261027205519-89482f0';
import {chordLabel} from './image-controls.js?v=v0.1.0-20261027205519-89482f0';

// Display only: use the existing audio clock and anchors, never a second timer.
export function recordingPosition({now,bars,tempo,anchor=null,loop=false,kind=null,recordAnchor=null,phase='idle'}){
 const total=bars*16,hasClock=Number.isFinite(anchor),taking=kind&&Number.isFinite(recordAnchor);
 const waiting=taking&&now<recordAnchor;
 let tick=hasClock?(now-anchor)*tempo*4/60:null;
 if(taking&&!waiting)tick=(now-recordAnchor)*tempo*4/60;
 const wraps=kind==='tap'||(!taking||waiting)&&loop;
 if(tick!==null&&tick>=0)tick=wraps?tick%total:Math.min(tick,total-1e-6);else tick=null;
 const mode=taking?(waiting?`${kind}-wait`:kind):hasClock?(now<anchor?'count':loop?'loop':'play'):phase==='analyzing'?'analyzing':phase==='preparing'?'preparing':'ready';
 const remaining=waiting?Math.ceil((recordAnchor-now)*tempo/60):hasClock&&now<anchor?Math.ceil((anchor-now)*tempo/60):0;
 return {mode,tick,remaining,bar:tick===null?null:Math.floor(tick/16),beat:tick===null?null:Math.floor(tick/4)%4};
}

export class RecordingGuide {
 constructor(panel,status){
  this.status=status;status.removeAttribute('role');
  this.root=document.createElement('div');this.root.id='recording-guide';this.root.setAttribute('aria-label','小節とコード進行');
  this.row=document.createElement('div');this.row.id='recording-chords';this.root.append(this.row);panel.querySelector('.keyboard-actions').after(this.root);
  this.signature='';this.key='';this.cells=[];
 }
 configure(pattern){
  if(!pattern)return;
  const segments=harmonicSegments(pattern),enabled=!!pattern.accompaniment?.enabled;
  const signature=JSON.stringify([pattern.bars,enabled,segments]);
  this.bars=pattern.bars;this.enabled=enabled;
  if(signature===this.signature)return;
  this.signature=signature;this.segments=segments;this.labels=segments.map(chordLabel);this.revision=(this.revision??0)+1;this.key='';this.cells=[];this.row.replaceChildren();
  // Eight bars fit without swiping. Longer songs retain a scrolling strip.
  this.row.style.setProperty('--guide-bars',Math.min(8,pattern.bars));
  for(let bar=0;bar<pattern.bars;bar++){
   const chords=segments.filter(c=>Math.floor(c.startTick/16)===bar),label=enabled?chords.map(chordLabel).join('→'):'—';
   const cell=document.createElement('span'),number=document.createElement('small'),code=document.createElement('b');
   number.textContent=String(bar+1);code.textContent=label;if(pattern.bars>=8&&label.length>4)code.style.fontSize='10px';cell.append(number,code);cell.title=`${bar+1}小節目 ${enabled?label:'伴奏なし'}`;cell.setAttribute('aria-label',cell.title);this.row.append(cell);this.cells.push(cell);
  }
 }
 message(text){this.key='';this.status.textContent=text;}
 follow({phase,transport,capture,take,now}){
  if(!this.bars)return;
  const liveCapture=capture?.active&&['count-in','recording'].includes(phase)&&Number.isFinite(capture.startTime),active=transport?.active;
  const position=recordingPosition({now,bars:liveCapture?capture.timing?.bars??this.bars:this.bars,tempo:take?.tempo??(liveCapture?capture.tempo:transport?.tempo)??120,anchor:active?transport.anchor:null,loop:!!transport?.loop,kind:take?'tap':liveCapture?'hum':null,recordAnchor:take?.anchor??(liveCapture?capture.startTime:null),phase});
  const {mode,tick,bar,beat,remaining}=position;
  const index=tick===null?0:Math.max(0,this.segments.findIndex(c=>c.startTick<=tick&&tick<c.startTick+c.durationTick));
  const current=this.enabled?this.labels[index]:'',next=this.enabled?this.labels[(index+1)%this.labels.length]:'';
  const key=`${this.revision}:${mode}:${bar}:${beat}:${remaining}:${index}`;
  if(key===this.key)return;this.key=key;
  Object.assign(this.root.dataset,{mode,bar:bar===null?'':String(bar+1),beat:beat===null?'':String(beat+1),chord:current,next});
  const state=mode.endsWith('-wait')?`次の先頭から：あと${remaining}拍`:({ready:'れんしゅう中',loop:'伴奏ループ中',tap:'タップ録音中',hum:'ハナウタ録音中',count:`開始まで あと${remaining}拍`,play:'再生中',preparing:'音を準備中',analyzing:'音を取り込み中'}[mode]);
  const place=bar===null?`${this.bars}小節のコード`:`${bar+1}小節目・${beat+1}拍`;
  if(!this.status.querySelector('.recording-place')){
   this.status.replaceChildren(...['recording-state','recording-place','recording-chord'].map(name=>{const span=document.createElement('span');span.className=name;return span;}));
  }
  const [stateNode,placeNode,chordNode]=this.status.children;
  stateNode.textContent=state;placeNode.textContent=place;chordNode.textContent=this.enabled?`${bar===null?'':'今 '}${current} → ${bar===null?'':'次 '}${next}`:'伴奏なし';chordNode.title=this.enabled?`今のコード ${current}、次は ${next}`:'伴奏なし';
  for(const [i,cell] of this.cells.entries()){
   const playing=i===bar;cell.toggleAttribute('data-playing',playing);
   if(playing)cell.setAttribute('aria-current','true');else cell.removeAttribute('aria-current');
  }
  if(bar!==null&&this.cells[bar]){
   const cell=this.cells[bar],left=cell.offsetLeft-this.row.offsetLeft;
   if(left<this.row.scrollLeft||left+cell.offsetWidth>this.row.scrollLeft+this.row.clientWidth)this.row.scrollLeft=left-(this.row.clientWidth-cell.offsetWidth)/2;
  }else this.row.scrollLeft=0;
  this.root.classList.toggle('following',!['ready','preparing','analyzing'].includes(mode));
 }
}
