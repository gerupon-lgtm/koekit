// クリアしたレベルだけを端末内に保存。音声ログとは分離する。
const NAMES = ['ひだりみぎマスター', 'うえしたマスター', 'なかまマスター', 'ななめマスター', 'ぜんほうこうマスター'];
const MEDALS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
export const GAME_NAMES = { doubutsu: 'ピタリズム', 'kioku-place': 'メモリズム・場所', 'kioku-sequence': 'メモリズム・順番' };

export class Progress {
  constructor(game, { storage, maxLevel = 5, speedIds = ['extra'] } = {}) {
    this.game = game;
    this.normalIds = Array.from({ length: maxLevel }, (_, i) => String(i + 1));
    this.speedIds = speedIds;
    this.key = 'koekit.progress.v1.' + game;
    this.ids = new Set();
    this.persistent = true;
    try {
      this.storage = storage ?? globalThis.localStorage;
      if (!this.storage) throw Error('storage unavailable');
      const saved = JSON.parse(this.storage.getItem(this.key) || '[]');
      if (Array.isArray(saved)) for (const id of saved) {
        if (typeof id === 'string' && (/^[1-8]$/.test(id) || id === 'extra' || /^s[1-8]$/.test(id) || /^@speed:[1-8]$/.test(id))) this.ids.add(id);
      }
    } catch { /* 壊れた記録でも起動する。書き込み失敗は保存時に通知。 */ }
  }
  completed(id) { return this.ids.has(id); }
  unlocked() { return this.normalIds.every(id => this.completed(id)); }
  speedCleared() { return this.unlocked() && this.speedIds.every(id => this.completed(id)); }
  title(id) {
    if (this.speedIds.includes(id)) return this.speedCleared() ? { rank: 100, name: 'スピードマスター', medal: 'rainbow' } : null;
    const n = Number(id);
    if (!this.normalIds.includes(id)) return null;
    return { rank: n, name: this.game === 'kioku-sequence' ? `${n + 1}てマスター` : NAMES[n - 1], medal: MEDALS[Math.min(n, 5) - 1] };
  }
  clear(id) {
    if (!this.normalIds.includes(id) && !this.speedIds.includes(id)) return null;
    if (this.speedIds.includes(id) && !this.unlocked()) return null;
    this.ids.add(id);
    if (this.speedCleared()) this.ids.add('@speed:' + this.normalIds.length);
    try {
      // 他タブで獲得した記録も保つ。
      const saved = JSON.parse(this.storage.getItem(this.key) || '[]');
      if (Array.isArray(saved)) for (const old of saved) {
        if (this.normalIds.includes(old) || this.speedIds.includes(old) || (typeof old === 'string' && /^@speed:[1-8]$/.test(old))) this.ids.add(old);
      }
    } catch {}
    try { this.storage.setItem(this.key, JSON.stringify([...this.ids])); this.persistent = true; }
    catch { this.persistent = false; }
    return this.title(id);
  }
  highest() {
    if (this.speedCleared() || [...this.ids].some(id => /^@speed:[1-8]$/.test(id))) return { rank: 100, name: 'スピードマスター', medal: 'rainbow' };
    const id = [...this.normalIds].reverse().find(id => this.completed(id));
    return id ? this.title(id) : null;
  }
}
