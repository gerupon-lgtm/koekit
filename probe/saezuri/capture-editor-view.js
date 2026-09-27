import { openEditSession, stageEdit, selectEditNote, confirmEditSession, cancelEditSession, undoEditSession, hasDraftChanges } from './edit-session.js';
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

// Original diagnostics stay immutable. Each source owns a working melody and
// session history; only explicit confirmation updates the main melody.
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
      'capture-edit-undo', 'capture-edit-status', 'capture-score', 'capture-pitch-up', 'capture-pitch-down', 'capture-previous', 'capture-next', 'capture-blocks']) {
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
    for (const command of ['up','down','previous','next']) this._elements[`capture-${command === 'up' || command === 'down' ? 'pitch-' : ''}${command}`].onclick = () => this.command(command);
    this._elements['capture-blocks'].onclick = event => { const note=event.target.closest('[data-note-id]'); if(note) this._select(note.dataset.noteId); };
    this._render(true);
  }

  get _active() { return this._variants.get(this._variant); }
  get pattern() { return clone(this._active?.session.confirmed ?? null); }
  get previewPattern() { return clone(this._active?.state.pattern ?? null); }
  get pending() { return hasDraftChanges(this._active?.session); }
  get edited() { return !!this._active?.edited; }
  get accepted() { return !!this._active?.session.accepted; }
  get isOpen() { return !!this._active && !this._active.session.closed; }
  get variant() { return this._variant; }

  _makeVariant(pattern) {
    const session = openEditSession(pattern);
    if (session.code) throw new Error(session.code);
    return {session, get state() { return this.session.working; }, sourcePattern:clone(pattern), edited:false};
  }

  openPattern(pattern) {
    this._variants.clear(); this._variant='current';
    this._variants.set('current',this._makeVariant(pattern));
    this._status('音を選んで直し、流れを聴いてから、まとめてオッケー。');
    this._emit(true);
  }

  end() {
    if (!this.isOpen || this.pending || this._busy) return false;
    for (const item of this._variants.values()) item.session={...item.session,closed:true,history:[]};
    this._emit(false); return true;
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
      : '音を選んで直し、流れを聴いてから、まとめてオッケー。');
    this._emit(true);
  }

  // Alignment is allowed only before manual edits. Its immutable source remains
  // available to restore the original leading rest without altering diagnostics.
  setPattern(pattern) {
    if (this._busy || this.pending || !this._active || this.edited) return false;
    const session = openEditSession(pattern);
    if (session.code) { this._status(messages[session.code] ?? 'この音列は編集できません。'); return false; }
    this._active.session = session;
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
      accepted:this.accepted, closed:!this.isOpen, undoDepth:this._active?.session.history.length ?? 0,
      ...(this.pending ? { editCandidate: this.previewPattern } : {}),
    };
  }

  _status(text) { this._elements['capture-edit-status'].textContent = text; }

  _emit(sourceChanged, fields = true, confirmed = false) {
    this._render(fields);
    this.onChange?.({ pattern: this.pattern, previewPattern: this.previewPattern, pending: this.pending,
      edited: this.edited, variant: this.variant, sourcePattern: clone(this._active?.sourcePattern ?? null), sourceChanged, confirmed });
    this._highlight();
  }

  _switch(mode) {
    if (this._busy || this.pending || !this._variants.has(mode)) { this._render(false); return; }
    if (mode === this.variant) return;
    this._variant = mode;
    this._active.session={...this._active.session,accepted:false};
    this._status(`${labels[mode]}の候補に切り替えました。方式ごとの編集は保持しています。`);
    this._emit(true);
  }

  _select(noteId) {
    if (this._busy || !this.isOpen) return;
    const next = selectEditNote(this._active.session,noteId);
    if (next.code) return;
    this._active.session=next;
    this._emit(false);
  }

  command(command) {
    if(this._busy || !this.isOpen) return;
    if(command==='confirm') return this._confirm();
    if(command==='undo') return this._undo();
    if(command==='cancel') return this._cancel();
    const notes=this._active.state.pattern.notes, index=notes.findIndex(n=>n.id===this._active.state.selectedNoteId), note=notes[index];
    if(!note) return;
    if(command==='next' || command==='previous') return this._select(notes[Math.max(0,Math.min(notes.length-1,index+(command==='next'?1:-1)))].id);
    if(command==='up' || command==='down') this._stage({type:'replace',noteId:note.id,midi:note.midi+(command==='up'?1:-1),startTick:note.startTick,durationTick:note.durationTick});
  }

  _stage(command) {
    const next=stageEdit(this._active.session,command);
    if(next.code) {this._status(messages[next.code] ?? 'この変更はできません。');return;}
    this._active.session=next; this._active.edited=true;
    this._status('仮の変更です。ほかの音も直せます。「流れを聴く」で確認してからオッケー。');
    this._emit(false);
  }

  _propose(type) {
    if(this._busy || !this.isOpen) return;
    const number=id=>this._elements[id].value.trim()===''?NaN:Number(this._elements[id].value);
    const command={type:type==='merge'?'merge-next':type,noteId:this._active.state.selectedNoteId};
    if(type==='replace') Object.assign(command,{midi:number('capture-edit-midi'),startTick:number('capture-edit-start')-1,durationTick:number('capture-edit-length')});
    if(type==='split') command.offsetTick=number('capture-split-at');
    this._stage(command);
  }

  _confirm() {
    if(this._busy || !this.isOpen) return;
    this._active.session=confirmEditSession(this._active.session);
    this._status('まとめて確定しました。続けて編集できます。履歴は「おわり」まで残ります。');
    this._emit(false,true,true);
  }

  _cancel() {
    if(this._busy || !this.isOpen || !this.pending) return;
    this._active.session=cancelEditSession(this._active.session);
    this._status('最後に確定した音列へ戻しました。'); this._emit(false);
  }

  _undo() {
    if(this._busy || !this.isOpen || !this._active.session.history.length) return;
    this._active.session=undoEditSession(this._active.session);
    this._status('ひとつ戻しました。仮の音列を確認してオッケーで確定してください。'); this._emit(false);
  }

  _render(fields) {
    const elements = this._elements, active = this._active, locked = this._busy || !this.isOpen;
    elements['capture-variant'].value = this.variant;
    elements['capture-variant'].disabled = locked || this.pending;
    for (const option of elements['capture-variant'].options) option.disabled = !this._variants.has(option.value);
    const notes = active?.state.pattern.notes ?? [];
    const selected = notes.find(note => note.id === active?.state.selectedNoteId);
    if (fields) {
      elements['capture-note'].replaceChildren();
      for (const [index, note] of notes.entries()) {
        const option = document.createElement('option');
        option.value = note.id;
        option.textContent = `${index + 1}ばんめ：${pitchName(note.midi)}`;
        elements['capture-note'].append(option);
      }
      elements['capture-note'].value = selected?.id ?? '';
      elements['capture-edit-midi'].value = selected?.midi ?? '';
      elements['capture-edit-start'].value = selected ? selected.startTick + 1 : '';
      elements['capture-edit-length'].value = selected?.durationTick ?? '';
      elements['capture-split-at'].value = selected ? Math.max(1, Math.floor(selected.durationTick / 2)) : '';
    }
    for (const id of ['capture-note', 'capture-edit-midi', 'capture-edit-start', 'capture-edit-length',
      'capture-split-at', 'capture-edit-replace', 'capture-edit-delete', 'capture-edit-split', 'capture-edit-merge', 'capture-pitch-up', 'capture-pitch-down', 'capture-next', 'capture-previous']) {
      elements[id].disabled = locked || !selected;
    }
    elements['capture-edit-confirm'].disabled = locked || (this.accepted && !this.pending);
    elements['capture-edit-cancel'].disabled = this._busy || !this.pending;
    elements['capture-edit-undo'].disabled = locked || !active?.session.history.length;
    const blocks=elements['capture-blocks']; blocks.replaceChildren();
    for(const [i,note] of notes.entries()) {
      const button=document.createElement('button');button.dataset.noteId=note.id;button.textContent=`${i+1} ${pitchName(note.midi)}`;
      button.setAttribute('aria-pressed',String(note.id===selected?.id));button.disabled=locked;
      button.style.borderTopWidth=`${4+Math.min(24,note.midi-Math.min(...notes.map(n=>n.midi)))*2}px`; blocks.append(button);
    }
    this._highlight();
  }

  _highlight() {
    for (const element of this._elements['capture-score'].querySelectorAll('[data-note-id]')) {
      const selected = element.getAttribute('data-note-id') === this._active?.state.selectedNoteId;
      const id=element.getAttribute('data-note-id');
      const before=this.pattern?.notes.find(n=>n.id===id), after=this.previewPattern?.notes.find(n=>n.id===id);
      element.classList.toggle('capture-note-draft',JSON.stringify(before)!==JSON.stringify(after));
      element.classList.toggle('capture-note-selected', selected);
      if (selected) element.setAttribute('data-editor-selected', 'true');
      else element.removeAttribute('data-editor-selected');
    }
  }
}
