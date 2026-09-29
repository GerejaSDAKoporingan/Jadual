/* Code.gs — tampal di Google Sheet DB > Extensions > Apps Script
   Deploy: Deploy > New deployment > Web app > Execute as: Me > Access: Anyone
   Salin URL /exec ke assets/config.js APPS_SCRIPT_URL
*/
const SHEETS = {
  petugas: 'List Petugas',
  pagi: 'JADUAL KEBAKTIAN PAGI',
  khotbah: 'JADUAL KHOTBAH'
};

function norm_(s) {
  return (s || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, msg: 'Gunakan POST: updateCell / bulkUpdate / addPetugas' });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'updateCell') return updateCell_(p);
    if (p.action === 'bulkUpdate') return bulkUpdate_(p);
    if (p.action === 'addPetugas') return addPetugas_(p);
    return json_({ ok: false, error: 'action tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function headerRow_(sh) {
  // Jadual ada baris tajuk (row1) + header (row2). Petugas header row1.
  const name = sh.getName();
  if (name === SHEETS.petugas) return { headers: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], headerRow: 1 };
  return { headers: sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0], headerRow: 2 };
}

function updateCell_(p) {
  const sh = SpreadsheetApp.getActive().getSheetByName(p.sheet);
  if (!sh) throw new Error('Sheet tidak jumpa: ' + p.sheet);
  const h = headerRow_(sh);
  const ci = h.headers.map(x => norm_(x)).indexOf(norm_(p.colName).replace(/_/g, ' '));
  // fallback: match tanpa space/underscore
  let col = ci + 1;
  if (col < 1) {
    const flat = h.headers.map(x => norm_(x).replace(/[\s_\/]+/g, ''));
    col = flat.indexOf(norm_(p.colName).replace(/[\s_\/]+/g, '')) + 1;
  }
  if (col < 1) throw new Error('Kolum tidak jumpa: ' + p.colName);
  if (p.row < h.headerRow + 1) throw new Error('Row tidak valid');

  // R1 server check: nama tidak boleh double pada TARIKH sama merentas Pagi+Khotbah
  const val = (p.value || '').toString().trim();
  if (val) {
    const tarikhIdx = h.headers.map(x => norm_(x)).indexOf('TARIKH') + 1;
    const tarikh = tarikhIdx ? sh.getRange(p.row, tarikhIdx).getValue() : '';
    const dup = findDup_(String(tarikh), val, { sheet: p.sheet, row: p.row, col: col });
    if (dup) throw new Error('R1: ' + val + ' sudah bertugas di ' + dup + ' pada tarikh sama.');
  }
  sh.getRange(p.row, col).setValue(val);
  return json_({ ok: true });
}

function sheetNamesOnDate_(tarikhStr) {
  const ss = SpreadsheetApp.getActive();
  const out = [];
  [SHEETS.pagi, SHEETS.khotbah].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const h = headerRow_(sh);
    const vals = sh.getDataRange().getValues();
    const tIdx = h.headers.map(x => norm_(x)).indexOf('TARIKH');
    for (let r = h.headerRow; r < vals.length; r++) {
      if (String(vals[r][tIdx]).trim() !== String(tarikhStr).trim()) continue;
      h.headers.forEach(function (hh, c) {
        if (['BULAN', 'TARIKH', 'SABAT'].indexOf(norm_(hh)) >= 0) return;
        String(vals[r][c] || '').split('&').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) {
          out.push({ nama: norm_(n), src: name + '/' + hh, row: r + 1, col: c + 1 });
        });
      });
    }
  });
  return out;
}

function findDup_(tarikhStr, candidate, self) {
  const key = norm_(candidate);
  const all = sheetNamesOnDate_(tarikhStr);
  const hit = all.find(function (x) {
    return x.nama === key && !(x.src.indexOf(self.sheet) === 0 && x.row === self.row && x.col === self.col);
  });
  return hit ? hit.src : null;
}

function colIndex_(headers, colName) {
  const ci = headers.map(x => norm_(x)).indexOf(norm_(colName).replace(/_/g, ' '));
  let col = ci + 1;
  if (col < 1) {
    const flat = headers.map(x => norm_(x).replace(/[\s_\/]+/g, ''));
    col = flat.indexOf(norm_(colName).replace(/[\s_\/]+/g, '')) + 1;
  }
  return col;
}

function bulkUpdate_(p) {
  // p.updates = [{sheet,row,colName,value}]
  const list = p.updates || [];
  if (!list.length) throw new Error('Tiada perubahan');
  if (list.length > 300) throw new Error('Terlalu banyak perubahan sekali (' + list.length + ')');
  const ss = SpreadsheetApp.getActive();
  // cache sheets + headers + tarikh per row
  const cache = {};
  function info(sheetName) {
    if (!cache[sheetName]) {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) throw new Error('Sheet tidak jumpa: ' + sheetName);
      const h = headerRow_(sh);
      cache[sheetName] = { sh: sh, h: h, tIdx: h.headers.map(x => norm_(x)).indexOf('TARIKH') + 1 };
    }
    return cache[sheetName];
  }
  // resolve columns + tarikh dahulu
  const resolved = list.map(function (u) {
    const inf = info(u.sheet);
    const col = colIndex_(inf.h.headers, u.colName);
    if (col < 1) throw new Error('Kolum tidak jumpa: ' + u.colName);
    if (u.row < inf.h.headerRow + 1) throw new Error('Row tidak valid: ' + u.row);
    const tarikh = inf.tIdx ? String(inf.sh.getRange(u.row, inf.tIdx).getValue()).trim() : '';
    return { sheet: u.sheet, row: u.row, col: col, colName: u.colName, value: (u.value || '').toString().trim(), tarikh: tarikh };
  });
  // bina peta nama sedia ada per tarikh, tolak sel yang akan dioverwrite
  const selfKeys = {};
  resolved.forEach(function (r) { selfKeys[r.sheet + '|' + r.row + '|' + r.col] = true; });
  const taken = {}; // tarikh -> {NORM: src}
  [SHEETS.pagi, SHEETS.khotbah].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const h = headerRow_(sh);
    const vals = sh.getDataRange().getValues();
    const tIdx = h.headers.map(x => norm_(x)).indexOf('TARIKH');
    for (let r = h.headerRow; r < vals.length; r++) {
      const t = String(vals[r][tIdx] || '').trim();
      h.headers.forEach(function (hh, c) {
        if (['BULAN', 'TARIKH', 'SABAT'].indexOf(norm_(hh)) >= 0) return;
        if (selfKeys[name + '|' + (r + 1) + '|' + (c + 1)]) return; // akan diganti — abaikan nilai lama
        String(vals[r][c] || '').split('&').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) {
          (taken[t] = taken[t] || {})[norm_(n)] = name + '/' + hh;
        });
      });
    }
  });
  // validasi batch (termasuk duplicate dalam batch sendiri)
  resolved.forEach(function (r) {
    if (!r.value) return;
    const m = (taken[r.tarikh] = taken[r.tarikh] || {});
    if (m[norm_(r.value)]) throw new Error('R1: ' + r.value + ' sudah bertugas di ' + m[norm_(r.value)] + ' pada tarikh ' + r.tarikh + '.');
    m[norm_(r.value)] = r.sheet + '/' + r.colName;
  });
  // tulis semua
  resolved.forEach(function (r) {
    info(r.sheet).sh.getRange(r.row, r.col).setValue(r.value);
  });
  return json_({ ok: true, updated: resolved.length });
}

function addPetugas_(p) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.petugas);
  if (!sh) throw new Error('Sheet List Petugas tidak jumpa');
  const nama = (p.nama || '').toString().trim();
  if (!nama) throw new Error('Nama wajib');
  const vals = sh.getDataRange().getValues();
  const exists = vals.some(function (r) { return norm_(r[0]) === norm_(nama); });
  if (exists) throw new Error('Nama sudah wujud: ' + nama);
  sh.appendRow([nama, p.jabatan || '', p.peranan || '', 'Y']);
  return json_({ ok: true });
}
