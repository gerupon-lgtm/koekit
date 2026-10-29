import {chordTones} from '../../saezuri/music/catalog.js?v=v0.1.0-20261029133022-8d1641e';

export const CHORD_SLOT_COUNT=9;
const storageKey='saezuri.chordSlots.v1';
const clean=values=>Array.from({length:CHORD_SLOT_COUNT},(_,i)=>{
 const chord=Array.isArray(values)?values[i]:null;
 return chordTones(chord).code?null:{root:chord.root,quality:chord.quality,bass:chord.bass};
});

// Personal shortcuts stay on this device, outside song drafts and undo history.
export function readChordSlots(storage){
 try{return clean(JSON.parse((storage??globalThis.localStorage).getItem(storageKey)));}
 catch{return clean(null);}
}
export function writeChordSlots(slots,storage){
 try{(storage??globalThis.localStorage).setItem(storageKey,JSON.stringify(clean(slots)));return true;}
 catch{return false;}
}
