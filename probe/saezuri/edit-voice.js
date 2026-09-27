const aliases = {
  up:['たかく','高く','あげる','上げる','はんおんたかく','半音高く','はんおんあげる','半音上げる'],
  down:['ひくく','低く','さげる','下げる','はんおんひくく','半音低く','はんおんさげる','半音下げる'],
  next:['つぎ','次'], previous:['まえ','前'],
  first:['さいしょ','最初'], last:['さいご','最後'],
  preview:['きく','聴く','聞く'], confirm:['オッケー','オーケー','おっけー','おーけー','決定','けってい'],
  undo:['もどす','戻す'], cancel:['とりけし','取り消し'],
  delete:['けす','消す'],
};
const normalize = text => String(text).normalize('NFKC').replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).toLowerCase();
const digits=['','一','二','三','四','五','六','七','八','九'];
const readings=['','いち','に','さん','よん','ご','ろく','なな','はち','きゅう'];
const numberedGrammar=[];
for(let number=1;number<=64;number++) {
  const tens=Math.floor(number/10), ones=number%10;
  const kanji=(tens?(tens>1?digits[tens]:'')+'十':'')+digits[ones];
  const kana=(tens?(tens>1?readings[tens]:'')+'じゅう':'')+readings[ones];
  aliases[`select:${number}`]=[`${number}番`,`${number}番目`,`${number}ばん`,`${number}ばんめ`,`${kanji}番`,`${kanji}番目`,`${kana}ばん`,`${kana}ばんめ`];
  aliases[`delete:${number}`]=aliases[`select:${number}`].flatMap(form=>aliases.delete.map(verb=>form+verb));
  // The shipped Japanese model has numeral and 番 tokens, not joined "10番".
  // This follows the existing delivery/commands.js grammar convention.
  const tokens=[tens>1?digits[tens]:'',tens?'十':'',digits[ones]].filter(Boolean).join(' ');
  numberedGrammar.push(`${tokens} 番`,`${tokens} 番 目`);
  numberedGrammar.push(`${tokens} 番 消す`,`${tokens} 番 目 消す`);
}
for (const direction of ['up','down']) for (const word of aliases[direction].slice(0,4)) {
  aliases[direction].push(`半音${word}`,`はんおん${word}`);
}
export const EDIT_WORDS = [...Object.entries(aliases).filter(([key])=>!key.includes(':')).flatMap(([,forms])=>forms),...numberedGrammar];
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
