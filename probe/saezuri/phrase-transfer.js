import {canKeepPhrase} from './sequence-session.js?v=v0.1.0-20261030102318-2f22e53';

const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function copyPhrase(pattern){
 if(!isObject(pattern))return null;
 try{return canKeepPhrase(pattern)?structuredClone(pattern):null;}catch{return null;}
}
const identityKeys=new Set(['id','name','familyId','familyName']);
const phraseContent=pattern=>Object.fromEntries(Object.entries(pattern).filter(([key])=>!identityKeys.has(key)));
function sameValue(left,right){
 if(Object.is(left,right))return true;
 if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
 const keys=Object.keys(left);
 return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameValue(left[key],right[key]));
}

// Source songs stay untouched; destination registration assigns its own identities.
export function extractSongPhrases(record){
 if(!isObject(record)||record.schemaVersion!==1||!isObject(record.data))return [];
 const patterns=record.data.sequence?.patterns;
 if(!Array.isArray(patterns))return [];
 const result=[];
 for(const [index,pattern] of patterns.entries()){
  if(typeof pattern?.id!=='string'||!pattern.id.trim())continue;
  const copy=copyPhrase(pattern);if(!copy)continue;
  result.push({id:`phrase:${pattern.id}`,label:typeof pattern.name==='string'&&pattern.name.trim()?pattern.name.trim():`フレーズ${index+1}`,pattern:copy});
 }
 const current=copyPhrase(record.data.checkpoint?.confirmed?.pattern);
 if(current&&!result.some(item=>sameValue(phraseContent(item.pattern),phraseContent(current))))result.push({id:'current',label:'つくったフレーズ',pattern:current});
 return result;
}
