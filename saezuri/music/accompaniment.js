// Editable audition presets. These concrete arrangements are trial data.
import {GENRES} from './catalog.js';
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
export function validateAccompaniment(value) {
 if(!value || typeof value.enabled!=='boolean'||!GENRES.some(g=>g.id===value.genre)||!RHYTHMS.some(r=>r.id===value.rhythm)||!PROGRESSIONS.C.some(p=>p.id===value.progression)) return {code:'ACCOMPANIMENT_INVALID'};
 return null;
}
export function accompanimentEvents(pattern) {
 const value=pattern.accompaniment;
 if(!value?.enabled||validateAccompaniment(value)) return [];
 const key=pattern.key?.mode==='minor'?'Am':'C';
 const progression=PROGRESSIONS[key].find(p=>p.id===value.progression),events=[];
 const instrument=({nursery:'wood',pop:'piano',ballad:'soft',rock:'lead'})[value.genre];
 for(let bar=0;bar<pattern.bars;bar++) {
  const [root,quality]=progression.chords[bar%4],chord=[0,quality==='minor'?3:4,7].map(x=>48+root+x);
  for(const tick of [0,8]) events.push({startTick:bar*16+tick,durationTick:7,midi:36+root,instrument:'soft',gain:.075});
  const ticks=value.rhythm==='quarters'?[0,4,8,12]:value.rhythm==='offbeat'?[2,6,10,14]:[0,2,4,6,8,10,12,14];
  for(const [i,tick] of ticks.entries()) for(const midi of value.rhythm==='arpeggio'?[chord[i%3]]:chord) {
   events.push({startTick:bar*16+tick,durationTick:value.rhythm==='quarters'?3:2,midi,instrument,gain:value.genre==='rock'?.035:.045});
  }
 }
 return events;
}
