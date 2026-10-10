// Sound policy is shared by playback, held keys and the creation URL.
// Saved songs keep instrument IDs, independently of the playback engine.
export const DEFAULT_SOUND_ENGINE = 'light';
export const SOUND_POLICY_REVISION = '2026-10-10-light-default';
export const SOUND_ENGINES = ['light', 'simple', 'classic'];
export function resolveSoundEngine(requested) {
  return SOUND_ENGINES.includes(requested) ? requested : DEFAULT_SOUND_ENGINE;
}
