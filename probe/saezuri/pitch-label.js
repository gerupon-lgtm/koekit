const names=['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'];
// Pitch numbers remain unchanged; only labels shown to the player use solfege.
export const pitchLabel=midi=>midi==null?'休み':names[((midi%12)+12)%12];
export function registerLabel(midi){
 if(midi==null)return '休み';
 const octave=Math.floor(midi/12)-5;
 return `${octave===0?'ふつうの':octave>0?'うえの'.repeat(octave):'したの'.repeat(-octave)}${pitchLabel(midi)}`;
}
