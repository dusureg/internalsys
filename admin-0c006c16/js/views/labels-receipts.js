/**
 * <admin>/js/views/labels-receipts.js  -  a printable receipt for every cost in the system
 * The costs come from where they already live: company expenses (every repeat of a recurring one), shipment costs, payroll (one receipt per person and month, only for whoever may open Staff & pay)
 * and the cost lines of every project. Nothing is stored for a receipt: its number is made from the number of the record (V-EXP-0007, V-LG-0003, V-PAY-2026-10-PPL-001, V-<project number>-<line>),
 * so the same cost always gives the same number and a scan of its QR code or barcode finds it again. A receipt is printed on A4, A5 or an 80 mm roll, or saved as a picture.
 * Loaded by: admin page (on demand)
 */
'use strict';

const LK_SOURCES = ['expense', 'shipment', 'payroll', 'project'];
const lkDayOf = (x) => (oday(x) ? x : '');

// every cost of the period: { code, src, date, title, party, kind ('direct' | 'indirect' | 'none'), cat, project, notes, lines: [{ text, amount, sub }], total, href, key, text }
function lkReceiptRows(sel) {
  const from = sel.from || '', to = sel.to || '', inR = (d) => !!d && (!from || d >= from) && (!to || d <= to), out = [];
  const push = (r) => { r.key = r.code; r.text = [r.code, r.title, r.party, r.cat, r.project, r.notes].join(' '); out.push(r); };
  if (sel.src.includes('expense')) {
    for (const e of opsList('expenses')) for (const o of expenseOccurrences(e, from, to)) {
      const lines = [{ text: t('lk.rc.amount'), amount: num(e.amount) }]; if (num(e.discount) > 0) lines.push({ text: t('lk.rc.discount'), amount: -num(e.discount), sub: true });
      push({ code: 'V-' + e.id + (e.repeat !== 'none' ? '-' + o.date.slice(2, 4) + o.date.slice(5, 7) : ''), src: 'expense', date: o.date, title: e.name, party: e.supplierId ? supName(e.supplierId) : '', kind: e.kind,
        cat: catText(e.kind, e.cat), project: '', notes: e.notes, lines, total: o.amount, href: '#expenses/' + e.id });
    }
  }
  if (sel.src.includes('shipment')) {
    for (const s of opsList('logistics')) {
      const date = lkDayOf(s.received) || lkDayOf(s.eta) || String(s.createdAt || '').slice(0, 10);
      if (!(s.cost > 0) || s.cancelled || !inR(date)) continue;
      push({ code: 'V-' + s.id, src: 'shipment', date, title: s.title || s.code || s.id, party: s.supplierId ? supName(s.supplierId) : s.carrier, kind: s.fin === 'direct' || s.fin === 'indirect' ? s.fin : 'none',
        cat: t('lg.kind.' + s.kind), project: s.clientName || s.project, notes: [s.carrier && s.supplierId ? s.carrier : '', s.tracking].filter(Boolean).join(' · '), lines: [{ text: t('lk.rc.freight'), amount: num(s.cost) }], total: num(s.cost), href: '#logistics/' + s.id });
    }
  }
  if (sel.src.includes('payroll') && can('staff')) {
    const ctl = ctlNow(), people = opsList('people'), cur = monthNow();
    const starts = people.map((p) => empStart(p).slice(0, 7)).filter(monthOk).sort(), first = from && from.slice(0, 7) > (starts[0] || '') ? from.slice(0, 7) : (starts[0] || cur), last = to && to.slice(0, 7) < cur ? to.slice(0, 7) : cur;
    for (let m = first, n = 0; m <= last && monthOk(m) && n < 240; m = monthShift(m, 1), n++) {
      const pm = payCache[m] ? payCache[m].data : null, day = m === cur ? (todayStr() < lastDayOf(m) ? todayStr() : lastDayOf(m)) : lastDayOf(m);
      if (!inR(day)) continue;
      for (const x of payMonthRows(m, people, pm, ctl)) {
        const r = x.r; if (!(r.gross > 0)) continue;
        const lines = [{ text: t('pay.base'), amount: r.base }, r.overtime ? { text: t('pay.overtime'), amount: r.overtime } : null, r.extra ? { text: t('pay.extra'), amount: r.extra } : null, r.bonus ? { text: t('pay.bonus'), amount: r.bonus } : null,
          r.deduction ? { text: t('pay.deduction'), amount: -r.deduction, sub: true } : null, { text: t('pay.gross'), amount: r.gross, bold: true }, r.advance ? { text: t('pay.advance'), amount: -r.advance, sub: true } : null].filter(Boolean);
        push({ code: 'V-PAY-' + m + '-' + x.p.id, src: 'payroll', date: day, title: t('lk.rc.payTitle', { m: monthLabel(m) }), party: x.p.name, kind: x.p.cost === 'direct' ? 'direct' : 'indirect',
          cat: catText(x.p.cost === 'direct' ? 'direct' : 'indirect', x.p.cost === 'direct' ? 'labor' : 'salaries'), project: '', notes: '', lines, total: r.net, href: '#staff/payroll/' + m });
      }
    }
  }
  if (sel.src.includes('project') && store) {
    for (const it of store.items) for (const p of it.rec.projects) {
      const date = lkDayOf(p.startDate) || String(it.rec.createdAt || '').slice(0, 10); if (!inR(date)) continue;
      (p.costs || []).forEach((c, i) => {
        const a = num(c.amount); if (!(a > 0)) return;
        const kind = c.type === 'opex' ? 'indirect' : 'direct';
        push({ code: 'V-' + p.sku + '-' + (i + 1), src: 'project', date, title: c.note || catText(kind, COST_CATS.includes(c.cat) ? c.cat : 'other'), party: it.rec.client.name, kind, cat: catText(kind, COST_CATS.includes(c.cat) ? c.cat : 'other'),
          project: p.sku + (p.title ? ' · ' + p.title : ''), notes: '', lines: [{ text: c.note || t('lk.rc.amount'), amount: a }], total: a, href: '#manage/' + it.rec.id });
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code));
}
// a code scanned from a receipt: the row it stands for (the period is widened to every date)
function lkFindReceipt(code, sources) {
  const rows = lkReceiptRows({ from: '', to: '', src: sources });
  return rows.find((r) => r.code.toUpperCase() === String(code).toUpperCase()) || null;
}

/* ---- one receipt ---- */
function lkReceiptEl(r, d, k) {
  const [w, hh] = lkDims('receipt', d), has = (f) => d.fields.includes(f), code = r.code;
  const row = (key, val) => (val ? h('div', { class: 'lk-rc-row' }, h('span', { class: 'lk-rc-k' }, t(key)), h('span', { class: 'lk-rc-v', dir: 'auto' }, String(val))) : null);
  const kindText = r.kind === 'none' ? t('lk.kind.none') : t('fin.kind.' + r.kind);
  const head = h('div', { class: 'lk-rc-head' }, has('logo') ? h('div', { class: 'lk-rc-logo' }, lblLogo()) : null,
    h('div', { class: 'lk-rc-title' }, h('b', {}, t('lk.rc.title')), h('span', { class: 'mono', dir: 'ltr' }, code), h('span', { dir: 'ltr' }, fmtDay(r.date))));
  const meta = h('div', { class: 'lk-rc-meta' }, row('lk.rc.src', t('lk.src.' + r.src)), row('lk.rc.for', r.title), has('party') ? row('lk.rc.party', r.party) : null, has('category') ? row('lk.rc.cat', r.cat) : null, row('lk.rc.kind', kindText),
    has('project') ? row('lk.rc.project', r.project) : null);
  const table = h('div', { class: 'lk-rc-lines' }, r.lines.map((l) => h('div', { class: 'lk-rc-line' + (l.sub ? ' sub' : '') + (l.bold ? ' b' : '') }, h('span', { dir: 'auto' }, l.text), h('span', { class: 'mono', dir: 'ltr' }, money(l.amount)))),
    h('div', { class: 'lk-rc-line total' }, h('span', {}, t('lk.rc.total')), h('span', { class: 'mono', dir: 'ltr' }, money(r.total))));
  const vals = { brand: brandName(), date: fmtDay(r.date), code, title: r.title, party: r.party, amount: money(r.total), project: r.project, cat: r.cat };
  const extras = d.extra.map((e) => { const s = lkFill(e.text, vals, code); return s.trim() ? h('div', { class: 'lk-x lk-x-' + e.size + (e.b ? ' b' : '') + (e.i ? ' i' : ''), dir: 'auto', style: 'text-align:' + e.align }, s) : null; }).filter(Boolean);
  const codes = has('qr') || has('barcode') ? h('div', { class: 'lk-rc-codes' }, has('qr') ? h('div', { class: 'lbl-qrbox' }, lblQr(code)) : null, has('barcode') ? h('div', { class: 'lbl-barbox' }, lblBarcode(code)) : null) : null;
  const sign = has('signatures') ? h('div', { class: 'lk-rc-sign' }, h('div', {}, h('span', {}, t('lk.rc.by'))), h('div', {}, h('span', {}, t('lk.rc.rec')))) : null;
  const el = h('div', { class: 'lk-rc', 'data-kind': 'receipt', 'data-code': code, 'data-border': d.border, 'data-align': d.align, 'data-paper': d.size, dir: document.documentElement.getAttribute('dir') || 'ltr' },
    head, meta, table, has('notes') && r.notes ? h('p', { class: 'lk-rc-notes', dir: 'auto' }, r.notes) : null, sign, extras.length ? h('div', { class: 'lk-rc-extra' }, extras) : null, codes);
  const st = el.style;
  st.setProperty('--w', w + 'mm'); st.setProperty('--hh', hh ? hh + 'mm' : 'auto'); st.setProperty('--k', String(k)); st.setProperty('--sc', String(d.scale / 100));
  st.setProperty('--lk-bg', d.bg); st.setProperty('--lk-fg', d.fg); st.setProperty('--lk-ac', d.accent); st.setProperty('--lk-st', lkdContrast(d.accent, d.bg) >= 4.5 ? d.accent : d.fg);
  st.fontFamily = LK_FONTS[d.font];
  return el;
}
const lkReceiptK = (d) => { const w = lkDims('receipt', d)[0]; return Math.max(0.55, Math.min(1, (Math.min(window.innerWidth, 900) - 48) / (w * LK_PX_MM))); };      // real size, a little smaller on a phone
const lkReceiptPicture = (r, d) => lkPicture((k) => lkReceiptEl(r, d, k), lkDims('receipt', d)[0], d.bg);
