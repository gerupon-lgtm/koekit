import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEntryCommand as parse,ENTRY_WORDS} from '../probe/saezuri/entry-voice.js';
test('pitch and duration must occur together; upper is absolute and never sticky',()=>{
 assert.deepEqual(parse('ド 1'),{type:'note',midi:60,durationTick:4});
 assert.deepEqual(parse('上 ミ 二'),{type:'note',midi:76,durationTick:8});
 assert.deepEqual(parse('ド はんぶん'),{type:'note',midi:60,durationTick:2});
 assert.deepEqual(parse('上 上 ド 四'),{type:'note',midi:84,durationTick:16});
 assert.deepEqual(parse('休み 半 拍'),{type:'note',midi:null,durationTick:2});
 for(const raw of ['ド','1','うえ','上 上 レ 一','上 休み 一','ド 0','ド 三','ド 一 オッケー','ドにする','5拍半']) assert.equal(parse(raw),null,raw);
});
test('half-beat positions are separate from duration and editing commands remain available',()=>{
 assert.deepEqual(parse('三 拍 半'),{type:'position',beat:3,half:true});
 assert.equal(parse('3はくめ'),null);assert.equal(parse('2しょうせつ'),null);
 assert.equal(parse('スタート'),'preview');assert.equal(parse('きく'),'preview');
 assert.equal(parse('九 番 消す'),'delete:9');assert.equal(parse('オッケー'),'confirm');
 assert.ok(ENTRY_WORDS.includes('上 上 ド 一'));assert.ok(ENTRY_WORDS.includes('休み 半分'));
});
