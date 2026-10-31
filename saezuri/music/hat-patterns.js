// Independent hat timing and accent choices. Legacy combined ids remain readable.
const strong=.06,weak=.008,even=.02;
export const HAT_RHYTHMS=[
 {id:'hat-half-on',label:'二分音符・表（1・3拍）',summary:'二分表',ticks:[0,8]},
 {id:'hat-half-off',label:'二分音符・裏（2・4拍）',summary:'二分裏',ticks:[4,12]},
 {id:'hat-quarter-on',label:'四分音符・表（毎拍）',summary:'四分表',ticks:[0,4,8,12]},
 {id:'hat-quarter-off',label:'四分音符・裏（毎拍の裏）',summary:'四分裏',ticks:[2,6,10,14]},
 {id:'hat-eighths',label:'八分音符（1拍に2回）',summary:'八分',ticks:[0,2,4,6,8,10,12,14]},
 {id:'hat-sixteenths',label:'十六分音符（1拍に4回）',summary:'十六分',ticks:Array.from({length:16},(_,i)=>i)},
];
const accents=[
 {id:'none',label:'均等（アクセントなし）',summary:'均等',beats:[]},
 ...[1,2,3,4].map(beat=>({id:`beat-${beat}`,label:`${beat}拍目を強く`,summary:`${beat}拍強`,beats:[beat]})),
 {id:'beats-13',label:'1・3拍目を強く',summary:'1・3拍強',beats:[1,3]},
 {id:'beats-24',label:'2・4拍目を強く',summary:'2・4拍強',beats:[2,4]},
];
const accentTicks=(rhythm,accent)=>accent.beats.map(beat=>(beat-1)*4+rhythm.ticks[0]%4);
export function hatAccentOptions(rhythmId){
 const rhythm=HAT_RHYTHMS.find(r=>r.id===rhythmId);if(!rhythm)return [];
 return accents.filter(a=>!a.beats.length||a.beats.length<rhythm.ticks.length&&accentTicks(rhythm,a).every(t=>rhythm.ticks.includes(t)))
  .map(a=>({...a,label:rhythm.ticks[0]%4?a.label.replace('拍目','拍目の裏'):a.label}));
}
function buildHat(rhythmId,accentId){
 const rhythm=HAT_RHYTHMS.find(r=>r.id===rhythmId),accent=hatAccentOptions(rhythmId).find(a=>a.id===accentId);if(!rhythm||!accent)return null;
 const hits=accentTicks(rhythm,accent);return {rhythm:rhythmId,accent:accentId,ticks:[...rhythm.ticks],gains:rhythm.ticks.map(t=>accentId==='none'?even:hits.includes(t)?strong:weak)};
}
const legacy=[
 ['hat-half-front','ハット2拍ずつ・前を強く','hat-half-on','beat-1'],
 ['hat-half-back','ハット2拍ずつ・後を強く','hat-half-on','beat-3'],
 ['hat-backbeat','ハット2・4拍（裏打ち）','hat-half-off','none'],
 ['hat-backbeat-front','ハット裏打ち・2拍を強く','hat-half-off','beat-2'],
 ['hat-backbeat-back','ハット裏打ち・4拍を強く','hat-half-off','beat-4'],
 ['hat-quarters-first','ハット毎拍・1拍を強く','hat-quarter-on','beat-1'],
 ['hat-quarters-third','ハット毎拍・3拍を強く','hat-quarter-on','beat-3'],
 ['hat-quarters-front','ハット毎拍・1・3拍を強く','hat-quarter-on','beats-13'],
 ['hat-quarters-back','ハット毎拍・2・4拍を強く','hat-quarter-on','beats-24'],
];
export const DRUM_PATTERNS=[{id:'auto',label:'おまかせ'},{id:'none',label:'打楽器なし'},
 ...legacy.map(([id,label,rhythm,accent])=>({id,label,...buildHat(rhythm,accent)})),
 ...HAT_RHYTHMS.map(r=>({id:r.id,label:r.label,...buildHat(r.id,'none')})),
];
export const DRUM_CHOICES=[...DRUM_PATTERNS.slice(0,2),...HAT_RHYTHMS];
export function resolveHatPattern(value){
 const entry=DRUM_PATTERNS.find(p=>p.id===value?.drumPattern&&p.ticks);return entry?buildHat(entry.rhythm,value.drumAccent===undefined?entry.accent:value.drumAccent):null;
}
