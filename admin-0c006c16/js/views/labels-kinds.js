/**
 * <admin>/js/views/labels-kinds.js  -  the kinds of label (project, part, inventory, shipment): what each holds, the sizes, the design saved for each kind, and the codes printed on them
 * Read only when the Labels screen is opened (js/lazy.js). Every label carries the internal number of its record as a QR code and a Code 128 barcode: nothing secret is ever put in a code,
 * so a sticker that is lost or photographed gives nothing away. lkParse() turns a scanned or typed code back into the record it points to.
 * settings.labelKinds = { project: design, part: design, inventory: design, shipment: design, receipt: design } is kept with the sealed settings; lkDesign() always returns a complete, checked design.
 * Loaded by: admin page (on demand)
 */
'use strict';

const LK_KINDS = ['project', 'part', 'inventory', 'shipment'], LK_ALL = LK_KINDS.concat(['receipt']);
const LK_AREA = { project: 'clients', part: 'clients', inventory: 'inventory', shipment: 'logistics', receipt: 'finance' };      // the permission that opens each kind
// every field a kind can print (the order here is the order they are offered); the first six of a label are the usual ones
const LK_FIELDS = {
  project: ['logo', 'flag', 'clientId', 'clientName', 'sku', 'title', 'type', 'date', 'qr', 'barcode'],
  part: ['logo', 'flag', 'clientId', 'clientName', 'sku', 'part', 'title', 'status', 'due', 'date', 'qr', 'barcode'],
  inventory: ['logo', 'flag', 'id', 'code', 'name', 'category', 'unit', 'location', 'supplier', 'expiry', 'date', 'qr', 'barcode'],
  shipment: ['logo', 'flag', 'id', 'code', 'title', 'type', 'carrier', 'tracking', 'route', 'eta', 'client', 'line', 'date', 'qr', 'barcode'],
  receipt: ['logo', 'party', 'category', 'project', 'notes', 'signatures', 'qr', 'barcode'],
};
const LK_START = {
  project: ['logo', 'flag', 'clientId', 'sku', 'title', 'qr', 'barcode'], part: ['logo', 'flag', 'sku', 'part', 'title', 'qr', 'barcode'],
  inventory: ['logo', 'id', 'name', 'location', 'qr', 'barcode'], shipment: ['logo', 'id', 'title', 'route', 'tracking', 'qr', 'barcode'],
  receipt: ['logo', 'party', 'category', 'project', 'notes', 'signatures', 'qr', 'barcode'],
};
const LK_SIZE_IDS = ['sq', 'strip', 'p50x30', 'p70x40', 'p100x60', 'p100x150', 'custom'];
const LK_SIZE_MM = { sq: [25, 25], p50x30: [50, 30], p70x40: [70, 40], p100x60: [100, 60], p100x150: [100, 150] };
const LK_PAPER_IDS = ['a4', 'a5', 'roll80'], LK_PAPER_MM = { a4: [210, 297], a5: [148, 210], roll80: [80, 0] };           // a receipt: A4, A5 or an 80 mm roll (as long as it needs to be)
const LK_START_SIZE = { project: 'p50x30', part: 'p50x30', inventory: 'p50x30', shipment: 'p100x60', receipt: 'a5' };
const LK_FONTS = { sans: '"IBM Plex Sans","IBM Plex Sans Arabic",system-ui,sans-serif', serif: 'Georgia,"Times New Roman","Noto Naskh Arabic",serif', mono: 'ui-monospace,Menlo,Consolas,monospace', rounded: '"Trebuchet MS","Segoe UI",system-ui,sans-serif' };
const LK_BORDERS = ['none', 'thin', 'thick', 'round'], LK_ALIGNS = ['start', 'center'], LK_XSIZES = ['s', 'm', 'l'], LK_XALIGNS = ['start', 'center', 'end'];
const LK_THEMES = { light: ['#ffffff', '#000000', '#555555'], dark: ['#1b1b1b', '#ffffff', '#f5b301'], sand: ['#f4efe6', '#2b2118', '#8a5a2b'], green: ['#e8f1ea', '#102a1b', '#1f6b3a'], sky: ['#e8f0fa', '#0d2340', '#1f5fae'] };
const LK_EXTRA_MAX = 6, LK_COPIES_MAX = 50, LK_PIECES_MAX = 200;

const lkClamp = (v, lo, hi, def) => { const n = Math.round(Number(v)); return v !== '' && v != null && isFinite(n) && n >= lo && n <= hi ? n : def; };
const lkdHex = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : def);
const lkdLuma = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const lkdContrast = (a, b) => { const x = lkdLuma(a), y = lkdLuma(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* =====================================================================
   The design of one kind: size, what is printed (in this order), colours, font, text size, alignment, border and extra paragraphs
   ===================================================================== */
function lkDefault(kind) {
  const [bg, fg, ac] = LK_THEMES.light;
  return { size: LK_START_SIZE[kind], length: 6, w: 50, h: 30, fields: LK_START[kind].slice(), slogan: 'EGYPT MADE WITH EGYPT', copies: 1, bg, fg, accent: ac, font: 'sans', scale: 100, align: 'start', border: 'thin', extra: [], mode: 'page' };
}
function lkNorm(kind, x) {
  const d = lkDefault(kind); x = x && typeof x === 'object' ? x : {}; const paper = kind === 'receipt';
  const known = LK_FIELDS[kind], fields = Array.isArray(x.fields) ? x.fields.filter((f, i) => known.includes(f) && x.fields.indexOf(f) === i) : d.fields;
  const extra = (Array.isArray(x.extra) ? x.extra : []).slice(0, LK_EXTRA_MAX).map((e) => {
    e = e && typeof e === 'object' ? e : {};
    return { text: String(e.text == null ? '' : e.text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 160), b: e.b === true, i: e.i === true, size: LK_XSIZES.includes(e.size) ? e.size : 'm', align: LK_XALIGNS.includes(e.align) ? e.align : 'start' };
  }).filter((e) => e.text.trim());
  return { size: (paper ? LK_PAPER_IDS : LK_SIZE_IDS).includes(x.size) ? x.size : d.size, length: lkClamp(x.length * 10, 30, 300, 60) / 10, w: lkClamp(x.w, 15, 300, d.w), h: lkClamp(x.h, 15, 300, d.h), fields,
    slogan: typeof x.slogan === 'string' ? x.slogan.replace(/\s+/g, ' ').trim().slice(0, 40) : d.slogan, copies: lkClamp(x.copies, 1, LK_COPIES_MAX, 1), bg: lkdHex(x.bg, d.bg), fg: lkdHex(x.fg, d.fg), accent: lkdHex(x.accent, d.accent),
    font: Object.prototype.hasOwnProperty.call(LK_FONTS, x.font) ? x.font : d.font, scale: lkClamp(x.scale, 70, 160, 100), align: LK_ALIGNS.includes(x.align) ? x.align : d.align,
    border: LK_BORDERS.includes(x.border) ? x.border : d.border, extra, mode: x.mode === 'sheet' ? 'sheet' : 'page' };
}
const lkStored = (kind) => (session && session.settings && session.settings.labelKinds && session.settings.labelKinds[kind]) || null;
const lkDesign = (kind) => lkNorm(kind, lkStored(kind));
// page size in mm: [width, height]; a roll receipt has no fixed height (0)
function lkDims(kind, d) {
  if (kind === 'receipt') return LK_PAPER_MM[d.size] || LK_PAPER_MM.a5;
  return d.size === 'strip' ? [Math.round(d.length * 10), 25] : d.size === 'custom' ? [d.w, d.h] : LK_SIZE_MM[d.size];
}

/* =====================================================================
   What can be chosen: one row per record
   ===================================================================== */
const lkPieces = (x) => Math.max(1, Math.min(LK_PIECES_MAX, Math.round(num(x.qty)) || 1));
// rows of a kind: { key, text (what the search looks in), group (what the filter chooses by), ... the records }
function lkRows(kind) {
  const out = [];
  if (kind === 'project' || kind === 'part') {
    for (const it of (store ? store.items : [])) it.rec.projects.forEach((p, i) => {
      const base = [p.sku, p.title, L(p.typeName), it.rec.id, it.rec.client.name].join(' ');
      if (kind === 'project') out.push({ key: p.sku, rec: it.rec, p, i, text: base, group: it.rec.id });
      else (p.parts || []).forEach((x, j) => out.push({ key: p.sku + '.' + (j + 1), rec: it.rec, p, i, x, no: j + 1, pieces: lkPieces(x), text: base + ' ' + (x.name || ''), group: p.sku }));
    });
  } else if (kind === 'inventory') {
    for (const x of opsList('inventory')) out.push({ key: x.id, item: x, text: [x.id, x.code, x.name, x.location, x.notes].join(' '), group: x.category });
  } else if (kind === 'shipment') {
    for (const s of opsList('logistics')) out.push({ key: s.id, s, text: [s.id, s.code, s.title, s.tracking, s.carrier, s.clientName, s.from, s.to].join(' '), group: s.kind });
  }
  return out;
}
// the labels of the chosen rows: scope 'piece' / 'lines' gives one label for every piece of a part / every line of a shipment; copies repeats each label
function lkLabels(kind, rows, scope, copies) {
  const list = [];
  for (const r of rows) {
    if (kind === 'part' && scope === 'piece') for (let k = 1; k <= r.pieces; k++) list.push({ kind, row: r, k, n: r.pieces });
    else if (kind === 'part') list.push({ kind, row: r, k: 0, n: r.pieces });
    else if (kind === 'shipment' && scope === 'lines' && r.s.lines.length) r.s.lines.forEach((l, j) => list.push({ kind, row: r, line: l, j: j + 1 }));
    else list.push({ kind, row: r });
  }
  const out = []; for (const x of list) for (let c = 0; c < copies; c++) out.push(x);
  return out;
}
// the text of a QR code and barcode: the internal number only (40 characters at most, plain ASCII)
function lkCode(lb) {
  const r = lb.row;
  if (lb.kind === 'project') return r.p.sku;
  if (lb.kind === 'part') return r.p.sku + '.' + r.no + (lb.k ? '.' + lb.k : '');
  if (lb.kind === 'inventory') return r.item.id;
  return r.s.id + (lb.line ? '.' + lb.j : '');
}
// the printed text of every text field of one label
function lkValues(lb) {
  const r = lb.row, v = { date: fmtDay(todayStr()) };
  if (lb.kind === 'project' || lb.kind === 'part') {
    const p = r.p; Object.assign(v, { clientId: r.rec.id, clientName: r.rec.client.name, sku: p.sku, title: p.title || L(p.typeName) || p.type || '', type: L(p.typeName) || p.type || '' });
    if (lb.kind === 'part') Object.assign(v, { part: (r.x.name || t('lbl.piece')) + (lb.k ? ' ' + nf(lb.k) + '/' + nf(lb.n) : ' × ' + nf(lb.n)), status: t(statusInfo(r.x.status || 'pending')[1]), due: r.x.dueDate ? fmtDay(r.x.dueDate) : '' });
  } else if (lb.kind === 'inventory') {
    const x = r.item; Object.assign(v, { id: x.id, code: x.code, name: x.name, category: t('bom.cat.' + x.category), unit: t('bom.unit.' + x.unit), location: x.location, supplier: x.supplierId ? supName(x.supplierId) : '', expiry: x.expiry ? fmtDay(x.expiry) : '' });
  } else {
    const s = r.s; Object.assign(v, { id: s.id, code: s.code, title: s.title, type: t('lg.kind.' + s.kind), carrier: s.carrier, tracking: s.tracking, route: [s.from, s.to].filter(Boolean).join(' → '), eta: s.eta ? fmtDay(s.eta) : '', client: s.clientName,
      line: lb.line ? (lb.line.name || '') + ' × ' + nf(lb.line.qty) + ' ' + t('bom.unit.' + lb.line.unit) : '' });
  }
  return v;
}
// the words an extra paragraph may use: {brand} {date} {code} and the fields of the kind in curly brackets (an unknown word stays as it is)
function lkFill(text, vals, code) {
  const all = Object.assign({}, vals, { brand: brandName(), code });
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(all, k) && all[k] !== undefined ? all[k] : m));
}

/* =====================================================================
   Scanning: a code read by a keyboard scanner (or typed) -> the record it points to
   ===================================================================== */
function lkParse(raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase(); if (!s || s.length > 60) return null;
  let m;
  if (/^V-/.test(s)) return { kind: 'receipt', code: s };
  if ((m = /^(MAT-\d+)$/.exec(s))) return { kind: 'inventory', id: m[1] };
  if ((m = /^(LG-\d+)(?:\.(\d+))?$/.exec(s))) return { kind: 'shipment', id: m[1], line: m[2] ? Number(m[2]) : 0 };
  m = /^(.+?)(?:\.(\d+)\.(\d+))?$/.exec(s);
  return { kind: 'project', sku: m[1], part: m[2] ? Number(m[2]) : 0, k: m[3] ? Number(m[3]) : 0 };
}
// the data a code needs must already be loaded (the Labels screen loads it before asking); null = no such record
function lkResolve(pc) {
  if (!pc) return null;
  if (pc.kind === 'inventory') { const x = opsFind('inventory', pc.id); return x ? { kind: 'inventory', title: x.name, sub: x.id + (x.location ? ' · ' + x.location : ''), href: '#inventory/' + x.id, key: x.id } : null; }
  if (pc.kind === 'shipment') { const s = opsFind('logistics', pc.id); return s ? { kind: 'shipment', title: s.title || s.id, sub: s.id + (pc.line && s.lines[pc.line - 1] ? ' · ' + s.lines[pc.line - 1].name : ''), href: '#logistics/' + s.id, key: s.id } : null; }
  if (pc.kind === 'project' && store) {
    for (const it of store.items) for (let i = 0; i < it.rec.projects.length; i++) {
      const p = it.rec.projects[i]; if (String(p.sku).toUpperCase() !== pc.sku) continue;
      const x = pc.part ? (p.parts || [])[pc.part - 1] : null;
      if (pc.part && !x) return null;
      return x ? { kind: 'part', title: (x.name || t('lbl.piece')) + (pc.k ? ' ' + nf(pc.k) + '/' + nf(lkPieces(x)) : ''), sub: p.sku + ' · ' + it.rec.client.name, href: '#progress/' + it.rec.id + '/' + i, key: p.sku + '.' + pc.part }
        : { kind: 'project', title: p.title || L(p.typeName) || p.sku, sub: p.sku + ' · ' + it.rec.client.name, href: '#manage/' + it.rec.id, key: p.sku };
    }
  }
  return null;
}
