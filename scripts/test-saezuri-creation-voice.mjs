import test from 'node:test';import assert from 'node:assert/strict';
import {EDIT_WORDS,parseEditCommand} from '../probe/saezuri/edit-voice.js';
import {ENTRY_WORDS,parseEntryCommand} from '../probe/saezuri/entry-voice.js';
import {IMAGE_VOICE_CHOICES,IMAGE_VOICE_WORDS,RECORD_VOICE_WORDS,parseCreationCommand,creationVoiceProfile,LOOP_VOICE_PROFILE,STOP_VOICE_PROFILE} from '../probe/saezuri/creation-voice.js';
import {DEFAULT_IMAGE} from '../saezuri/music/image-arrangement.js';
test('every image word and category-qualified phrase selects exactly one field without colliding with existing commands',()=>{
 for(const [field,value,aliases] of IMAGE_VOICE_CHOICES)for(const alias of aliases){
  assert.deepEqual(parseCreationCommand(alias,{image:true}),{type:'image-choice',field,value});
  assert.deepEqual(parseCreationCommand(alias,{image:true,backing:true}),{type:'image-choice',field,value},'the image choice also owns its words while the backing tab is active');
  assert.equal(parseEditCommand(alias),null);assert.equal(parseEntryCommand(alias),null);
 }
 for(const word of IMAGE_VOICE_WORDS){assert.equal(parseEditCommand(word),null,word);assert.equal(parseEntryCommand(word),null,word);assert.ok(parseCreationCommand(word,{manual:true,image:true}),word);}
 assert.deepEqual(parseCreationCommand('雰囲気 カッコ いい',{image:true}),{type:'image-choice',field:'mood',value:'cool'});
 assert.deepEqual(parseCreationCommand('速さ ゆっくり',{image:true}),{type:'image-choice',field:'speed',value:'slow'});
});
test('loop grammar accepts recording and stop only; waiting and recording accept only stop',()=>{
 for(const word of [...EDIT_WORDS,...ENTRY_WORDS,...IMAGE_VOICE_WORDS]){
  assert.equal(LOOP_VOICE_PROFILE.parse(word),null,word);assert.equal(STOP_VOICE_PROFILE.parse(word),null,word);
 }
 for(const word of ['ストップ','とめる','停止']){
  assert.deepEqual(parseCreationCommand(word),{type:'loop-stop'});assert.deepEqual(LOOP_VOICE_PROFILE.parse(word),{type:'loop-stop'});assert.deepEqual(STOP_VOICE_PROFILE.parse(word),{type:'loop-stop'});
 }
 for(const word of ['ろくおん','録音','はなうた','鼻歌']){assert.equal(LOOP_VOICE_PROFILE.parse(word).type,'record-standby');assert.equal(STOP_VOICE_PROFILE.parse(word),null);}
 assert.deepEqual(LOOP_VOICE_PROFILE.words,['ストップ','とめる','停止','鼻歌','録音']);
 assert.equal(RECORD_VOICE_WORDS.includes('はなうた'),false);assert.equal(RECORD_VOICE_WORDS.includes('ろくおん'),false);
});
test('start changes its old audition meaning to loop; recording words arm modes and next keeps note navigation',()=>{
 assert.equal(parseEntryCommand('スタート'),'preview');
 for(const manual of [true,false])assert.deepEqual(parseCreationCommand('スタート',{manual}),{type:'loop-start'});
 assert.deepEqual(parseCreationCommand('ろくおん'),{type:'record-standby',mode:'tap'});
 assert.deepEqual(parseCreationCommand('鼻 歌'),{type:'record-standby',mode:'humming'});
 assert.deepEqual(parseCreationCommand('別のパターン',{image:true}),{type:'image-next'});
 assert.equal(parseCreationCommand('つぎ',{manual:true,image:true}),'next');assert.equal(parseCreationCommand('きく',{manual:true}),'preview');
 for(const word of RECORD_VOICE_WORDS.filter(word=>word!=='スタート')){assert.equal(parseEntryCommand(word),null);assert.equal(parseEditCommand(word),null);}
 for(const phrase of ['ロックにしよう','もっとはやく','別','パターン','ふんいき','録音 オッケー','スタートしない'])assert.equal(parseCreationCommand(phrase,{manual:true,image:true}),null,phrase);
});
test('free editing never accepts image words, preserves note/edit phrases, and profiles remain stable after recording changes source',()=>{
 for(const manual of [true,false])for(const word of IMAGE_VOICE_WORDS)assert.equal(parseCreationCommand(word,{manual}),null,word);
 for(const word of EDIT_WORDS)assert.equal(parseCreationCommand(word,{manual:true,image:true}),parseEditCommand(word));
 for(const word of ENTRY_WORDS.filter(word=>word!=='スタート'))assert.deepEqual(parseCreationCommand(word,{manual:true,image:true}),parseEntryCommand(word));
 const image={source:'manual',accompaniment:{imageChoice:{...DEFAULT_IMAGE}}};assert.equal(creationVoiceProfile(image),creationVoiceProfile(structuredClone(image)));
 const tapping={...image,source:'tap'};assert.notEqual(creationVoiceProfile(tapping),creationVoiceProfile(image));assert.deepEqual(creationVoiceProfile(tapping).parse('ロック'),{type:'image-choice',field:'type',value:'rock'});
 assert.equal(creationVoiceProfile({source:'manual'}).words.includes('ロック'),false);assert.equal(creationVoiceProfile(image).words.includes('ロック'),true);
});

test('tutorial navigation is bounded and keeps ordinary next and stop meanings',async()=>{
 const {TUTORIAL_VOICE_PROFILE:p,TUTORIAL_PLAY_PROFILE:playing}=await import('../probe/saezuri/creation-voice.js');
 for(const [word,action] of [['次 へ','next'],['お手本','model'],['閉じる','close']])assert.deepEqual(p.parse(word),{type:'tutorial',action});
 assert.equal(p.parse('つぎ'),'next');assert.deepEqual(p.parse('ミ 付 点 一'),{type:'note',midi:64,durationTick:6});
 assert.equal(playing.parse('オッケー'),null);assert.deepEqual(playing.parse('ストップ'),{type:'loop-stop'});
 assert.deepEqual(parseCreationCommand('伴奏 を つける',{manual:true}),{type:'backing-navigation',action:'open'});
});

 test('audition repeat aliases keep the visible target and remain excluded from loop and recording profiles',async()=>{
 const {TUTORIAL_VOICE_PROFILE:idle,TUTORIAL_PLAY_PROFILE:playing}=await import('../probe/saezuri/creation-voice.js');
 for(const text of ['もう 一度','もう 一回','もういちど','もういっかい']){assert.deepEqual(idle.parse(text),{type:'tutorial',action:'replay'});assert.deepEqual(playing.parse(text),{type:'tutorial',action:'replay'});assert.equal(STOP_VOICE_PROFILE.parse(text),null);assert.equal(LOOP_VOICE_PROFILE.parse(text),null);assert.equal(parseCreationCommand(text,{manual:true}),'preview');}
 assert.deepEqual(playing.parse('きく'),{type:'tutorial',action:'replay'});assert.equal(playing.parse('ド 一'),null);
 });

test('production and tutorial share backing navigation, and numbered candidate commands are confined to the common sheet',async()=>{
 const {TUTORIAL_VOICE_PROFILE:t,PROGRESSION_VOICE_PROFILE:p,PROGRESSION_PLAY_PROFILE:playing}=await import('../probe/saezuri/creation-voice.js');
 for(const word of ['伴奏','ばんそう','伴奏をつける']){const command={type:'backing-navigation',action:'open'};assert.deepEqual(parseCreationCommand(word),command);assert.deepEqual(t.parse(word),command);}
 assert.deepEqual(t.parse('進行 の おすすめ'),{type:'backing-navigation',action:'suggestions'});
 for(const [index,number] of ['いち','に','さん','よん'].entries()){
  assert.deepEqual(p.parse(number+'ばんをきく'),{type:'progression-choice',action:'listen',index});
  assert.deepEqual(p.parse(number+'ばんをつかう'),{type:'progression-choice',action:'use',index});
  assert.equal(playing.parse(number+'ばんをつかう'),null);assert.equal(parseCreationCommand(number+'ばんをつかう'),null);
 }
 assert.equal(p.parse('1ばん'),null);assert.equal(parseCreationCommand('1ばん'),'select:1');assert.equal(p.parse('オッケー'),null);
 assert.deepEqual(playing.parse('とじる'),{type:'progression-choice',action:'close'});assert.deepEqual(playing.parse('とめる'),{type:'progression-choice',action:'stop'});
});
test('genre and shared pop pattern phrases select the same backing controls only while the backing tab is active',async()=>{
 const {TUTORIAL_BACKING_VOICE_PROFILE:t}=await import('../probe/saezuri/creation-voice.js');
 for(const [word,genre] of [['どうよう','nursery'],['ポップ','pop'],['ロック','rock'],['バラード','ballad']]){
  const command={type:'backing-genre',genre};assert.deepEqual(t.parse(word),command);assert.deepEqual(creationVoiceProfile({source:'manual'},{backing:true}).parse(word),command);
  assert.equal(creationVoiceProfile({source:'manual'}).parse(word),null);assert.equal(LOOP_VOICE_PROFILE.parse(word),null);
 }
 assert.deepEqual(t.parse('はずむ 八 ビート'),{type:'backing-rhythm',rhythm:'tutorial'});assert.equal(t.parse('つぎ'),'next');
 assert.equal(creationVoiceProfile({source:'manual'},{backing:true}),creationVoiceProfile({source:'manual'},{backing:true}));
});
