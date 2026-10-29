import {tutorialPattern} from './tutorial-data.js?v=v0.1.0-20261029225948-ef4bb5a';
const names={60:'ド',62:'レ',64:'ミ',65:'ファ',67:'ソ',69:'ラ'};
const lengths={2:'はんぱく',4:'1ぱく',6:'1ぱく半',8:'2はく'};
export const LESSON_TITLES=['完成形を 聴こう','2つの音を 直そう','1小節を つくろう','2小節に のばそう','3小節目を つくろう','音を 小節の先へ','4小節を しあげよう','伴奏を つけよう'];
export const LESSON_RANGES=[[0,64],[0,8],[0,16],[0,32],[32,64],[32,64],[0,64],[0,64]];
export const lessonFingerprint=pattern=>JSON.stringify([pattern?.notes?.map(n=>[n.startTick,n.durationTick,n.midi]),pattern?.accompaniment??null]);
const same=(a,b)=>a&&b&&a.startTick===b.startTick&&a.durationTick===b.durationTick&&a.midi===b.midi;
const result=(kind,action,text='',extra={})=>({kind,action,text,...extra});
const recover=editor=>result('recover',editor.pending?'「とりけす」で 直そう':'「もどす」で 直そう','今の音は残しています。おてほんと違うところを戻してみよう。',{target:editor.pending?'#learning-cancel':'#capture-edit-undo'});
const listen=()=>result('listen','「聴く」で たしかめよう','カウントのあとに、いま作った音が鳴ります。',{target:'#preview'});
const confirm=()=>result('confirm','「オッケー」で 決めよう','点線の音は、まだ候補です。',{target:'#capture-edit-confirm'});
const done=()=>result('done','このれんしゅうは できた！','もう一度聴いても大丈夫。下のボタンで、つぎのれんしゅうへ進みます。',{done:true,target:'#learning-next'});
function input(editor,expected){
 if(editor.entry){if(editor.entry.proposal.code||editor.entry.input.midi!==expected.midi||editor.entry.input.durationTick!==expected.durationTick||expected.midi!==null&&!editor.previewPattern.notes.some(n=>same(n,expected)))return recover(editor);return {...confirm(),mode:'input'};}
 if(editor.pending)return recover(editor);
 if(editor.cursor!==expected.startTick)return result('position','入力する場所へ もどろう','ボタンを押すと、つぎの音を置く場所へ移動します。',{target:'#learning-position',tick:expected.startTick,mode:'input'});
 if(editor.inputDuration!==expected.durationTick)return result('length',`長さを「${lengths[expected.durationTick]}」に`, '長さをえらんでから、音を押そう。',{target:`[data-duration="${expected.durationTick/4}"]`,expected,mode:'input'});
 const pitch=expected.midi===null?7:[60,62,64,65,67,69,71].indexOf(expected.midi);
 return result('input',`「${names[expected.midi]??'やすみ'}」を 押そう`,`${lengths[expected.durationTick]}で置きます。声でも「${names[expected.midi]??'やすみ'} ${lengths[expected.durationTick]}」。`,{target:`[data-pitch="${pitch}"]`,expected,mode:'input'});
}
export function lessonGuide(editor,{stage=0,heard=false,modelHeard=false,heardOriginal=false,backingMode=false,suggestionsOpen=false}={}){
 if(stage===0)return modelHeard?{...done(),action:'この曲を つくってみよう！'}:result('model','まずは 完成形を 聴こう','4小節の曲を、少しずつ作っていきます。',{target:'#learning-model'});
 if([2,3,4].includes(stage)&&!modelHeard)return result('model','おてほんを 聴こう','これから作るところを、先に聴いてみよう。',{target:'#learning-model'});
 const target=tutorialPattern().notes,base=editor.pattern?.notes??[],notes=editor.previewPattern?.notes??[];
 if(stage===1){
  if(editor.pending&&!editor.entry&&notes.length<base.length&&notes.every((n,i)=>same(n,{...target[i],midi:i?64:60})))return confirm();
  if(base.length<2){const expected={...target[base.length],midi:base.length?64:60};if(base.some((n,i)=>!same(n,{...target[i],midi:i?64:60})))return recover(editor);return input(editor,expected);}
  if(notes.length!==2||!same(notes[1],target[1])||notes[0].startTick!==0||notes[0].durationTick!==4||![60,61,62].includes(notes[0].midi))return recover(editor);
  if(!heardOriginal&&base[0].midi===60&&!editor.pending)return listen();
  if(editor.selectedNoteId!==notes[0].id)return result('select',`1ばんの「${names[notes[0].midi]??'ド♯'}」を えらぼう`,'青い枠の音を押すと、その音が鳴ります。',{target:'#learning-melody [data-note-id]',noteId:notes[0].id,mode:'edit'});
  if(notes[0].midi!==62)return result('pitch',notes[0].midi===61?'もう1回 「たかく」':'「たかく」を 2回','ドをレに変えます。まだ仮の変更です。',{target:'#capture-pitch-up',mode:'edit'});
  if(!heard)return listen();if(editor.pending)return confirm();return done();
 }
 const count={2:4,3:7,4:12,5:12,6:15,7:15}[stage];
 const expected=structuredClone(target.slice(0,count));if(stage===4)expected[11].durationTick=2;
 // The length lesson deliberately starts with a shorter, confirmed final note.
 const shortIndex=stage===3?6:stage===5?11:-1,shortDuration=stage===3?4:2;
 const allowed=(n,i)=>same(n,expected[i])||i===shortIndex&&same(n,{...expected[i],durationTick:shortDuration});
 if(editor.pending&&!editor.entry&&notes.length<=count&&notes.every(allowed)&&(notes.length<base.length||!base.every(allowed)))return {...confirm(),text:'戻した音を、オッケーで決めよう。'};
 for(let i=0;i<base.length;i++)if(!allowed(base[i],i))return recover(editor);
 if(base.length>count)return recover(editor);
 if(stage===7){
  if(base.length!==15)return recover(editor);
  if(!editor.previewPattern?.accompaniment?.enabled){
   if(!backingMode)return result('backing-mode','「伴奏」を 押そう','本番と同じ画面で、伴奏をえらびます。',{target:'[data-mode="backing"]'});
   if(!suggestionsOpen)return result('backing-suggestions','ジャンルとリズムを えらぼう','おてほんは「ポップ」「はずむ8ビート」。ほかの伴奏でもOK。「進行のおすすめ」で聴き比べよう。',{target:'#image-suggest'});
   return result('backing-choice','C → F → G → C を ためそう','「聴く」でたしかめて、「この候補をつかう」を押そう。ほかの候補でも大丈夫。',{target:'[data-progression-use="home"]'});
  }
  if(!heard)return listen();if(editor.pending)return confirm();return done();
 }
 if(base.length<count){
  let next=expected[base.length];if(stage===3&&base.length===6)next={...next,durationTick:4};
  if(stage===4&&base.length===8&&!(editor.hasRest&&editor.cursor>=38))next={midi:null,startTick:36,durationTick:2};
  return input(editor,next);
 }
 if(shortIndex>=0){
  if(editor.selectedNoteId!==base[shortIndex].id)return result('select',`さいごの「${names[base[shortIndex].midi]}」を えらぼう`,'青い枠の音を押してから、長さを直します。',{target:'#learning-melody [data-note-id]',noteId:base[shortIndex].id,mode:'edit'});
  if(notes[shortIndex]?.durationTick!==expected[shortIndex].durationTick)return result('edit-length',`長さを「${lengths[expected[shortIndex].durationTick]}」に`,stage===5?'小節をこえて、同じ音が続きます。':'最後のレを長くします。',{target:`[data-lesson-length="${expected[shortIndex].durationTick}"]`,durationTick:expected[shortIndex].durationTick,mode:'edit'});
 }
 if(notes.some((n,i)=>!same(n,expected[i])))return recover(editor);
 if(!heard)return listen();if(editor.pending)return confirm();return done();
}
