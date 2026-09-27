const letters = ['C','D','E','F','G','A','B'];
const naturals = [0,2,4,5,7,9,11];
const sharpOrder = [3,0,4,1,5,2,6], flatOrder = [6,2,5,1,4,0,3];
const majorNames = ['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];
const minorNames = ['A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯','G♯','D♯','A♯'];
const mod = n => (n % 12 + 12) % 12;

export function signature(fifths) {
  if (!Number.isInteger(fifths) || Math.abs(fifths)>7) throw new Error('KEY_SIGNATURE');
  const alterations = new Array(7).fill(0);
  for (const letter of (fifths<0?flatOrder:sharpOrder).slice(0,Math.abs(fifths))) alterations[letter]=Math.sign(fifths);
  const count = fifths===0?'調号なし':`${fifths>0?'♯':'♭'}${Math.abs(fifths)}`;
  return { fifths, alterations, tonic:mod(fifths*7), label:`${majorNames[fifths+7]}長調 / ${minorNames[fifths+7]}短調（${count}）` };
}

// A transparent probe heuristic, not a claim of musical key identification:
// prefer duration coverage, then tonic/final-note support; avoid unnecessary
// accidentals. Relative major/minor share one signature and stay undecided.
export function inferSignature(notes) {
  const weights=new Array(12).fill(0);
  const pitched=notes.filter(n=>Number.isInteger(n.midi)&&n.durationTick>0);
  for(const note of pitched)weights[mod(note.midi)]+=note.durationTick;
  const total=weights.reduce((a,b)=>a+b,0);
  if(weights.filter(x=>x>0).length<3)return {fifths:0,estimated:false,alternatives:[]};
  const last=pitched.reduce((a,b)=>!a || b.startTick+b.durationTick>a.startTick+a.durationTick?b:a,null);
  const ranked=Array.from({length:15},(_,i)=>{
    const fifths=i-7,key=signature(fifths),relative=mod(key.tonic+9);
    const coverage=naturals.reduce((sum,pc,letter)=>sum+weights[mod(pc+key.alterations[letter])],0)/total;
    const tonicWeight=(weights[key.tonic]+weights[relative])/total;
    const ending=[key.tonic,relative].includes(mod(last.midi))?.15:0;
    return {fifths,coverage,score:coverage*10+tonicWeight*.3+ending-Math.abs(fifths)*.02};
  }).sort((a,b)=>b.score-a.score || Math.abs(a.fifths)-Math.abs(b.fifths) || b.fifths-a.fifths);
  if(ranked[0].coverage<.8)return {fifths:0,estimated:false,alternatives:[]};
  return {fifths:ranked[0].fifths,estimated:true,alternatives:ranked.slice(1).filter(k=>ranked[0].score-k.score<.5).map(k=>k.fifths)};
}

export function spellPitch(midi, fifths=0) {
  const key=signature(fifths), candidates=[];
  for(let letter=0;letter<7;letter++)for(const accidental of [-1,0,1]){
    if(mod(naturals[letter]+accidental)!==mod(midi))continue;
    const octave=(midi-naturals[letter]-accidental)/12-1;
    const preference=accidental!==0 && Math.sign(accidental)!==(fifths<0?-1:1)?.01:0;
    candidates.push({letter,octave,accidental,step:octave*7+letter,
      name:`${letters[letter]}${accidental<0?'♭':accidental>0?'♯':''}${octave}`,
      cost:Math.abs(accidental-key.alterations[letter])*4+Math.abs(accidental)*.05+preference});
  }
  candidates.sort((a,b)=>a.cost-b.cost);
  const {cost,...pitch}=candidates[0];
  return pitch;
}
