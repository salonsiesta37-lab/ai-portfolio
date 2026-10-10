# tasteskill: ai-portfolio のプロジェクト設定

このファイルは taste-skill（`SKILL.md`）をこのサイトに適用したときの判断記録です。
サイトを変更する前に読み、ここで決めた内容と矛盾しないようにしてください。

## Design Read

> Reading this as: **redesign (preserve)** of a solo AI-creator portfolio for clinic, home-nursing and beauty-salon owners in Japan, with a **quiet luxury-Japanese editorial** language, leaning toward **native CSS + Cormorant Garamond / Shippori Mincho + restrained IntersectionObserver motion**.

- モード: Redesign / Preserve（Section 11）。IA・アンカー ID・ナビラベル・フォームの name 属性は変えない。
- Dials: `DESIGN_VARIANCE 5` / `MOTION_INTENSITY 5` / `VISUAL_DENSITY 3`

## 意図的に残しているもの（Section 11.C ブランド保持による override）

| taste-skill の既定 | このサイトでの判断 | 理由 |
|---|---|---|
| beige + brass + espresso 系パレットは既定で使わない（4.2） | cream `#FDF5EE` / gold `#C9A96E` / brown `#2C1A0E` を維持 | 既存ブランドの色。美容サロン Siesta とのトーン統一 |
| serif は既定で使わない（4.1） | Cormorant Garamond（欧文）+ Shippori Mincho（和文） | luxury / editorial の方向性で、Cormorant は許可リスト内 |
| 大文字 + 字間の広いラベル | ナビ・フィルター・カードのカテゴリ表記で継続 | ブランドの書体表現。セクション上の eyebrow は Contact の 1 つだけ |

## taste-skill の監査で直したこと

- カスタムマウスカーソルを削除（9.A）
- 縦書き「SCROLL」と脈動ラインのスクロールキューを削除（9.F）
- Contact の回転した巨大「Contact」装飾文字を削除（9.F）
- セクション eyebrow を 4→1 に削減（4.7 Eyebrow restraint）
- 表示テキストと alt から em-dash（—）を全削除（9.G）
- ヒーロー: `<br>` 改行 + イタリックの見出しを 2 行に収まる流し組みへ。テキスト要素を 4 つ以内に。concentric circle の装飾を実際の制作物 2 点の重ねビジュアルに置換（4.7 / 4.8）
- `height: 100vh` → `min-height: 100dvh`
- ページ途中で暗転する Contact / Footer をやめ、同系色トーンに統一（4.11 Page Theme Lock）
- `prefers-color-scheme: dark` に追従するダークモードをトークンで実装（6.C）
- Skills の番号付き 4 等分カードを、罫線と余白だけの 2×2 に（9.C / 9.F の番号ラベル禁止）
- Works を 12 カラムの非対称ギャラリー（7/5 → 5/7 → 6/6）に。フィルター中は均等 2 カラムで空きセルなし
- 分野紹介（Medical / Beauty）に実際の制作物画像を追加（4.7 Bento background diversity）
- `window.addEventListener('scroll')` を IntersectionObserver に置換（5.D）
- 小さいゴールド文字は `--accent-ink`（AA 4.5:1 以上）を使用（4.5 Contrast）
- 1.6〜4.8MB の PNG を 55〜180KB の WebP（640 / 1200 の srcset）に変換（6.D LCP）
- skip link、`<main>`、favicon、ボタンの `:active` 押下フィードバックを追加
- 和文は `word-break: auto-phrase` で文節改行。ソースの改行による和文中の余計な空白も除去

## 今後の変更ルール

- 色は `css/style.css` の `:root` トークンだけを使う。ライト / ダーク両方で確認する。
- アクセントはゴールド 1 色。小さな文字には `--accent-ink`、線と面には `--accent`。
- 角丸なし（Shape lock: all-sharp）。影は `--shadow`（ブラウン系の色付き影）のみ。
- モーションは `.reveal` と `var(--ease)` を再利用し、`prefers-reduced-motion` で止まることを確認する。
- 新しい画像は `img/` に WebP（640 / 1200）で置き、`width` / `height` を指定する。
