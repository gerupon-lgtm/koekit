# 部品ごとのデータと旧曲の移行

2026-10-31。今回の[合意仕様](project-workflow-20261031.md)と[実装記録](project-workflow-implementation-20261031.md)の補足。

## 保存する内容

DB `koekit-saezuri`、songsレコードのschemaVersion=1、曲上限10、既存の世代比較と直列保存は維持。`data.project` を任意追加する。

```js
project: {
 version: 1,
 activeId: 'part id or null',
 parts: [{id, name, patternId: 'sequence.patterns id or null', mode, checkpoint}]
}
```

部品checkpointは既存のconfirmedとdraftを再利用。空でも作成済み部品はdraftに初期状態を持ち、構造・音符候補・イメージ候補を保つ。音を確定すると、その部品の確定内容をsequence.patternsへ同期する。保存は確定操作ではない。未確定音はpatternへ入れない。配置から外してもproject.partsとpatternsを残す。

配置済みpatternの音楽内容は直接上書きしない。保存側でも使用済みIDの内容変更を検知し、独立した部品へ分離する。配置の特定箇所編集は既存derive/commitを使い、元の部品・他の配置を維持する。

`sequenceDraft`は並びの候補、`placementDraft`は一か所の修正草稿。保留した修正中に別の並び候補を作れないよう、追加・移動・外す・Undo・エンディングを保護する。座標・長押しタイマー・ゴーストは保存しない。

## 移行と失敗保護

projectがない旧曲は、登録済みpatternsを部品として読み、旧checkpointは独立した「つくりかけ」に移す。同じ音でも元の作業を消さない。placementDraftも保持して、全体の「この場所の修正をつづける」から再開する。元の音・伴奏・調・BPMは変更しない。

未知のproject版、不正な参照やcheckpointは開かず、保存済みレコードを維持する。既にprojectを持つ曲を、projectなしの旧版の保存処理で上書きしようとすると拒否する。保存失敗・削除済み・世代競合では作業を画面に残す。トップへは保存終了後に移り、未保存分の破棄は別確認を経る。

## 制作中だけ保持する内容

部品ごとに既存編集器のparkWorkspaceを保持し、通常の全体往復・切替で選択・Undoを失わない。一か所修正にも同様の一時保存を使う。再読込後のUndo履歴は保存しない。並びのUndoは部品の最新内容を優先し、独立した編集を巻き戻さない。

サンプルの試用・おてほんは保存枠を使わない。明示的に自分の曲へ移した時から通常の保存・上限・競合保護を使う。
