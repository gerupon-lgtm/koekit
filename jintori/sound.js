// Jintori-only sounds: soft wood impacts, marimba-like flips, air and bell harmonics.
// Synthesized locally: no downloaded audio, microphone input or runtime dependency.
const note = (frequency, at, duration = .15, gain = .12, type = 'sine') => ({frequency,at,duration,gain,type});
const air = (at, duration, gain, frequency) => ({type:'noise',at,duration,gain,frequency});
export function scoreFor(event, {flipped = 1} = {}) {
  if (event === 'dice') return [air(0,.07,.18,1800),note(660,.06,.16),note(880,.15,.22),note(1320,.15,.18,.045)];
  if (event === 'invalid') return [note(210,0,.08,.08,'triangle'),note(175,.08,.09,.07,'triangle')];
  if (event === 'pass') return [note(440,0,.10,.09),note(587,.13,.17,.09)];
  if (event === 'win') return [note(523,0,.20),note(659,.12,.20),note(784,.24,.20),
    note(1047,.38,.40,.12),note(659,.38,.36,.08),note(784,.38,.36,.08)];
  if (event === 'loss') return [note(440,0,.25,.08),note(349,.18,.27,.09),note(262,.38,.36,.09),note(330,.38,.30,.06)];
  if (event === 'draw') return [note(523,0,.23,.09),note(659,0,.23,.07),note(587,.25,.30,.09),note(784,.25,.30,.07)];
  const score = [air(0,.035,.16,1000),note(190,0,.10,.18,'triangle')];
  const count = Math.max(1,Math.min(6,Math.floor(Number(flipped)||1)));
  for(let i=0;i<count;i++) {
    const f=[392,440,523,587,659,784][i];
    score.push(note(f,.06+i*.042,.11,.095,'triangle'),note(f*3,.06+i*.042,.06,.017));
  }
  if(event==='enhanced') score.push(note(523,.03,.27,.09),note(659,.10,.27,.08),note(784,.17,.28,.09));
  if(event==='strongest') score.push(air(0,.23,.12,3000),note(784,.06,.34,.10),note(1175,.12,.33,.075),note(1568,.20,.32,.065));
  return score;
}
export const scoreDuration = score => Math.ceil(Math.max(0,...score.map(n=>n.at+n.duration+.02))*1000);
export class SoundPlayer {
  constructor({contextFactory = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Audio ? new Audio() : null;
  }} = {}) { this.contextFactory=contextFactory;this.context=null;this.playing=new Set(); }
  primeAudio() {
    try { this.context ||= this.contextFactory(); if(this.context?.state==='suspended') void this.context.resume().catch(()=>{}); }
    catch { /* Audio failure must never prevent touch play. */ }
    return this.context;
  }
  play(event, options={}, delay=0) {
    const score=scoreFor(event,options), duration=scoreDuration(score)+Math.ceil(delay*1000);
    const ac=this.primeAudio();if(!ac)return duration;
    for(const n of score) {
      let source, filter;
      const gain=ac.createGain(), start=ac.currentTime+delay+n.at;
      if(n.type==='noise') {
        const buffer=ac.createBuffer(1,Math.max(1,Math.ceil(ac.sampleRate*n.duration)),ac.sampleRate);
        const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        source=ac.createBufferSource();source.buffer=buffer;
        filter=ac.createBiquadFilter();filter.type='bandpass';filter.frequency.value=n.frequency;filter.Q.value=.7;
        source.connect(filter);filter.connect(gain);
      } else {
        source=ac.createOscillator();source.type=n.type;source.frequency.setValueAtTime(n.frequency,start);
        // A brief downward pitch envelope softens each struck tone.
        source.frequency.exponentialRampToValueAtTime(n.frequency*.985,start+n.duration);
        source.connect(gain);
      }
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(n.gain,start+.004);
      gain.gain.exponentialRampToValueAtTime(.0001,start+n.duration);
      gain.connect(ac.destination);this.playing.add(source);
      source.addEventListener('ended',()=>{this.playing.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();},{once:true});
      source.start(start);source.stop(start+n.duration+.02);
    }
    return duration;
  }
  stopAll() { for(const source of this.playing){try{source.stop();}catch{}}this.playing.clear(); }
}
const player=new SoundPlayer();
export const primeAudio=()=>player.primeAudio();
export const stopAll=()=>player.stopAll();
export const playDiceSound=()=>player.play('dice');
export const playInvalidSound=()=>player.play('invalid');
export function playMoveSound({item='basic',flipped=1,result=null,passed=false}={}) {
  const move=player.play(item,{flipped});
  if(result)return player.play(result,{},move/1000+.06);
  if(passed)return player.play('pass',{},move/1000+.04);
  return move;
}
