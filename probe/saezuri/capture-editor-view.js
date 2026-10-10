import { openEditSession, stageEdit, selectEditNote, confirmEditSession, cancelEditSession, undoEditSession, hasDraftChanges } from './edit-session.js?v=v0.1.0-20261010122649-d4089c8';
import {canGenerateAccompaniment,stageAccompanimentCandidate} from './edit-session.js?v=v0.1.0-20261010122649-d4089c8';
import { analyzeFrames, quantizeSegments } from './analyzer.js?v=v0.1.0-20261010122649-d4089c8';
import { decodePitchTrace } from './analysis-comparison.js?v=v0.1.0-20261010122649-d4089c8';
import { pitchName } from './score.js?v=v0.1.0-20261010122649-d4089c8';
import { orderedNotes, selectionTarget } from './note-selection.js?v=v0.1.0-20261010122649-d4089c8';
import {proposeEntry,confirmEntry,cancelEntry,moveEntryCursor,entryPreview} from './entry-session.js?v=v0.1.0-20261010122649-d4089c8';
import {songCheckpoint,restoreCheckpoint} from './song-session.js?v=v0.1.0-20261010122649-d4089c8';

const clone = value => value == null ? value : structuredClone(value);
const labels = { current: '現在の設定', detail: '細かい変化', unsmoothed: 'ならしなし' };
const messages = {
  NOTE_NOT_FOUND: '編集する音符を選んでください。',
  NOTE_PITCH: '音高は0〜127の整数で指定してください。',
  NOTE_GRID: '開始位置と長さは16分音符単位の整数で指定してください。',
  NOTE_OVERFLOW: '最後の小節を超えています。開始位置か長さを調整してください。',
  ENTRY_PITCH:'ド〜うえうえドの白鍵から選んでください。',
  ENTRY_REST_REPLACE:'音を休符にするときは「けす」を使ってください。',
  DRAFT_PENDING:'仮の編集をオッケーで確定するか、戻してから音を追加してください。',
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
      'capture-edit-undo', 'capture-edit-status', 'capture-score', 'capture-pitch-up', 'capture-pitch-down', 'capture-previous', 'capture-next', 'capture-first', 'capture-last', 'capture-selection', 'capture-blocks']) {
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
    this._transposeButtons = [...document.querySelectorAll('[data-transpose]')];
    for (const button of this._transposeButtons) button.onclick = () => {
      if (!this._busy && this.isOpen) this._stage({type:'transpose',semitones:Number(button.dataset.transpose)});
    };
    for (const command of ['up','down','previous','next','first','last']) this._elements[`capture-${command === 'up' || command === 'down' ? 'pitch-' : ''}${command}`].onclick = () => this.command(command);
    this._elements['capture-blocks'].onclick = event => { const note=event.target.closest('[data-note-id]'); if(note) this._select(note.dataset.noteId); };
    this._render(true);
  }

  get _active() { return this._variants.get(this._variant); }
  get pattern() { return clone(this._active?.session.confirmed ?? null); }
  get previewPattern() { return this._active ? clone(entryPreview(this._active.session)) : null; }
  get pending() { return !!this.entry || hasDraftChanges(this._active?.session); }
  get entry() {return this._active?.session.entry ?? null;}
  get cursor() {return this._active?.state.cursor ?? 0;}
  get selectedNoteId() {return this._active?.state.selectedNoteId ?? null;}

  inputNote(input) {
    if(this._busy || !this.isOpen) return;
    const next=proposeEntry(this._active.session,input);
    if(next.code) {this._status(messages[next.code]??next.code);return;}
    this._active.session=next;
    const problem=next.entry.proposal;
    this._status(problem.code==='NOTE_OVERFLOW'?`${problem.details.shortageBeats===.5?'はんぱく':`${problem.details.shortageBeats}拍`}たりません。長さを直してください。`:problem.code?(messages[problem.code]??problem.code):'候補です。聴いてからオッケーで確定します。');
    this._emit(false);
  }
  moveCursor(tick) {
    if(this._busy || !this.isOpen) return;
    const next=moveEntryCursor(this._active.session,tick);
    if(next.code) {this._status(messages[next.code]??next.code);return;}
    this._active.session=next;this._emit(false);
  }
  changeStructure(command) {
    if(this._busy || !this.isOpen || this.entry) return;
    this._stage(command);
  }
  get canGenerateAccompaniment(){return !this._busy&&canGenerateAccompaniment(this._active?.session);}
  get imageCandidate(){return !!this._active?.session.imageCandidate;}
  stageImageAccompaniment(value){
    if(!this.canGenerateAccompaniment)return false;
    const next=stageAccompanimentCandidate(this._active.session,value);
    if(next.code){this._status(messages[next.code]??next.code);return false;}
    this._active.session=next;this._active.edited=true;
    this._status('伴奏の候補です。聴いて、オッケーで決めよう。');this._emit(false);return true;
  }
  get edited() { return !!this._active?.edited; }
  get accepted() { return !!this._active?.session.accepted; }
  get isOpen() { return !!this._active && !this._active.session.closed; }
  get variant() { return this._variant; }

  checkpoint(existing=false) { return songCheckpoint(this._active?.session,{existing}); }
  clearHistory(){for(const item of this._variants.values())item.session.history=[];}
  restore(checkpoint,options={}) {
    const session=restoreCheckpoint(checkpoint,options);
    this._variants.clear();this._variant='current';
    if(session){const item=this._makeVariant(session.confirmed);item.session=session;item.edited=true;this._variants.set('current',item);}
    this._status(session?.entry||session?.working&&hasDraftChanges(session)?'つくりかけから再開しました。聴いてオッケーで確定します。':'きめたところから再開しました。');
    this._emit(true);
  }

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
    const bars=result.bars??captureOptions.loop?.bars??4;
    this._variants.set('current', this._makeVariant({ bars, gridStep: 1, notes: clone(result.notes ?? []) }));
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
          const notes = quantizeSegments(analyzed.segments, settings.tempo,bars*16);
          this._variants.set(mode, this._makeVariant({ bars, gridStep: 1, notes }));
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

  stageRecording(result,captureOptions={}){
    const previous=this._active?.session;
    if(!previous){this.load(result,captureOptions);return;}
    const replacement={...clone(previous.working.pattern),gridStep:1,source:'humming',notes:clone(result.notes??[])};
    const candidate=this._makeVariant(replacement);
    candidate.session={...clone(previous),working:{...candidate.session.working,revision:previous.working.revision+1},entry:null,history:[...previous.history,clone(previous.working)]};
    this._variants.clear();this._variant='current';this._variants.set('current',candidate);
    this._status('録り直しの候補です。きめたメロディーは残しています。聴いてオッケー。');this._emit(true);
  }
  stageTapRecording(pattern){
    const previous=this._active?.session;if(!previous)return;
    const candidate=this._makeVariant(pattern);
    candidate.session={...clone(previous),working:{...candidate.session.working,revision:previous.working.revision+1},entry:null,history:[...previous.history,clone(previous.working)]};
    this._variants.clear();this._variant='current';this._variants.set('current',candidate);
    this._status('タップ録音の候補です。高さや長さを直して、オッケーで決めよう。');this._emit(true);
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
      inputCursor:this.cursor, inputCandidate:this.entry?clone(this.entry.input):null, inputError:this.entry?.proposal.code??null,
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
    if(this.entry) {this._status('入力候補を確定するか取り消してから、編集する音を選んでください。');return;}
    const next = selectEditNote(this._active.session,noteId);
    if (next.code) return;
    this._active.session=next;
    this._emit(false);
    this._revealSelection(true);
  }

  command(command) {
    if(this._busy || !this.isOpen) return;
    if(command==='confirm') return this._confirm();
    if(command==='undo') return this._undo();
    if(command==='cancel') return this._cancel();
    if(this.entry) {this._status('入力候補を確定するか取り消してください。');return;}
    const notes=orderedNotes(this._active.state.pattern.notes), index=notes.findIndex(n=>n.id===this._active.state.selectedNoteId), note=notes[index];
    if(!note) return;
    if(command==='delete') return this._stage({type:'delete',noteId:note.id});
    if(command.startsWith('delete:')) {
      const target=selectionTarget(notes,note.id,command.replace('delete:','select:'));
      if(!target) {this._status('その番号の音はありません。ブロックの番号を確認してください。');return;}
      this._active.session=selectEditNote(this._active.session,target);
      return this._stage({type:'delete',noteId:target});
    }
    if(['first','last','next','previous'].includes(command) || command.startsWith('select:')) {
      const target=selectionTarget(notes,note.id,command);
      if(target) return this._select(target);
      this._status('その番号の音はありません。ブロックの番号を確認してください。');
      return;
    }
    if(command==='up' || command==='down') this._stage({type:'replace',noteId:note.id,midi:note.midi+(command==='up'?1:-1),startTick:note.startTick,durationTick:note.durationTick});
  }

  _stage(command) {
    if(this.entry) {this._status('入力候補を確定するか取り消してください。');return;}
    const next=stageEdit(this._active.session,command);
    if(next.code) {this._status(messages[next.code] ?? 'この変更はできません。');return;}
    this._active.session=next; this._active.edited=true;
    this._status(command.type==='delete'
      ? '仮に消しました。その場所は休符になります。「もどす」で戻せます。確認してからオッケー。'
      : '仮の変更です。ほかの音も直せます。「流れを聴く」で確認してからオッケー。');
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
    const adding=!!this.entry;
    const next=adding?confirmEntry(this._active.session):confirmEditSession(this._active.session);
    if(next.code) {this._status(messages[next.code]??next.code);return;}
    this._active.session=next;this._active.edited=true;
    this._active.session.confirmedCursor=this._active.session.working.cursor;
    this._status(adding?'追加を確定しました。次の音を入力できます。':'まとめて確定しました。続けて編集できます。この作業中は「もどす」が使えます。');
    this._emit(false,true,true);
  }

  _cancel() {
    if(this._busy || !this.isOpen || !this.pending) return;
    this._active.session=this.entry?cancelEntry(this._active.session):cancelEditSession(this._active.session);
    this._status('最後に確定した音列へ戻しました。'); this._emit(false);
  }

  _undo() {
    if(!this._busy && this.isOpen && this.entry) return this._cancel();
    if(this._busy || !this.isOpen || !this._active.session.history.length) return;
    this._active.session=undoEditSession(this._active.session);
    this._status('ひとつ戻しました。仮の音列を確認してオッケーで確定してください。'); this._emit(false);
  }

  _render(fields) {
    const elements = this._elements, active = this._active, locked = this._busy || !this.isOpen;
    elements['capture-variant'].value = this.variant;
    elements['capture-variant'].disabled = locked || this.pending;
    for (const option of elements['capture-variant'].options) option.disabled = !this._variants.has(option.value);
    const notes = orderedNotes(active?.state.pattern.notes ?? []);
    if(active) for(const id of ['capture-edit-start','capture-edit-length','capture-split-at']) elements[id].max=String(active.state.pattern.bars*16);
    for (const button of this._transposeButtons) {
      const step=Number(button.dataset.transpose);
      button.disabled=locked || !notes.length || notes.some(n=>n.midi+step<0 || n.midi+step>127);
    }
    const selected = notes.find(note => note.id === active?.state.selectedNoteId);
    const selectedIndex=notes.indexOf(selected);
    elements['capture-selection'].textContent=selected
      ? `${selectedIndex+1} / ${notes.length} ばんめの音・${Math.floor(selected.startTick/16)+1}小節目・${pitchName(selected.midi)}`
      : '音がありません';
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
      'capture-split-at', 'capture-edit-replace', 'capture-edit-delete', 'capture-edit-split', 'capture-edit-merge', 'capture-pitch-up', 'capture-pitch-down', 'capture-next', 'capture-previous', 'capture-first', 'capture-last']) {
      elements[id].disabled = locked || !selected;
    }
    for(const id of ['capture-first','capture-previous']) elements[id].disabled ||= selectedIndex<=0;
    for(const id of ['capture-last','capture-next']) elements[id].disabled ||= selectedIndex===notes.length-1;
    elements['capture-edit-confirm'].disabled = locked || !!this.entry?.proposal.code || (this.accepted && !this.pending);
    elements['capture-edit-cancel'].disabled = this._busy || !this.pending;
    elements['capture-edit-undo'].disabled = locked || (!this.entry && !active?.session.history.length);
    const blocks=elements['capture-blocks'], focusedId=blocks.contains(document.activeElement)?document.activeElement.dataset.noteId:null;
    const scrollLeft=blocks.scrollLeft;
    blocks.replaceChildren();
    for(const [i,note] of orderedNotes(this.previewPattern?.notes??[]).entries()) {
      const button=document.createElement('button');button.dataset.noteId=note.id;
      const number=document.createElement('strong');number.textContent=String(i+1);
      const pitch=document.createElement('span');pitch.textContent=pitchName(note.midi);
      button.append(number,pitch);
      button.setAttribute('aria-pressed',String(note.id===selected?.id));button.disabled=locked || !notes.some(n=>n.id===note.id);
      button.setAttribute('aria-label',`${i+1}ばんめの音 ${pitchName(note.midi)}`);
      button.style.borderTopWidth=`${4+Math.min(24,note.midi-Math.min(...(this.previewPattern?.notes??[]).map(n=>n.midi)))*2}px`; blocks.append(button);
    }
    blocks.scrollLeft=scrollLeft;
    if(focusedId) [...blocks.children].find(button=>button.dataset.noteId===focusedId)?.focus({preventScroll:true});
    this._highlight();
    if(this.isOpen) queueMicrotask(()=>{if(this.isOpen) this._revealSelection();});
  }

  _revealSelection(explicit=false) {
    if(this._playbackKey!=null) return;
    const manual=this._active?.state.pattern.source==='manual';
    if(manual && !explicit) return;
    const score=this._elements['capture-score'];
    const selected=score.querySelector('[data-editor-selected="true"]');
    if(!selected) return;
    // Move the score's own viewport, so selecting a late note does not send
    // the controls off the phone screen. Use the head, not the whole tie group.
    const head=selected.querySelector('ellipse') ?? selected;
    const bounds=head.getBoundingClientRect(), viewport=score.getBoundingClientRect();
    const staff=selected.closest('svg'), fit=document.body.classList.contains('editor-focus');
    score.scrollTo({left:fit?0:score.scrollLeft+bounds.left-viewport.left-(score.clientWidth-bounds.width)/2,
      top:fit?score.scrollTop+staff.getBoundingClientRect().top-viewport.top-2:score.scrollTop+bounds.top-viewport.top-(score.clientHeight-bounds.height)/2,behavior:'instant'});
    const blocks=this._elements['capture-blocks'];
    const block=[...blocks.children].find(button=>button.dataset.noteId===this._active.state.selectedNoteId);
    if(block) blocks.scrollLeft+=block.getBoundingClientRect().left-blocks.getBoundingClientRect().left-(blocks.clientWidth-block.offsetWidth)/2;
    const visibleHead=head.getBoundingClientRect(), footer=document.querySelector('footer').getBoundingClientRect();
    const toolbar=document.querySelector('.edit-toolbar').getBoundingClientRect();
    if(!manual && !document.body.classList.contains('melody-app') && (visibleHead.top<Math.max(0,toolbar.bottom) || visibleHead.bottom>footer.top)) {
      document.getElementById('capture-note-panel').scrollIntoView({block:'start',behavior:'instant'});
    }
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

  invalidatePlayback(){this._playbackKey=null;}
  followPlayback(tick,{notes:showNotes=true,scrollPage=true}={}) {
    const score=this._elements['capture-score'], blocks=this._elements['capture-blocks'];
    if(tick==null) {
      if(this._playbackKey==null) return;
      this._playbackKey=null;
      score.classList.remove('is-playing');blocks.classList.remove('is-playing');
      for(const node of [...score.querySelectorAll('[data-playing]'),...blocks.querySelectorAll('[data-playing]')]) {
        node.removeAttribute('data-playing');node.removeAttribute('aria-current');
      }
      this._render(false);return;
    }
    if(!this.isOpen) return;
    const notes=showNotes?orderedNotes(entryPreview(this._active.session).notes):[];
    const index=notes.findIndex(n=>n.startTick<=tick && tick<n.startTick+n.durationTick);
    const note=notes[index], bar=Math.min(this._active.state.pattern.bars-1,Math.floor(tick/16));
    const fragment=showNotes?[...score.querySelectorAll('[data-start-tick]')].find(n=>Number(n.dataset.startTick)<=tick && tick<Number(n.dataset.startTick)+Number(n.dataset.durationTick)):null;
    const key=`${bar}:${showNotes?'notes':Math.floor(tick/4)%4}:${note?.id??'rest'}:${fragment?.dataset.startTick??''}`;
    if(key===this._playbackKey) return;
    this._playbackKey=key;
    score.classList.add('is-playing');blocks.classList.add('is-playing');
    for(const node of score.querySelectorAll('[data-playing]')) node.removeAttribute('data-playing');
    const staff=score.querySelector(`[data-bar="${bar}"]`);
    staff?.setAttribute('data-playing','bar');fragment?.setAttribute('data-playing','note');
    for(const block of blocks.children) {
      if(block.dataset.noteId===note?.id) {block.setAttribute('data-playing','note');block.setAttribute('aria-current','true');
        blocks.scrollLeft+=block.getBoundingClientRect().left-blocks.getBoundingClientRect().left-(blocks.clientWidth-block.offsetWidth)/2;
      } else {block.removeAttribute('data-playing');block.removeAttribute('aria-current');}
    }
    this._elements['capture-selection'].textContent=note
      ? `再生 ${bar+1}小節・${index+1} / ${notes.length} ばん・${pitchName(note.midi)}`
      : showNotes?`再生 ${bar+1}小節・休符`:`伴奏 ${bar+1}小節・${Math.floor(tick/4)%4+1}拍`;
    if(staff) score.scrollTo({left:0,top:score.scrollTop+staff.getBoundingClientRect().top-score.getBoundingClientRect().top-2,behavior:'instant'});
    const viewport=score.getBoundingClientRect(), footer=document.querySelector('footer').getBoundingClientRect();
    if(scrollPage&&(viewport.top<0 || viewport.bottom>footer.top)) document.getElementById('capture-note-panel').scrollIntoView({block:'start',behavior:'instant'});
  }
}
