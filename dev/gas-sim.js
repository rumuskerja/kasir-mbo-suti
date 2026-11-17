// Simulasi minimal Google Apps Script (SpreadsheetApp dkk.) untuk menguji Code.gs di Node.
// Bukan untuk produksi. Pakai: const sim = require('./gas-sim')('../apps-script/Code.gs')
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

module.exports = function load(codePath, opts = {}) {
  const sheets = {};
  const mkSheet = (name) => {
    const s = { name, data: [], maxRows: 1000 };
    const range = (r, c, nr = 1, nc = 1) => {
      if (r + nr - 1 > s.maxRows) throw new Error('Range out of bounds ' + name);
      const R = {
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(((s.data[r - 1 + i] || [])[c - 1 + j]) ?? ''); out.push(row); } return out; },
        setValues: (v) => { for (let i = 0; i < nr; i++) { s.data[r - 1 + i] = s.data[r - 1 + i] || []; for (let j = 0; j < nc; j++) s.data[r - 1 + i][c - 1 + j] = v[i][j]; } return R; },
        setValue: (v) => R.setValues([[v]]),
        setFontWeight: () => R, setBackground: () => R, setFontColor: () => R, setNumberFormat: () => R,
      };
      return R;
    };
    const lastRow = () => { let n = s.data.length; while (n > 0 && (!s.data[n - 1] || s.data[n - 1].every(x => x === '' || x == null))) n--; return n; };
    const lastCol = () => Math.max(0, ...s.data.map(r => (r || []).length));
    return Object.assign(s, {
      getRange: range, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => s.maxRows,
      insertRowsAfter: (_, n) => { s.maxRows += n; },
      getDataRange: () => range(1, 1, Math.max(1, lastRow()), Math.max(1, lastCol())),
      setFrozenRows: () => {}, getName: () => name,
    });
  };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mkSheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet: (s) => delete sheets[s.name],
    setSpreadsheetTimeZone: () => {}, getUrl: () => 'https://docs.google.com/spreadsheets/d/SIMULASI/edit',
  };
  const props = {}; const cache = {};
  const fmt = (d, tz, f) => {
    const t = new Date(d.getTime() + 7 * 3600e3).toISOString(); // WIB
    return f === 'yyyy-MM-dd' ? t.slice(0, 10) : t.slice(0, 19);
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => [...crypto.createHash('sha256').update(s).digest()],
      computeHmacSha256Signature: (s, k) => [...crypto.createHmac('sha256', k).update(s).digest()],
      base64EncodeWebSafe: (b) => Buffer.from(b.map(x => x & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => crypto.randomUUID(), formatDate: fmt, sleep: () => {},
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
    Logger: { log: (...a) => opts.quiet || console.log('[GAS]', ...a) },
    console, Date, Math, JSON, String, Number, Object, Array, Error, isNaN,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  return { ctx, sheets, post, setup: () => ctx.setup() };
};
