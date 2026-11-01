// Stable, straight eighth-note backing sets. One tick is a sixteenth note.
export const EIGHT_BEAT_RHYTHMS=[{id:'eight-basic',label:'8ビート・基本'},{id:'eight-light',label:'8ビート・軽め'},{id:'eight-motion',label:'8ビート・動きのある'}];
const row=(chords,bass,kicks,voicing='block',gate=2,level=1)=>({chords,bass,kicks,voicing,gate,level});
const recipes={
 nursery:[row([0,4,8,12],[0,8],[0,8]),row([0,8],[0,8],[0,8],'block',7,.7),row([0,6,8,14],[0,4,8,12],[0,6,8],'broken')],
 pop:[row([0,6,8,14],[0,2,4,6,8,10,12,14],[0,6,8]),row([0,8],[0,8],[0,8],'block',7,.7),row([0,2,6,8,10,14],[0,4,6,8,12,14],[0,6,8,10],'broken')],
 rock:[row([0,2,4,6,8,10,12,14],[0,2,4,6,8,10,12,14],[0,8],'power'),row([0,4,8,12],[0,4,8,12],[0,8],'power',3,.7),row([0,2,6,8,10,14],[0,2,6,8,10,14],[0,6,8,14],'power')],
 ballad:[row([0,2,4,6,8,10,12,14],[0,8],[0,8],'rising',3,.8),row([0],[0,8],[0,8],'block',15,.65),row([0,4,6,8,12,14],[0,6,8,14],[0,6,8],'broken',3,.8)],
};
const sounds={nursery:{chord:'piano',bass:'soft',drums:'acoustic'},pop:{chord:'fm-piano',bass:'synth-bass',drums:'electronic'},rock:{chord:'lead',bass:'synth-bass',drums:'acoustic'},ballad:{chord:'piano',bass:'sine',drums:'acoustic'}};
export function eightBeatSet(genre,rhythm){const index=EIGHT_BEAT_RHYTHMS.findIndex(r=>r.id===rhythm);return recipes[genre]?.[index]?{...structuredClone(recipes[genre][index]),sounds:{...sounds[genre]}}:null;}
// The complete old harmony recipe and explicit notes/blank intervals stay intact.
export function applyEightBeatSet(pattern,genre,rhythm){
 const set=eightBeatSet(genre,rhythm);if(!set)throw new Error('EIGHT_BEAT_INVALID');
 const value=structuredClone(pattern.accompaniment??{progression:'home'});
 Object.assign(value,{enabled:true,genre,rhythm,drumPattern:'auto',manualSettings:{...value.manualSettings,enabled:true,genre:true,rhythm:true}});delete value.drumAccent;
 if(value.imageChoice)value.imageChoice.type=genre;
 if(value.sounds?.drums==='none')value.sounds.drums=set.sounds.drums;
 return {...structuredClone(pattern),accompaniment:value};
}
