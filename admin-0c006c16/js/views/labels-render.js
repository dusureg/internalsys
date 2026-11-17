/**
 * <admin>/js/views/labels-render.js  -  draws one label of any kind and size, and prints it or saves it as a picture
 * A label is built from the design of its kind (labels-kinds.js): the logo and the thin flag on top, the chosen text lines in the chosen order, the extra paragraphs, the QR code beside the text
 * and the Code 128 barcode below, all in the colours, font and text size of the design. Codes are always black on white, whatever the colours of the label, so a scanner can read them.
 * The text of a label that does not fit is shrunk a step at a time (fitLabel, in views/labels.js); one that still does not fit is marked. Printing gives one label per page of exactly its
 * size (a label printer, or "Save as PDF"), or labels side by side on a sheet of paper. A picture (PNG) is made with the same drawing, one label or all of them in one ZIP file.
 * Loaded by: admin page (on demand)
 */
'use strict';

const LK_PLAIN = new Set(['clientId', 'sku', 'id', 'code', 'tracking', 'date', 'eta', 'expiry', 'due']);           // left-to-right text in a monospaced font: numbers and codes
const LK_SPECIAL = new Set(['logo', 'flag', 'qr', 'barcode']);
const LK_PX_MM = 96 / 25.4;
// how many times the real size a label is drawn on screen so that it fits a screen: small labels are magnified, a big one is shown smaller (printing is always 1:1)
function lkScreenK(kind, d) {
  const [w] = lkDims(kind, d);
  return d.size === 'strip' ? Math.max(0.6, Math.min(2, 300 / w)) : Math.max(0.5, Math.min(2.6, 90 / w));
}

/* ---- one label ---- */
function lkLabelEl(lb, d, k) {
  const vals = lkValues(lb), code = lkCode(lb), [w, hh] = lkDims(lb.kind, d), strip = w >= hh * 1.8, has = (f) => d.fields.includes(f);
  const sc = Math.max(1, Math.min(w, hh) / 25) * d.scale / 100;
  const first = d.fields.find((f) => (f === 'sku' || f === 'id') && vals[f]);
  const lines = d.fields.filter((f) => !LK_SPECIAL.has(f) && vals[f] !== undefined && String(vals[f]).trim()).map((f) => {
    const plain = LK_PLAIN.has(f);
    return h('div', { class: 'lbl-line lk-line' + (plain ? ' mono' : '') + (f === first ? ' lbl-sku lk-strong' : ''), dir: plain ? 'ltr' : 'auto', 'data-f': f }, String(vals[f]));
  });
  const extras = d.extra.map((e) => {
    const s = lkFill(e.text, vals, code);
    return s.trim() ? h('div', { class: 'lk-x lk-x-' + e.size + (e.b ? ' b' : '') + (e.i ? ' i' : ''), dir: 'auto', style: 'text-align:' + e.align }, s) : null;
  }).filter(Boolean);
  const logo = has('logo') ? h('div', { class: 'lbl-top' }, lblLogo()) : null;
  const flag = has('flag') ? h('div', { class: 'lbl-eg' }, lblFlag(), d.slogan ? h('span', { class: 'lbl-slogan', dir: 'ltr' }, d.slogan) : null) : null;
  const bar = has('barcode') ? h('div', { class: 'lbl-barbox' }, lblBarcode(code)) : null, qr = has('qr') ? h('div', { class: 'lbl-qrbox' }, lblQr(code)) : null;
  const text = h('div', { class: 'lbl-text' }, lines, extras);
  const el = h('div', { class: 'lbl lk lbl-' + (strip ? 'strip' : 'sq'), 'data-layout': strip ? 'strip' : 'box', 'data-align': d.align, 'data-border': d.border, 'data-kind': lb.kind, 'data-code': code, dir: 'ltr' },
    strip ? [h('div', { class: 'lbl-side' }, logo, flag), text, qr, bar] : [logo, flag, qr ? h('div', { class: 'lbl-mid' }, text, qr) : text, bar]);
  const st = el.style;
  st.setProperty('--w', w + 'mm'); st.setProperty('--hh', hh + 'mm'); st.setProperty('--k', String(k)); st.setProperty('--sc', String(Math.round(sc * 100) / 100));
  st.setProperty('--lk-bg', d.bg); st.setProperty('--lk-fg', d.fg); st.setProperty('--lk-ac', d.accent); st.setProperty('--lk-st', lkdContrast(d.accent, d.bg) >= 4.5 ? d.accent : d.fg);
  st.fontFamily = LK_FONTS[d.font];
  return el;
}

/* ---- the sheet of labels on screen, and the page rule for printing ---- */
function lkPageRule(kind, d, rollMm) {
  const [w, hh] = lkDims(kind, d); let st = document.getElementById('dsLabelPage');
  if (!st) { st = document.createElement('style'); st.id = 'dsLabelPage'; document.head.appendChild(st); }
  const paper = normPaper(session && session.settings ? session.settings.paper : 'A4');
  st.textContent = d.mode === 'sheet' && kind !== 'receipt' ? '@page lbl{size:' + paper + ';margin:8mm}' : kind === 'receipt' && d.size === 'roll80' ? '@page lbl{size:80mm ' + (rollMm || 200) + 'mm;margin:0}'
    : '@page lbl{size:' + w + 'mm ' + hh + 'mm;margin:0}';
}
function lkFitAll(root) {
  let tight = 0;
  root.querySelectorAll('.lbl').forEach((el) => { fitLabel(el); if (el.hasAttribute('data-tight')) tight++; });
  return tight;
}
function lkPrint(kind, d, name, rollMm) {
  lkPageRule(kind, d, rollMm); lkFitAll(document.getElementById('lkSheet') || document.body);
  const old = document.title; document.title = (brandName() + '-' + name).replace(/[^\w\u0600-\u06FF-]+/g, '_').replace(/^_+|_+$/g, '');
  const back = () => { document.title = old; removeEventListener('afterprint', back); };
  addEventListener('afterprint', back); window.print();
}

/* ---- pictures ---- */
// a node drawn off screen at a size that gives a sharp picture, then saved as PNG of exactly the label's (or paper's) shape
async function lkPicture(build, wmm, bg) {
  const k = Math.max(0.4, Math.min(8, 640 / (wmm * LK_PX_MM))), host = h('div', { style: 'position:fixed;left:-100000px;top:0;visibility:hidden' }), el = build(k);
  host.append(el); document.body.append(host);
  try {
    if (el.classList.contains('lbl')) fitLabel(el);
    return await domToPng(el, { width: Math.round(wmm * k * LK_PX_MM), scale: 2, exact: true, background: bg });
  } catch (e) { throw new Error(e && e.message ? e.message : t('img.fail')); } finally { host.remove(); }
}
const lkLabelPicture = (lb, d) => lkPicture((k) => lkLabelEl(lb, d, k), lkDims(lb.kind, d)[0], d.bg);
const lkFileName = (s) => String(s).replace(/[^\w\u0600-\u06FF.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'label';
async function lkSavePictures(items, pic, onStep) {
  if (items.length === 1) { const b = await pic(items[0]); saveBlob(b, lkFileName(items[0].name) + '.png'); return 1; }
  const files = [], used = new Set();
  for (let i = 0; i < items.length; i++) {
    if (onStep) onStep(i + 1, items.length);
    const b = await pic(items[i]); let n = lkFileName(items[i].name), u = n, c = 2; while (used.has(u)) u = n + '-' + c++;
    used.add(u); files.push({ name: u + '.png', data: new Uint8Array(await b.arrayBuffer()) });
    await new Promise((r) => setTimeout(r, 0));
  }
  saveBlob(new Blob([zipStore(files)], { type: 'application/zip' }), brandName().replace(/[^\w-]+/g, '_') + '-' + t('lk.fileName') + '.zip');
  return files.length;
}
