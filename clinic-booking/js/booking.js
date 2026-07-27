// @ts-check
'use strict';

/* ================================================================
   患者用 予約フォーム — booking.js

   画面の流れ:
     1 受診内容 → 2 日時 → 3 問診入力 → 4 確認 → 完了

   DOM への文字列反映は textContent のみを使い、
   入力値がそのまま HTML として解釈されないようにしています。
   ================================================================ */

import {
  CLINIC, Store, Api, WEEKDAY_JA,
  ymd, parseYmd, formatDateJa, formatDateFullJa,
  bookableDates, buildSlots, closedReason, hoursTextOf,
  visitTypeOf, validate, makeCode, makeId, mailtoUrl,
} from './core.js';

/** 日付グリッドに一度に並べる日数 */
const DAYS_PER_PAGE = 7;

/**
 * 画面の状態
 * @type {{
 *   step: number,
 *   visitType: string,
 *   date: string,
 *   time: string,
 *   offset: number,
 *   form: Record<string, string>,
 * }}
 */
const state = {
  step: 1,
  visitType: CLINIC.visitTypes[0].id,
  date: '',
  time: '',
  offset: 0,
  form: {},
};

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * 支援技術向けの読み上げメッセージを更新する
 * @param {string} message
 */
function announce(message) {
  $('liveRegion').textContent = message;
}

/* ── 初期表示 ───────────────────────────────────────────────── */

function renderClinicInfo() {
  document.title = `Web予約 | ${CLINIC.name}`;
  $('clinicName').textContent = CLINIC.name;
  $('clinicNameEn').textContent = CLINIC.nameEn;

  if (CLINIC.tel) {
    const tel = /** @type {HTMLAnchorElement} */ ($('headerTel'));
    tel.href = `tel:${CLINIC.tel.replace(/-/g, '')}`;
    tel.textContent = `お電話でのご予約 ${CLINIC.tel}`;
    tel.hidden = false;
    $('footTel').textContent = CLINIC.tel;
  }

  const noticeList = $('noticeList');
  for (const text of CLINIC.notice) {
    const li = document.createElement('li');
    li.textContent = text;
    noticeList.appendChild(li);
  }
}

/** 曜日ごとの診療時間表を組み立てる */
function renderHours() {
  const tbody = /** @type {HTMLTableSectionElement} */ ($('hoursTable').querySelector('tbody'));
  tbody.replaceChildren();

  for (let dow = 1; dow <= 7; dow += 1) {
    const day = dow % 7; // 月曜始まりで並べ、最後に日曜
    const sessions = CLINIC.schedule[day] ?? [];

    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = `${WEEKDAY_JA[day]}曜日`;
    if (day === 0) th.classList.add('is-sunday');

    const td = document.createElement('td');
    if (sessions.length === 0) {
      td.textContent = '休診';
      td.classList.add('is-closed');
    } else {
      td.textContent = sessions.map((/** @type {any} */ s) => `${s.start}〜${s.end}`).join(' / ');
    }

    tr.append(th, td);
    tbody.appendChild(tr);
  }

  const notes = [`予約枠は ${CLINIC.slotMinutes} 分単位です。`];
  if (CLINIC.closeOnHolidays) notes.push('祝日は休診です。');
  if (CLINIC.newPatientCloseBeforeEndMin > 0) {
    notes.push(`初診の受付は診療終了の ${CLINIC.newPatientCloseBeforeEndMin} 分前までです。`);
  }
  notes.push(`ご予約は ${CLINIC.bookingWindowDays} 日先までお取りできます。`);
  $('hoursNote').textContent = notes.join(' ');
}

/** 受付種別の選択肢を組み立てる */
function renderVisitTypes() {
  const list = $('typeList');
  list.replaceChildren();

  for (const type of CLINIC.visitTypes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'type-card';
    button.setAttribute('role', 'radio');
    button.dataset.type = type.id;

    const title = document.createElement('span');
    title.className = 'type-label';
    title.textContent = type.label;

    const note = document.createElement('span');
    note.className = 'type-note';
    note.textContent = type.note;

    button.append(title, note);
    button.addEventListener('click', () => {
      state.visitType = type.id;
      state.time = '';
      syncVisitTypes();
      if (state.date) renderSlots();
      updateNextButton();
    });

    list.appendChild(button);
  }
  syncVisitTypes();
}

function syncVisitTypes() {
  for (const el of document.querySelectorAll('.type-card')) {
    const selected = /** @type {HTMLElement} */ (el).dataset.type === state.visitType;
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-checked', String(selected));
  }
}

/* ── STEP 2: 日付と時間枠 ──────────────────────────────────── */

function renderDates() {
  const all = bookableDates();
  const page = all.slice(state.offset, state.offset + DAYS_PER_PAGE);
  const grid = $('dateGrid');
  grid.replaceChildren();

  if (page.length > 0) {
    $('dateRange').textContent =
      `${formatDateFullJa(page[0].key)} 〜 ${formatDateJa(page[page.length - 1].key)}`;
  }

  for (const day of page) {
    const d = parseYmd(day.key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'date-card';
    button.dataset.date = day.key;
    button.disabled = day.closed !== null;

    const dow = document.createElement('span');
    dow.className = `date-dow dow-${d.getDay()}`;
    dow.textContent = WEEKDAY_JA[d.getDay()];

    const num = document.createElement('span');
    num.className = 'date-num';
    num.textContent = String(d.getDate());

    const month = document.createElement('span');
    month.className = 'date-month';
    month.textContent = `${d.getMonth() + 1}月`;

    const status = document.createElement('span');
    status.className = 'date-status';
    status.textContent = day.closed ?? '受付中';
    if (day.closed) status.classList.add('is-closed');

    button.append(month, num, dow, status);
    button.setAttribute('aria-label',
      `${formatDateFullJa(day.key)} ${day.closed ?? '予約受付中'}`);

    if (!button.disabled) {
      button.addEventListener('click', () => {
        state.date = day.key;
        state.time = '';
        syncDates();
        renderSlots();
        updateNextButton();
      });
    }
    grid.appendChild(button);
  }

  /** @type {HTMLButtonElement} */ ($('prevWeek')).disabled = state.offset === 0;
  /** @type {HTMLButtonElement} */ ($('nextWeek')).disabled =
    state.offset + DAYS_PER_PAGE >= all.length;

  syncDates();
}

function syncDates() {
  for (const el of document.querySelectorAll('.date-card')) {
    const selected = /** @type {HTMLElement} */ (el).dataset.date === state.date;
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  }
}

/**
 * 予約済み人数を取得する。
 * Apps Script 連携時はサーバーの値を、未連携時はこの端末の控えを使う。
 * @param {string} date
 * @param {string} visitType
 * @returns {Promise<Record<string, number>>}
 */
async function fetchCounts(date, visitType) {
  if (!Api.enabled()) return Store.countByTime(date, visitType);
  try {
    return await Api.counts(date, visitType);
  } catch {
    announce('空き状況を取得できませんでした。表示は目安です。');
    return Store.countByTime(date, visitType);
  }
}

async function renderSlots() {
  const grid = $('slotGrid');
  const empty = $('slotEmpty');
  grid.replaceChildren();
  empty.hidden = true;

  if (!state.date) return;

  const type = visitTypeOf(state.visitType);
  $('slotHead').textContent =
    `${formatDateFullJa(state.date)}　${hoursTextOf(state.date)}　［${type.label}］`;

  const closed = closedReason(state.date);
  if (closed) {
    empty.textContent = `${formatDateJa(state.date)} は${closed}です。別の日をお選びください。`;
    empty.hidden = false;
    return;
  }

  grid.setAttribute('aria-busy', 'true');
  const counts = await fetchCounts(state.date, state.visitType);
  grid.setAttribute('aria-busy', 'false');

  // 表示待ちの間に別の日付が選ばれていたら、この描画は破棄する
  if (!state.date) return;

  const slots = buildSlots(state.date, state.visitType, counts);
  if (slots.length === 0) {
    empty.textContent = 'この日にご案内できる枠がありません。別の日をお選びください。';
    empty.hidden = false;
    return;
  }

  let currentLabel = '';
  for (const slot of slots) {
    if (slot.label !== currentLabel) {
      currentLabel = slot.label;
      const heading = document.createElement('p');
      heading.className = 'slot-session';
      heading.textContent = currentLabel;
      grid.appendChild(heading);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slot';
    button.dataset.time = slot.time;
    button.disabled = !slot.available;

    const time = document.createElement('span');
    time.className = 'slot-time';
    time.textContent = slot.time;

    const mark = document.createElement('span');
    mark.className = 'slot-mark';
    if (slot.available) {
      mark.textContent = '○';
      mark.classList.add('is-open');
      const rest = slot.capacity - slot.booked;
      button.setAttribute('aria-label', `${slot.time} 空きあり（残り ${rest} 名）`);
    } else {
      mark.textContent = slot.reason === '満枠' ? '×' : '−';
      mark.classList.add('is-full');
      button.setAttribute('aria-label', `${slot.time} ${slot.reason}`);
    }

    button.append(time, mark);
    if (slot.available) {
      button.addEventListener('click', () => {
        state.time = slot.time;
        syncSlots();
        updateNextButton();
      });
    }
    grid.appendChild(button);
  }

  const openCount = slots.filter((s) => s.available).length;
  if (openCount === 0) {
    const allFull = slots.every((s) => s.reason === '満枠');
    empty.textContent = allFull
      ? 'この日は満枠です。別の日をお選びください。'
      : 'この日はご案内できる時間が残っていません。別の日をお選びください。';
    empty.hidden = false;
  }
  announce(`${formatDateJa(state.date)} の空き枠は ${openCount} 件です。`);
  syncSlots();
}

function syncSlots() {
  for (const el of document.querySelectorAll('.slot')) {
    const selected = /** @type {HTMLElement} */ (el).dataset.time === state.time;
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  }
}

function updateNextButton() {
  /** @type {HTMLButtonElement} */ ($('toStep3')).disabled = !(state.date && state.time);
}

/* ── 画面遷移 ───────────────────────────────────────────────── */

/** @param {number} step 1〜4、完了画面は 5 */
function goStep(step) {
  state.step = step;
  announce(''); // 前の画面の案内文を残さない
  for (const n of [1, 2, 3, 4]) {
    $(`panel${n}`).hidden = n !== step;
  }
  $('panelDone').hidden = step !== 5;

  for (const el of document.querySelectorAll('.step')) {
    const no = Number(/** @type {HTMLElement} */ (el).dataset.step);
    el.classList.toggle('is-current', no === step);
    el.classList.toggle('is-done', no < step);
  }
  $('stepper').hidden = step === 5;

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── STEP 3: 入力チェック ──────────────────────────────────── */

/** @returns {Record<string, string>} */
function readForm() {
  const form = /** @type {HTMLFormElement} */ ($('bookingForm'));
  const data = new FormData(form);
  /** @type {Record<string, string>} */
  const values = {};
  for (const [key, value] of data.entries()) {
    values[key] = String(value).trim();
  }
  return values;
}

/** @param {Record<string, string>} errors */
function showErrors(errors) {
  for (const field of ['name', 'kana', 'birthday', 'tel', 'email', 'symptom']) {
    const box = $(`e-${field}`);
    const input = $(`f-${field}`);
    const message = errors[field] ?? '';
    box.textContent = message;
    input.classList.toggle('is-invalid', message !== '');
    input.setAttribute('aria-invalid', String(message !== ''));
  }

  const first = Object.keys(errors)[0];
  if (first) {
    $(`f-${first}`).focus();
    announce('入力内容にエラーがあります。');
  }
}

/* ── STEP 4: 確認画面 ──────────────────────────────────────── */

function renderConfirm() {
  const sexLabel = { female: '女性', male: '男性', other: '回答しない' };
  const f = state.form;

  /** @type {[string, string][]} */
  const rows = [
    ['受診日時', `${formatDateFullJa(state.date)} ${state.time}`],
    ['受付種別', visitTypeOf(state.visitType).label],
    ['お名前', `${f.name}（${f.kana}）`],
    ['生年月日', f.birthday],
    ['性別', sexLabel[/** @type {keyof typeof sexLabel} */ (f.sex)] ?? '未回答'],
    ['電話番号', f.tel],
    ['メールアドレス', f.email || '（未入力）'],
    ['保険証', f.insurance],
    ['症状・ご要望', f.symptom || '（記入なし）'],
  ];

  const list = $('confirmList');
  list.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
}

/* ── 送信 ───────────────────────────────────────────────────── */

async function submitBooking() {
  const button = /** @type {HTMLButtonElement} */ ($('submitBooking'));
  const errorBox = $('submitError');
  button.disabled = true;
  button.textContent = '送信中…';
  errorBox.hidden = true;

  const f = state.form;
  /** @type {import('./core.js').Booking} */
  const booking = {
    id:        makeId(),
    code:      makeCode(state.date),
    createdAt: new Date().toISOString(),
    date:      state.date,
    time:      state.time,
    visitType: state.visitType,
    name:      f.name,
    kana:      f.kana,
    birthday:  f.birthday,
    sex:       f.sex,
    tel:       f.tel,
    email:     f.email,
    insurance: f.insurance,
    symptom:   f.symptom,
    status:    'reserved',
  };

  try {
    // 送信直前に、その枠がまだ空いているかを確認する
    const counts = await fetchCounts(booking.date, booking.visitType);
    const type = visitTypeOf(booking.visitType);
    if ((counts[booking.time] ?? 0) >= type.capacity) {
      throw new Error('選択された枠は、ちょうど他の方のご予約で埋まりました。恐れ入りますが別の時間をお選びください。');
    }

    if (Api.enabled()) {
      await Api.submit(booking);
    }
    Store.add(booking);
    showDone(booking);
  } catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : '送信に失敗しました。';
    errorBox.hidden = false;
    announce(errorBox.textContent);
    button.disabled = false;
    button.textContent = 'この内容で予約する';
  }
}

/** @param {import('./core.js').Booking} booking */
function showDone(booking) {
  $('doneCode').textContent = booking.code;
  $('doneWhen').textContent = `${formatDateFullJa(booking.date)} ${booking.time}`;
  $('doneType').textContent = visitTypeOf(booking.visitType).label;

  if (Api.enabled()) {
    $('doneNote').textContent =
      `予約内容は${CLINIC.name}の受付へ送信されました。当日は予約時間の 10 分前までにご来院ください。`;
  } else {
    // mailto 方式: 患者さんのメールソフトで送信してもらう
    const link = /** @type {HTMLAnchorElement} */ ($('mailtoLink'));
    link.href = mailtoUrl(booking);
    $('mailtoBox').hidden = false;
    $('doneNote').textContent =
      'メールが送信されて初めて予約が確定します。送信できない場合はお電話でご連絡ください。';
    window.setTimeout(() => { window.location.href = link.href; }, 400);
  }

  goStep(5);
  announce('予約を受け付けました。');
}

/* ── リセット ───────────────────────────────────────────────── */

function restart() {
  state.date = '';
  state.time = '';
  state.form = {};
  /** @type {HTMLFormElement} */ ($('bookingForm')).reset();
  $('symptomCount').textContent = '0';
  $('mailtoBox').hidden = true;
  const button = /** @type {HTMLButtonElement} */ ($('submitBooking'));
  button.disabled = false;
  button.textContent = 'この内容で予約する';
  showErrors({});
  renderDates();
  $('slotGrid').replaceChildren();
  $('slotHead').textContent = '日付を選択してください';
  updateNextButton();
  goStep(1);
}

/* ── 起動 ───────────────────────────────────────────────────── */

function bindEvents() {
  $('toStep2').addEventListener('click', () => {
    renderDates();
    goStep(2);
  });
  $('backTo1').addEventListener('click', () => goStep(1));
  $('backTo2').addEventListener('click', () => goStep(2));
  $('backTo3').addEventListener('click', () => goStep(3));

  $('prevWeek').addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - DAYS_PER_PAGE);
    renderDates();
  });
  $('nextWeek').addEventListener('click', () => {
    state.offset += DAYS_PER_PAGE;
    renderDates();
  });

  $('toStep3').addEventListener('click', () => {
    const type = visitTypeOf(state.visitType);
    $('selectedSummary').textContent =
      `${formatDateFullJa(state.date)} ${state.time}／${type.label}`;
    goStep(3);
  });

  $('bookingForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = readForm();
    const errors = validate(values);
    showErrors(errors);
    if (Object.keys(errors).length > 0) return;
    state.form = values;
    renderConfirm();
    goStep(4);
  });

  $('f-symptom').addEventListener('input', (event) => {
    const target = /** @type {HTMLTextAreaElement} */ (event.target);
    $('symptomCount').textContent = String(target.value.length);
  });

  $('submitBooking').addEventListener('click', submitBooking);
  $('restart').addEventListener('click', restart);
}

function init() {
  renderClinicInfo();
  renderHours();
  renderVisitTypes();
  bindEvents();

  // 生年月日は未来日を選べないようにする
  /** @type {HTMLInputElement} */ ($('f-birthday')).max = ymd(new Date());

  // 予約枠が 1 件も無い設定を早めに気付けるようにする
  const hasSession = Object.values(CLINIC.schedule)
    .some((/** @type {any} */ list) => list.length > 0);
  if (!hasSession) {
    announce('診療時間が設定されていません。js/config.js をご確認ください。');
  }
}

init();
