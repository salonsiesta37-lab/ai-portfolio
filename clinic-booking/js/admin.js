// @ts-check
'use strict';

/* ================================================================
   受付用 予約一覧 — admin.js

   ・予約枠ごとの空き状況ボード
   ・期間 / 状態 / キーワードで絞り込める予約リスト
   ・CSV 出力・印刷・バックアップ（JSON）

   注意: パスコードはブラウザ内での簡易的な目隠しです。
        院外からアクセスできる場所には置かないでください。
   ================================================================ */

import {
  CLINIC, Store, Api,
  ymd, parseYmd, formatDateJa, formatDateFullJa,
  buildSlots, closedReason, hoursTextOf,
  visitTypeOf,
} from './core.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const STATUS_LABEL = { reserved: '予約済み', visited: '来院済み', canceled: 'キャンセル' };
const SEX_LABEL = { female: '女性', male: '男性', other: '回答しない' };

/** 受付でつけた状態（来院済み・キャンセル）をこの端末に覚えておくキー */
const STATUS_KEY = 'kamei-clinic-status-v1';

/**
 * @type {{ bookings: import('./core.js').Booking[], range: string }}
 */
const state = { bookings: [], range: 'today' };

/** @param {string} message */
function announce(message) {
  $('liveRegion').textContent = message;
}

/* ── パスコード ─────────────────────────────────────────────── */

function guard() {
  if (!CLINIC.adminPasscode) {
    start();
    return;
  }
  $('lockScreen').hidden = false;
  $('lockForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = /** @type {HTMLInputElement} */ ($('passcode'));
    if (input.value === CLINIC.adminPasscode) {
      $('lockScreen').hidden = true;
      start();
    } else {
      $('lockError').textContent = 'パスコードが違います。';
      input.select();
    }
  });
}

/* ── データ読み込み ─────────────────────────────────────────── */

/**
 * 受付でつけた状態の控えを読む
 * @returns {Record<string, import('./core.js').Booking['status']>}
 */
function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * 受付でつけた状態を控えておく（サーバーから読み直しても消えないように）
 * @param {string} id
 * @param {import('./core.js').Booking['status']} status
 */
function writeOverride(id, status) {
  const overrides = readOverrides();
  overrides[id] = status;
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(overrides));
  } catch {
    // 保存領域が使えない場合は、画面上の変更だけにとどめる
  }
}

async function loadBookings() {
  if (!Api.enabled()) {
    state.bookings = Store.all();
    return;
  }
  try {
    const from = /** @type {HTMLInputElement} */ ($('filterFrom')).value || ymd(new Date());
    const to = /** @type {HTMLInputElement} */ ($('filterTo')).value || from;
    const overrides = readOverrides();
    state.bookings = (await Api.list(from, to))
      .map((b) => (overrides[b.id] ? { ...b, status: overrides[b.id] } : b));
  } catch (error) {
    announce(error instanceof Error ? error.message : '一覧を取得できませんでした。');
    state.bookings = Store.all();
  }
}

/** 日時の早い順に並べる */
function sorted() {
  return [...state.bookings].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

/* ── 集計 ───────────────────────────────────────────────────── */

function renderStats() {
  const today = ymd(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = ymd(tomorrowDate);

  const active = state.bookings.filter((b) => b.status !== 'canceled');
  $('statToday').textContent = String(active.filter((b) => b.date === today).length);
  $('statTomorrow').textContent = String(active.filter((b) => b.date === tomorrow).length);
  $('statUpcoming').textContent = String(active.filter((b) => b.date >= today).length);
  $('statCanceled').textContent = String(state.bookings.filter((b) => b.status === 'canceled').length);
}

/* ── 予約枠ボード ───────────────────────────────────────────── */

function renderBoard() {
  const date = /** @type {HTMLInputElement} */ ($('boardDate')).value;
  const visitType = /** @type {HTMLSelectElement} */ ($('boardType')).value;
  const board = $('board');
  board.replaceChildren();

  if (!date) return;

  const closed = closedReason(date);
  $('boardHours').textContent = closed
    ? `${formatDateFullJa(date)} は${closed}です。`
    : `${formatDateFullJa(date)}　診療時間 ${hoursTextOf(date)}`;
  if (closed) return;

  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Record<string, import('./core.js').Booking[]>} */
  const byTime = {};
  for (const b of state.bookings) {
    if (b.date !== date || b.visitType !== visitType || b.status === 'canceled') continue;
    counts[b.time] = (counts[b.time] ?? 0) + 1;
    (byTime[b.time] ??= []).push(b);
  }

  const slots = buildSlots(date, visitType, counts);
  if (slots.length === 0) {
    $('boardHours').textContent += '（この種別で案内できる枠はありません）';
    return;
  }

  for (const slot of slots) {
    const cell = document.createElement('div');
    cell.className = 'board-slot';
    cell.classList.add(slot.booked > 0 ? 'is-taken' : 'is-open');

    const time = document.createElement('p');
    time.className = 'board-time';
    time.textContent = slot.time;

    const count = document.createElement('p');
    count.className = 'board-count';
    count.textContent = `${slot.booked} / ${slot.capacity}`;

    cell.append(time, count);

    for (const b of byTime[slot.time] ?? []) {
      const name = document.createElement('p');
      name.className = 'board-name';
      name.textContent = b.name;
      cell.appendChild(name);
    }
    board.appendChild(cell);
  }
}

/* ── 予約リスト ─────────────────────────────────────────────── */

/** @returns {import('./core.js').Booking[]} */
function filtered() {
  const from = /** @type {HTMLInputElement} */ ($('filterFrom')).value;
  const to = /** @type {HTMLInputElement} */ ($('filterTo')).value;
  const status = /** @type {HTMLSelectElement} */ ($('filterStatus')).value;
  const keyword = /** @type {HTMLInputElement} */ ($('filterKeyword')).value.trim().toLowerCase();

  return sorted().filter((b) => {
    if (from && b.date < from) return false;
    if (to && b.date > to) return false;
    if (status === 'active' && b.status === 'canceled') return false;
    if (status !== 'active' && status !== 'all' && b.status !== status) return false;
    if (keyword) {
      const haystack = `${b.name} ${b.kana} ${b.tel} ${b.code} ${b.email}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

/**
 * 状態変更ボタンを作る
 * @param {import('./core.js').Booking} booking
 * @param {import('./core.js').Booking['status']} next
 * @param {string} label
 */
function actionButton(booking, next, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-btn';
  button.textContent = label;
  button.addEventListener('click', () => {
    Store.update(booking.id, { status: next });
    writeOverride(booking.id, next);
    booking.status = next;
    renderAll();
    announce(`${booking.name} 様のご予約を「${STATUS_LABEL[next]}」に変更しました。`);
  });
  return button;
}

function renderList() {
  const body = /** @type {HTMLTableSectionElement} */ ($('listBody'));
  body.replaceChildren();

  const rows = filtered();
  $('listEmpty').hidden = rows.length > 0;

  for (const b of rows) {
    const tr = document.createElement('tr');
    tr.classList.add(`row-${b.status}`);

    const when = document.createElement('td');
    when.className = 'col-when';
    const day = document.createElement('span');
    day.className = 'cell-date';
    day.textContent = formatDateJa(b.date);
    const time = document.createElement('strong');
    time.className = 'cell-time';
    time.textContent = b.time;
    const code = document.createElement('span');
    code.className = 'cell-code';
    code.textContent = b.code;
    when.append(day, time, code);

    const type = document.createElement('td');
    type.textContent = visitTypeOf(b.visitType).label;

    const name = document.createElement('td');
    const nameMain = document.createElement('strong');
    nameMain.textContent = b.name;
    const nameKana = document.createElement('span');
    nameKana.className = 'cell-kana';
    nameKana.textContent = b.kana;
    name.append(nameMain, nameKana);

    const birthday = document.createElement('td');
    birthday.textContent = `${b.birthday}${b.sex ? `／${SEX_LABEL[/** @type {keyof typeof SEX_LABEL} */ (b.sex)] ?? ''}` : ''}`;

    const contact = document.createElement('td');
    const tel = document.createElement('a');
    tel.href = `tel:${b.tel.replace(/-/g, '')}`;
    tel.textContent = b.tel;
    contact.appendChild(tel);
    if (b.email) {
      const mail = document.createElement('span');
      mail.className = 'cell-mail';
      mail.textContent = b.email;
      contact.appendChild(mail);
    }

    const symptom = document.createElement('td');
    symptom.className = 'col-symptom';
    symptom.textContent = b.symptom || '—';
    if (b.insurance) symptom.title = `保険証: ${b.insurance}`;

    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge-${b.status}`;
    badge.textContent = STATUS_LABEL[b.status] ?? b.status;
    status.appendChild(badge);

    const action = document.createElement('td');
    action.className = 'col-action';
    if (b.status !== 'visited') action.appendChild(actionButton(b, 'visited', '来院済'));
    if (b.status !== 'canceled') action.appendChild(actionButton(b, 'canceled', 'キャンセル'));
    if (b.status !== 'reserved') action.appendChild(actionButton(b, 'reserved', '戻す'));

    tr.append(when, type, name, birthday, contact, symptom, status, action);
    body.appendChild(tr);
  }
}

/* ── 書き出し ───────────────────────────────────────────────── */

/**
 * ファイルをダウンロードさせる
 * @param {string} filename
 * @param {Blob} blob
 */
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * CSV の 1 セルを組み立てる（引用符と改行を安全に扱う）
 * @param {string} value
 */
function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportCsv() {
  const header = ['予約番号', '日付', '時間', '受付種別', '氏名', 'ふりがな', '生年月日',
    '性別', '電話番号', 'メール', '保険証', '症状・ご要望', '状態', '申込日時'];

  const lines = [header.map(csvCell).join(',')];
  for (const b of filtered()) {
    lines.push([
      b.code, b.date, b.time, visitTypeOf(b.visitType).label, b.name, b.kana, b.birthday,
      SEX_LABEL[/** @type {keyof typeof SEX_LABEL} */ (b.sex)] ?? '', b.tel, b.email,
      b.insurance, b.symptom, STATUS_LABEL[b.status] ?? b.status,
      new Date(b.createdAt).toLocaleString('ja-JP'),
    ].map(csvCell).join(','));
  }

  // BOM を付けて Excel で文字化けしないようにする
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  download(`予約一覧_${ymd(new Date())}.csv`, blob);
  announce(`${filtered().length} 件を CSV に書き出しました。`);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(Store.all(), null, 2)], { type: 'application/json' });
  download(`予約バックアップ_${ymd(new Date())}.json`, blob);
}

/** @param {Event} event */
async function importJson(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  if (!file) return;

  try {
    const list = JSON.parse(await file.text());
    if (!Array.isArray(list)) throw new Error('形式が違います');

    // 予約番号が同じものは重複させず、既存データに追加する
    const existing = Store.all();
    const known = new Set(existing.map((b) => b.id));
    const merged = [...existing, ...list.filter((b) => b && b.id && !known.has(b.id))];
    Store.save(merged);

    await refresh();
    announce(`${merged.length - existing.length} 件を読み込みました。`);
  } catch {
    announce('読み込めませんでした。バックアップファイルをご確認ください。');
  } finally {
    input.value = '';
  }
}

/* ── 絞り込み操作 ───────────────────────────────────────────── */

/** @param {string} range */
function applyRange(range) {
  state.range = range;
  const from = /** @type {HTMLInputElement} */ ($('filterFrom'));
  const to = /** @type {HTMLInputElement} */ ($('filterTo'));
  const today = new Date();

  if (range === 'all') {
    from.value = '';
    to.value = '';
  } else {
    const days = { today: 0, week: 6, month: 29 }[range] ?? 0;
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    from.value = ymd(today);
    to.value = ymd(end);
  }

  for (const chip of document.querySelectorAll('.chip')) {
    const active = /** @type {HTMLElement} */ (chip).dataset.range === range;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  }
}

function renderAll() {
  renderStats();
  renderBoard();
  renderList();
}

async function refresh() {
  await loadBookings();
  renderAll();
}

/* ── 起動 ───────────────────────────────────────────────────── */

function renderTypeOptions() {
  const select = /** @type {HTMLSelectElement} */ ($('boardType'));
  for (const type of CLINIC.visitTypes) {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.label;
    select.appendChild(option);
  }
}

function bindEvents() {
  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      applyRange(/** @type {HTMLElement} */ (chip).dataset.range ?? 'today');
      void refresh();
    });
  }

  for (const id of ['filterFrom', 'filterTo', 'filterStatus']) {
    $(id).addEventListener('change', () => { void refresh(); });
  }
  $('filterKeyword').addEventListener('input', renderList);

  $('boardDate').addEventListener('change', renderBoard);
  $('boardType').addEventListener('change', renderBoard);

  $('exportCsv').addEventListener('click', exportCsv);
  $('exportJson').addEventListener('click', exportJson);
  $('importJson').addEventListener('change', (event) => { void importJson(event); });
  $('printList').addEventListener('click', () => window.print());
  $('reload').addEventListener('click', () => { void refresh(); });
}

async function start() {
  $('adminScreen').hidden = false;
  $('clinicName').textContent = CLINIC.name;

  renderTypeOptions();
  /** @type {HTMLInputElement} */ ($('boardDate')).value = ymd(new Date());
  applyRange('today');
  bindEvents();

  if (Api.enabled()) {
    $('reload').hidden = false;
    $('dataNote').textContent =
      '予約データは Google スプレッドシートに保存され、どの端末からも同じ一覧が表示されます。'
      + '状態の変更はこの端末にのみ保存されます。';
  } else {
    $('dataNote').textContent =
      '予約データはこのブラウザ内にのみ保存されています（メール送信方式のため）。'
      + '別の端末やブラウザからは表示されません。'
      + '端末を替えるとき、ブラウザのデータを消すときは、必ずバックアップを保存してください。';
  }

  await refresh();
  // 予約データが空でも一覧の枠組みは表示する
  const boardDate = parseYmd(/** @type {HTMLInputElement} */ ($('boardDate')).value);
  announce(`${formatDateFullJa(ymd(boardDate))} の予約状況を表示しています。`);
}

guard();
