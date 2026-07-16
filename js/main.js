// @ts-check
'use strict';

/* ================================================================
   AI Creative Portfolio — main.js
   方針:
     - JSDoc で TypeScript 同等の型定義
     - 関数は単一責任（1関数1役割）
     - マジックナンバーを CONFIG 定数に集約
     - XSS 対策: DOM 操作は textContent / hidden 属性を使用
   ================================================================ */

// ── 型定義 ──────────────────────────────────────────────────────

/**
 * 2D 座標
 * @typedef {{ x: number, y: number }} Vec2
 */

/**
 * カーソル DOM 要素
 * @typedef {{ dot: HTMLElement, ring: HTMLElement }} CursorElements
 */

/**
 * フォーム検証結果
 * @typedef {{ valid: boolean, errorMessage: string }} ValidationResult
 */

/**
 * フォーム入力データ
 * @typedef {{ name: string, email: string, message: string }} ContactFormData
 */

/**
 * アプリケーション設定
 * @typedef {{
 *   CURSOR_LERP:        number,
 *   CURSOR_HOVER_DOT:   number,
 *   CURSOR_HOVER_RING:  number,
 *   SCROLL_THRESHOLD:   number,
 *   FORM_RESET_DELAY:   number,
 *   REVEAL_THRESHOLD:   number,
 *   REVEAL_MARGIN:      string,
 *   NAME_MAX:           number,
 *   EMAIL_MAX:          number,
 *   SERVICE_MAX:        number,
 *   MESSAGE_MAX:        number,
 * }} AppConfig
 */

// ── 定数 ────────────────────────────────────────────────────────

/** @type {Readonly<AppConfig>} */
const CONFIG = Object.freeze({
  /** カーソルリングの線形補間係数 */
  CURSOR_LERP:        0.11,
  /** ホバー時のカーソルドットサイズ (px) */
  CURSOR_HOVER_DOT:   12,
  /** ホバー時のカーソルリングサイズ (px) */
  CURSOR_HOVER_RING:  50,
  /** ヘッダーシャドウ発動スクロール量 (px) */
  SCROLL_THRESHOLD:   20,
  /** フォームリセット遅延 (ms) */
  FORM_RESET_DELAY:   3000,
  /** IntersectionObserver 表示しきい値 */
  REVEAL_THRESHOLD:   0.10,
  /** IntersectionObserver ルートマージン */
  REVEAL_MARGIN:      '0px 0px -36px 0px',
  /** 名前フィールド最大文字数 */
  NAME_MAX:           50,
  /** メールアドレス最大文字数 */
  EMAIL_MAX:          100,
  /** サービスフィールド最大文字数 */
  SERVICE_MAX:        100,
  /** メッセージ最大文字数 */
  MESSAGE_MAX:        1000,
});

// ── セキュリティユーティリティ ───────────────────────────────

/**
 * HTML 特殊文字をエスケープする（XSS 対策）
 * ※ textContent を使う限り不要だが、将来 innerHTML を使う場合の備え
 * @param {string} str - エスケープ対象文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── バリデーション ───────────────────────────────────────────

/**
 * メールアドレスの形式を検証する
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  // RFC 5322 の簡易実装（フロントエンド用）
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * フォーム入力データを検証する（単一責任: 検証のみ）
 * @param {ContactFormData} data
 * @returns {ValidationResult}
 */
function validateFormData({ name, email, message }) {
  if (!name.trim()) {
    return { valid: false, errorMessage: 'お名前を入力してください' };
  }
  if (name.length > CONFIG.NAME_MAX) {
    return { valid: false, errorMessage: `お名前は ${CONFIG.NAME_MAX} 文字以内で入力してください` };
  }
  if (!email.trim()) {
    return { valid: false, errorMessage: 'メールアドレスを入力してください' };
  }
  if (!isValidEmail(email)) {
    return { valid: false, errorMessage: '正しいメールアドレス形式で入力してください' };
  }
  if (email.length > CONFIG.EMAIL_MAX) {
    return { valid: false, errorMessage: `メールアドレスは ${CONFIG.EMAIL_MAX} 文字以内で入力してください` };
  }
  if (!message.trim()) {
    return { valid: false, errorMessage: 'メッセージを入力してください' };
  }
  if (message.length > CONFIG.MESSAGE_MAX) {
    return { valid: false, errorMessage: `メッセージは ${CONFIG.MESSAGE_MAX} 文字以内で入力してください` };
  }
  return { valid: true, errorMessage: '' };
}

// ── フォーム UI ──────────────────────────────────────────────

/**
 * フォームにエラーメッセージを表示する（単一責任: エラー表示のみ）
 * textContent を使用して XSS を防止
 * @param {HTMLFormElement} form
 * @param {string} message
 * @returns {void}
 */
function showFormError(form, message) {
  removeFormError(form);
  const el = document.createElement('p');
  el.className = 'form-error-msg';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message; // innerHTML ではなく textContent で XSS 対策
  form.prepend(el);
}

/**
 * フォームのエラーメッセージを削除する（単一責任: エラー削除のみ）
 * @param {HTMLFormElement} form
 * @returns {void}
 */
function removeFormError(form) {
  form.querySelector('.form-error-msg')?.remove();
}

/**
 * 送信成功 UI を表示する（単一責任: 成功表示のみ）
 * @param {HTMLButtonElement} btn
 * @returns {void}
 */
function showFormSuccess(btn) {
  btn.textContent = 'SENT ✓';
  btn.classList.add('submit-btn--sent');
  btn.disabled = true;
  btn.setAttribute('aria-label', '送信完了');
}

/**
 * フォームを初期状態にリセットする（単一責任: リセットのみ）
 * @param {HTMLFormElement} form
 * @param {HTMLButtonElement} btn
 * @returns {void}
 */
function resetContactForm(form, btn) {
  form.reset();
  removeFormError(form);
  btn.textContent = 'SEND MESSAGE';
  btn.classList.remove('submit-btn--sent');
  btn.disabled = false;
  btn.setAttribute('aria-label', 'メッセージを送信');
}

/**
 * コンタクトフォームの送信を処理する（単一責任: イベント制御のみ）
 * @param {SubmitEvent} e
 * @returns {void}
 */
function handleContactSubmit(e) {
  e.preventDefault();
  const form = /** @type {HTMLFormElement} */ (e.currentTarget);
  const btn  = /** @type {HTMLButtonElement | null} */ (form.querySelector('.submit-btn'));
  if (!btn) return;

  // フォームデータを安全に取得
  const name    = /** @type {HTMLInputElement}  */ (form.querySelector('#contact-name')).value;
  const email   = /** @type {HTMLInputElement}  */ (form.querySelector('#contact-email')).value;
  const message = /** @type {HTMLTextAreaElement}*/ (form.querySelector('#contact-message')).value;

  const { valid, errorMessage } = validateFormData({ name, email, message });
  if (!valid) {
    showFormError(form, errorMessage);
    return;
  }

  removeFormError(form);
  showFormSuccess(btn);
  setTimeout(() => resetContactForm(form, btn), CONFIG.FORM_RESET_DELAY);
}

/**
 * コンタクトフォームを初期化する（単一責任: イベント登録のみ）
 * @returns {void}
 */
function initContactForm() {
  const form = document.querySelector('.contact-form');
  if (!(form instanceof HTMLFormElement)) return;
  // inline onsubmit ではなく addEventListener でイベント登録（CSP 準拠）
  form.addEventListener('submit', handleContactSubmit);
}

// ── カスタムカーソル ─────────────────────────────────────────

/**
 * カーソルリングの線形補間を1フレーム分実行する（単一責任: 座標計算と描画のみ）
 * rAF の再スケジュールは initCursor 内の loop() が担当する
 * @param {CursorElements} els
 * @param {Vec2} mouse  マウス座標（参照型で最新値を参照）
 * @param {Vec2} ring   リング現在座標（参照型で更新）
 * @returns {void}
 */
function runCursorLoop(els, mouse, ring) {
  // 線形補間でリングをなめらかに追従
  ring.x += (mouse.x - ring.x) * CONFIG.CURSOR_LERP;
  ring.y += (mouse.y - ring.y) * CONFIG.CURSOR_LERP;
  els.ring.style.left = `${ring.x}px`;
  els.ring.style.top  = `${ring.y}px`;
  // ※ requestAnimationFrame の再スケジュールは initCursor の loop() が担当
}

/**
 * カーソルのホバー状態を更新する（単一責任: ホバー CSS クラスの切替のみ）
 * @param {CursorElements} els
 * @param {boolean} isHover
 * @returns {void}
 */
function setCursorHover(els, isHover) {
  els.dot.classList.toggle('cur--hover',      isHover);
  els.ring.classList.toggle('cur-ring--hover', isHover);
}

/**
 * カスタムカーソルを初期化する（単一責任: カーソル機能のみ）
 * @returns {void}
 */
function initCursor() {
  const dot  = document.getElementById('cur');
  const ring = document.getElementById('curRing');
  if (!dot || !ring) return;

  // prefers-reduced-motion チェック: 動き軽減設定の場合はカーソルを起動しない
  // （CSS 側で cur/cur-ring を display:none にするが、JS ループの無駄な計算も防ぐ）
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // タッチ端末（マウスなし）ではカスタムカーソル自体を起動しない
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  /** @type {CursorElements} */
  const els = { dot, ring };

  /** @type {Vec2} マウス現在座標 */
  const mouse = { x: 0, y: 0 };

  /** @type {Vec2} リング描画座標 */
  const ringPos = { x: 0, y: 0 };

  /** @type {number} cancelAnimationFrame 用 ID */
  let rafId = 0;

  // rAF ループ本体: cancelAnimationFrame(rafId) で停止可能
  function loop() {
    runCursorLoop(els, mouse, ringPos);
    rafId = requestAnimationFrame(loop);
  }

  /** @type {boolean} 初回 mousemove 済みフラグ（フェードイン制御用） */
  let cursorShown = false;

  // マウス移動: ドットは即時追従
  document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    dot.style.left = `${mouse.x}px`;
    dot.style.top  = `${mouse.y}px`;
    if (!cursorShown) {
      cursorShown = true;
      // 初回はリングもマウス位置から追従開始させ、画面外から滑ってくるのを防ぐ
      ringPos.x = mouse.x;
      ringPos.y = mouse.y;
      dot.classList.add('cur--on');
      ring.classList.add('cur-ring--on');
    }
  });

  // インタラクティブ要素のホバー検知（イベント委譲）
  document.addEventListener('mouseover', (e) => {
    if (e.target instanceof Element && e.target.closest('a, button')) {
      setCursorHover(els, true);
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target instanceof Element && e.target.closest('a, button')) {
      setCursorHover(els, false);
    }
  });

  // タブ非表示時にループを停止してバックグラウンドでの無駄な計算を防止
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      rafId = requestAnimationFrame(loop);
    }
  });

  // rAF ループ開始
  rafId = requestAnimationFrame(loop);
}

// ── ヘッダースクロール ───────────────────────────────────────

/**
 * スクロール時のヘッダーシャドウを初期化する（単一責任: ヘッダー制御のみ）
 * @returns {void}
 */
function initScrollHeader() {
  const header = document.getElementById('header');
  if (!header) return;
  window.addEventListener(
    'scroll',
    () => { header.classList.toggle('scrolled', window.scrollY > CONFIG.SCROLL_THRESHOLD); },
    { passive: true },
  );
}

// ── スクロールリビール ───────────────────────────────────────

/**
 * スクロールリビールアニメーションを初期化する（単一責任: 表示アニメのみ）
 * @returns {void}
 */
function initReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target); // 一度表示したら監視解除（パフォーマンス改善）
        }
      });
    },
    { threshold: CONFIG.REVEAL_THRESHOLD, rootMargin: CONFIG.REVEAL_MARGIN },
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

// ── ワークスフィルター ───────────────────────────────────────

/**
 * フィルターボタンの active 状態と aria-pressed を更新する（単一責任: ボタン状態のみ）
 * @param {NodeListOf<HTMLButtonElement>} btns
 * @param {HTMLButtonElement} activeBtn
 * @returns {void}
 */
function updateFilterButtons(btns, activeBtn) {
  btns.forEach((btn) => {
    const isActive = btn === activeBtn;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

/**
 * ワークカードの表示・非表示を更新する（単一責任: カード表示制御のみ）
 * @param {NodeListOf<HTMLElement>} cards
 * @param {string} filter
 * @returns {void}
 */
function updateWorkCards(cards, filter) {
  cards.forEach((card) => {
    // hidden 属性を使用（display:none より意味論的・アクセシブル）
    card.hidden = filter !== 'all' && card.dataset.category !== filter;
  });
}

/**
 * ワークスフィルターを初期化する（単一責任: フィルター機能のみ）
 * @returns {void}
 */
function initWorksFilter() {
  const filterBtns = /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll('.filter-btn')
  );
  const workCards = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('.work-card')
  );

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      updateFilterButtons(filterBtns, btn);
      updateWorkCards(workCards, btn.dataset.filter ?? 'all');
    });
  });
}

// ── エントリーポイント ───────────────────────────────────────

/**
 * アプリケーションを初期化する
 * @returns {void}
 */
function main() {
  initCursor();
  initScrollHeader();
  initReveal();
  initWorksFilter();
  initContactForm();
}

// DOM 構築完了後に実行
document.addEventListener('DOMContentLoaded', main);
