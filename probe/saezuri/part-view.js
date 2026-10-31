import {accompanimentEvents} from '../../saezuri/music/accompaniment.js?v=v0.1.0-20261031231907-35a39bd';
import {restoreCheckpoint,checkpointFingerprint} from './song-session.js?v=v0.1.0-20261031231907-35a39bd';
import {entryPreview} from './entry-session.js?v=v0.1.0-20261031231907-35a39bd';
import {canKeepPhrase} from './sequence-session.js?v=v0.1.0-20261031231907-35a39bd';
const clone=value=>value?structuredClone(value):null;
const content=pattern=>Object.fromEntries(Object.entries(pattern).filter(([key])=>!['id','name','familyId','familyName','derivedFrom','revision'].includes(key)));
const description=(pattern,fallback)=>!pattern.notes.length&&pattern.accompaniment?.chords?.some(c=>c.rest)&&!accompanimentEvents(pattern).length?`${pattern.bars}小節の空白です。その長さだけ進みます。`:fallback;
// Read-only presentation: listening never registers, confirms or edits a part.
export function readPartView(part,sequence){
 const source=sequence.patterns.find(pattern=>pattern.id===part.patternId)??null;
 const checkpoint=part.checkpoint,confirmed=source??checkpoint?.confirmed?.pattern??null;
 const session=checkpoint?.draft?restoreCheckpoint(checkpoint):null,draft=session?entryPreview(session):null;
 const listenChoices=[];
 if(draft&&canKeepPhrase(draft))listenChoices.push({id:'draft',label:'つくりかけ',description:description(draft,'まだ決めていない変更を含みます'),pattern:clone(draft)});
 if(confirmed&&canKeepPhrase(confirmed)&&(!listenChoices.length||checkpointFingerprint(content(confirmed))!==checkpointFingerprint(content(draft))))listenChoices.push({id:'confirmed',label:'オッケー済み',description:description(confirmed,'オッケーで決めた音です'),pattern:clone(confirmed)});
 const used=!!source&&sequence.placements.some(placement=>placement.patternId===source.id);
 return {source:clone(source),working:clone(checkpoint?.draft?.working?.pattern??confirmed),hasDraft:!!checkpoint?.draft,
  used,canInsert:!!source&&canKeepPhrase(source),listenChoices,
  listenHint:listenChoices.length?'':'まだ音がありません。「編集する」から音を入れられます。'};
}
