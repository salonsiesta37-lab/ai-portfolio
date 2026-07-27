// @ts-check
'use strict';

/* ================================================================
   日本の祝日判定 — holidays.js

   外部ライブラリを使わず、内閣府の規定に沿って祝日を計算します。
   （振替休日・国民の休日にも対応。2000〜2099 年で有効）
   ================================================================ */

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Date を 'YYYY-MM-DD' に変換する（ローカル時刻基準）
 * @param {Date} d
 * @returns {string}
 */
function toKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * その月の第 n 月曜日の日付を返す
 * @param {number} year
 * @param {number} month 1〜12
 * @param {number} nth
 * @returns {number} 日
 */
function nthMonday(year, month, nth) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset = (8 - firstDow) % 7; // 1 日から最初の月曜までの日数
  return 1 + offset + (nth - 1) * 7;
}

/**
 * 春分の日 / 秋分の日（2000〜2099 年の近似式）
 * @param {number} year
 * @param {'spring' | 'autumn'} kind
 * @returns {number} 日
 */
function equinox(year, kind) {
  const base = kind === 'spring' ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 指定年の祝日を求める
 * @param {number} year
 * @returns {Map<string, string>} 'YYYY-MM-DD' → 祝日名
 */
function buildYear(year) {
  /** @type {[number, number, string][]} */
  const fixed = [
    [1,  1,  '元日'],
    [2,  11, '建国記念の日'],
    [2,  23, '天皇誕生日'],
    [4,  29, '昭和の日'],
    [5,  3,  '憲法記念日'],
    [5,  4,  'みどりの日'],
    [5,  5,  'こどもの日'],
    [8,  11, '山の日'],
    [11, 3,  '文化の日'],
    [11, 23, '勤労感謝の日'],
    [1,  nthMonday(year, 1, 2),  '成人の日'],
    [7,  nthMonday(year, 7, 3),  '海の日'],
    [9,  nthMonday(year, 9, 3),  '敬老の日'],
    [10, nthMonday(year, 10, 2), 'スポーツの日'],
    [3,  equinox(year, 'spring'), '春分の日'],
    [9,  equinox(year, 'autumn'), '秋分の日'],
  ];

  /** @type {Map<string, string>} */
  const map = new Map();
  for (const [month, day, name] of fixed) {
    map.set(toKey(new Date(year, month - 1, day)), name);
  }

  // 振替休日: 日曜と重なった祝日の直後の平日
  for (const key of [...map.keys()]) {
    const d = new Date(`${key}T00:00:00`);
    if (d.getDay() !== 0) continue;
    const sub = new Date(d);
    do { sub.setDate(sub.getDate() + 1); } while (map.has(toKey(sub)));
    map.set(toKey(sub), '振替休日');
  }

  // 国民の休日: 祝日に挟まれた平日（敬老の日と秋分の日の間など）
  const keiro = new Date(year, 8, nthMonday(year, 9, 3));
  const shubun = new Date(year, 8, equinox(year, 'autumn'));
  if (shubun.getDate() - keiro.getDate() === 2) {
    const between = new Date(year, 8, keiro.getDate() + 1);
    if (!map.has(toKey(between))) map.set(toKey(between), '国民の休日');
  }

  return map;
}

/** 年ごとの計算結果をキャッシュする @type {Map<number, Map<string, string>>} */
const cache = new Map();

/**
 * 指定日が祝日なら祝日名を、そうでなければ null を返す
 * @param {Date} date
 * @returns {string | null}
 */
export function holidayName(date) {
  const year = date.getFullYear();
  if (!cache.has(year)) cache.set(year, buildYear(year));
  return cache.get(year)?.get(toKey(date)) ?? null;
}
