/* Jadual Gereja SDA Koporingan — shared logic
   Baca: CSV publish (tanpa login). Tulis: via Apps Script (config APPS_SCRIPT_URL).
   Rules: R1 no-double per Tarikh across Pagi+Khotbah, R2 kosong block PDF, R3 dropdown only.
*/
(function () {
  const cfg = window.APP_CONFIG || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const norm = (s) => (s || "").toString().trim().replace(/\s+/g, " ").toUpperCase();

  function csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/e/${cfg.PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  }

  // CSV parser ringkas (handle quoted commas)
  function parseCSV(text) {
    const rows = [];
    let row = [], val = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (q) {
        if (c === '"' && n === '"') { val += '"'; i++; }
        else if (c === '"') { q = false; }
        else val += c;
      } else {
        if (c === '"') q = true;
        else if (c === ",") { row.push(val); val = ""; }
        else if (c === "\n") { row.push(val); rows.push(row); row = []; val = ""; }
        else if (c === "\r") { /* skip */ }
        else val += c;
      }
    }
    row.push(val); rows.push(row);
    return rows.filter(r => r.some(x => (x || "").trim() !== ""));
  }

  function parseTarikh(s) {
    // input "3/10", "03/10/2026", "2026-10-03" -> {d,m,y,iso,label}
    s = (s || "").trim();
    if (!s) return null;
    let d, m, y = cfg.YEAR_DEFAULT || 2026;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [yy, mm, dd] = s.split("-").map(Number);
      y = yy; m = mm; d = dd;
    } else {
      const parts = s.split(/[\/\-.]/).map(x => parseInt(x, 10));
      if (parts.length >= 2) { d = parts[0]; m = parts[1]; if (parts[2]) y = parts[2] < 100 ? 2000 + parts[2] : parts[2]; }
      else return null;
    }
    if (!d || !m) return null;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const bulanMs = ["", "Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];
    return { d, m, y, iso, label: `${d} ${bulanMs[m]} ${y}` };
  }

  async function loadDB() {
    const [tP, tPa, tK] = await Promise.all([
      fetch(csvUrl(cfg.GIDS.petugas)).then(r => r.text()),
      fetch(csvUrl(cfg.GIDS.pagi)).then(r => r.text()),
      fetch(csvUrl(cfg.GIDS.khotbah)).then(r => r.text()),
    ]);
    const rPet = parseCSV(tP);
    const rPagi = parseCSV(tPa);
    const rKhot = parseCSV(tK);

    // List Petugas: header Nama,Jabatan,Peranan,Aktif
    const hP = rPet[0].map(h => norm(h));
    const iN = hP.indexOf("NAMA"), iJ = hP.indexOf("JABATAN"), iR = hP.indexOf("PERANAN"), iA = hP.indexOf("AKTIF");
    const petugas = rPet.slice(1).map(r => ({
      nama: (r[iN] || "").trim(),
      jabatan: (r[iJ] || "").trim(),
      peranan: (r[iR] || "").trim(),
      aktif: (r[iA] || "").trim().toUpperCase(),
    })).filter(p => p.nama);

    // Jadual: baris 0 = tajuk, baris 1 = header, baris 2+ = data
    function toJadual(rows) {
      if (rows.length < 2) return { headers: [], rows: [] };
      const headers = rows[1].map(h => (h || "").trim());
      return {
        headers,
        rows: rows.slice(2).map((r, idx) => {
          const o = { _rowIndex: idx + 3 }; // nombor baris sebenar dalam Sheet (1-based)
          headers.forEach((h, ci) => { o[h] = (r[ci] || "").trim(); });
          const t = parseTarikh(o["TARIKH"]);
          o._iso = t ? t.iso : "";
          o._label = t ? t.label : (o["TARIKH"] || "-");
          return o;
        })
      };
    }
    return { petugas, pagi: toJadual(rPagi), khotbah: toJadual(rKhot) };
  }

  // Kumpul semua nama bertugas pada satu tarikh (untuk R1)
  function namesOnDate(db, iso, ignore) {
    const out = [];
    const push = (val, src) => {
      (val || "").split("&").map(s => s.trim()).filter(Boolean).forEach(n => {
        if (ignore && norm(n) === norm(ignore)) return;
        out.push({ nama: n, key: norm(n), src });
      });
    };
    db.pagi.rows.filter(r => r._iso === iso).forEach(r => {
      Object.keys(r).forEach(k => {
        if (["BULAN", "TARIKH", "SABAT", "_rowIndex", "_iso", "_label"].includes(k)) return;
        push(r[k], "Pagi/" + k);
      });
    });
    db.khotbah.rows.filter(r => r._iso === iso).forEach(r => {
      Object.keys(r).forEach(k => {
        if (["BULAN", "TARIKH", "SABAT", "_rowIndex", "_iso", "_label"].includes(k)) return;
        push(r[k], "Khotbah/" + k);
      });
    });
    return out;
  }

  function findDuplicate(db, iso, candidate) {
    const key = norm(candidate);
    if (!key) return null;
    return namesOnDate(db, iso).find(x => x.key === key) || null;
  }

  // Tulis ke Sheet via Apps Script
  async function apiPost(payload) {
    if (!cfg.APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL belum diisi dalam assets/config.js");
    const res = await fetch(cfg.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || "Gagal simpan");
    return j;
  }

  // Helpers revamp: nama saya (localStorage), senarai sabat, progress dept
  const SKIP = ["BULAN", "TARIKH", "SABAT", "_rowIndex", "_iso", "_label"];
  function roleCols(j) { return (j.headers || []).filter(h => !["BULAN", "TARIKH", "SABAT"].includes(h)); }
  function getMyName() { try { return localStorage.getItem("sda_myname") || ""; } catch (e) { return ""; } }
  function setMyName(n) { try { localStorage.setItem("sda_myname", n || ""); } catch (e) {} }
  function sabatList(db) {
    const byIso = {};
    db.pagi.rows.forEach(r => { if (r._iso) byIso[r._iso] = byIso[r._iso] || { iso: r._iso, label: r._label, sabat: r.SABAT, bulan: r.BULAN, pagi: r, khotbah: null }; });
    db.khotbah.rows.forEach(r => { if (!r._iso) return; byIso[r._iso] = byIso[r._iso] || { iso: r._iso, label: r._label, sabat: r.SABAT, bulan: r.BULAN, pagi: null }; byIso[r._iso].khotbah = r; if (!byIso[r._iso].pagi) { byIso[r._iso].label = r._label; byIso[r._iso].sabat = r.SABAT; } });
    return Object.values(byIso).filter(x => x.iso).sort((a, b) => a.iso < b.iso ? -1 : 1);
  }
  function slotStats(db, iso) {
    // jumlah slot, diisi, kosong, double
    let total = 0, filled = 0;
    const seen = {}, dups = [];
    const count = (rows) => {
      rows.filter(r => r._iso === iso).forEach(r => {
        Object.keys(r).forEach(k => {
          if (SKIP.includes(k)) return;
          total++;
          const v = (r[k] || "").trim();
          if (v) {
            filled++;
            v.split("&").map(s => s.trim()).filter(Boolean).forEach(n => {
              const key = norm(n);
              if (seen[key]) dups.push(n); else seen[key] = 1;
            });
          }
        });
      });
    };
    count(db.pagi.rows); count(db.khotbah.rows);
    return { total, filled, empty: total - filled, dups: [...new Set(dups)] };
  }
  function deptStats(db, iso, deptCols) {
    // deptCols: null = semua
    let total = 0, filled = 0;
    const check = (rows) => {
      rows.filter(r => r._iso === iso).forEach(r => {
        Object.keys(r).forEach(k => {
          if (SKIP.includes(k)) return;
          if (deptCols && !deptCols.includes(k)) return;
          total++;
          if ((r[k] || "").trim()) filled++;
        });
      });
    };
    check(db.pagi.rows); check(db.khotbah.rows);
    return { total, filled, empty: total - filled };
  }
  function myDuties(db, nama) {
    const key = norm(nama);
    if (!key) return [];
    const out = [];
    const scan = (rows, src) => {
      rows.forEach(r => {
        Object.keys(r).forEach(k => {
          if (SKIP.includes(k)) return;
          (r[k] || "").split("&").map(s => s.trim()).filter(Boolean).forEach(n => {
            if (norm(n) === key) out.push({ iso: r._iso, label: r._label, sabat: r.SABAT, role: k, src });
          });
        });
      });
    };
    scan(db.pagi.rows, "Pagi"); scan(db.khotbah.rows, "Khotbah");
    return out.sort((a, b) => a.iso < b.iso ? -1 : 1);
  }

  // Expose
  window.JadualApp = { loadDB, parseTarikh, namesOnDate, findDuplicate, apiPost, norm, csvUrl, roleCols, getMyName, setMyName, sabatList, slotStats, deptStats, myDuties };
})();
