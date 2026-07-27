// @ts-check
'use strict';

/* ================================================================
   予約システム 共通ロジック — core.js

   ・診療時間から時間枠を生成する
   ・予約データの保存 / 読み出し（localStorage・任意で Apps Script）
   ・入力チェック
   ・クリニック宛メール本文の組み立て

   画面固有の処理は booking.js / admin.js が担当します。
   ================================================================ */

import { CLINIC } from './config.js';
import { holidayName } from './holidays.js';

/**
 * 予約 1 件
 * @typedef {{
 *   id:        string,
 *   code:      string,
 *   createdAt: string,
 *   date:      string,
 *   time:      string,
 *   visitType: string,
 *   name:      string,
 *   kana:      string,
 *   birthday:  string,
 *   sex:       string,
 *   tel:       string,
 *   email:     string,
 *   insurance: string,
 *   symptom:   string,
 *   status:    'reserved' | 'visited' | 'canceled',
 * }} Booking
 */

/**
 * 時間枠 1 つ
 * @typedef {{
 *   time:      string,
 *   label:     string,
 *   capacity:  number,
 *   booked:    number,
 *   available: boolean,
 *   reason:    string,
 * }} Slot
 */

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const STORAGE_KEY = 'kamei-clinic-bookings-v1';

/* ── 日付ユーティリティ ─────────────────────────────────────── */

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Date → 'YYYY-MM-DD'（ローカル時刻基準。UTC 変換によるずれを避ける）
 * @param {Date} d
 */
export function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 'YYYY-MM-DD' → Date（その日の 0 時）
 * @param {string} key
 */
export function parseYmd(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 'YYYY-MM-DD' と 'HH:MM' から Date を作る
 * @param {string} key
 * @param {string} time
 */
export function parseDateTime(key, time) {
  const at = parseYmd(key);
  const [h, min] = time.split(':').map(Number);
  at.setHours(h, min, 0, 0);
  return at;
}

/**
 * 'HH:MM' → 0 時からの経過分
 * @param {string} time
 */
export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 経過分 → 'HH:MM'
 * @param {number} minutes
 */
export function toTime(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/**
 * 表示用の日付文字列（例: 8月3日(月)）
 * @param {string} key
 */
export function formatDateJa(key) {
  const d = parseYmd(key);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_JA[d.getDay()]})`;
}

/**
 * 表示用の年月日（例: 2026年8月3日(月)）
 * @param {string} key
 */
export function formatDateFullJa(key) {
  return `${parseYmd(key).getFullYear()}年${formatDateJa(key)}`;
}

/* ── 診療日 / 時間枠 ────────────────────────────────────────── */

/**
 * 受付種別 ID から定義を引く
 * @param {string} id
 */
export function visitTypeOf(id) {
  return CLINIC.visitTypes.find((/** @type {any} */ v) => v.id === id) ?? CLINIC.visitTypes[0];
}

/**
 * その日の診療帯を返す（休診日なら空配列）
 * @param {string} key 'YYYY-MM-DD'
 */
export function sessionsOf(key) {
  const date = parseYmd(key);
  if (CLINIC.closedDates.includes(key)) return [];
  if (CLINIC.closeOnHolidays && holidayName(date)) return [];
  return CLINIC.schedule[date.getDay()] ?? [];
}

/**
 * 休診の理由を返す（診療日なら null）
 * @param {string} key
 * @returns {string | null}
 */
export function closedReason(key) {
  const date = parseYmd(key);
  if (CLINIC.closedDates.includes(key)) return '臨時休診';
  const holiday = holidayName(date);
  if (CLINIC.closeOnHolidays && holiday) return holiday;
  if ((CLINIC.schedule[date.getDay()] ?? []).length === 0) return '休診日';
  return null;
}

/**
 * 診療時間を人が読める形にする（例: 09:00〜12:00 / 15:00〜18:00）
 * @param {string} key
 */
export function hoursTextOf(key) {
  return sessionsOf(key)
    .map((/** @type {any} */ s) => `${s.start}〜${s.end}`)
    .join(' / ');
}

/**
 * 指定日の時間枠を生成する
 * @param {string} key       'YYYY-MM-DD'
 * @param {string} visitType 受付種別 ID
 * @param {Record<string, number>} bookedCount 'HH:MM' → 予約済み人数
 * @returns {Slot[]}
 */
export function buildSlots(key, visitType, bookedCount = {}) {
  const type = visitTypeOf(visitType);
  const step = CLINIC.slotMinutes;
  const now = Date.now();
  const leadLimit = now + CLINIC.minLeadMinutes * 60 * 1000;

  /** @type {Slot[]} */
  const slots = [];

  for (const session of sessionsOf(key)) {
    const start = toMinutes(session.start);
    let end = toMinutes(session.end);

    // 初診の最終受付を診療終了前で締め切る設定
    if (type.id === 'new' && CLINIC.newPatientCloseBeforeEndMin > 0) {
      end -= CLINIC.newPatientCloseBeforeEndMin;
    }

    // 枠の終了が診療終了を超えないところまで生成する
    for (let at = start; at + step <= end; at += step) {
      const time = toTime(at);
      const booked = bookedCount[time] ?? 0;
      let reason = '';

      if (parseDateTime(key, time).getTime() < leadLimit) {
        reason = '受付終了';
      } else if (booked >= type.capacity) {
        reason = '満枠';
      }

      slots.push({
        time,
        label: session.label,
        capacity: type.capacity,
        booked,
        available: reason === '',
        reason,
      });
    }
  }
  return slots;
}

/**
 * 予約を受け付ける日付を並べる（休診日も「休診」として含める）
 * @returns {{ key: string, closed: string | null }[]}
 */
export function bookableDates() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= CLINIC.bookingWindowDays; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = ymd(d);
    days.push({ key, closed: closedReason(key) });
  }
  return days;
}

/* ── 保存領域（この端末に残る控え） ───────────────────────────── */

export const Store = {
  /** @returns {Booking[]} */
  all() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },

  /** @param {Booking[]} list */
  save(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  },

  /** @param {Booking} booking */
  add(booking) {
    const list = this.all();
    list.push(booking);
    this.save(list);
    return booking;
  },

  /**
   * @param {string} id
   * @param {Partial<Booking>} patch
   */
  update(id, patch) {
    const list = this.all().map((b) => (b.id === id ? { ...b, ...patch } : b));
    this.save(list);
  },

  /** @param {string} id */
  remove(id) {
    this.save(this.all().filter((b) => b.id !== id));
  },

  /**
   * 指定日・種別の予約済み人数を時間ごとに数える
   * @param {string} key
   * @param {string} visitType
   * @returns {Record<string, number>}
   */
  countByTime(key, visitType) {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const b of this.all()) {
      if (b.date !== key || b.status === 'canceled') continue;
      if (b.visitType !== visitType) continue;
      counts[b.time] = (counts[b.time] ?? 0) + 1;
    }
    return counts;
  },
};

/* ── Apps Script 連携（sendMode: 'endpoint' のとき） ──────────── */

export const Api = {
  /** 連携が設定されているか */
  enabled() {
    return CLINIC.sendMode === 'endpoint' && Boolean(CLINIC.endpoint.url);
  },

  /**
   * 指定日の予約済み人数を取得する
   * @param {string} key
   * @param {string} visitType
   * @returns {Promise<Record<string, number>>}
   */
  async counts(key, visitType) {
    const url = `${CLINIC.endpoint.url}?action=counts&date=${encodeURIComponent(key)}`
      + `&visitType=${encodeURIComponent(visitType)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`空き状況を取得できませんでした (${res.status})`);
    const data = await res.json();
    return data.counts ?? {};
  },

  /**
   * 予約を送信する（クリニックへのメール送信もサーバー側で行う）
   * @param {Booking} booking
   */
  async submit(booking) {
    // text/plain にすることで CORS プリフライトを避ける（Apps Script の制約）
    const res = await fetch(CLINIC.endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'create', booking }),
    });
    if (!res.ok) throw new Error(`送信に失敗しました (${res.status})`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '送信に失敗しました');
    return data;
  },

  /**
   * 管理画面用に予約一覧を取得する
   * @param {string} from 'YYYY-MM-DD'
   * @param {string} to   'YYYY-MM-DD'
   * @returns {Promise<Booking[]>}
   */
  async list(from, to) {
    const url = `${CLINIC.endpoint.url}?action=list&from=${from}&to=${to}`
      + `&token=${encodeURIComponent(CLINIC.endpoint.token)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`一覧を取得できませんでした (${res.status})`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '一覧を取得できませんでした');
    return data.bookings ?? [];
  },
};

/* ── 入力チェック ───────────────────────────────────────────── */

const RE = {
  kana:  /^[ぁ-んァ-ヶー　\s]+$/u,
  tel:   /^0\d{1,4}-?\d{1,4}-?\d{3,4}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
};

/**
 * 予約フォームの入力を検証する
 * @param {Partial<Booking>} input
 * @returns {Record<string, string>} 項目名 → エラーメッセージ（空なら問題なし）
 */
export function validate(input) {
  /** @type {Record<string, string>} */
  const errors = {};

  if (!input.name || input.name.trim().length === 0) {
    errors.name = 'お名前を入力してください';
  } else if (input.name.length > 50) {
    errors.name = 'お名前は 50 文字以内で入力してください';
  }

  if (!input.kana || input.kana.trim().length === 0) {
    errors.kana = 'ふりがなを入力してください';
  } else if (!RE.kana.test(input.kana)) {
    errors.kana = 'ふりがなは ひらがな または カタカナ で入力してください';
  }

  if (!input.birthday) {
    errors.birthday = '生年月日を選択してください';
  } else {
    const day = parseYmd(input.birthday);
    if (Number.isNaN(day.getTime()) || day.getTime() > Date.now()) {
      errors.birthday = '生年月日を正しく選択してください';
    }
  }

  if (!input.tel || !RE.tel.test(input.tel.trim())) {
    errors.tel = '電話番号を正しく入力してください（例: 078-000-0000）';
  }

  // メールは任意。入力された場合のみ形式を確認する
  if (input.email && input.email.trim() && !RE.email.test(input.email.trim())) {
    errors.email = 'メールアドレスを正しく入力してください';
  }

  if (input.symptom && input.symptom.length > 500) {
    errors.symptom = '症状・ご要望は 500 文字以内で入力してください';
  }

  return errors;
}

/* ── 予約番号とメール本文 ──────────────────────────────────── */

/**
 * 予約番号を作る（例: K260803-4821）
 * @param {string} key
 */
export function makeCode(key) {
  const digits = key.replace(/-/g, '').slice(2);
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `K${digits}-${random}`;
}

/**
 * 一意な ID を作る
 */
export function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * クリニック宛メールの件名
 * @param {Booking} b
 */
export function mailSubject(b) {
  return `【${CLINIC.name} Web予約】${formatDateJa(b.date)} ${b.time} ${b.name} 様（${visitTypeOf(b.visitType).label}）`;
}

/**
 * クリニック宛メールの本文
 * @param {Booking} b
 */
export function mailBody(b) {
  const sexLabel = { male: '男性', female: '女性', other: '回答しない' };
  return [
    `${CLINIC.name} 御中`,
    '',
    'Web 予約フォームより、以下の内容で予約が申し込まれました。',
    '',
    '──────────────────────────',
    `予約番号　　: ${b.code}`,
    `受診日時　　: ${formatDateFullJa(b.date)} ${b.time}`,
    `受付種別　　: ${visitTypeOf(b.visitType).label}`,
    '──────────────────────────',
    `お名前　　　: ${b.name}`,
    `ふりがな　　: ${b.kana}`,
    `生年月日　　: ${b.birthday}`,
    `性別　　　　: ${sexLabel[/** @type {keyof typeof sexLabel} */ (b.sex)] ?? '未回答'}`,
    `電話番号　　: ${b.tel}`,
    `メール　　　: ${b.email || '（未入力）'}`,
    `保険証　　　: ${b.insurance || '（未回答）'}`,
    '──────────────────────────',
    '症状・ご要望:',
    b.symptom || '（記入なし）',
    '──────────────────────────',
    '',
    `申込日時　　: ${new Date(b.createdAt).toLocaleString('ja-JP')}`,
    '',
    '※このメールは予約フォームから自動生成されています。',
  ].join('\n');
}

/**
 * mailto: リンクを組み立てる
 * @param {Booking} b
 */
export function mailtoUrl(b) {
  const params = new URLSearchParams({ subject: mailSubject(b), body: mailBody(b) });
  // URLSearchParams は空白を + にするため、メール本文用に %20 へ直す
  return `mailto:${CLINIC.email}?${params.toString().replace(/\+/g, '%20')}`;
}

export { CLINIC };
