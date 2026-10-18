import test from 'node:test';
import assert from 'node:assert/strict';
const diagnostics=await import('../probe/saezuri/playback-diagnostics.js').catch(()=>({}));

test('only the explicit playback comparison changes the normal interactive latency',()=>{
 for(const value of [null,undefined,'','unknown','balanced','0.1','interactive'])assert.equal(diagnostics.playbackLatencyHint(value),'interactive');
 assert.equal(diagnostics.playbackLatencyHint('playback'),'playback');
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
