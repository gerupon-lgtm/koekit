import {blankPattern} from './entry-session.js?v=v0.1.0-20261002214255-70753ad';
const make=(id,name,description,key,tempo,genre,rhythm,progression,notes)=>({id,name,description,tempo,pattern:{...blankPattern(key),accompaniment:{enabled:false,genre,rhythm,progression},notes:notes.map(([startTick,durationTick,midi],i)=>({id:`${id}-${i}`,startTick,durationTick,midi,origin:'manual',completedRanges:[]}))}});
// Original practice melodies. Public access always returns an independent copy.
const examples=[
 make('walk','ひなたの さんぽ','ゆったり7音。高さを変えてみよう。','C',120,'nursery','quarters','home',[[0,8,60],[8,8,64],[16,8,67],[24,8,64],[32,8,62],[40,8,65],[48,16,60]]),
 make('bounce','はずむ ステップ','短い音と休みで、リズムあそび。','C',120,'pop','offbeat','pop',[[0,4,60],[6,2,64],[8,4,67],[16,4,65],[22,2,64],[24,4,62],[32,4,64],[38,2,67],[40,4,69],[48,4,67],[54,2,62],[56,8,60]]),
 make('moon','つきの こもりうた','長い音をつなぐ、しずかなフレーズ。','Am',80,'ballad','arpeggio','home',[[0,12,69],[12,4,64],[16,8,65],[24,8,62],[32,12,64],[44,4,71],[48,16,69]]),
 make('call','こえの キャッチボール','同じ形をくり返す。後半を変えてみよう。','C',110,'rock','quarters','pop',[[0,4,67],[4,4,67],[8,8,64],[16,4,65],[20,4,64],[24,8,62],[32,4,67],[36,4,67],[40,8,69],[48,4,65],[52,4,62],[56,8,60]])
];
export const practicePhrases=()=>structuredClone(examples);
export const practicePhrase=id=>structuredClone(examples.find(p=>p.id===id)??null);
export function tutorialGuide(editor,heard=false){
 const notes=editor.previewPattern?.notes??[],base=editor.pattern?.notes??[];
 const first=notes[0],second=notes[1];
 const validFirst=n=>n&&n.startTick===0&&n.durationTick===4&&[60,61,62].includes(n.midi);
 const validSecond=n=>n&&n.startTick===4&&n.durationTick===4&&n.midi===64;
 if(notes.length>2||(first&&!validFirst(first))||(second&&!validSecond(second)))return {step:0,text:'「もどす」で戻して、ドとミを1拍ずつ置こう。',target:'#capture-edit-undo'};
 if(!base.length)return {step:1,text:editor.entry?'ドの候補が出たね。「オッケー」で置こう。':'高さは「ふつう」、長さは1拍。「ド」を押そう。',target:editor.entry?'#capture-edit-confirm':'[data-pitch="0"]',mode:'input'};
 if(base.length===1)return {step:2,text:editor.entry?'ミも「オッケー」で置こう。':'つぎは「ミ」を1拍で置こう。',target:editor.entry?'#capture-edit-confirm':'[data-pitch="2"]',mode:'input'};
 if(notes.length!==2||!validFirst(first)||!validSecond(second)||!validFirst(base[0])||!validSecond(base[1]))return {step:0,text:'「もどす」でドとミの形に戻そう。',target:'#capture-edit-undo'};
 if(editor.selectedNoteId!==first.id)return {step:3,text:'1ばんのカードを選ぼう。譜面の音を押してもいいよ。',target:'#capture-blocks button:first-child',mode:'edit'};
 if(first.midi!==62)return {step:4,text:first.midi===61?'もう一度「たかく」。ドがレになるよ。':'「音を直す」で「たかく」を2回。ドをレにしよう。',target:'#capture-pitch-up',mode:'edit'};
 if(!heard)return {step:5,text:'「聴く」で、変えた音の流れをたしかめよう。',target:'#preview',mode:'edit'};
 if(editor.pending)return {step:6,text:'よければ「オッケー」。変えた高さを決めよう。',target:'#capture-edit-confirm',mode:'edit'};
 return {step:7,text:'できた！ 音を置く・直す・聴く・決めるを体験したよ。',done:true};
}
