import test from 'node:test';
import assert from 'node:assert/strict';
const diagnostics=await import('../probe/saezuri/playback-diagnostics.js').catch(()=>({}));

test('song playback uses the adopted profile while live input never inherits it',()=>{
 for(const value of [null,undefined,'','unknown','balanced','0.1'])assert.equal(diagnostics.playbackLatencyHint(value,'playback'),.02);
 assert.equal(diagnostics.playbackLatencyHint('playback','playback'),'playback');
 assert.equal(diagnostics.playbackLatencyHint('interactive','playback'),'interactive');
 assert.equal(diagnostics.playbackLatencyHint('10ms','playback'),.01);
 assert.equal(diagnostics.playbackLatencyHint('20ms','playback'),.02);
 for(const value of [null,'playback','10ms','20ms','interactive','unknown'])for(const purpose of ['live','keyboard','recording'])assert.equal(diagnostics.playbackLatencyHint(value,purpose),'interactive');
});

test('song playback bounds future voices by default, with a short phrase comparison override',()=>{
 for(const value of [null,undefined,'','unknown','window'])for(const ticks of [16,64,128,256])assert.equal(diagnostics.playbackScheduleAll(value,ticks),false);
 for(const ticks of [16,64,128])assert.equal(diagnostics.playbackScheduleAll('phrase',ticks),true);
 assert.equal(diagnostics.playbackScheduleAll('phrase',256),false,'long songs never allocate the full phrase graph');
});
test('native counters are copied and unsupported or failed readings stay unavailable',()=>{
 assert.equal(diagnostics.readPlaybackStats({}),null);
 assert.equal(diagnostics.readPlaybackStats({get playbackStats(){throw new Error('unsupported');}}),null);
 const stats={underrunEvents:7,underrunDuration:.02,totalDuration:12};
 const read=diagnostics.readPlaybackStats({playbackStats:stats});stats.underrunEvents=9;assert.equal(read.underrunEvents,7);
 assert.equal(diagnostics.readPlaybackStats({playbackStats:{...stats,totalDuration:NaN}}),null);
});
test('each playback reports only its own native underruns and preserves zero as measured',()=>{
 const before={underrunEvents:7,underrunDuration:.02,totalDuration:12},after={underrunEvents:8,underrunDuration:.024,totalDuration:28};
 const result=diagnostics.playbackStatsDelta(before,after);assert.equal(result.status,'measured');assert.equal(result.underrunEvents,1);assert.equal(result.totalDuration,16);assert.ok(Math.abs(result.underrunDuration-.004)<1e-9);
 assert.deepEqual(diagnostics.playbackStatsDelta(after,after),{status:'measured',underrunEvents:0,underrunDuration:0,totalDuration:0});
 assert.equal(diagnostics.playbackStatsDelta(null,after).status,'unavailable');
 assert.equal(diagnostics.playbackStatsDelta(after,before).status,'counter-reset');
});
