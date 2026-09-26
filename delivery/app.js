import { LEVELS, TITLES, PLAYBACK } from './config.js';
import { createSession, editSequence, startExecution, advance, retry, resumeSession, remainingSteps, markLevelCleared, highestTitle, allLevelsCleared } from './run.js';
import { parseUtterance, vocabulary } from './commands.js';
import { BASIC_STAGE, ADDITIONAL_STAGE, tutorialNeeded, completeTutorial } from './tutorial.js';
import { DeliveryStorage } from './storage.js';
import { SearchClient } from './search.js';
import { mountEditor } from './editor.js';
import { DeliverySound } from './sound.js';
import { DeliverySpeech } from './phase.js';
import { $, node, showScreen, renderBoard, renderSequence, flashSequence, renderRecord, renderStepOptions, directionIcon, medalMarkup, DIRECTIONS } from './view.js';
import { setMicState } from '../src/ui/micstate.js';
import { setVoiceGuide } from '../src/ui/voice-guide.js';
import { microphoneEnabled, onMicrophoneChange } from '../src/speech/microphone.js';
import { ScreenAwake } from '../src/ui/screenawake.js';

const storage=new DeliveryStorage(),search=new SearchClient(),editorSearch=new SearchClient(),sound=new DeliverySound(),awake=new ScreenAwake();
const clone=value=>JSON.parse(JSON.stringify(value));
let progress={easy:{clearedLevelIds:[]},hard:{clearedLevelIds:[]},tutorialCompletion:{basic:false,additional:{easy:false,hard:false}}};
let progressRevision=0,sessionRevision=0,session=null,difficulty='easy',screen='title',direction='right';
let epoch=0,busy=false,conflict=false,editor=null,editorVoice=null,previewReturn=null,hint=null,hintLevel=0,pendingPrepare=null,dialogContext=null;
const timers=new Map();
const speech=new DeliverySpeech({method:new URLSearchParams(location.search).get('speech'),onText:(text,context)=>{if(microphoneEnabled()&&!document.hidden)handleText(text,context)},onState:state=>{
  setMicState($('mic-state'),null,state);
  $('mic-notice').hidden=state!=='denied'&&!speech.failed;
}});
function notice(text,action){const el=$('save-status');el.replaceChildren();el.hidden=!text;if(!text)return;el.append(node('span',text));if(action){const b=node('button','最新を よみこむ');b.onclick=action;el.append(b)}}
function wait(ms){return new Promise(resolve=>{const id=setTimeout(()=>{timers.delete(id);resolve()},ms);timers.set(id,resolve)})}
function stopAsync(){epoch++;for(const[id,resolve]of timers){clearTimeout(id);resolve()}timers.clear();search.cancel();sound.stopAll();speech.close();busy=false;}
function pause(){stopAsync();if(screen==='preparing'){$('preparing-message').textContent='じゅんびを おやすみしました';$('prepare-retry').hidden=false;}if(session?.phase==='executing'){session={...session,phase:'paused'};saveSession()}if(screen==='game'){if(['cleared','failed'].includes(session?.phase))showResult();else paintGame();}}
function setScreen(id){screen=id;showScreen(id);if(!['game','result'].includes(id))$('mic-notice').hidden=true;if(id!=='result'){$('result').classList.remove('board-result');$('app').style.removeProperty('--finished-board-size')}if(id==='game')$('input-status').textContent='';awake.setActive(['game','result','ending'].includes(id));}
function loadProgress(){const r=storage.load('progress');progressRevision=r.revision??0;if(r.ok&&r.value)progress=r.value;else if(!r.ok)notice('記録を読みこめません。保存済みの内容は残しています。');}
function mergeProgress(a,b){return {...a,...b,easy:{clearedLevelIds:[...new Set([...(a.easy?.clearedLevelIds||[]),...(b.easy?.clearedLevelIds||[])])].sort()},hard:{clearedLevelIds:[...new Set([...(a.hard?.clearedLevelIds||[]),...(b.hard?.clearedLevelIds||[])])].sort()},tutorialCompletion:{basic:!!(a.tutorialCompletion?.basic||b.tutorialCompletion?.basic),additional:{easy:!!(a.tutorialCompletion?.additional?.easy||b.tutorialCompletion?.additional?.easy),hard:!!(a.tutorialCompletion?.additional?.hard||b.tutorialCompletion?.additional?.hard)}}};}
function saveProgress(next){let r=storage.save('progress',next,progressRevision);if(!r.ok&&r.code==='STALE_REVISION'){const latest=storage.load('progress');if(latest.ok){next=mergeProgress(latest.value||{},next);progressRevision=latest.revision;r=storage.save('progress',next,progressRevision)}}progress=next;if(r.ok)progressRevision=r.revision;else notice('記録を保存できません。この画面を閉じるまで保持します。');}
function saveSession(){if(!session||conflict)return false;const r=storage.save('session',session,sessionRevision);if(r.ok){sessionRevision=r.revision;return true}if(r.code==='STALE_REVISION'){conflict=true;stopAsync();notice('別の画面でプレイが更新されました。ここでの上書きを止めています。',reloadLatest)}else notice('保存を更新できません。この画面では続けられます。');return false;}
function reloadLatest(){stopAsync();session=null;conflict=false;notice('');showTitle();}
function readSaved(){const r=storage.load('session');sessionRevision=r.revision??0;if(!r.ok){notice('つづきを読みこめません。保存済みの内容は残しています。');return null}return r.value?.ended?null:r.value;}
function showTitle(){stopAsync();editor?.dispose();editor=null;editorVoice=null;previewReturn=null;session=null;hint=null;$('dialog').close();dialogContext=null;setScreen('title');loadProgress();const saved=readSaved();$('resume').hidden=!saved;$('new').textContent=saved?'さいしょから':'はじめから';
  for(const button of document.querySelectorAll('[data-difficulty]'))button.setAttribute('aria-pressed',String(button.dataset.difficulty===difficulty));
  const title=highestTitle(progress,difficulty);renderRecord($('record'),title&&{...title,name:title.title},difficulty);
  renderLevels();
}
function renderLevels(){$('level-list').replaceChildren();for(const level of LEVELS){
  const b=node('button',undefined,'big'),cleared=!!progress[difficulty]?.clearedLevelIds?.includes(level.id);b.dataset.level=level.id;
  const label=node('span',`レベル ${level.id}`);label.append(node('small',`${level.size}×${level.size}・${level.packageCount}こ`));b.append(label);
  b.classList.toggle('completed',cleared);b.setAttribute('aria-label',`レベル ${level.id}・${level.size}かける${level.size}・にもつ${level.packageCount}こ${cleared?'・クリアずみ':''}`);
  if(cleared){const mark=node('span','✓','clear-mark');mark.setAttribute('aria-hidden','true');b.append(mark)}$('level-list').append(b);
}}
function openDialog(title,text,actions,{word='オッケー',onVoice}={}){pause();speech.close();$('dialog-title').textContent=title;$('dialog-body').textContent=text;$('dialog-actions').replaceChildren();dialogContext={onVoice};for(const action of actions){const b=node('button',action.label,`big ${action.color||'subtle'}`);b.onclick=()=>{speech.close();$('dialog').close();dialogContext=null;action.run()};$('dialog-actions').append(b)}$('dialog').showModal();setVoiceGuide($('dialog-voice-guide'),onVoice?word:'',onVoice?'で すすむ':'ボタンで えらぼう');if(onVoice)speech.open(['オッケー','オーケー','つぎ','おわり'],'dialog',`dialog-${epoch}`)}
function closeDialog(){speech.close();$('dialog').close();dialogContext=null;syncVoice();}
function requestStart(level=1,{reviewTutorial=null}={}){
  const start=()=>{conflict=false;const saved=readSaved();if(saved){const r=storage.endSession(saved.sessionId,sessionRevision);if(r.ok)sessionRevision=r.revision;else{notice('前のプレイを更新できません。新しいプレイは開始していません。');return}}beginNormal(level,0,{reviewTutorial})};
  const saved=readSaved();if(saved)openDialog('さいしょから あそぶ？','今の「つづき」は新しいプレイに置きかえます。作った面と称号は残ります。',[{label:'さいしょから',color:'green',run:start},{label:'もどる',run:showTitle}]);else start();
}
async function beginNormal(level,stageIndex=0,{reviewTutorial=null}={}){
  stopAsync();hint=null;hintLevel=0;
  const needed=reviewTutorial||tutorialNeeded(progress,difficulty,level);
  if(needed){const stage=needed==='basic'?BASIC_STAGE:ADDITIONAL_STAGE;
    session=createSession(stage,{difficulty,source:'tutorial',level,stageIndex,tutorialType:needed,pendingStart:{level,stageIndex,difficulty},reviewTutorial:!!reviewTutorial});
    saveSession();await enterStage();return;
  }
  pendingPrepare={level,stageIndex};setScreen('preparing');$('preparing-message').textContent='みちを じゅんびちゅう…';$('prepare-retry').hidden=true;
  const token=epoch;
  try{const seed=crypto.getRandomValues(new Uint32Array(1))[0];const stage=await search.run('generate',{seed,level,options:{difficulty}});if(token!==epoch)return;
    session=createSession(stage,{difficulty,source:'normal',level,stageIndex});saveSession();await enterStage();
  }catch{if(token!==epoch)return;$('preparing-message').textContent='みちを つくれませんでした';$('prepare-retry').hidden=false;}
}
async function enterStage(){
  if(conflict)return;
  const token=epoch;speech.close();busy=true;setScreen('game');
  $('tutorial-note').querySelector('span').textContent=tutorialText();paintGame();
  guide('game-voice-guide','','はじまるよ');
  // The first stage can open within the first gesture, before AudioContext.resume resolves.
  await sound.prime();if(token!==epoch)return;
  const duration=sound.play('stageStart');await wait(duration+80);if(token!==epoch)return;
  busy=false;paintGame();syncVoice();
}
function tutorialText(){if(!session?.tutorialType)return '';if(session.tutorialType==='basic')return ['まずは「した 1」。方向と歩数をひとつずつ入れよう。','つぎは「みぎ 2」。にもつは自動でひろうよ。','さいごに「した 1」。おうちに届けよう。','表をみて「オッケー」。4歩で届けよう。'][Math.min(session.sequence.length,3)];
  if(session.runtime.deliveredMask)return '2こ とどけたね！ のこりを「ひだり 1 → みぎ 1」で届けよう。';
  return session.difficulty==='easy'?'2こまで持てるよ。「みぎ 4」で3こ目を通りすぎて配達。つぎに取りにもどろう。':'2こまで持てるよ。「みぎ 4 → ひだり 1 → みぎ 1」。2回の配達をまとめて入れよう。';}
function paintGame(){if(!session)return;const s=session;
  $('game').classList.toggle('large-grid',s.stageSnapshot.size>=5);
  renderStepOptions(s.stageSnapshot.size);
  $('stage-label').textContent=s.source==='tutorial'?'れんしゅう':s.source==='custom'?`じぶんの面 ${s.stageIndex+1} / ${s.orderedStageSnapshots.length}`:`レベル ${s.level}・${s.stageIndex+1} / 3`;
  $('tutorial-note').hidden=s.source!=='tutorial';$('tutorial-note').style.visibility=s.phase==='cleared'?'hidden':'';
  if(!busy&&s.phase!=='cleared')$('tutorial-note').querySelector('span').textContent=tutorialText();
  $('skip-tutorial').hidden=!(s.reviewTutorial&&(s.tutorialType==='basic'?progress.tutorialCompletion?.basic:progress.tutorialCompletion?.additional?.[s.difficulty]));
  renderBoard(s.stageSnapshot,s.runtime,{hintTarget:hint?.target,hintDirection:hintLevel>=2?hint?.direction:null});renderSequence(s);
  const remaining=remainingSteps(s),editing=s.phase==='editing';$('budget').classList.toggle('over',remaining<0);$('budget').replaceChildren(node('span',editing?(s.stageSnapshot.size>=5?'入力の のこり':'入力できる のこり'):'のこり ほすう'),node('strong',remaining<0?`${remaining}歩（${-remaining}歩オーバー）`:`${remaining}歩`));
  $('touch-input').hidden=false;for(const control of $('touch-input').querySelectorAll('button,select'))control.disabled=!editing||busy||conflict;
  $('execute').hidden=s.phase==='paused';$('execute').disabled=!editing||s.sequence.length===0||!!hint||conflict||busy;
  $('continue').hidden=s.phase!=='paused';$('continue').disabled=conflict;
  $('hint-panel').hidden=!hint;
  if(hint){$('hint-message').textContent=!hint.withinBudget?'いまの残り歩数では 届けきれないよ。':hintLevel===1?'まずは 光っているところへ。':`はじめの1歩は「${DIRECTIONS[hint.direction]?.[1]||''}」。`;}
}
function guide(el,word,action,touch){setVoiceGuide($(el),word,action,touch)}
function syncVoice(){if(document.hidden||conflict||busy||$('dialog').open)return;
  if(screen==='editor-screen'){if(editorVoice){guide('editor-voice-guide',editorVoice.cue,'',editorVoice.touch);speech.open(editorVoice.words,'editor',`editor-${epoch}-${editorVoice.words.join('|')}`)}else{speech.close();guide('editor-voice-guide','','ボタンで えらぼう')}return}
  if(screen==='ending'){guide('ending-voice-guide','オッケー','で タイトルへ','タイトルへ を タッチ');speech.open(['オッケー','オーケー','おわり'],'ending',`ending-${epoch}`);return}
  if(!session||!['game','result'].includes(screen)){speech.close();return}
  const phase=hint?'hint':session.phase;
  if(phase==='executing'){speech.close();guide('game-voice-guide','','ロボットが おとどけちゅう');return}
  const context={phase,maxRows:session.sequence.length};let words=vocabulary(context);
  if(hint){words=['ヒント','つぎ','オッケー','オーケー','おわり'];guide('hint-voice-guide','ヒント','で 最初の1歩。オッケーで とじる','ボタンで ヒント／とじる')}
  else if(phase==='editing')guide('game-voice-guide','みぎ2 ／ オッケー','で ついか ／ うごかす','ついか → オッケー');
  else if(phase==='paused'){words=['つづける','オッケー','オーケー','おわり'];guide('game-voice-guide','つづける','で のこりを うごかす','つづける を タッチ')}
  else guide('result-voice-guide',phase==='failed'?'スタート':'つぎ',phase==='failed'?'で しじを なおす':'で すすむ',phase==='failed'?'スタート を タッチ':'つぎ を タッチ');
  speech.open(words,phase,`${epoch}-${phase}-${context.maxRows}`);
}
function handleText(raw,context){if(context==='dialog'){if(/^(オッケー|オーケー|つぎ)$/.test(raw.trim()))dialogContext?.onVoice?.();return}
  if(context==='editor'){editorVoice?.onText(raw);return}
  if(!session||busy||conflict||$('dialog').open)return;
  if(context==='ending'){if(/^(オッケー|オーケー|おわり)$/.test(raw.trim()))endPlay();return}
  if(hint){if(/^(ヒント|ひんと|つぎ)$/.test(raw.trim()))void showHint(true);else if(/^(オッケー|オーケー|おっけー)$/.test(raw.trim()))closeHint();else if(raw.trim()==='おわり')endPlay();return}
  if(session.phase==='paused'&&raw.replace(/\s/g,'')==='つづける'){void execute();return}
  const command=parseUtterance(raw,{phase:session.phase,maxRows:session.sequence.length});
  if(command.type==='error'){if(session.phase==='editing')$('input-status').textContent=command.code==='MULTIPLE_COMMANDS'?'ひとつずつ おねがい':'「みぎ2」「2ばん」のように いってね';return}
  if(command.type==='direction'){selectDirection(command.direction);$('input-status').textContent=`${DIRECTIONS[command.direction][1]} だね。「みぎ2」で ついか`;return}
  if(command.type==='move')selectDirection(command.direction);
  dispatchCommand(command,{voice:true});
}
function selectDirection(value){direction=value;for(const b of document.querySelectorAll('[data-direction]'))b.setAttribute('aria-pressed',String(b.dataset.direction===value));}
function dispatchCommand(command,{voice=false}={}){if(command.type==='end'){endPlay();return}if(hint||busy||conflict)return;
  if(command.type==='confirm'){void execute();return}if(command.type==='retry'){retryPlay();return}if(command.type==='next'){if(session.phase==='paused')void execute();else void nextStage();return}if(command.type==='hint'){void showHint();return}
  const before=session,selected=session.selectedIndex;session=editSequence(session,command);if(session===before)return;hint=null;saveSession();paintGame();
  $('input-status').textContent=command.type==='move'?`${DIRECTIONS[command.direction][1]} ${command.count}：${selected!=null?`${selected+1}ばんを なおしたよ`:'ついかしたよ'}`:'表を みて たしかめよう';
  if(command.type==='move'){$('sequence').scrollTop=$('sequence').scrollHeight;if(selected!=null){const row=$('sequence').children[selected];row?.classList.add('changed');if(row){const box=$('sequence').getBoundingClientRect(),item=row.getBoundingClientRect();$('sequence').scrollTop+=item.top-box.top}}if(voice)flashSequence(selected??session.sequence.length-1)}syncVoice();
}
async function execute(){if(!session||busy||hint||conflict||!['editing','paused'].includes(session.phase))return;const next=startExecution(session);if(next.phase!=='executing')return;
  stopAsync();session=next;busy=true;const token=epoch;saveSession();paintGame();guide('game-voice-guide','','ロボットが おとどけちゅう');
  const startDuration=sound.play('start');
  await wait(Math.max(PLAYBACK.startMs,startDuration+PLAYBACK.startSoundGapMs));if(token!==epoch)return;
  while(token===epoch&&session?.phase==='executing'){
    const result=advance(session);
    if(result.session.phase==='cleared'){await wait(PLAYBACK.goalPauseMs);if(token!==epoch)return;}
    session=result.session;saveSession();if(token!==epoch)return;paintGame();
    const events=result.events.map(e=>e.type);let event='move';
    if(session.phase==='cleared')event=session.source==='normal'&&session.stageIndex===2?'award':'clear';
    else if(session.phase==='failed')event='failure';else if(events.includes('deliver'))event='delivery';else if(events.includes('pickup'))event='pickup';
    if(events.includes('full'))$('input-status').textContent='りょうてが いっぱい！ このにもつは あとで。';
    else if(events.includes('deliver'))$('input-status').textContent=session.phase==='cleared'?'ぜんぶ とどけたよ！':session.phase==='editing'?'とどけたよ！ つぎの しじを いれよう。':'とどけたよ！ のこりも とどけよう。';
    const duration=sound.play(event),interval=['cleared','failed'].includes(session.phase)?PLAYBACK.resultMs:events.includes('deliver')?PLAYBACK.deliveryMs:PLAYBACK.stepMs;
    await wait(Math.max(interval,duration+70));if(token!==epoch)return;
  }
  if(token!==epoch)return;busy=false;if(['failed','cleared'].includes(session.phase))showResult();else{paintGame();syncVoice()}
}
function showResult(){if(!session)return;const failed=session.phase==='failed';
  const boardSize=$('board').getBoundingClientRect().width;
  setScreen('result');$('result').classList.toggle('board-result',!failed);
  if(!failed){$('game').hidden=false;paintGame();if(boardSize>0)$('app').style.setProperty('--finished-board-size',`${boardSize}px`)}
  $('retry').hidden=!failed;$('next').hidden=failed;$('preview-return').hidden=!session.preview;$('result-mark').replaceChildren();
  $('failure-location').hidden=!failed;$('failure-location').replaceChildren();$('result').classList.toggle('is-failure',failed);
  if(failed){$('result-mark').textContent='↶';$('result-heading').textContent='もういちど やってみよう';$('result-detail').textContent=({BLOCKED:'岩に ぶつかったよ。',OUT_OF_BOUNDS:'みちの そとに でちゃった。',STEP_LIMIT:'ほすうが たりなかった。',SEQUENCE_EXHAUSTED:'しじが たりなかった。'})[session.failureCode]||'しじを たしかめよう。';
    $('result-detail').textContent+='\nスタートで しじを なおせるよ。';
    const rowIndex=Math.min(session.commandIndex,session.sequence.length-1),command=session.sequence[rowIndex],label=command?`${rowIndex+1}ばん「${DIRECTIONS[command.direction][1]} ${command.count}」`:'しじの おわり';
    const from=session.runtime.position,n=session.stageSnapshot.size,delta={up:-n,down:n,left:-1,right:1}[command?.direction],target=from+delta;
    const failedCell=session.failureCode==='BLOCKED'?target:from;
    renderBoard(session.stageSnapshot,session.runtime,{failedCell});const miniature=$('board').cloneNode(true);miniature.removeAttribute('id');miniature.classList.add('failure-board');
    $('failure-location').append(node('p',`${label}・${Math.floor(from/n)+1}ぎょう ${from%n+1}れつで とまったよ`),miniature);
  }else{
    $('result-heading').textContent=session.source==='tutorial'?'できた！':'ぜんぶ とどけた！';$('result-mark').textContent='✓';$('result-detail').textContent=`${session.runtime.usedSteps}歩で おとどけ。`;
    if(session.source==='tutorial')saveProgress(completeTutorial(progress,session.tutorialType,session.difficulty));
    if(session.source==='normal'&&session.stageIndex===2){const wasComplete=allLevelsCleared(progress,session.difficulty);saveProgress(markLevelCleared(progress,session));if(allLevelsCleared(progress,session.difficulty)&&(!wasComplete||session.level===4))session={...session,allClearReady:true};const award=TITLES.find(t=>t.level===session.level);$('result-mark').innerHTML=medalMarkup(award.medal);$('result-heading').textContent=award.title;$('result-detail').textContent=session.level===4?'レベル4 たっせい！ 3めん とどけたね。':'3めん クリア！ つぎのレベルへ。';if(!session.awardShown)session={...session,awardShown:true};}
    if(session.allClearReady)$('result-detail').textContent='ぜんぶの レベルを クリア！';
    saveSession();
  }
  syncVoice();
}
async function showEnding({music=true}={}){
  stopAsync();if(conflict)return;const token=epoch;
  session={...session,endingShown:true};saveSession();if(conflict)return;
  setScreen('ending');$('ending-difficulty').textContent=`${session.difficulty==='easy'?'やさしい':'むずかしい'}・ぜんぶの レベル クリア！`;
  if(!music){syncVoice();return}
  busy=true;guide('ending-voice-guide','','タイトルへ を タッチ');
  await sound.prime();if(token!==epoch)return;
  try{await $('ending').querySelector('img').decode()}catch{}if(token!==epoch)return;
  await wait(sound.play('allClear')+150);if(token!==epoch)return;
  busy=false;syncVoice();
}
function retryPlay(){if(session?.phase!=='failed'||busy||conflict)return;stopAsync();session=retry(session);hint=null;saveSession();setScreen('game');$('input-status').textContent='しじを なおしてから オッケー。';paintGame();syncVoice()}
async function nextStage(){if(session?.phase!=='cleared'||busy||conflict)return;const old=session;stopAsync();busy=true;
  if(old.source==='normal'&&old.allClearReady&&allLevelsCleared(progress,old.difficulty)){await showEnding();return}
  if(old.source==='tutorial'){if(old.reviewTutorial){endPlay();return}difficulty=old.pendingStart.difficulty;await beginNormal(old.pendingStart.level,old.pendingStart.stageIndex);return}
  if(old.source==='custom'){if(old.preview){returnToEditor();return}if(old.stageIndex+1>=old.orderedStageSnapshots.length){endPlay();return}session=createSession(old.orderedStageSnapshots[old.stageIndex+1],{source:'custom',difficulty:old.difficulty,stageIndex:old.stageIndex+1,orderedStageSnapshots:old.orderedStageSnapshots});saveSession();await enterStage();return}
  if(old.stageIndex<2)await beginNormal(old.level,old.stageIndex+1);else if(old.level<4)await beginNormal(old.level+1,0);else endPlay();
}
async function showHint(next=false){if(session?.phase!=='editing'||busy||conflict)return;if(hint&&next){hintLevel=2;paintGame();syncVoice();return}speech.close();busy=true;const token=epoch;
  try{const result=await search.run('hint',{stage:session.stageSnapshot,runtime:session.runtime});if(token!==epoch)return;busy=false;if(result.status!=='solved'){$('input-status').textContent='ヒントを つくれませんでした。もういちど ヒント。';syncVoice();return}hint=result;hintLevel=1;paintGame();syncVoice()}
  catch{if(token===epoch){busy=false;$('input-status').textContent='ヒントを よみこめませんでした。';syncVoice()}}
}
function closeHint(){hint=null;hintLevel=0;paintGame();syncVoice()}
function resume(){stopAsync();conflict=false;const saved=readSaved();if(!saved)return;session=resumeSession(saved);difficulty=session.difficulty;hint=null;saveSession();if(session.endingShown&&allLevelsCleared(progress,session.difficulty))void showEnding({music:false});else if(['failed','cleared'].includes(session.phase))showResult();else{setScreen('game');paintGame();syncVoice()}}
function endPlay(){stopAsync();hint=null;$('toast').hidden=true;if(session){const r=storage.endSession(session.sessionId,sessionRevision);if(r.ok){sessionRevision=r.revision;notice('')}else notice('保存を更新できません。端末に前のつづきが残る場合があります。');}session=null;showTitle()}
function openEditor(){stopAsync();setScreen('editor-screen');editor?.dispose();editor=mountEditor($('editor-host'),{storage,search:editorSearch,onClose:showTitle,onPlay:(stages,options)=>requestCustom(stages,options),onSpeechContext:context=>{editorVoice=context;if(screen==='editor-screen')syncVoice()}})}
function requestCustom(stages,options){const start=()=>{stopAsync();const saved=readSaved();if(saved){const r=storage.endSession(saved.sessionId,sessionRevision);if(!r.ok){notice('前のプレイを更新できません。新しいプレイは開始していません。');setScreen('editor-screen');syncVoice();return}sessionRevision=r.revision}conflict=false;previewReturn=options.onReturn;session=createSession(stages[0],{difficulty,source:'custom',stageIndex:0,orderedStageSnapshots:clone(stages),preview:!!options.preview,editorSnapshot:options.preview?editor?.getState():null});saveSession();hint=null;void enterStage()};const saved=readSaved();if(saved)openDialog('今のつづきを 置きかえる？','作った面と称号は残ります。',[{label:'あそぶ',color:'green',run:start},{label:'もどる',run:()=>{setScreen('editor-screen');syncVoice()}}]);else start()}
function returnToEditor(){stopAsync();const snapshot=session?.editorSnapshot;if(session){const r=storage.endSession(session.sessionId,sessionRevision);if(r.ok)sessionRevision=r.revision;else notice('つづきの削除を保存できませんでした。')}session=null;if(editor&&previewReturn){setScreen('editor-screen');previewReturn();syncVoice()}else{openEditor();editor.restorePreview(snapshot)}}
function help(){const back=()=>{closeDialog();if(screen==='game')paintGame();syncVoice()};const actions=[{label:'とじる',color:'green',run:back}];if(screen==='title')actions.push({label:'はじめの れんしゅう',run:()=>requestStart(1,{reviewTutorial:'basic'})},{label:'2かい はいたつの れんしゅう',run:()=>requestStart(3,{reviewTutorial:'additional'})});openDialog('デリバリズムの あそびかた','① 方向と歩数を ひとつずつ入れる\n② 表の順番をみて「オッケー」\n③ にもつを おうちへ とどけよう！\n\n「2ばん」で行を選んで、しじを言いなおせるよ。\nもどす：最後の1行／やりなおし：表をぜんぶ消す\n\nやさしい：届けるたびに 次のしじ。\nむずかしい：ぜんぶのしじを まとめて。\nヒントは 何回でもつかえるよ。\n\nマイクを使わなくても、ぜんぶタッチであそべます。',actions,{onVoice:back})}
const actions={new:()=>requestStart(),title:showTitle,resume,editor:openEditor,help,
  add:()=>{const before=session;dispatchCommand({type:'move',direction,count:Number($('step-count').value)});if(session!==before)$('step-count').value='1';},undo:()=>dispatchCommand({type:'undo'}),reset:()=>dispatchCommand({type:'reset'}),execute,continue:execute,retry:retryPlay,next:nextStage,end:endPlay,hint:showHint,hintNext:()=>showHint(true),hintClose:closeHint,previewReturn:returnToEditor,
  skipTutorial:()=>{if(!$('skip-tutorial').hidden)endPlay()},prepareRetry:()=>beginNormal(pendingPrepare.level,pendingPrepare.stageIndex),
  quit:()=>{if(screen==='ending'){endPlay();return}if(['title','editor-screen','preparing'].includes(screen)){showTitle();return}openDialog('あそびを おわる？','今のつづきは消えます。作った面と称号は残ります。',[{label:'おわる',run:endPlay},{label:'つづける',color:'green',run:()=>{if(screen==='game')paintGame();syncVoice()}}])},
  retryMic:()=>{speech.retry();syncVoice()}
};
document.addEventListener('click',event=>{void sound.prime();const target=event.target.closest('button');if(!target)return;if(target.dataset.action)void actions[target.dataset.action]?.();if(target.dataset.difficulty){difficulty=target.dataset.difficulty;showTitle()}if(target.dataset.level)requestStart(Number(target.dataset.level));if(target.dataset.direction)selectDirection(target.dataset.direction);if(target.dataset.row!=null&&session)dispatchCommand({type:'select',index:Number(target.dataset.row)})});
$('dialog').addEventListener('cancel',()=>{dialogContext=null;speech.close();setTimeout(syncVoice,0)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(!dialogContext)syncVoice()});
window.addEventListener('pagehide',()=>pause());
window.addEventListener('storage',event=>{if(event.key?.startsWith('koekit.delivery.v1.session')&&session){const latest=storage.load('session');if(latest.revision!==sessionRevision){conflict=true;pause();notice('別の画面でプレイが更新されました。ここでの上書きを止めています。',reloadLatest)}}});
onMicrophoneChange(()=>{speech.close();speech.retry();if(!document.hidden)syncVoice()});
for(const button of document.querySelectorAll('[data-direction]'))button.replaceChildren(directionIcon(button.dataset.direction),document.createTextNode(DIRECTIONS[button.dataset.direction][1]));
loadProgress();showTitle();
