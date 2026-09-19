// イロドリズム 保存層（localStorage）— docs/irodori/data-model.md 準拠
// C-5: 保存データを失わない。例外は握って既存データを壊さない。外部送信なし（C-1）。

const KEY_V = 'irodori:v';
const KEY_ARTWORKS = 'irodori:artworks';
const KEY_DRAFT = 'irodori:draft';
const SCHEMA = 1;
export const MAX_ARTWORKS = 12;

function readJSON(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    if (!s) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback; // 壊れていても全消ししない
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // QuotaExceeded 等。既存は保持
  }
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 保存済み作品一覧（配列）
export function listArtworks() {
  try { localStorage.setItem(KEY_V, String(SCHEMA)); } catch { /* 無視 */ }
  const arr = readJSON(KEY_ARTWORKS, []);
  return Array.isArray(arr) ? arr.filter(a => a && Array.isArray(a.cells)) : [];
}

// 追加/更新。戻り値 {ok, reason}
export function saveArtwork(artwork) {
  const arr = listArtworks();
  const now = new Date().toISOString();
  const idx = arr.findIndex(a => a.id === artwork.id);
  if (idx >= 0) {
    arr[idx] = { ...artwork, updatedAt: now };
  } else {
    if (arr.length >= MAX_ARTWORKS) return { ok: false, reason: 'limit' };
    arr.push({ ...artwork, createdAt: artwork.createdAt || now, updatedAt: now });
  }
  const ok = writeJSON(KEY_ARTWORKS, arr);
  return { ok, reason: ok ? null : 'quota' };
}

export function deleteArtwork(id) {
  const arr = listArtworks().filter(a => a.id !== id);
  return writeJSON(KEY_ARTWORKS, arr);
}

// 自動下書き（単一スロット）
export function saveDraft(artwork) { return writeJSON(KEY_DRAFT, artwork); }
export function loadDraft() { return readJSON(KEY_DRAFT, null); }
export function clearDraft() { try { localStorage.removeItem(KEY_DRAFT); } catch { /* 無視 */ } }
