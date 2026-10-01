// Editable audition presets. These concrete arrangements are trial data.
import {GENRES,CHORD_INTERVALS,chordTones} from './catalog.js';
export const RHYTHMS=[{id:'quarters',label:'4つずつ'},{id:'offbeat',label:'うらで弾く'},{id:'arpeggio',label:'音をばらして弾く'}];
export const PROGRESSIONS={
 C:[{id:'home',label:'C → F → G → C',chords:[[0,'major'],[5,'major'],[7,'major'],[0,'major']]},
    {id:'pop',label:'C → G → Am → F',chords:[[0,'major'],[7,'major'],[9,'minor'],[5,'major']]},
    {id:'circle',label:'C → Am → F → G',chords:[[0,'major'],[9,'minor'],[5,'major'],[7,'major']]},
    {id:'gentle',label:'F → G → Em → Am',chords:[[5,'major'],[7,'major'],[4,'minor'],[9,'minor']]}],
 Am:[{id:'home',label:'Am → Dm → E → Am',chords:[[9,'minor'],[2,'minor'],[4,'major'],[9,'minor']]},
     {id:'pop',label:'Am → F → C → G',chords:[[9,'minor'],[5,'major'],[0,'major'],[7,'major']]},
     {id:'circle',label:'Am → Dm → G → C',chords:[[9,'minor'],[2,'minor'],[7,'major'],[0,'major']]},
     {id:'gentle',label:'Am → G → F → E',chords:[[9,'minor'],[7,'major'],[5,'major'],[4,'major']]}],
};
export const PRESETS={nursery:{tempo:120,rhythm:'quarters',progression:'home'},pop:{tempo:120,rhythm:'offbeat',progression:'pop'},ballad:{tempo:80,rhythm:'arpeggio',progression:'circle'},rock:{tempo:140,rhythm:'quarters',progression:'pop'}};
export const SOUNDS=[{id:'piano',label:'ピアノ風'},{id:'wood',label:'木琴風'},{id:'soft',label:'やわらかい電子音'},{id:'sine',label:'まるい電子音'},{id:'lead',label:'シンセ'}];
export const SOUND_PRESETS={nursery:{chord:'wood',bass:'soft',drums:'acoustic'},pop:{chord:'piano',bass:'sine',drums:'electronic'},ballad:{chord:'soft',bass:'wood',drums:'acoustic'},rock:{chord:'lead',bass:'soft',drums:'electronic'}};
export function validateAccompaniment(value,bars=8) {
 if(!value || typeof value.enabled!=='boolean'||!GENRES.some(g=>g.id===value.genre)||!RHYTHMS.some(r=>r.id===value.rhythm)||!PROGRESSIONS.C.some(p=>p.id===value.progression)) return {code:'ACCOMPANIMENT_INVALID'};
 if(value.sounds)for(const [part,id] of Object.entries(value.sounds))if(part==='drums'?!['none','acoustic','electronic'].includes(id):!['chord','bass'].includes(part)||!SOUNDS.some(s=>s.id===id))return {code:'SOUND_INVALID'};
 if(value.chords!==undefined){
  if(!Array.isArray(value.chords))return {code:'CHORD_INVALID'};
  let end=0;
  for(const chord of [...value.chords].sort((a,b)=>a.startTick-b.startTick)){
   if(chordTones(chord).code)return {code:'CHORD_INVALID'};
   if(!Number.isInteger(chord.startTick)||chord.startTick<0||!Number.isInteger(chord.durationTick)||chord.durationTick<1||chord.startTick+chord.durationTick>bars*16)return {code:'CHORD_TIME'};
   if(chord.startTick<end)return {code:'CHORD_OVERLAP'};end=chord.startTick+chord.durationTick;
  }
 }
 return null;
}
// Timed segments also support future 1/2-beat controls without a storage migration.
export function harmonicSegments(pattern){
 const value=pattern.accompaniment??{progression:'home'},minor=pattern.key?.mode==='minor';
 const progression=PROGRESSIONS[minor?'Am':'C'].find(p=>p.id===value.progression)??PROGRESSIONS.C[0];
 const transpose=(pattern.key?.tonicPitchClass??(minor?9:0))-(minor?9:0),total=pattern.bars*16;
 const custom=(value.chords??[]).filter(c=>c.startTick<total);
 const boundaries=[...new Set([0,total,...Array.from({length:pattern.bars},(_,i)=>i*16),...custom.flatMap(c=>[c.startTick,Math.min(total,c.startTick+c.durationTick)])])].sort((a,b)=>a-b);
 return boundaries.slice(0,-1).map((startTick,i)=>{
  const manual=custom.find(c=>c.startTick<=startTick&&startTick<c.startTick+c.durationTick);
  const [pitch,quality]=progression.chords[Math.floor(startTick/16)%4],root=(pitch+transpose+12)%12;
  return {...(manual??{root,quality,bass:root,manual:false}),startTick,durationTick:boundaries[i+1]-startTick};
 });
}
export function recommendProgressions(pattern){
 const value=pattern.accompaniment??{enabled:true,genre:'nursery',rhythm:'quarters',progression:'home'};
 return PROGRESSIONS[pattern.key?.mode==='minor'?'Am':'C'].map((p,index)=>{
  const candidate={...structuredClone(value),enabled:true,progression:p.id};let score=0;
  for(const segment of harmonicSegments({...pattern,accompaniment:candidate})){
   const tones=CHORD_INTERVALS[segment.quality].map(n=>(n+segment.root)%12);
   for(const note of pattern.notes){const overlap=Math.max(0,Math.min(note.startTick+note.durationTick,segment.startTick+segment.durationTick)-Math.max(note.startTick,segment.startTick));score+=overlap*(tones.includes(note.midi%12)?2:-1);}
  }return {candidate,score,index};
 }).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).map(item=>item.candidate);
}
export function accompanimentEvents(pattern) {
 const value=pattern.accompaniment;
 if(!value?.enabled||validateAccompaniment(value,pattern.bars)) return [];
 const events=[],sounds={...SOUND_PRESETS[value.genre],...value.sounds};let previous=[];
 for(const segment of harmonicSegments(pattern)){
  const {startTick,durationTick,root,quality,bass}=segment;
  let chord=CHORD_INTERVALS[quality].map(x=>48+root+x);
  // Choose a nearby octave for each voice rather than jumping root positions.
  if(previous.length)chord=chord.map((midi,i)=>[midi-12,midi,midi+12].filter(n=>n>=45&&n<=79).sort((a,b)=>Math.abs(a-(previous[i]??60))-Math.abs(b-(previous[i]??60)))[0]);previous=chord;
  const push=(tick,length,midi,instrument,gain,part)=>events.push({startTick:startTick+tick,durationTick:Math.min(length,durationTick-tick),midi,instrument,gain,part});
  const bassTicks=value.genre==='rock'?[0,4,8,12]:value.genre==='ballad'?[0]:[0,8];
  for(const tick of bassTicks)if(tick<durationTick)push(tick,value.genre==='ballad'?14:7,36+bass,sounds.bass,.075,'bass');
  const ticks=value.rhythm==='quarters'?[0,4,8,12]:value.rhythm==='offbeat'?[2,6,10,14]:[0,2,4,6,8,10,12,14];
  for(const [i,tick] of ticks.entries())if(tick<durationTick)for(const midi of value.rhythm==='arpeggio'?[chord[i%chord.length]]:chord)push(tick,value.rhythm==='quarters'?3:2,midi,sounds.chord,value.genre==='rock'?.035:.045,'chord');
  if(sounds.drums!=='none')for(let tick=0;tick<durationTick;tick+=2){
   if(value.genre==='ballad'&&tick%8)continue;
   const kind=tick%8===0?'kick':tick%8===4?'snare':'hat';
   push(tick,1,kind==='kick'?36:kind==='snare'?38:42,`${sounds.drums==='electronic'?'electro-':''}${kind}`,value.genre==='rock'?.055:.025,'drums');
  }
 }
 return events;
}
