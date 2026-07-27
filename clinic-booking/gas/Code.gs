/* ================================================================
   かめいクリニック 予約システム — Google Apps Script（任意設定）

   これを使うと次のことができます。
     ・予約が入った瞬間にクリニックへメールが届く
     ・予約がスプレッドシートに自動で貯まる
     ・空き状況がすべての患者さん・端末で共有される

   ▼ 導入手順
     1. Google スプレッドシートを新規作成する
     2. 「拡張機能 > Apps Script」を開き、このファイルの内容を貼り付ける
     3. 下の SETTINGS を書き換える
     4. 「デプロイ > 新しいデプロイ > ウェブアプリ」を選び
          次のユーザーとして実行 : 自分
          アクセスできるユーザー : 全員
        でデプロイし、表示された URL をコピーする
     5. js/config.js を次のように変更する
          sendMode: 'endpoint',
          endpoint: { url: 'コピーした URL', token: 'SETTINGS と同じ合言葉' }
   ================================================================ */

const SETTINGS = {
  /** 予約通知の宛先。カンマ区切りで複数指定できます */
  clinicEmail: 'yoyaku@example.com',

  /** クリニック名（メール本文に使用） */
  clinicName: 'かめいクリニック',

  /** 予約を書き込むシート名（自動で作成されます） */
  sheetName: '予約一覧',

  /** 受付種別ごとの受入人数。config.js の visitTypes と揃えてください */
  capacity: { new: 1, repeat: 2 },

  /** 管理画面から一覧を取得するときの合言葉。config.js の endpoint.token と揃えます */
  token: 'change-me',

  /** 患者さんにも控えメールを送るか（メールアドレス入力時のみ） */
  sendCopyToPatient: true,
};

const HEADERS = [
  '申込日時', '予約番号', '日付', '時間', '受付種別', '氏名', 'ふりがな',
  '生年月日', '性別', '電話番号', 'メール', '保険証', '症状・ご要望', '状態', 'ID',
];

/* ── 入口 ───────────────────────────────────────────────────── */

/**
 * 空き状況の取得（action=counts）と一覧の取得（action=list）
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  try {
    if (params.action === 'counts') {
      return json({ ok: true, counts: countsFor(params.date, params.visitType) });
    }
    if (params.action === 'list') {
      if (params.token !== SETTINGS.token) return json({ ok: false, error: '認証に失敗しました' });
      return json({ ok: true, bookings: listBetween(params.from, params.to) });
    }
    return json({ ok: false, error: '不明なリクエストです' });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

/**
 * 予約の受付（action=create）
 * @param {GoogleAppsScript.Events.DoPost} e
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action !== 'create') return json({ ok: false, error: '不明なリクエストです' });

    const booking = payload.booking || {};
    const error = validate(booking);
    if (error) return json({ ok: false, error: error });

    // 同じ枠への同時申込を防ぐため、書き込み中は他の処理を待たせる
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const limit = SETTINGS.capacity[booking.visitType] || 1;
      const taken = countsFor(booking.date, booking.visitType)[booking.time] || 0;
      if (taken >= limit) {
        return json({ ok: false, error: 'この枠はちょうど埋まりました。別の時間をお選びください。' });
      }
      appendRow(booking);
    } finally {
      lock.releaseLock();
    }

    notifyClinic(booking);
    if (SETTINGS.sendCopyToPatient && booking.email) notifyPatient(booking);

    return json({ ok: true, code: booking.code });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

/* ── シート操作 ─────────────────────────────────────────────── */

function sheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let target = book.getSheetByName(SETTINGS.sheetName);
  if (!target) {
    target = book.insertSheet(SETTINGS.sheetName);
    target.appendRow(HEADERS);
    target.setFrozenRows(1);
  }
  return target;
}

function rows() {
  const values = sheet().getDataRange().getValues();
  return values.slice(1).map(function (row) {
    return {
      createdAt: row[0], code: row[1], date: row[2], time: row[3], visitType: row[4],
      name: row[5], kana: row[6], birthday: row[7], sex: row[8], tel: row[9],
      email: row[10], insurance: row[11], symptom: row[12],
      status: row[13] || 'reserved', id: row[14],
    };
  });
}

function appendRow(b) {
  sheet().appendRow([
    b.createdAt, b.code, b.date, b.time, b.visitType, b.name, b.kana,
    b.birthday, b.sex, b.tel, b.email, b.insurance, b.symptom, b.status || 'reserved', b.id,
  ]);
}

/**
 * 指定日・種別の予約済み人数を時間ごとに数える
 */
function countsFor(date, visitType) {
  const counts = {};
  rows().forEach(function (r) {
    if (String(r.date) !== date) return;
    if (r.visitType !== visitType) return;
    if (r.status === 'canceled') return;
    counts[r.time] = (counts[r.time] || 0) + 1;
  });
  return counts;
}

function listBetween(from, to) {
  return rows().filter(function (r) {
    const date = String(r.date);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

/* ── 検証 ───────────────────────────────────────────────────── */

function validate(b) {
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) return '日付が正しくありません';
  if (!b.time || !/^\d{2}:\d{2}$/.test(String(b.time))) return '時間が正しくありません';
  if (!b.name || String(b.name).length > 50) return 'お名前が正しくありません';
  if (!b.tel) return '電話番号が入力されていません';
  if (b.symptom && String(b.symptom).length > 500) return '症状の文字数が多すぎます';
  return '';
}

/* ── メール ─────────────────────────────────────────────────── */

function typeLabel(id) {
  return id === 'new' ? '初診（はじめての方）' : '再診（2 回目以降）';
}

function bodyFor(b) {
  const sex = { male: '男性', female: '女性', other: '回答しない' }[b.sex] || '未回答';
  return [
    'Web 予約フォームより、以下の内容で予約が申し込まれました。',
    '',
    '──────────────────────────',
    '予約番号　　: ' + b.code,
    '受診日時　　: ' + b.date + ' ' + b.time,
    '受付種別　　: ' + typeLabel(b.visitType),
    '──────────────────────────',
    'お名前　　　: ' + b.name,
    'ふりがな　　: ' + b.kana,
    '生年月日　　: ' + b.birthday,
    '性別　　　　: ' + sex,
    '電話番号　　: ' + b.tel,
    'メール　　　: ' + (b.email || '（未入力）'),
    '保険証　　　: ' + (b.insurance || '（未回答）'),
    '──────────────────────────',
    '症状・ご要望:',
    b.symptom || '（記入なし）',
    '──────────────────────────',
  ].join('\n');
}

function notifyClinic(b) {
  MailApp.sendEmail({
    to: SETTINGS.clinicEmail,
    subject: '【' + SETTINGS.clinicName + ' Web予約】' + b.date + ' ' + b.time + ' ' + b.name + ' 様',
    body: SETTINGS.clinicName + ' 御中\n\n' + bodyFor(b) + '\n\n※このメールは予約フォームから自動送信されています。',
  });
}

function notifyPatient(b) {
  MailApp.sendEmail({
    to: b.email,
    subject: '【' + SETTINGS.clinicName + '】ご予約を受け付けました',
    body: b.name + ' 様\n\nこのたびはご予約いただきありがとうございます。\n'
      + '以下の内容で受け付けいたしました。\n\n' + bodyFor(b)
      + '\n\nご予約時間の 10 分前までにご来院ください。\n'
      + 'ご変更・キャンセルはお電話にてご連絡ください。\n\n' + SETTINGS.clinicName,
  });
}

/* ── 応答 ───────────────────────────────────────────────────── */

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
