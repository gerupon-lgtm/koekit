import assert from 'node:assert/strict';
import {parseUtterance,vocabulary} from '../delivery/commands.js';
// Relevant entries verified against model/graph/words.txt in vosk-model-small-ja-0.22.
const dictionary=new Set(['上','下','左','右','一','二','三','四','五','六','七','八','九','十','百','番','もどす','やりなおし','ヒント','オッケー','オーケー','おわり','スタート','つぎ']);
for(const phase of ['editing','failed','paused','cleared','executing','preparing']){
 for(const phrase of vocabulary({phase,maxRows:130}))for(const token of phrase.split(' '))assert.ok(dictionary.has(token),`Model cannot recognize ${token} in ${phrase}`);
}
for(const [raw,command]of [['右 二',{type:'move',direction:'right',count:2}],['下 十 二',{type:'move',direction:'down',count:12}],['二 番',{type:'select',index:1}],['百 三 十 番',{type:'select',index:129}],['ひだり',{type:'direction',direction:'left'}]])assert.deepEqual(parseUtterance(raw,{maxRows:130}),command);
for(const raw of ['二','右 二 下 一','右 二 オッケー'])assert.equal(parseUtterance(raw).type,'error');
assert.equal(parseUtterance('右',{phase:'executing'}).type,'error');
assert.equal(parseUtterance('右',{phase:'cleared'}).type,'error');
console.log('Japanese model token compatibility, composed numbers, row selection, direction-only feedback, full-utterance validation and phase guards: passed');
