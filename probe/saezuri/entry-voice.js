import {parseEditCommand,EDIT_WORDS} from './edit-voice.js?v=v0.1.0-20261010113359-a5daded';
const normalize=text=>String(text).normalize('NFKC').replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const pitches={ど:60,れ:62,み:64,ふぁ:65,そ:67,ら:69,し:71};
const lengths={'1':4,'一':4,'いち':4,'2':8,'二':8,'に':8,'4':16,'四':16,'よん':16,'し':16,'はんぱく':2,'半拍':2,'はんぶん':2,'半分':2};
export function parseEntryCommand(raw) {
 const text=normalize(raw);
 if(text==='すたーと') return 'preview';
 const position=/^(1|2|3|4|一|二|三|四|いち|に|さん|よん)(?:拍|はく)(?:半|はん)$/.exec(text);
 if(position) return {type:'position',beat:({'一':1,'二':2,'三':3,'四':4,'いち':1,'に':2,'さん':3,'よん':4})[position[1]]??Number(position[1]),half:true};
 const input=/^(うえうえ|上上|うえ|上)?(ど|れ|み|ふぁ|そ|ら|し|やすみ|休み)(.+)$/.exec(text);
 if(input) {
  const [,upper,pitch,length]=input,durationTick=lengths[length];
  if(!durationTick) return null;
  if(pitch==='やすみ'||pitch==='休み') return upper?null:{type:'note',midi:null,durationTick};
  const midi=pitches[pitch]+(upper?(upper==='うえうえ'||upper==='上上'?24:12):0);
  return midi>84?null:{type:'note',midi,durationTick};
 }
 return parseEditCommand(raw);
}
const pitchWords=['ド','レ','ミ','ファ','ソ','ラ','シ'];
const lengthWords=['一','二','四','半 拍','半分'];
export const ENTRY_WORDS=[...EDIT_WORDS,'スタート',
 ...['', '上 '].flatMap(prefix=>pitchWords.flatMap(p=>lengthWords.map(l=>`${prefix}${p} ${l}`))),
 ...lengthWords.map(l=>`上 上 ド ${l}`),...lengthWords.map(l=>`休み ${l}`),
 ...['一','二','三','四'].map(n=>`${n} 拍 半`)];
