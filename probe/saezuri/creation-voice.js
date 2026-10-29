import {EDIT_WORDS,parseEditCommand} from './edit-voice.js?v=v0.1.0-20261029232900-c4e5b66';
import {ENTRY_WORDS,parseEntryCommand} from './entry-voice.js?v=v0.1.0-20261029232900-c4e5b66';
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
const backingPhrases=[...['伴奏','ばんそう','伴奏 を つける'].map(word=>({word,command:{type:'backing-navigation',action:'open'}})),{word:'進行 の おすすめ',command:{type:'backing-navigation',action:'suggestions'}}];
const backingChoices=IMAGE_VOICE_CHOICES.filter(([field])=>field==='type').flatMap(([,genre,words])=>words.map(word=>({word,command:{type:'backing-genre',genre}})));
backingChoices.push({word:'はずむ 八 ビート',command:{type:'backing-rhythm',rhythm:'tutorial'}});
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
export function parseCreationCommand(raw,{manual=false,image=false,backing=false}={}){
 const word=normalize(raw),phrase=[...transportPhrases,...backingPhrases,...(image?imagePhrases:[]),...(backing?backingChoices:[])].find(p=>normalize(p.word)===word);
 return phrase?{...phrase.command}:manual?parseEntryCommand(raw):parseEditCommand(raw);
}
// Stable profiles avoid restarting the recognizer on every render or selection.
const profiles=new Map();
for(const manual of [false,true])for(const image of [false,true])for(const backing of [false,true])profiles.set(`${manual}:${image}:${backing}`,{
 words:[...new Set([...(manual?ENTRY_WORDS:EDIT_WORDS),...RECORD_VOICE_WORDS,...backingPhrases.map(p=>p.word),...(backing?backingChoices.map(p=>p.word):[]),...(image?IMAGE_VOICE_WORDS:[])])],
 parse:raw=>parseCreationCommand(raw,{manual,image,backing}),
});
export const creationVoiceProfile=(pattern,{backing=false}={})=>profiles.get(`${pattern?.source==='manual'}:${!!pattern?.accompaniment?.imageChoice}:${backing}`);

const repeatWords=['もういちど','もう一度','もういっかい','もう一回'];
const tutorialPhrases=[...repeatWords.map(word=>[word,'replay']),['つぎへ','next'],['次へ','next'],['つくってみよう','next'],['おてほん','model'],['お手本','model'],['とじる','close'],['閉じる','close']];
export const TUTORIAL_VOICE_PROFILE={words:[...new Set([...ENTRY_WORDS,...backingPhrases.map(p=>p.word),...['次 へ','つくっ て みよう','お手本','伴奏 を つける','閉じる','もう 一度','もう 一回']])],parse:raw=>{const phrase=tutorialPhrases.find(p=>normalize(p[0])===normalize(raw));return phrase?{type:'tutorial',action:phrase[1]}:parseCreationCommand(raw,{manual:true});}};
export const TUTORIAL_PLAY_PROFILE={words:[...STOP_VOICE_PROFILE.words,'とじる','閉じる','もう 一度','もう 一回','きく','聴く','聞く'],parse:raw=>repeatWords.some(w=>normalize(w)===normalize(raw))||parseEditCommand(raw)==='preview'?{type:'tutorial',action:'replay'}:['とじる','閉じる'].some(w=>normalize(w)===normalize(raw))?{type:'tutorial',action:'close'}:STOP_VOICE_PROFILE.parse(raw)};
export const TUTORIAL_BACKING_VOICE_PROFILE={words:[...TUTORIAL_VOICE_PROFILE.words,...backingChoices.map(p=>p.word)],parse:raw=>{const phrase=backingChoices.find(p=>normalize(p.word)===normalize(raw));return phrase?{...phrase.command}:TUTORIAL_VOICE_PROFILE.parse(raw);}};

const choicePhrases=[...['とじる','閉じる'].map(word=>({word,command:{type:'progression-choice',action:'close'}})),...['ストップ','とめる','停止'].map(word=>({word,command:{type:'progression-choice',action:'stop'}}))];
for(const [index,forms] of [['1','一','いち'],['2','二','に'],['3','三','さん'],['4','四','よん']].entries())for(const number of forms)for(const counter of ['番','ばん'])for(const [verb,action] of [['聴く','listen'],['きく','listen'],['使う','use'],['つかう','use']])choicePhrases.push({word:`${number} ${counter} を ${verb}`,command:{type:'progression-choice',action,index}});
const choiceProfile=phrases=>({words:phrases.filter(p=>p.command.index===undefined||/^[一二三四] 番/.test(p.word)).map(p=>p.word),parse:raw=>{const p=phrases.find(p=>normalize(p.word)===normalize(raw));return p?{...p.command}:null;}});
export const PROGRESSION_VOICE_PROFILE=choiceProfile(choicePhrases);
export const PROGRESSION_PLAY_PROFILE=choiceProfile(choicePhrases.filter(p=>['close','stop'].includes(p.command.action)));
