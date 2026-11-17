/**
 * <admin>/js/views/labels-hub.js  -  the Labels screen: labels for projects, parts, inventory items and shipments, and receipts for every cost
 * #labels (or #labels/<project | part | inventory | shipment | receipt>): tick the records, choose the size and the number of copies, adjust the design (colours, font, what is printed and in which
 * order, extra paragraphs), then print many at once (one label per page for a label printer, or labels side by side on a sheet of paper) or save them as pictures (one file, or a ZIP of all).
 * Every label and receipt carries a QR code and a Code 128 barcode of the record's number; the box at the top finds a record from a scanned or typed code. The design of each kind can be saved
 * as the default (needs the right to edit Settings). The screen of one project's labels (#labels/<client id>/<n>, views/labels.js) stays as it was.
 * Loaded by: admin page (on demand)
 */
'use strict';

const LK_LIST_MAX = 300;
const lkS = { kind: '', q: '', group: '', sel: {}, scope: { part: 'piece', shipment: 'shipment' }, d: {}, rc: null };
const lkAllowed = (k) => can(LK_AREA[k]);
const lkSelOf = (kind) => lkS.sel[kind] || (lkS.sel[kind] = new Set());
const lkWork = (kind) => lkS.d[kind] || (lkS.d[kind] = clone(lkDesign(kind)));
const lkLogAudit = (kind, how, n) => audit({ area: 'reports', act: 'export', ref: kind, title: t('lk.title'), note: how + ' · ' + n });

// the two lines that describe a row in the list
function lkRowText(kind, r) {
  if (kind === 'project') return [r.p.title || L(r.p.typeName) || r.p.sku, r.p.sku + ' · ' + r.rec.client.name];
  if (kind === 'part') return [(r.x.name || t('lbl.piece')) + ' × ' + nf(r.pieces), r.p.sku + ' · ' + (r.p.title || r.rec.client.name)];
  if (kind === 'inventory') return [r.item.name, [r.item.id, r.item.code, r.item.location].filter(Boolean).join(' · ')];
  if (kind === 'shipment') return [r.s.title || r.s.id, [r.s.id, t('lg.kind.' + r.s.kind), r.s.eta ? fmtDay(r.s.eta) : ''].filter(Boolean).join(' · ')];
  return [r.title, [r.code, fmtDay(r.date), r.party].filter(Boolean).join(' · ')];
}
function lkGroups(kind, rows) {
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.group)) continue;
    seen.set(r.group, kind === 'project' ? r.rec.client.name + ' (' + r.rec.id + ')' : kind === 'part' ? r.p.sku + ' · ' + (r.p.title || r.rec.client.name) : kind === 'inventory' ? t('bom.cat.' + r.group) : kind === 'shipment' ? t('lg.kind.' + r.group) : t('lk.src.' + r.group));
  }
  return [...seen].sort((a, b) => String(a[1]).localeCompare(String(b[1]), locale()));
}

/* ---- loading what a kind needs ---- */
async function lkLoad(kind, rcSel) {
  await loadSettings();
  if (kind === 'project' || kind === 'part' || kind === 'receipt') { if (!store) await loadStore(); }
  if (kind === 'inventory') await Promise.all([loadOps('inventory'), loadOps('suppliers')]);
  if (kind === 'shipment') await Promise.all([loadOps('logistics'), loadOps('suppliers')]);
  if (kind === 'receipt') {
    await Promise.all([loadOps('expenses'), loadOps('logistics'), loadOps('suppliers')]);
    if (can('staff') && rcSel.src.includes('payroll')) await payEnsure(rcSel.from, rcSel.to);
  }
  CUR = (session.settings && session.settings.currency) || CUR;
}
const lkDefaultRc = () => ({ from: monthShift(monthNow(), -2) + '-01', to: lastDayOf(monthNow()), src: LK_SOURCES.filter((s) => s !== 'payroll' || can('staff')), rows: [] });

/* ---- the screen ---- */
async function renderLabelHub(token, kindArg) {
  const kinds = LK_ALL.filter(lkAllowed);
  if (!kinds.length) return mount(notice(t('perm.denied'), t('perm.deniedSub'), 'bad', { actions: [h('a', { class: 'btn', href: '#dashboard' }, t('nav.dashboard'))] }));
  const kind = kinds.includes(kindArg) ? kindArg : kinds.includes(lkS.kind) ? lkS.kind : kinds[0];
  if (lkS.kind !== kind) { lkS.q = ''; lkS.group = ''; lkS.kind = kind; }
  if (!lkS.rc) lkS.rc = lkDefaultRc();
  mount(notice(t('ops.loading'), t('ops.loadingSub'), 'info', { spinner: true }));
  try { await lkLoad(kind, lkS.rc); if (kind === 'receipt') lkS.rc.rows = lkReceiptRows(lkS.rc); } catch (e) {
    if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));
    return;
  }
  if (token !== routeToken) return;
  drawLabelHub(kinds, kind);
}

function drawLabelHub(kinds, kind) {
  const rc = kind === 'receipt', d = lkWork(kind), sel = lkSelOf(kind), canSave = can('settings', PERM_EDIT);
  const list = h('div', { class: 'lk-list', id: 'lkList', role: 'group', 'aria-label': t('lk.pick') }), sheet = h('div', { class: 'lk-sheet', id: 'lkSheet' }), count = h('p', { class: 'hint rp-noprint', id: 'lkCount', role: 'status' });
  const note = h('p', { class: 'hint', id: 'lkListNote' });
  const rowsNow = () => (rc ? lkS.rc.rows : lkRows(kind));
  const shownRows = () => { const q = lkS.q.trim().toLowerCase(); return rowsNow().filter((r) => (!lkS.group || r.group === lkS.group) && (!q || r.text.toLowerCase().includes(q))); };
  const found = h('div', { id: 'lkFound', role: 'status', class: 'lk-found' });

  /* the preview and the numbers */
  const drawSheet = () => {
    const rows = rowsNow(), picked = rows.filter((r) => sel.has(r.key)), sample = !picked.length, [w, hh] = lkDims(kind, d);
    sheet.setAttribute('data-mode', rc ? 'page' : d.mode); sheet.setAttribute('data-sample', sample ? '1' : '0'); lkPageRule(kind, d);
    let nodes, total;
    if (rc) { const use = sample ? rows.slice(0, 1) : picked; total = use.length * d.copies; nodes = use.slice(0, LABEL_MAX).map((r) => lkReceiptEl(r, d, lkReceiptK(d))); }
    else {
      const all = lkLabels(kind, sample ? rows.slice(0, 1) : picked, lkS.scope[kind], sample ? 1 : d.copies); total = all.length; const k = lkScreenK(kind, d);
      nodes = all.slice(0, LABEL_MAX).map((lb) => lkLabelEl(lb, d, k));
    }
    sheet.replaceChildren(...nodes);
    requestAnimationFrame(() => {
      const tight = rc ? 0 : lkFitAll(sheet);
      const dim = rc ? t('lk.paper.' + d.size) : nf(w, { maximumFractionDigits: 1 }) + ' × ' + nf(hh, { maximumFractionDigits: 1 }) + ' mm';
      count.textContent = (sample ? t('lk.sample') + ' ' : '') + t(rc ? 'lk.countRc' : 'lk.count', { n: nf(sample ? 0 : total), size: dim }) + (total > nodes.length && !sample ? ' ' + t('lbl.capped', { n: nf(LABEL_MAX) }) : '') + (tight ? ' ' + t('lbl.tight') : '');
      for (const id of ['lkPrint', 'lkPng']) { const b = document.getElementById(id); if (b) b.disabled = sample; }
    });
  };
  const drawList = () => {
    const all = shownRows(), rows = all.slice(0, LK_LIST_MAX);
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const [a, b] = lkRowText(kind, r);
      return h('label', { class: 'lk-item check' }, h('input', { type: 'checkbox', 'data-key': r.key, checked: sel.has(r.key), onchange: (e) => { if (e.target.checked) sel.add(r.key); else sel.delete(r.key); drawSheet(); drawNote(); } }),
        h('span', { class: 'lk-item-t' }, h('b', { dir: 'auto' }, a), h('span', { class: 'hint', dir: 'auto' }, b)), rc ? h('span', { class: 'mono lk-amt', dir: 'ltr' }, money(r.total)) : null);
    }) : [h('p', { class: 'empty' }, t('lk.none'))]));
    note.textContent = all.length > rows.length ? t('lk.listCap', { a: nf(rows.length), b: nf(all.length) }) : '';
  };
  const drawNote = () => { const n = document.getElementById('lkPicked'); if (n) n.textContent = t('lk.picked', { n: nf(rowsNow().filter((r) => sel.has(r.key)).length) }); };
  const redraw = () => { drawList(); drawNote(); drawSheet(); };

  /* the picker */
  const search = h('input', { id: 'lkSearch', type: 'search', 'aria-label': t('lk.search'), placeholder: t('lk.search'), value: lkS.q, autocomplete: 'off', oninput: (e) => { lkS.q = e.target.value; drawList(); } });
  const groups = lkGroups(kind, rowsNow());
  const groupSel = groups.length > 1 ? selectEl([['', t('lk.allGroups')]].concat(groups), lkS.group, (v) => { lkS.group = v; drawList(); }, 'lkGroup', t('lk.group.' + kind)) : null;
  const picker = h('section', { class: 'card stack-sm rp-noprint', id: 'lkPicker' }, h('div', { class: 'card-head' }, h('h2', {}, t('lk.pick')), h('span', { class: 'hint', id: 'lkPicked' })),
    rc ? h('div', { class: 'grid2' }, fld('lk.from', h('input', { id: 'lkFrom', type: 'date', value: lkS.rc.from, onchange: (e) => { lkS.rc.from = e.target.value; } })), fld('lk.to', h('input', { id: 'lkTo', type: 'date', value: lkS.rc.to, onchange: (e) => { lkS.rc.to = e.target.value; } }))) : null,
    rc ? h('fieldset', { class: 'lbl-fields' }, h('legend', {}, t('lk.sources')), h('div', { class: 'checks' }, LK_SOURCES.filter((s) => s !== 'payroll' || can('staff')).map((s) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', id: 'lkSrc-' + s, checked: lkS.rc.src.includes(s), onchange: (e) => { lkS.rc.src = e.target.checked ? lkS.rc.src.concat([s]) : lkS.rc.src.filter((x) => x !== s); } }), h('span', {}, t('lk.src.' + s)))))) : null,
    rc ? h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'lkRcLoad', onclick: () => route({ keep: true }) }, t('lk.rcLoad')), h('span', { class: 'hint' }, t('lk.rcHint'))) : null,
    h('div', { class: 'grid2' }, fld('lk.search', search), groupSel ? fld('lk.group.' + kind, groupSel) : null),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'lkAll', onclick: () => { for (const r of shownRows()) sel.add(r.key); drawList(); drawNote(); drawSheet(); } }, t('lk.selAll')),
      h('button', { class: 'btn small', type: 'button', id: 'lkNone', onclick: () => { sel.clear(); drawList(); drawNote(); drawSheet(); } }, t('lk.selNone'))), list, note);

  /* options */
  const sizes = rc ? LK_PAPER_IDS : LK_SIZE_IDS, num2 = (id, key, lo, hi, step) => h('input', { id, type: 'number', min: lo, max: hi, step: step || 1, inputmode: 'decimal', value: d[key], 'aria-label': t(key === 'length' ? 'lbl.length' : 'lk.' + key),
    oninput: (e) => { const v = Number(e.target.value); d[key] = e.target.value !== '' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lkDefault(kind)[key]; drawSheet(); } });
  const lenFld = fld('lbl.length', num2('lkLen', 'length', 3, 30, 0.5)), wFld = fld('lk.w', num2('lkW', 'w', 15, 300)), hFld = fld('lk.h', num2('lkH', 'h', 15, 300));
  const syncSize = () => { lenFld.hidden = d.size !== 'strip' || rc; wFld.hidden = hFld.hidden = d.size !== 'custom' || rc; };
  const scopeOpts = kind === 'part' ? [['piece', t('lk.scope.piece')], ['part', t('lk.scope.part')]] : kind === 'shipment' ? [['shipment', t('lk.scope.shipment')], ['lines', t('lk.scope.lines')]] : null;
  const copies = h('input', { id: 'lkCopies', type: 'number', min: 1, max: LK_COPIES_MAX, step: 1, inputmode: 'numeric', value: d.copies, 'aria-label': t('lbl.copies'), oninput: (e) => { d.copies = lkClamp(e.target.value, 1, LK_COPIES_MAX, 1); drawSheet(); } });
  const options = h('section', { class: 'card stack-sm rp-noprint', id: 'lkOptions' }, h('div', { class: 'card-head' }, h('h2', {}, t(rc ? 'lk.optionsRc' : 'lk.options'))),
    h('div', { class: 'grid2' }, fld(rc ? 'lk.paper' : 'lbl.size', selectEl(sizes.map((s) => [s, rc ? t('lk.paper.' + s) : t('lk.size.' + s)]), d.size, (v) => { d.size = v; syncSize(); drawSheet(); }, 'lkSize')), lenFld),
    h('div', { class: 'grid2' }, wFld, hFld), syncSize() || null,
    h('div', { class: 'grid2' }, scopeOpts ? fld('lbl.scope', selectEl(scopeOpts, lkS.scope[kind], (v) => { lkS.scope[kind] = v; drawSheet(); }, 'lkScope')) : null, fld('lbl.copies', copies)),
    rc ? null : fld('lk.mode', selectEl([['page', t('lk.mode.page')], ['sheet', t('lk.mode.sheet')]], d.mode, (v) => { d.mode = v; drawSheet(); }, 'lkMode'), 'lk.modeHint'));

  /* the designer */
  const designer = lkDesignerEl(kind, d, drawSheet, canSave, () => { delete lkS.d[kind]; route({ keep: true }); });

  /* the scan box */
  const scan = h('input', { id: 'lkScan', type: 'text', dir: 'ltr', autocomplete: 'off', 'aria-label': t('lk.scan'), placeholder: t('lk.scanPh') });
  const goScan = async () => {
    const pc = lkParse(scan.value); found.replaceChildren();
    if (!pc) return found.append(h('p', { class: 'hint' }, t('lk.scan.empty')));
    const need = pc.kind === 'receipt' ? 'receipt' : pc.kind;
    if (!lkAllowed(need)) return found.append(h('p', { class: 'msg bad' }, t('lk.scan.denied')));
    found.append(h('p', { class: 'hint' }, t('ops.loading')));
    let res = null;
    try {
      if (pc.kind === 'receipt') { await lkLoad('receipt', { from: '', to: '', src: LK_SOURCES }); const r = lkFindReceipt(pc.code, LK_SOURCES.filter((s) => s !== 'payroll' || can('staff'))); res = r ? { kind: 'receipt', title: r.title, sub: r.code + ' · ' + money(r.total), href: r.href, key: r.code } : null; }
      else { await lkLoad(pc.kind === 'project' ? 'project' : pc.kind); res = lkResolve(pc); }
    } catch (e) { found.replaceChildren(h('p', { class: 'msg bad' }, e.message)); return; }
    found.replaceChildren(res ? h('div', { class: 'lk-hit' }, h('span', { class: 'badge' }, t('lk.k.' + res.kind)), h('b', { dir: 'auto' }, res.title), h('span', { class: 'hint', dir: 'auto' }, res.sub),
      h('a', { class: 'btn small', href: res.href, id: 'lkOpen' }, t('act.open')), lkAllowed(res.kind) ? h('button', { class: 'btn small', type: 'button', id: 'lkPickIt', onclick: () => {
        lkSelOf(res.kind).add(res.key);
        if (res.kind === 'receipt') { lkS.rc.from = ''; lkS.rc.to = ''; }
        if (res.kind === kind) route({ keep: true }); else location.hash = '#labels/' + res.kind;
      } }, t('lk.pickIt')) : null)
      : h('p', { class: 'msg bad', id: 'lkNoHit' }, t('lk.scan.none', { c: pc.sku || pc.id || pc.code || '' })));
  };
  scan.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goScan(); } });
  const scanCard = h('section', { class: 'card stack-sm rp-noprint', id: 'lkScanCard' }, h('div', { class: 'card-head' }, h('h2', {}, t('lk.scan'))), h('p', { class: 'hint' }, t('lk.scanHint')),
    h('div', { class: 'lk-scanrow' }, scan, h('button', { class: 'btn', type: 'button', id: 'lkScanGo', onclick: goScan }, t('lk.find'))), found);

  /* actions */
  const printName = () => t('lbl.fileName') + '-' + t('lk.k.' + kind);
  const imgBtn = h('button', { class: 'btn', type: 'button', id: 'lkPng' }, t('lk.png'));
  imgBtn.onclick = async () => {
    const rows = rowsNow().filter((r) => sel.has(r.key)); if (!rows.length) return;
    const label = imgBtn.textContent; imgBtn.disabled = true;
    try {
      const items = rc ? rows.slice(0, LABEL_MAX).map((r) => ({ name: r.code, r })) : lkLabels(kind, rows, lkS.scope[kind], 1).slice(0, LABEL_MAX).map((lb) => ({ name: lkCode(lb), lb }));
      const n = await lkSavePictures(items, (it) => (rc ? lkReceiptPicture(it.r, d) : lkLabelPicture(it.lb, d)), (i, all) => { imgBtn.textContent = t('lk.building', { a: nf(i), b: nf(all) }); });
      lkLogAudit(kind, 'png', n); toast(t(n > 1 ? 'lk.pngZip' : 'lk.pngDone', { n: nf(n) }), 'ok');
    } catch (e) { toast(t('lk.pngFail', { m: e.message }), 'bad'); } finally { imgBtn.disabled = false; imgBtn.textContent = label; drawSheet(); }
  };
  const doPrint = () => {
    const n = rowsNow().filter((r) => sel.has(r.key)).length; if (!n) return;
    drawSheet(); lkLogAudit(kind, 'print', n);
    requestAnimationFrame(() => {
      const roll = rc && d.size === 'roll80' ? Math.ceil(Math.max(...[...sheet.querySelectorAll('.lk-rc')].map((el) => el.getBoundingClientRect().height / (lkReceiptK(d) * LK_PX_MM)))) + 4 : 0;
      lkPrint(kind, d, printName(), roll);
    });
  };
  const actions = h('div', { class: 'actions rp-noprint' }, h('button', { class: 'btn primary', type: 'button', id: 'lkPrint', onclick: doPrint }, t(rc ? 'lk.printRc' : 'lbl.print')), imgBtn, h('span', { class: 'hint' }, t('lbl.printHint')));

  const tabs = h('div', { class: 'tabs rp-noprint', role: 'tablist', 'aria-label': t('lk.title') }, kinds.map((k) => h('a', { class: 'tab pill', id: 'lkTab-' + k, role: 'tab', 'aria-selected': String(k === kind), href: '#labels/' + k }, t('lk.k.' + k))));
  const head = h('div', { class: 'page-head rp-noprint' }, h('div', {}, h('h1', {}, t('lk.title'))), encBadge());
  mount(h('section', { class: 'stack rp-page lk-screen' }, head, tabs, h('p', { class: 'hint rp-noprint' }, t('lk.intro')), scanCard, picker, options, designer, actions, count, h('div', { class: 'lk-area lbl-area' }, sheet)));
  redraw();
}

/* ---- the designer ---- */
function lkDesignerEl(kind, d, drawSheet, canSave, reset) {
  const rc = kind === 'receipt', fields = LK_FIELDS[kind], ordered = !rc, elements = ['logo', 'flag', 'qr', 'barcode'].filter((f) => fields.includes(f));
  const box = h('details', { class: 'card stack-sm rp-noprint', id: 'lkDesigner' }), body = h('div', { class: 'stack-sm' });
  const warn = h('p', { class: 'msg bad', id: 'lkLow', hidden: true }, t('lk.lowContrast'));
  const chk = (id, text, on, fn) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked: on, onchange: (e) => fn(e.target.checked) }), h('span', {}, text));
  const color = (id, key, labelKey) => fld(labelKey, h('input', { id, type: 'color', value: d[key], 'aria-label': t(labelKey), oninput: (e) => { d[key] = e.target.value; chk2(); drawSheet(); } }));
  const chk2 = () => { warn.hidden = lkdContrast(d.fg, d.bg) >= 4.5; };
  const themes = h('div', { class: 'actions' }, Object.keys(LK_THEMES).map((id) => h('button', { class: 'btn small', type: 'button', id: 'lkTheme-' + id, onclick: () => { [d.bg, d.fg, d.accent] = LK_THEMES[id]; paint(); drawSheet(); } }, t('lk.theme.' + id))));
  const colors = h('div', { class: 'grid2' }, color('lkBg', 'bg', 'lk.bg'), color('lkFg', 'fg', 'lk.fg'), color('lkAc', 'accent', 'lk.accent'));
  const flist = h('div', { class: 'stack-sm', id: 'lkFields' }), elist = h('div', { class: 'checks', id: 'lkElements' }), xlist = h('div', { class: 'stack-sm', id: 'lkExtra' });
  const setField = (f, on) => { d.fields = on ? d.fields.concat([f]) : d.fields.filter((x) => x !== f); if (on && ordered) d.fields = lkOrderLike(kind, d.fields); paint(); drawSheet(); };
  const move = (f, by) => { const a = d.fields.filter((x) => !LK_SPECIAL.has(x)), i = a.indexOf(f), j = i + by; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; d.fields = a.concat(d.fields.filter((x) => LK_SPECIAL.has(x))); paint(); drawSheet(); };
  const paint = () => {
    elist.replaceChildren(...elements.map((f) => chk('lkField-' + f, t('lk.f.' + f), d.fields.includes(f), (on) => setField(f, on))));
    const texts = fields.filter((f) => !LK_SPECIAL.has(f)), on = ordered ? d.fields.filter((f) => !LK_SPECIAL.has(f)) : texts.filter((f) => d.fields.includes(f)), off = texts.filter((f) => !on.includes(f));
    flist.replaceChildren(...on.map((f, i) => h('div', { class: 'lk-frow' }, chk('lkField-' + f, t('lk.f.' + f), true, (v) => setField(f, v)),
      ordered ? h('span', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', id: 'lkUp-' + f, disabled: i === 0, 'aria-label': t('act.up') + ': ' + t('lk.f.' + f), onclick: () => move(f, -1) }, '↑'),
        h('button', { class: 'btn small', type: 'button', id: 'lkDown-' + f, disabled: i === on.length - 1, 'aria-label': t('act.down') + ': ' + t('lk.f.' + f), onclick: () => move(f, 1) }, '↓')) : null)),
      ...off.map((f) => h('div', { class: 'lk-frow' }, chk('lkField-' + f, t('lk.f.' + f), false, (v) => setField(f, v)))));
    xlist.replaceChildren(...d.extra.map((e, i) => h('div', { class: 'lk-xrow' }, h('input', { id: 'lkX-' + i, type: 'text', maxlength: 160, dir: 'auto', value: e.text, 'aria-label': t('lk.extraText') + ' ' + nf(i + 1), oninput: (ev) => { e.text = ev.target.value; drawSheet(); } }),
      chk('lkXb-' + i, t('lk.bold'), e.b, (v) => { e.b = v; drawSheet(); }), chk('lkXi-' + i, t('lk.italic'), e.i, (v) => { e.i = v; drawSheet(); }),
      selectEl([['s', t('lk.xs')], ['m', t('lk.xm')], ['l', t('lk.xl')]], e.size, (v) => { e.size = v; drawSheet(); }, 'lkXs-' + i, t('lk.extraSize')),
      selectEl([['start', t('lk.al.start')], ['center', t('lk.al.center')], ['end', t('lk.al.end')]], e.align, (v) => { e.align = v; drawSheet(); }, 'lkXa-' + i, t('lk.extraAlign')),
      h('button', { class: 'btn small danger', type: 'button', 'aria-label': t('act.remove'), onclick: () => { d.extra.splice(i, 1); paint(); drawSheet(); } }, '×'))));
    chk2();
  };
  const tokens = rc ? ['brand', 'date', 'code', 'title', 'party', 'amount', 'project', 'cat'] : ['brand', 'date', 'code'].concat(LK_FIELDS[kind].filter((f) => !LK_SPECIAL.has(f) && f !== 'date' && f !== 'code'));
  const slogan = h('input', { id: 'lkSlogan', maxlength: 40, dir: 'ltr', value: d.slogan, 'aria-label': t('lbl.slogan'), oninput: (e) => { d.slogan = e.target.value; drawSheet(); } });
  const saveBtn = h('button', { class: 'btn primary', type: 'button', id: 'lkSave', onclick: async () => {
    saveBtn.disabled = true;
    try { await lkSaveDesign(kind, d); toast(t('ops.saved'), 'ok'); } catch (e) { toast(e.message, 'bad'); } finally { saveBtn.disabled = false; }
  } }, t('lk.save'));
  body.append(...[h('p', { class: 'hint' }, t('lk.designHint')), themes, colors, warn,
    h('div', { class: 'grid2' }, fld('lk.font', selectEl(Object.keys(LK_FONTS).map((f) => [f, t('lk.font.' + f)]), d.font, (v) => { d.font = v; drawSheet(); }, 'lkFont')),
      fld('lk.scale', h('input', { id: 'lkScale', type: 'number', min: 70, max: 160, step: 5, inputmode: 'numeric', value: d.scale, 'aria-label': t('lk.scale'), oninput: (e) => { d.scale = lkClamp(e.target.value, 70, 160, 100); drawSheet(); } })),
      fld('lk.align', selectEl([['start', t('lk.al.start')], ['center', t('lk.al.center')]], d.align, (v) => { d.align = v; drawSheet(); }, 'lkAlign')),
      fld('lk.border', selectEl(LK_BORDERS.map((b) => [b, t('lk.border.' + b)]), d.border, (v) => { d.border = v; drawSheet(); }, 'lkBorder'))),
    rc ? null : fld('lbl.slogan', slogan, 'lbl.sloganHint'),
    h('fieldset', { class: 'lbl-fields' }, h('legend', {}, t('lbl.fields')), elist, flist, ordered ? h('p', { class: 'hint' }, t('lk.orderHint')) : null),
    h('fieldset', { class: 'lbl-fields' }, h('legend', {}, t('lk.extra')), xlist, h('button', { class: 'btn small', type: 'button', id: 'lkXAdd', onclick: () => { if (d.extra.length >= LK_EXTRA_MAX) return toast(t('lk.extraMax', { n: nf(LK_EXTRA_MAX) }), 'bad'); d.extra.push({ text: '', b: false, i: false, size: 'm', align: 'start' }); paint(); const x = document.getElementById('lkX-' + (d.extra.length - 1)); if (x) x.focus(); } }, t('lk.extraAdd')),
      h('p', { class: 'hint' }, t('lk.tokens', { list: tokens.map((x) => '{' + x + '}').join(' ') }))),
    h('div', { class: 'actions' }, canSave ? saveBtn : h('span', { class: 'hint' }, t('lk.saveNo')), h('button', { class: 'btn', type: 'button', id: 'lkReset', onclick: reset }, t('lk.reset')))].filter(Boolean));          // append(null) would print the word null
  paint();
  box.append(h('summary', { class: 'card-head' }, h('h2', {}, t('lk.design'))), body);
  return box;
}
// the text fields in the order of the kind's list for those that were just switched on (a field that was off goes to the end of the printed ones)
const lkOrderLike = (kind, list) => list.filter((f) => !LK_SPECIAL.has(f)).concat(list.filter((f) => LK_SPECIAL.has(f)));
async function lkSaveDesign(kind, d) {
  await loadSettings();
  const before = clone(session.settings.labelKinds || {}), next = Object.assign({}, before, { [kind]: lkNorm(kind, d) });
  session.settings.labelKinds = next;
  try { await saveSettings(); } catch (e) { session.settings.labelKinds = before; throw e; }
  auditSave('settings', 'update', 'labels', t('lk.title') + ' · ' + t('lk.k.' + kind), before[kind] || null, next[kind]);
}
