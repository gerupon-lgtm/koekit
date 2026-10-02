import {validateNotes} from '../../saezuri/document.js?v=v0.1.0-20261002215245-e39d004';
const names=['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'];
export function pianoKeys(octave=0){
 if(![-1,0,1].includes(octave))throw new Error('KEYBOARD_OCTAVE');
 let white=0;
 return Array.from({length:16},(_,i)=>{
  const base=57+i,black=[1,3,6,8,10].includes(base%12);
  const midi=base+12*octave;
  const key={midi,base,label:names[base%12],black,position:white,reference:midi===60};
  if(!black)white++;return key;
 });
}
// One monophonic take overlays a fixed phrase. Times are absolute sixteenth ticks.
export class TapRecording {
 constructor(pattern){
  const invalid=validateNotes(pattern);if(invalid)throw new Error(invalid.code);
  this.pattern={...structuredClone(pattern),source:'tap',gridStep:1};this.totalTicks=pattern.bars*16;this.held=null;this.events=0;this.sequence=0;
  this.ids=new Set(pattern.notes.map(n=>n.id));
 }
 press(midi,tick){
  if(!Number.isInteger(midi)||midi<0||midi>127||!Number.isFinite(tick)||tick<0)throw new Error('TAP_INPUT');
  this.release(tick);this.held={midi,start:Math.round(tick)};
 }
 release(tick){
  if(!this.held)return;
  if(!Number.isFinite(tick)||tick<0)throw new Error('TAP_INPUT');
  const {midi,start}=this.held;this.held=null;
  const end=Math.max(start+1,Math.round(tick));
  // The last phrase-length of a very long hold completely supersedes earlier cycles.
  for(let cursor=Math.max(start,end-this.totalTicks);cursor<end;){
   const position=cursor%this.totalTicks,length=Math.min(end-cursor,this.totalTicks-position);
   this._overlay(midi,position,length);cursor+=length;
  }
  this.events++;
 }
 _overlay(midi,startTick,durationTick){
  const end=startTick+durationTick,notes=[];
  for(const old of this.pattern.notes){
   const oldEnd=old.startTick+old.durationTick;
   if(oldEnd<=startTick||old.startTick>=end){notes.push(old);continue;}
   // Same onset replaces the complete old note, including its old tail.
   if(old.startTick===startTick)continue;
   if(old.startTick<startTick)notes.push({...old,durationTick:startTick-old.startTick,completedRanges:[]});
   if(oldEnd>end)notes.push({...old,id:this._id('tap-tail'),startTick:end,durationTick:oldEnd-end,completedRanges:[]});
  }
  notes.push({id:this._id('tap'),midi,startTick,durationTick,origin:'input',completedRanges:[]});
  this.pattern.notes=notes.sort((a,b)=>a.startTick-b.startTick);
 }
 _id(prefix){let id;do{id=`${prefix}-${++this.sequence}`;}while(this.ids.has(id));this.ids.add(id);return id;}
 preview(tick){
  const copy=new TapRecording(this.pattern);copy.sequence=this.sequence;copy.held=this.held&&{...this.held};copy.release(tick);return copy.pattern;
 }
}
