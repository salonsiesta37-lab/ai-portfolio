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

// ── ヘッダースクロール ───────────────────────────────────────

/**
 * スクロール時のヘッダーシャドウを初期化する（単一責任: ヘッダー制御のみ）
 * scroll イベントは毎フレーム発火するため使わず、ページ最上部の
 * センチネル要素が画面外に出たかを IntersectionObserver で監視する
 * @returns {void}
 */
function initScrollHeader() {
  const header   = document.getElementById('header');
  const sentinel = document.getElementById('scrollSentinel');
  if (!header || !sentinel) return;
  const io = new IntersectionObserver(([entry]) => {
    header.classList.toggle('scrolled', !entry.isIntersecting);
  });
  io.observe(sentinel);
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
  const grid = document.getElementById('worksGrid');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter ?? 'all';
      updateFilterButtons(filterBtns, btn);
      updateWorkCards(workCards, filter);
      // 絞り込み中は非対称レイアウトを解除し、空きセルを作らない
      grid?.classList.toggle('is-filtered', filter !== 'all');
    });
  });
}

// ── エントリーポイント ───────────────────────────────────────

/**
 * アプリケーションを初期化する
 * @returns {void}
 */
function main() {
  initScrollHeader();
  initReveal();
  initWorksFilter();
  initContactForm();
}

// DOM 構築完了後に実行
document.addEventListener('DOMContentLoaded', main);
