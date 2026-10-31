import {restoreCheckpoint} from './song-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {entryPreview} from './entry-session.js?v=v0.1.0-20261031130511-e7ac30d';
import {extractSongPhrases} from './phrase-transfer.js?v=v0.1.0-20261031130511-e7ac30d';
import {sequencePlayback,canKeepPhrase} from './sequence-session.js?v=v0.1.0-20261031130511-e7ac30d';

// Optional navigation never changes the musical document or commits a draft.
export function songNavigation(data={}){
 const oldScreen=data.sequence?.placements?.length||data.sequence?.patterns?.length?'connect':'create';
 const navigation=data.navigation??{},pattern=data.checkpoint?.draft?.working?.pattern??data.checkpoint?.confirmed?.pattern;
 return {screen:data.placementDraft?'create':['create','connect'].includes(navigation.screen)?navigation.screen:oldScreen,
  mode:['input','edit','backing'].includes(navigation.mode)?navigation.mode:pattern?.source&&pattern.source!=='manual'?'edit':'input'};
}

export function songPlaybackChoices(record){
 const data=record?.data;if(!data||record.schemaVersion!==1)return [];
 if(data.sequence?.placements?.length){
  const playback=sequencePlayback(data.sequence);if(playback.code)throw Object.assign(new Error(playback.code),{code:playback.code});
  return [{id:'sequence',label:'並べた順番',state:'曲全体',data:playback}];
 }
 if(data.project){
  const choices=data.sequence.patterns.filter(canKeepPhrase).map(p=>({id:'phrase:'+p.id,label:p.name,state:'パーツ・オッケー済み',data:{pattern:structuredClone(p)}}));
  for(const part of data.project.parts){if(!part.checkpoint?.draft)continue;const session=restoreCheckpoint(part.checkpoint),pattern=session&&entryPreview(session);if(pattern&&canKeepPhrase(pattern))choices.push({id:'draft:'+part.id,label:part.name+'のつくりかけ',state:'仮の変更を含む・未確定',data:{pattern:structuredClone(pattern)}});}
  return choices;
 }
 const choices=extractSongPhrases(record).map(part=>({id:part.id,label:part.label,
  state:part.id==='current'?'制作中・未登録・オッケー済みのところまで':'登録済み',data:{pattern:part.pattern}}));
 if(data.checkpoint?.draft){
  const session=restoreCheckpoint(data.checkpoint),pattern=session&&entryPreview(session);
  if(pattern&&canKeepPhrase(pattern))choices.push({id:'draft',label:'制作中の変更候補',state:'仮の変更を含む・未確定',data:{pattern:structuredClone(pattern)}});
 }
 return choices;
}
