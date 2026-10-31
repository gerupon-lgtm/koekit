import test from 'node:test';
import assert from 'node:assert/strict';
const display=await import('../probe/saezuri/build-display.js').catch(()=>({}));
test('build display always uses JST rather than device timezone',()=>{for(const tz of ['UTC','America/Los_Angeles','Asia/Tokyo']){process.env.TZ=tz;assert.equal(display.formatBuildTime('v0.1.0-20261031130511-e7ac30d'),'2026/10/31 22:05:11 JST');}});
test('JST display handles next-day rollover and local builds',()=>{assert.equal(display.formatBuildTime('v0.1.0-20261031200000-abc'),'2026/11/01 05:00:00 JST');assert.equal(display.formatBuildTime('local-20261010'),'ローカル版');});
