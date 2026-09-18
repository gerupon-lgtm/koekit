// 声だけで遊ぶ間も画面を保つ。非表示・タイトルでは解除し、復帰時に再取得する。
export class ScreenAwake {
  constructor({ doc = document, wakeLock = navigator.wakeLock } = {}) {
    this.doc = doc;
    this.wakeLock = wakeLock;
    this.active = false;
    this.lock = null;
    this.pending = false;
    this.generation = 0;
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') void this.acquire();
      else this.release();
    });
  }
  setActive(active) {
    this.active = active;
    if (active) void this.acquire();
    else this.release();
  }
  release() {
    this.generation++;
    const lock = this.lock;
    this.lock = null;
    if (lock) void lock.release().catch(() => {});
  }
  async acquire() {
    if (!this.active || this.doc.visibilityState !== 'visible' || !this.wakeLock || this.lock || this.pending) return;
    this.pending = true;
    const generation = this.generation;
    try {
      const lock = await this.wakeLock.request('screen');
      if (!this.active || this.doc.visibilityState !== 'visible' || generation !== this.generation) {
        await lock.release();
      } else {
        this.lock = lock;
        lock.addEventListener('release', () => { if (this.lock === lock) this.lock = null; });
      }
    } catch { /* 非対応・省電力・拒否時もゲームは継続する。 */ }
    finally {
      this.pending = false;
      if (generation !== this.generation) void this.acquire();
    }
  }
}
