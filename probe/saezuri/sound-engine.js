// Sound policy is shared by playback, held keys and the creation URL.
// Saved songs keep instrument IDs, independently of the playback engine.
export const DEFAULT_SOUND_ENGINE = 'light';
export const SOUND_POLICY_REVISION = '2026-10-10-light-default';
export const SOUND_ENGINES = ['light', 'simple', 'classic'];
export function resolveSoundEngine(requested) {
  return SOUND_ENGINES.includes(requested) ? requested : DEFAULT_SOUND_ENGINE;
}
// Chord audition favors a small graph on phones. Keep the saved instrument,
// its envelope and bass balance; only piano-like audition voices use one wave.
export const CHORD_AUDITION_REVISION='2026-10-29-simple-piano-20ms';
export function chordAuditionEngine(engine,instrument,comparison){
 return engine==='light'&&['piano','fm-piano'].includes(instrument)&&comparison!=='light'?'simple':engine;
}
