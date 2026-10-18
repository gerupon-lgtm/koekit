# Saezurhythm Four-Bar Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved progressive four-bar tutorial with touch/voice editing and compact counted auditions.

**Architecture:** Keep CaptureEditorView, edit/entry sessions, ProbeTransport, existing voices and ordinary song workflows. Add focused tutorial data/guide/view modules; route tutorial auditions through shared playback. Preserve existing ordinary defaults.

**Tech Stack:** Native HTML/CSS/JS ES modules, local Vosk, Web Audio; Node and one Chrome at a time.

**Spec:** `docs/melody/tutorial-four-bars-20261018.md`.

## Global Constraints

- No build pipeline, runtime CDN, external voice submission, or automatic candidate confirmation.
- Work in `.local-tools/saezuri-workflow-release`, branch `codex/saezuri-continuation-20261018`; leave the dirty original checkout alone.
- 112 BPM, 4 bars, 15 attacks; tied E at tick46 has duration4; last D/C/C at50/54/56 have durations4/2/8.
- Every tutorial audition starts with one bar of four pulses per beat; stopping cancels all scheduled audio.
- Preserve manual work, Undo, storage, keyboard, humming, loop recording, placement/ending and other apps.
- Cache-stamp all changed/new runtime assets and display the resulting BUILD; distinguish browser checks from phone acceptance.

## Review Focus

1. Candidate, Undo and guide progression disagree after a wrong note, rest, cancellation or a returned step — pin in Task 3.
2. Length extension across a bar retriggers E or leaves the next cursor at the old endpoint — pin in Tasks 1 and 3.
3. Count or delayed audio survives closing/navigation; a modal prevents voice confirmation — pin in Tasks 2 and 3.
4. View changes restart playback, shrink notation illegibly or hide stop on a small phone — pin in Task 2.
5. Tutorial data/voice/state escapes into saved ordinary work or previous editing/recording — pin in Task 3 and release regression.

---

### Task 1: Target, accompaniment and duration commands

**Files:** Create `probe/saezuri/tutorial-data.js`, `scripts/test-saezuri-tutorial-data.mjs`; modify `entry-voice.js`, `creation-voice.js`, `capture-editor-view.js`, `composer-controls.js`, `edit-session.js`, `app.js`, `saezuri/music/accompaniment.js` and relevant existing unit tests.

**Interfaces:** Produce `tutorialPattern({backing=false}={})` (fresh validated 4-bar manual pattern), `tutorialExcerpt(pattern,startTick,endTick)` (clipped/shifted display pattern, notes, accompaniment, totalTicks), `CaptureEditorView.changeNoteLength(durationTick)` (candidate only). The accompaniment rhythm id `tutorial` has the spec's exact event pattern and a visible label. Ordinary rhythm ids retain behavior.

- [x] Write tests for exact 15 attacks, cross-bar split/hold, fresh copies, 140 accompaniment events and excerpt clipping; 1.5-beat spoken aliases and standalone duration commands, rejecting fragments/ambiguous text.
- [x] Run `node --test scripts/test-saezuri-tutorial-data.mjs scripts/test-saezuri-entry-voice.mjs`; Expected: new requirements fail before implementation.
- [x] Implement target/excerpts, the tutorial rhythm, duration parsing and candidate-only length changes. Follow the endpoint when editing the last note, preserving pitch and overlapping-note validation.
- [x] Run the above plus `test-saezuri-accompaniment.mjs`, `test-saezuri-entry-session.mjs`, `test-saezuri-capture-editor.mjs`; Expected: all pass.
- [x] Commit Task 1 with its tests.

### Task 2: Counted compact audition and shared melody view

**Files:** Create `probe/saezuri/tutorial-view.js`, `tutorial-preview.js`, `tutorial.css`, `scripts/test-saezuri-tutorial-preview-browser.cjs`; modify `audio.js`, relevant transport tests and HTML styles/imports.

**Interfaces:** Produce `TutorialPreview` with `open(data,{onHeard,onClose})`, `play()`, `follow()`, `stop()` and `close()`, using injected shared playback callbacks; `renderTutorialView(container,pattern,{display,selectedId,onSelect})`. Extend `ProbeTransport.start` with optional `preRollTicks=0,preRollStep=1` while keeping ordinary starts unchanged.

- [x] Add failing timing checks for 16 count attacks before music, no early music/active notes, count cancellation and ordinary transport defaults.
- [x] Implement one-bar count in the shared transport; implement cards/compact staff and audition controls from approved layout14. No duplicated synthesis engine or standalone copied app.
- [x] Verify `node scripts/test-saezuri-tutorial-preview-browser.cjs`; Expected: four bars fit 320×568 and other target viewports, chord labels at bar heads, notes/rest/dot/tie correct, view switch preserves anchor, close/stop cancel audio, no JS errors.
- [x] Run existing count/loop/default-sound browser checks once; Expected: pass without changing their ordinary expectations.
- [x] Commit Task 2 with its checks.

### Task 3: Progressive lesson, editing UI and voice path

**Files:** Create `probe/saezuri/tutorial-guide.js`, `scripts/test-saezuri-tutorial-guide.mjs`, `scripts/test-saezuri-tutorial-browser.cjs`; modify `learning.js`, `screens.js`, `app.js`, relevant tutorial/voice/layout tests.

**Interfaces:** Consume Task1 target/excerpt/length API and Task2 view/preview. Produce `lessonGuide(editor,{stage,heard})` with one action/target and a completion flag; `MelodyLearning.handleVoice(command)` for bounded tutorial navigation/preview/backing commands. Keep tutorial source ephemeral until explicit normal registration.

- [x] Write failing guide and browser cases for intro→2 notes→1 bar→2 bars→3 bars→tie→4 bars→backing, including rest-confirmation cursor, wrong input/Undo/cancel and explicit next.
- [x] Implement one action at a time, existing pitch-edit guidance, visible half/1/1.5/2 lengths, selected-note duration editing, endpoint following and backing candidate. Reuse all core edit transactions.
- [x] Wire counted auditions to existing audio/mixer/stop lifecycle. Voice commands must reach replay/close/confirm/next after an audition; recognition remains bounded to the appropriate interval.
- [x] Run `node --test scripts/test-saezuri-tutorial-guide.mjs scripts/test-saezuri-learning.mjs` and `node scripts/test-saezuri-tutorial-browser.cjs`; Expected: full touch and injected voice paths pass, no automatic confirmation, no tutorial save-slot consumption, all target sizes fit minimum operations.
- [x] Run existing learning/layout, composer, creation-voice, songs, keyboard and navigation regressions; Expected: pass (update old two-note-only assertions to approved multi-stage behavior where needed).
- [x] Commit Task 3 with its checks.

### Task 4: Review, cache/version and delivery evidence

**Files:** Modify canonical handoff/tasks/implementation records, `sw.js` and assets through canonical stamp tools; add release verification inputs if needed.

- [x] Run the focused Node suite and representative sequential browser regression under the resource-safe runner; Expected: green, with actual outputs recorded.
- [x] Run a fresh whole-branch review using the spec, this plan, ledger and branch diff. Fix important findings with a reproducing test; record remaining boundaries.
- [x] Run canonical cache stamp and version/cache checks, and rerun only affected release checks; Expected: new BUILD, all runtime import/style paths stamped, ordinary storage and routes intact.
- [x] Commit release records and changes. Deliver the approved implementation; honor the current deployment authorization only after checking the latest repository/publication instructions.
- [x] Record what was verified locally/publicly and what remains for Pixel/iPhone real voice/listening; do not call the entire Saezurhythm project complete.
