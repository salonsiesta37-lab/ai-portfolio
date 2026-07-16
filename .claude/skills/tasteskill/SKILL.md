---
name: tasteskill
description: このリポジトリ（AI Creative Portfolio）のデザインテイストを守るためのガイドライン。サイトの見た目・文言・アニメーション・レイアウトを追加/変更するとき、また新しいページやコンポーネントを作るときに必ず読むこと。
---

# Tasteskill — AI Creative Portfolio デザイン指針

このサイトのテイストは **「Luxury Japanese Modern」** — 医療・美容業界向けの、
静かで上質、余白と細い線で品格を出すデザイン。派手さ・重さ・過剰装飾は禁物。

## カラー

`css/style.css` の CSS 変数だけを使う。新しい色を勝手に増やさない。

| 変数 | 値 | 役割 |
|---|---|---|
| `--cream` | `#FDF5EE` | 背景の基調 |
| `--brown` | `#2C1A0E` | 見出し・本文の主色、Contact セクション背景 |
| `--brown-light` | `#7A5C45` | 補助テキスト |
| `--gold` | `#C9A96E` | アクセント。線・ラベル・ホバーのみ。面で多用しない |
| `--gold-pale` | `#F5ECD8` | パネル背景 |

- ゴールドは「細い線 1px」「小さなラベル文字」「ホバー反応」に限定して使う。
  大面積のゴールド背景はボタン（`.submit-btn`）以外に作らない。
- 半透明のゴールド `rgba(201,169,110,.1〜.4)` を罫線・装飾円に使うのがこのサイトの流儀。

## タイポグラフィ

- 欧文見出し・ラベル: `'Cormorant Garamond', serif`（font-weight 300–600、イタリックはアクセント）
- 和文: `'Shippori Mincho', serif`（font-weight 300–500）
- ゴシック体・システムフォントは使わない。
- ラベル類は「極小サイズ（9–12px）× 広い letter-spacing（.2em–.5em）× 大文字」が基本形。
- 見出しは `clamp()` で流動サイズ。font-weight は 300 を基本に、太字で強調しない。

## レイアウト・余白

- セクション余白はデスクトップ `120px 80px` / モバイル `72px 24px` を踏襲する。
- 角丸は使わない（border-radius はカーソルの円のみ）。影は極薄
  （例: `0 24px 64px rgba(44,26,14,.10)`）に留める。
- 罫線はすべて 1px。`gradient` の細線 divider（`.divider`）でセクションを区切る。
- セクション見出しは「英字ラベル（.section-label）→ 英字大見出し（.section-title）→
  和文小見出し（.section-title-ja）」の三段構成を守る。

## モーション

- イージングは必ず `var(--ease)`（cubic-bezier(0.25,0.46,0.45,0.94)）。
- 出現アニメは `.reveal` + `.reveal-d1〜d6`（IntersectionObserver 制御）を再利用する。
- 動きは「ゆっくり・小さく・一度だけ」。バウンス・回転・無限ループの装飾は追加しない
  （scroll インジケータの pulse が唯一の例外）。
- `prefers-reduced-motion: reduce` 対応を壊さないこと。新しいアニメを足したら
  reduce ブロックで無効化されるか確認する。

## アクセシビリティ・実装規律

- CSP（`script-src 'self'` / インライン禁止）を守る。inline style 属性・onXXX 属性は書かない。
- 画像は `loading="lazy" decoding="async"`、意味のある `alt`（日本語）を必ず付ける。
- `aria-label` / `role` / `aria-pressed` などの既存パターンを踏襲する。
- フォーカスは `:focus-visible` でゴールドの細線アウトラインを表示する。
- カスタムカーソルは `(hover: hover) and (pointer: fine)` の環境のみ。タッチ端末では
  通常カーソル・非表示にする。

## 文言のトーン

- 日本語は丁寧語で、医療・美容の現場に寄り添う「静かな信頼感」。誇大表現・絵文字・
  感嘆符の多用は避ける。
- 英字ラベルは短い単語（ABOUT / WORKS / SCROLL など）を letter-spacing で見せる。

## やらないことリスト

- 新しいフォント・鮮やかな色・グラデーション背景の追加
- 角丸・強い影・カード浮遊感の強調
- JS ライブラリ・外部 CDN の導入（CSP 違反かつ過剰）
- ダークモード切替などテイストの根幹を変える機能を、依頼なしに追加すること
