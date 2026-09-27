import { createCaptureEditor, proposeCaptureEdit, commitNote, undo } from './capture-editor.js';
import { analyzeFrames, quantizeSegments } from './analyzer.js';
import { decodePitchTrace } from './analysis-comparison.js';
import { pitchName } from './score.js';

const clone = value => value == null ? value : structuredClone(value);
const labels = { current: '現在の設定', detail: '細かい変化', unsmoothed: 'ならしなし' };
const messages = {
  NOTE_NOT_FOUND: '編集する音符を選んでください。',
  NOTE_PITCH: '音高は0〜127の整数で指定してください。',
  NOTE_GRID: '開始位置と長さは16分音符単位の整数で指定してください。',
  NOTE_OVERFLOW: '4小節の終わりを超えています。開始位置か長さを調整してください。',
  NOTE_OVERLAP: 'ほかの音符と重なります。開始位置か長さを調整してください。',
  NOTE_SPLIT: '分ける位置は、音符の先頭と末尾の間で指定してください。',
  NOTE_NEXT_NOT_FOUND: 'つなぐ次の音符がありません。',
  NOTE_GAP: '次の音符との間に休符があります。休符をまたいでつなぐことはできません。',
  STALE_CANDIDATE: '編集前の状態が変わりました。候補を取り消してやり直してください。',
};

// The capture and comparison diagnostics remain immutable. Each source owns a
// separate proposal, selection and undo history; only confirmation changes it.
export class CaptureEditorView {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this._variants = new Map();
    this._variant = 'current';
    this._busy = false;
    this._elements = {};
    for (const id of ['capture-variant', 'capture-note', 'capture-edit-midi', 'capture-edit-start',
      'capture-edit-length', 'capture-split-at', 'capture-edit-replace', 'capture-edit-delete',
      'capture-edit-split', 'capture-edit-merge', 'capture-edit-confirm', 'capture-edit-cancel',
      'capture-edit-undo', 'capture-edit-status', 'capture-score']) {
      this._elements[id] = document.getElementById(id);
      if (!this._elements[id]) throw new Error(`CAPTURE_EDITOR_ELEMENT: ${id}`);
    }
    this._elements['capture-variant'].addEventListener('change', event => this._switch(event.target.value));
    this._elements['capture-note'].addEventListener('change', event => this._select(event.target.value));
    this._elements['capture-score'].addEventListener('click', event => {
      const note = event.target.closest?.('[data-note-id]');
      if (note) this._select(note.getAttribute('data-note-id'));
    });
    for (const type of ['replace', 'delete', 'split', 'merge']) {
      this._elements[`capture-edit-${type}`].addEventListener('click', () => this._propose(type));
    }
    this._elements['capture-edit-confirm'].addEventListener('click', () => this._confirm());
    this._elements['capture-edit-cancel'].addEventListener('click', () => this._cancel());
    this._elements['capture-edit-undo'].addEventListener('click', () => this._undo());
    this._render(true);
  }

  get _active() { return this._variants.get(this._variant); }
  get pattern() { return clone(this._active?.state.pattern ?? null); }
  get previewPattern() { return clone(this._active?.proposal?.pattern ?? this._active?.state.pattern ?? null); }
  get pending() { return !!this._active?.proposal; }
  get edited() { return !!this._active?.edited; }
  get variant() { return this._variant; }

  _makeVariant(pattern) {
    const state = createCaptureEditor(pattern);
    if (state.code) throw new Error(state.code);
    state.selectedNoteId = state.pattern.notes[0]?.id ?? null;
    return { state, sourcePattern: clone(pattern), proposal: null, edited: false };
  }

  load(result, captureOptions = {}) {
    this._variants.clear();
    this._variant = 'current';
    if (!result) {
      this._status('取り込み後に音符を編集できます。');
      this._emit(true);
      return;
    }
    this._variants.set('current', this._makeVariant({ bars: 4, gridStep: 1, notes: clone(result.notes ?? []) }));
    const comparison = result.analysisComparison;
    let unavailable = false;
    if (comparison) {
      try {
        const frames = Array.isArray(result.frames) ? result.frames : decodePitchTrace(comparison.pitchTrace);
        const settings = {
          endSeconds: result.samples / result.sampleRate,
          tempo: captureOptions.tempo ?? 120,
          smoothingMs: captureOptions.smoothingMs ?? 80,
          maxGapSeconds: captureOptions.maxGapSeconds ?? .1,
          minDetectedRatio: captureOptions.minDetectedRatio ?? .1,
          ...comparison.sourceOptions,
        };
        for (const mode of ['detail', 'unsmoothed']) {
          const analyzed = analyzeFrames(frames, { ...settings, noteMode: 'detail',
            smoothingMs: mode === 'unsmoothed' ? 0 : settings.smoothingMs });
          const notes = quantizeSegments(analyzed.segments, settings.tempo);
          this._variants.set(mode, this._makeVariant({ bars: 4, gridStep: 1, notes }));
        }
      } catch {
        this._variants.delete('detail');
        this._variants.delete('unsmoothed');
        unavailable = true;
      }
    }
    this._status(unavailable ? '比較用の音程推移を読み込めませんでした。現在の設定の候補を編集できます。'
      : '音符を選び、変更を候補にしてから「この編集で確定」を押してください。');
    this._emit(true);
  }

  // Alignment is allowed only before manual edits. Its immutable source remains
  // available to restore the original leading rest without altering diagnostics.
  setPattern(pattern) {
    if (this._busy || this.pending || !this._active || this.edited) return false;
    const state = createCaptureEditor(pattern);
    if (state.code) { this._status(messages[state.code] ?? 'この音列は編集できません。'); return false; }
    state.selectedNoteId = state.pattern.notes.some(note => note.id === this._active.state.selectedNoteId)
      ? this._active.state.selectedNoteId : state.pattern.notes[0]?.id ?? null;
    this._active.state = state;
    this._emit(false);
    return true;
  }

  setBusy(busy) {
    this._busy = !!busy;
    this._render(false);
  }

  snapshot() {
    return {
      variant: this.variant,
      selectedNoteId: this._active?.state.selectedNoteId ?? null,
      revision: this._active?.state.revision ?? 0,
      edited: this.edited,
      pending: this.pending,
      ...(this.pending ? { editCandidate: clone(this._active.proposal.pattern) } : {}),
    };
  }

  _status(text) { this._elements['capture-edit-status'].textContent = text; }

  _emit(sourceChanged, fields = true) {
    this._render(fields);
    this.onChange?.({ pattern: this.pattern, previewPattern: this.previewPattern, pending: this.pending,
      edited: this.edited, variant: this.variant, sourcePattern: clone(this._active?.sourcePattern ?? null), sourceChanged });
    this._highlight();
  }

  _switch(mode) {
    if (this._busy || this.pending || !this._variants.has(mode)) { this._render(false); return; }
    if (mode === this.variant) return;
    this._variant = mode;
    this._status(`${labels[mode]}の候補に切り替えました。方式ごとの編集は保持しています。`);
    this._emit(true);
  }

  _select(noteId) {
    if (this._busy || this.pending || !this._active) return;
    if (!this._active.state.pattern.notes.some(note => note.id === noteId)) return;
    this._active.state = { ...this._active.state, selectedNoteId: noteId };
    this._status('選んだ音符の値を変更し、編集候補を作ってください。');
    this._emit(false);
  }

  _propose(type) {
    if (this._busy || this.pending || !this._active) return;
    const number = id => this._elements[id].value.trim() === '' ? NaN : Number(this._elements[id].value);
    const command = { type: type === 'merge' ? 'merge-next' : type, noteId: this._active.state.selectedNoteId };
    if (type === 'replace') Object.assign(command, { midi: number('capture-edit-midi'),
      startTick: number('capture-edit-start') - 1, durationTick: number('capture-edit-length') });
    if (type === 'split') command.offsetTick = number('capture-split-at');
    const proposal = proposeCaptureEdit(this._active.state, command);
    if (proposal.code) {
      this._status(messages[proposal.code] ?? 'この変更はできません。音符と入力値を確認してください。');
      this._render(false);
      return;
    }
    this._active.proposal = proposal;
    this._status(type === 'merge'
      ? '選んだ音高で次の音符とつなぐ候補です。試聴後、「この編集で確定」を押してください。'
      : '編集候補を表示しています。試聴後、「この編集で確定」を押すか、取り消してください。');
    this._emit(false, false);
  }

  _confirm() {
    if (this._busy || !this.pending) return;
    const next = commitNote(this._active.state, this._active.proposal);
    if (next.code) { this._status(messages[next.code] ?? '確定できません。候補を取り消してやり直してください。'); return; }
    this._active.state = next;
    this._active.proposal = null;
    this._active.edited = true;
    this._ensureSelection();
    this._status('編集を確定しました。「編集をもどす」で直前の編集を戻せます。');
    this._emit(false);
  }

  _cancel() {
    if (this._busy || !this.pending) return;
    this._active.proposal = null;
    this._status('編集候補を取り消しました。');
    this._emit(false);
  }

  _undo() {
    if (this._busy || this.pending || !this._active?.state.undoStack?.length) return;
    this._active.state = undo(this._active.state);
    this._ensureSelection();
    this._status('直前の編集を戻しました。');
    this._emit(false);
  }

  _ensureSelection() {
    const state = this._active.state;
    if (!state.pattern.notes.some(note => note.id === state.selectedNoteId)) {
      this._active.state = { ...state, selectedNoteId: state.pattern.notes[0]?.id ?? null };
    }
  }

  _render(fields) {
    const elements = this._elements, active = this._active, locked = this._busy || this.pending || !active;
    elements['capture-variant'].value = this.variant;
    elements['capture-variant'].disabled = locked;
    for (const option of elements['capture-variant'].options) option.disabled = !this._variants.has(option.value);
    const notes = active?.state.pattern.notes ?? [];
    const selected = notes.find(note => note.id === active?.state.selectedNoteId);
    if (fields) {
      elements['capture-note'].replaceChildren();
      for (const [index, note] of notes.entries()) {
        const option = document.createElement('option');
        option.value = note.id;
        option.textContent = `${index + 1}: ${pitchName(note.midi)}（MIDI ${note.midi}）・位置${note.startTick + 1}・長さ${note.durationTick}`;
        elements['capture-note'].append(option);
      }
      elements['capture-note'].value = selected?.id ?? '';
      elements['capture-edit-midi'].value = selected?.midi ?? '';
      elements['capture-edit-start'].value = selected ? selected.startTick + 1 : '';
      elements['capture-edit-length'].value = selected?.durationTick ?? '';
      elements['capture-split-at'].value = selected ? Math.max(1, Math.floor(selected.durationTick / 2)) : '';
    }
    for (const id of ['capture-note', 'capture-edit-midi', 'capture-edit-start', 'capture-edit-length',
      'capture-split-at', 'capture-edit-replace', 'capture-edit-delete', 'capture-edit-split', 'capture-edit-merge']) {
      elements[id].disabled = locked || !selected;
    }
    elements['capture-edit-confirm'].disabled = this._busy || !this.pending;
    elements['capture-edit-cancel'].disabled = this._busy || !this.pending;
    elements['capture-edit-undo'].disabled = locked || !active?.state.undoStack?.length;
    this._highlight();
  }

  _highlight() {
    for (const element of this._elements['capture-score'].querySelectorAll('[data-note-id]')) {
      const selected = element.getAttribute('data-note-id') === this._active?.state.selectedNoteId;
      element.classList.toggle('capture-note-selected', selected);
      if (selected) element.setAttribute('data-editor-selected', 'true');
      else element.removeAttribute('data-editor-selected');
    }
  }
}
