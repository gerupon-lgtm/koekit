import {EDIT_WORDS,parseEditCommand} from './edit-voice.js?v=v0.1.0-20261002022700-637b77f';
import {ENTRY_WORDS,parseEntryCommand} from './entry-voice.js?v=v0.1.0-20261002022700-637b77f';
const normalize=text=>String(text).normalize('NFKC').replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).toLowerCase();
// Exact phrases only. Never use a fragment such as 次 for regeneration.
export const IMAGE_VOICE_CHOICES=[
 ['type','nursery',['どうよう','童謡']],['type','pop',['ポップ']],['type','rock',['ロック']],['type','ballad',['バラード']],
 ['speed','slow',['ゆっくり']],['speed','normal',['ふつう','普通']],['speed','fast',['はやい','速い','早い']],
 ['mood','bright',['あかるい','明るい']],['mood','gentle',['やさしい','優しい']],
 ['mood','cool',['かっこいい','格好いい','格好 いい','カッコ いい']],['mood','sad',['かなしい','悲しい']],
];
const prefixes={type:['タイプ'],speed:['はやさ','速さ'],mood:['雰囲気']};
const imagePhrases=IMAGE_VOICE_CHOICES.flatMap(([field,value,words])=>words.flatMap(word=>[word,...prefixes[field].map(prefix=>`${prefix} ${word}`)]).map(word=>({word,command:{type:'image-choice',field,value}})));
imagePhrases.push(...['別 の パターン','べつ の パターン'].map(word=>({word,command:{type:'image-next'}})));
const transportPhrases=[
 {word:'スタート',command:{type:'loop-start'}},
 ...['ストップ','とめる','停止'].map(word=>({word,command:{type:'loop-stop'}})),
 ...['はなうた','鼻歌'].map(word=>({word,command:{type:'record-standby',mode:'humming'}})),
 ...['ろくおん','録音'].map(word=>({word,command:{type:'record-standby',mode:'tap'}})),
];
export const IMAGE_VOICE_WORDS=[...new Set(imagePhrases.map(p=>p.word))];
// Kana aliases remain parseable, but the shipped dictionary has 鼻歌/録音 tokens.
export const RECORD_VOICE_WORDS=transportPhrases.map(p=>p.word).filter(word=>!['はなうた','ろくおん'].includes(word));
export const STOP_VOICE_PROFILE={words:['ストップ','とめる','停止'],parse:raw=>{
 const phrase=transportPhrases.find(p=>p.command.type==='loop-stop'&&normalize(p.word)===normalize(raw));return phrase?{...phrase.command}:null;
}};
export const LOOP_VOICE_PROFILE={words:[...STOP_VOICE_PROFILE.words,'鼻歌','録音'],parse:raw=>{
 const phrase=transportPhrases.find(p=>['loop-stop','record-standby'].includes(p.command.type)&&normalize(p.word)===normalize(raw));return phrase?{...phrase.command}:null;
}};
export function parseCreationCommand(raw,{manual=false,image=false}={}){
 const word=normalize(raw),phrase=[...transportPhrases,...(image?imagePhrases:[])].find(p=>normalize(p.word)===word);
 return phrase?{...phrase.command}:manual?parseEntryCommand(raw):parseEditCommand(raw);
}
// Stable profiles avoid restarting the recognizer on every render or selection.
const profiles=new Map();
for(const manual of [false,true])for(const image of [false,true])profiles.set(`${manual}:${image}`,{
 words:[...new Set([...(manual?ENTRY_WORDS:EDIT_WORDS),...RECORD_VOICE_WORDS,...(image?IMAGE_VOICE_WORDS:[])])],
 parse:raw=>parseCreationCommand(raw,{manual,image}),
});
export const creationVoiceProfile=pattern=>profiles.get(`${pattern?.source==='manual'}:${!!pattern?.accompaniment?.imageChoice}`);
