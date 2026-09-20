# ロゴ制作プロンプト

2026-09-18。組み込み image_gen を使用。採用した構成は **ピタリ＋ズム／メモリ＋ズム**。配信用SVGは生成した部品のWebPを内包し、共通ズムの画素と配置を揃える。

## pitari

Edit this ピタリズム logo asset. Keep ONLY its first three glyphs ピタリ, and remove the last two glyphs ズム entirely. Preserve the exact shapes of those first three glyphs from the reference! In particular the middle glyph must be タ, with its original slanted top-left stroke and diagonal inner stroke; do NOT change it into ヌ. Recolor navy strokes to flat soft apricot #df967c and keep ピ's hollow handakuten ring flat honey #e5b85e. Flat opaque fill only. REMOVE all glow, blur, shading, shadows and any stray pixels. Genuine transparent background, tightly cropped wide horizontal canvas with modest clear margin. No new shapes, no new font, no other letters. Exact final text ピタリ.

## memori

Edit this メモリズム logo asset. Keep ONLY its first three glyphs メモリ, removing the last two glyphs ズム entirely. Preserve the exact shapes of メモリ from the reference, including the two distinct strokes of リ and the curved bottom of モ. Recolor ALL strokes uniformly flat soft sage #8fa58a. Do not keep blue or teal accents. Flat opaque fill only, no gradient, glow, haze, shadows or background. Clean antialiased edges with no stray pixels. Genuine transparent background, tightly cropped wide horizontal canvas with modest clear margin. No other text or icon. Exact final text メモリ.

## zum

Production Japanese educational toy brand LOGO COMPONENT. Crisp flat opaque colors on truly transparent background. Absolutely NO glow, haze, shadow, gradient, texture, shading, or lighting. Use softly rounded chunky geometric katakana, reassuring and warm, clearly legible with airy counters. Consistent stroke thickness and a level optical baseline. Tight landscape canvas, 5% empty margin. No separate icons, no extra text, no English. The attached reference is style guidance ONLY; do not reproduce its full text. Render EXACTLY ズム (two glyphs). Only ズム, no リ. These two letters are the COMMON SUFFIX across ピタリズム and メモリズム and future games. Both glyphs and dakuten marks uniformly warm cocoa brown #88644f. Reuse the rounded reassuring visual language of the reference. Fully opaque flat interiors, sharp clean antialiased edges.

## イロドリズム・ジントリズムの接頭部

2026-09-20。既存のベクター接頭部を調整。ピタリズム・メモリズムを参考に、共通「ズム」と釣り合う38pxの筆画（濁点20px）へ統一。「リ」を12px左に寄せ、接頭部と「ズム」の間は12px。色と共通部品は維持。再書き出しは `node scripts/export-wordmarks.cjs`。

同日の追加指示で、ジントリの接頭部はオセロの2色の石をイメージした交互配色へ変更。「ジ・ト」は濃いセージ `#65765a`、「ン・リ」は砂色 `#c1ac87`。共通「ズム」は既存の茶色を維持。

## コエキットのアイコン

Icon only; a navy rounded speech bubble assembled from interlocking toy-kit pieces and voice-wave bars, with one sunny-yellow piece. Deep blue #284f85, yellow #f4c64e. Simple silhouette, no letters or separate text. Centered composition within the central 64 percent, suitable for PWA maskable icons. The generated source has a transparent background; deployment PNGs use #f2f6fb beneath the unchanged mark.

