import {spellPitch} from './key-signature.js?v=v0.1.0-20261018060645-b9da761';
import {harmonicSegments} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261018060645-b9da761';

const names=['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'];
const roots=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs={},text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;};

// Keep one card per sound (split only at bar lines). The compact notation and
// cards share this timeline; sounding notes remain single playback events.
function displayEvents(pattern,endTick){
 const result=[];let cursor=0;
 const append=(start,end,note)=>{for(let tick=start;tick<end;){const stop=Math.min(end,(Math.floor(tick/16)+1)*16);result.push({startTick:tick,durationTick:stop-tick,midi:note?.midi??null,noteId:note?.id??null,tieIn:!!note&&tick>note.startTick,tieOut:!!note&&stop<note.startTick+note.durationTick});tick=stop;}};
 for(const note of [...pattern.notes].sort((a,b)=>a.startTick-b.startTick)){
  if(note.startTick>=endTick)break;
  append(cursor,note.startTick,null);append(note.startTick,Math.min(endTick,note.startTick+note.durationTick),note);cursor=Math.min(endTick,note.startTick+note.durationTick);
 }
 append(cursor,endTick,null);return result;
}
const chordLabel=segment=>segment?roots[segment.root]+({major:'',minor:'m',7:'7',maj7:'maj7',m7:'m7',m7b5:'m7♭5',dim:'dim'}[segment.quality]??''):'';
function timed(node,event){node.dataset.startTick=event.startTick;node.dataset.durationTick=event.durationTick;if(event.noteId)node.dataset.noteId=event.noteId;return node;}

export function renderTutorialView(container,pattern,{display='cards',selectedId=null,onSelect=null,barStart=0,barCount=pattern.bars,endTick=pattern.bars*16}={}){
 container.replaceChildren();container.classList.add('tutorial-view');container.dataset.display=display;
 const events=displayEvents(pattern,endTick),chords=harmonicSegments(pattern);
 const width=Math.max(220,container.clientWidth||320),left=40,right=width-8,span=width-left-18;
 for(let bar=barStart;bar<Math.min(pattern.bars,barStart+barCount);bar++){
  const section=document.createElement('section');section.className='tutorial-bar';section.dataset.bar=bar;
  const heading=document.createElement('div');heading.className='tutorial-bar-heading';
  const chord=chordLabel(chords.find(c=>c.startTick<=bar*16&&bar*16<c.startTick+c.durationTick));
  const title=document.createElement('span'),harmony=document.createElement('span');title.textContent=`${bar+1}小節`;harmony.className='tutorial-chord';harmony.textContent=chord;heading.append(title,harmony);
  const lane=document.createElement('div');lane.className='tutorial-cards';lane.setAttribute('aria-label',`${bar+1}小節目のカード`);
  const current=events.filter(n=>Math.floor(n.startTick/16)===bar);
  const yFor=midi=>62-(spellPitch(midi,0).step-28)*4;
  const ys=current.filter(n=>n.midi!==null).map(n=>yFor(n.midi));const top=Math.min(0,...ys.map(y=>y-28)),bottom=Math.max(76,...ys.map(y=>y+18));
  const staff=svg('svg',{viewBox:`0 ${top} ${width} ${bottom-top}`,class:'tutorial-staff',role:'img','aria-label':`${bar+1}小節目の五線譜`});
  staff.append(svg('text',{x:3,y:12,'font-size':12,class:'tutorial-staff-label'},`${bar+1}小節`),svg('text',{x:left,y:12,'font-size':12,class:'tutorial-chord tutorial-staff-label'},chord));
  for(let i=0;i<5;i++)staff.append(svg('line',{x1:3,y1:22+i*8,x2:right,y2:22+i*8,class:'tutorial-staff-line'}));
  staff.append(svg('text',{x:3,y:53,'font-size':34,'font-family':'Segoe UI Symbol,serif',class:'tutorial-staff-label'},'𝄞'));
  for(const event of current){
   const label=event.midi===null?'休み':names[event.midi%12],beats=event.durationTick/4;
   const card=timed(document.createElement(onSelect&&event.noteId?'button':'span'),event);card.className='tutorial-card'+(event.midi===null?' is-rest':'');
   if(card.tagName==='BUTTON'){card.type='button';card.onclick=()=>onSelect(event.noteId);card.setAttribute('aria-pressed',String(event.noteId===selectedId));}
   card.style.left=`${(event.startTick%16)/16*100}%`;card.style.width=`calc(${event.durationTick/16*100}% - 3px)`;
   const pitch=document.createElement('span'),length=document.createElement('span');pitch.textContent=(event.tieIn?'↳':'')+label+(event.tieOut?'↪':'');length.className='tutorial-length';length.textContent=beats;card.append(pitch,length);lane.append(card);
   const x=left+(event.startTick%16)/16*span,y=event.midi===null?42:yFor(event.midi);
   const group=timed(svg('g',{class:'tutorial-note-shape'}),event);group.append(svg('title',{},`${label} ${beats}拍${event.tieIn?'・前の小節から続く':event.tieOut?'・次の小節へ続く':''}`));
   group.append(svg('rect',{x:x-10,y:y-27,width:22,height:39,rx:11,class:'note-playback-halo','aria-hidden':'true'}));
   if(event.noteId&&event.noteId===selectedId)group.classList.add('is-selected');
   group.append(svg('rect',{x:x-13,y:y-28,width:28,height:44,rx:8,class:'learning-target-halo','aria-hidden':'true'}),svg('text',{x:x+13,y:y-19,'font-size':10,class:'learning-target-label','aria-hidden':'true'},'◀ここ'));
   if(onSelect&&event.noteId){group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',`${label} ${beats}拍を選ぶ`);group.addEventListener('click',()=>onSelect(event.noteId));group.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect(event.noteId);}});}
   if(event.midi===null)group.append(svg('text',{x:x-4,y:50,'font-size':25,'font-family':'Segoe UI Symbol,serif'},event.durationTick===2?'𝄾':event.durationTick===4?'𝄽':event.durationTick>=16?'𝄻':'𝄼'));
   else{
    for(let line=62;line<=y;line+=8)group.append(svg('line',{x1:x-8,y1:line,x2:x+8,y2:line,'stroke-width':1}));
    for(let line=14;line>=y;line-=8)group.append(svg('line',{x1:x-8,y1:line,x2:x+8,y2:line,'stroke-width':1}));
    const hollow=event.durationTick===8||event.durationTick===16;
    group.append(svg('ellipse',{cx:x,cy:y,rx:4.8,ry:3.2,transform:`rotate(-20 ${x} ${y})`,class:hollow?'tutorial-hollow':'','stroke-width':1.2}));
    if(event.durationTick!==16)group.append(svg('line',{x1:x+4.5,y1:y,x2:x+4.5,y2:y-22,'stroke-width':1.3}));
    if(event.durationTick===2)group.append(svg('path',{d:`M${x+4.5} ${y-22} q13 6 4 14`,fill:'none','stroke-width':1.3}));
    if(event.durationTick===6)group.append(svg('circle',{cx:x+9,cy:y-1,r:1.5,stroke:'none'}));
    if(spellPitch(event.midi,0).accidental)group.append(svg('text',{x:x-14,y:y+4,'font-size':13},'♯'));
    if(event.tieOut)group.append(svg('path',{d:`M${x} ${y+8} Q${(x+right)/2} ${y+18} ${right} ${y+8}`,fill:'none','stroke-width':1.2}));
    if(event.tieIn)group.append(svg('path',{d:`M${left-20} ${y+8} Q${left-10} ${y+18} ${left} ${y+8}`,fill:'none','stroke-width':1.2}));
   }
   staff.append(group);
  }
  staff.append(svg('line',{x1:right,y1:22,x2:right,y2:54,class:'tutorial-staff-line'}));
  section.append(heading,lane,staff);container.append(section);
 }
}
export function highlightTutorialView(container,tick){
 for(const node of container.querySelectorAll('[data-start-tick]')){
  const active=tick!==null&&Number(node.dataset.startTick)<=tick&&tick<Number(node.dataset.startTick)+Number(node.dataset.durationTick);
  if(active)node.setAttribute('data-playing','note');else node.removeAttribute('data-playing');
 }
}
