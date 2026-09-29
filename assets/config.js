// Config utama — tukar APPS_SCRIPT_URL selepas deploy Apps Script.
window.APP_CONFIG = {
  // ID publish DB sedia ada (jangan tukar kecuali buat Sheet baru)
  PUB_ID: "2PACX-1vSdxfCBYF76gKqrO8ZeSBaUhIgLNgAihHB3WIfI9B_DPQE1MEm93nwb0dTjsuPYg17GXoQ8WsRdEYH1",
  GIDS: {
    petugas: "1944164941",
    pagi: "959531238",
    khotbah: "1067441330"
  },
  // URL Web App dari Apps Script (Execute as: Me, Access: Anyone)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbz-pJLZ_cDJVXIu3hQg7cXd42cK4Q0RRYEZPIIUEQnZsjYqq0s0T0JvhjK097I6Hj39Rw/exec",
  YEAR_DEFAULT: 2026,
  // Dept -> columns yang boleh diisi (nama header exact dari Sheet). Tukar ikut keperluan.
  SHEET_PAGI: "JADUAL KEBAKTIAN PAGI",
  SHEET_KHOTBAH: "JADUAL KHOTBAH",
  DEPTS: {
    "Semua": null,
    "Pimpinan": ["PEMIMPIN NYANYI & PENUTUP S.SABAT, DOA PENUTUP", "PEMIMPIN ACARA & DOA PEMBUKA", "PEMIMPIN ACARA", "DOA PERSEMBAHAN & PERSEPULUHAN", "DOA PEMBUKA"],
    "Muzik": ["PIANISIT", "MEDIA", "PIANIST"],
    "Firman & Misi": ["CERITA MISI", "BACAAN KELUARGA & KESIHATAN", "BACAAN LAPORAN", "PENGKHOTBAH", "PERSEMBAHAN ISTIMEWA"],
    "Diakon & Jurutulis": ["JURUTULIS 1", "JURUTULIS 2", "DIAKON 1 / DIAKONES 1", "DIAKON 2 / DIAKONES 2"]
  }
};
