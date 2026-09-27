const aliases = {
  up:['たかく','高く','あげる','上げる','はんおんたかく','半音高く','はんおんあげる','半音上げる'],
  down:['ひくく','低く','さげる','下げる','はんおんひくく','半音低く','はんおんさげる','半音下げる'],
  next:['つぎ','次'], previous:['まえ','前'],
  preview:['きく','聴く','聞く'], confirm:['おっけー','おーけー','決定','けってい'],
  undo:['もどす','戻す'], cancel:['とりけし','取り消し'],
};
const normalize = text => String(text).replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).toLowerCase();
for (const direction of ['up','down']) for (const word of aliases[direction].slice(0,4)) {
  aliases[direction].push(`半音${word}`,`はんおん${word}`);
}
export const EDIT_WORDS = Object.values(aliases).flat();
export const parseEditCommand = raw => Object.keys(aliases).find(key=>aliases[key].some(word=>normalize(word)===normalize(raw))) ?? null;

// Gate the shared local recognizer by the editing interval. Disposing an
// unfinished start prevents a late model/microphone grant from opening capture.
export class EditVoice {
  constructor({createInput,onCommand,onStatus}) {
    Object.assign(this,{createInput,onCommand,onStatus});
    this.input=null; this.active=false; this.loading=false; this.epoch=0;
  }
  setActive(active, {release=false}={}) {
    if (!active) {
      const wasLoading=this.loading;
      this.active=false; this.loading=false; this.epoch++;
      this.detach?.(); this.detach=null;
      this.input?.stop();
      if (release || wasLoading) { this.input?.dispose(); this.input=null; }
      this.onStatus?.('paused');
      return;
    }
    if (this.active) return;
    this.active=true; this.loading=true;
    const epoch=++this.epoch;
    const input=this.input ??= this.createInput();
    const current=()=>this.active && this.epoch===epoch && this.input===input;
    const result=raw=>{ if(current()) { const command=parseEditCommand(raw); if(command) this.onCommand(command); } };
    const fail=()=>{ if(current()) {this.setActive(false,{release:true}); this.onStatus?.('error');} };
    const end=()=>{
      if(!current()) return;
      this.setActive(false);
      const stoppedEpoch=this.epoch;
      queueMicrotask(()=>{if(this.epoch===stoppedEpoch) this.setActive(true);});
    };
    input.on('result',result); input.on('error',fail); input.on('end',end);
    this.detach=()=>{input.off('result',result); input.off('error',fail); input.off('end',end);};
    this.onStatus?.('loading');
    Promise.resolve().then(()=>current() && input.start(EDIT_WORDS)).then(()=>{
      if(current()) {this.loading=false;this.onStatus?.('listening');}
    }).catch(fail);
  }
}
