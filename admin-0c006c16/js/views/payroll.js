/**
 * <admin>/js/views/payroll.js  -  Staff & pay: the month's payroll sheet, the day sheet, time entries, bonuses and deductions
 * One screen per month (#staff/payroll/YYYY-MM). The table shows what each person earned (base, overtime, extra shifts, bonuses, deductions, advances, net); a person's
 * time entries and adjustments open under it. "Fill from sign-in records" turns the recorded sign-ins of linked people into hours and overtime. A closed month is read-only.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Payroll
   ===================================================================== */
const entryNeeds = (type, basis) => ({ hours: type === 'overtime' || type === 'extra' || (type === 'work' && basis === 'hour'), days: type === 'absent' || type === 'leave' || (type === 'work' && basis !== 'hour') });
const entryText = (e, p) => (e.type === 'absent' || e.type === 'leave' || (e.type === 'work' && p.basis !== 'hour') ? t('pay.nDays', { n: nf(e.days) }) : t('pay.nHours', { n: nf(e.hours) }));

function drawPayroll() {
  const month = staffSel.month, pm = payCache[month].data, ctl = ctlNow(), people = opsList('people'), rows = payMonthRows(month, people, pm, ctl), tot = payTotals(rows);
  const edit = can('staff', PERM_EDIT), locked = pm.closed, canEdit = edit && !locked, sel = rows.find((x) => x.p.id === staffSel.pid) || null;
  const go = (m) => { location.hash = '#staff/payroll/' + m; };
  const picker = h('input', { type: 'month', id: 'payMonth', value: month, 'aria-label': t('pay.month'), onchange: (ev) => { if (monthOk(ev.target.value)) go(ev.target.value); } });
  const refresh = async () => { delete payCache[month]; staffDir = null; route(); };
  const table = rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'payTable' },
    h('thead', {}, h('tr', {}, h('th', {}, t('pay.person')), h('th', { class: 'n' }, t('pay.base')), h('th', { class: 'n' }, t('pay.overtime')), h('th', { class: 'n' }, t('pay.extra')), h('th', { class: 'n' }, t('pay.bonus')), h('th', { class: 'n' }, t('pay.deduction')),
      h('th', { class: 'n' }, t('pay.gross')), h('th', { class: 'n' }, t('pay.advance')), h('th', { class: 'n' }, t('pay.net')), h('th', {}, h('span', { class: 'sr' }, t('act.open'))))),
    h('tbody', {}, rows.map(({ p, r }) => h('tr', { 'data-id': p.id, class: staffSel.pid === p.id ? 'sel' : '' },
      h('td', {}, h('strong', { dir: 'auto' }, p.name), h('div', { class: 'small muted' }, rateText(p) + (r.otHours + r.extraHours ? ' · ' + t('pay.otShort', { n: nf(r.otHours + r.extraHours) }) : ''))),
      h('td', { class: 'n' }, money(r.base)), h('td', { class: 'n' }, r.overtime ? money(r.overtime) : '—'), h('td', { class: 'n' }, r.extra ? money(r.extra) : '—'), h('td', { class: 'n' }, r.bonus ? money(r.bonus) : '—'), h('td', { class: 'n' }, r.deduction ? money(r.deduction) : '—'),
      h('td', { class: 'n' }, h('strong', {}, money(r.gross))), h('td', { class: 'n' }, r.advance ? money(r.advance) : '—'), h('td', { class: 'n' }, h('strong', {}, money(r.net))),
      h('td', {}, h('button', { class: 'btn small', type: 'button', 'data-pid': p.id, onclick: () => { staffSel.pid = staffSel.pid === p.id ? '' : p.id; drawPayroll(); } }, staffSel.pid === p.id ? t('act.close') : t('pay.details')))))),
    h('tfoot', {}, h('tr', {}, h('th', {}, t('fin.total')), h('th', { class: 'n' }, money(tot.base)), h('th', { class: 'n' }, money(tot.overtime)), h('th', { class: 'n' }, money(tot.extra)), h('th', { class: 'n' }, money(tot.bonus)), h('th', { class: 'n' }, money(tot.deduction)),
      h('th', { class: 'n' }, money(tot.gross)), h('th', { class: 'n' }, money(tot.advance)), h('th', { class: 'n' }, money(tot.net)), h('td', {}))))) : h('p', { class: 'empty' }, people.length ? t('pay.noRows') : t('pay.noPeople'));
  const act = (fn, okKey) => async (ev) => { const b = ev && ev.currentTarget; if (b) b.disabled = true; try { await fn(); if (okKey) toast(t(okKey), 'ok'); } catch (e) { toast(e.message, 'bad'); } finally { drawPayroll(); } };
  const closeBtn = edit ? h('button', { class: 'btn' + (locked ? '' : ' primary'), type: 'button', id: 'btnCloseMonth', onclick: act(async () => {
    await payMutate(month, (d) => { d.closed = !d.closed; d.closedAt = d.closed ? oiso() : ''; });
    audit({ area: 'staff', act: 'update', ref: month, title: ak('pay.audit.title', { m: month }), note: ak(pm.closed ? 'pay.audit.closed' : 'pay.audit.reopened') });
  }, null) }, locked ? t('pay.reopen') : t('pay.close')) : null;
  mount(h('section', { class: 'stack', id: 'staffScreen' }, ...staffHead('payroll', h('button', { class: 'btn', type: 'button', id: 'btnPayRefresh', onclick: refresh }, t('act.refresh')),
      can('reports') ? h('a', { class: 'btn', href: '#reports/payroll/' + month, id: 'btnPayPrint' }, t('ops.printReport')) : null, closeBtn),
    h('div', { class: 'card stack-sm finbar' }, h('div', { class: 'filters3' },
      h('div', { class: 'row-between' }, h('button', { class: 'btn small', type: 'button', id: 'btnPrevMonth', onclick: () => go(monthShift(month, -1)) }, t('pay.prev')), h('strong', { id: 'payMonthLabel' }, monthLabel(month)), h('button', { class: 'btn small', type: 'button', id: 'btnNextMonth', onclick: () => go(monthShift(month, 1)) }, t('pay.next'))),
      fld('pay.month', picker)), locked ? h('p', { class: 'msg info', id: 'payClosed' }, t('pay.closedNote', { d: pm.closedAt ? fmtDateTime(pm.closedAt) : '' })) : null),
    kpis(kpi(t('pay.k.gross'), money(tot.gross)), kpi(t('pay.k.net'), money(tot.net), '', t('pay.k.netSub', { a: money(tot.advance) })), kpi(t('pay.k.overtime'), money(tot.overtime + tot.extra)), kpi(t('pay.k.bonus'), money(tot.bonus - tot.deduction))),
    ctl.pay.toFinance ? h('p', { class: 'hint', id: 'payFeedOn' }, t('pay.feedOn')) : h('p', { class: 'msg info', id: 'payFeedOff' }, t('pay.feedOff')),
    h('div', { class: 'card stack-sm' }, table),
    canEdit ? daySheet(month, people, pm, act) : null,
    canEdit ? fillCard(month, people, act) : null,
    sel ? personPay(sel, month, pm, canEdit, act) : null));
}

/* ---------------- the day sheet: who worked on one day ---------------- */
function daySheet(month, people, pm, act) {
  const day = { date: monthNow() === month ? todayStr() : month + '-01', vals: {} };
  const who = people.filter((p) => p.active && monthFraction(p, month) > 0);
  const box = h('div', { class: 'stack-sm', id: 'daySheetRows' });
  const draw = () => {
    const have = pm.entries.filter((e) => e.date === day.date);
    box.replaceChildren(who.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, t('pay.person')), h('th', {}, t('pay.dsWhat')))),
      h('tbody', {}, who.map((p) => {
        const mine = have.filter((e) => e.pid === p.id && e.src !== 'att'), cur = day.vals[p.id] != null ? day.vals[p.id] : (p.basis === 'hour' ? (mine.find((e) => e.type === 'work') || {}).hours || '' : p.basis === 'day' ? (mine.find((e) => e.type === 'work') || {}).days || '' : (mine.find((e) => e.type === 'absent') || {}).days || '');
        const set = (v) => { day.vals[p.id] = v; };
        const control = p.basis === 'hour' ? h('input', { type: 'number', id: 'dsH-' + p.id, min: 0, max: 24, step: 0.25, value: cur, placeholder: '0', 'aria-label': t('pay.nHoursLabel') + ': ' + p.name, oninput: (ev) => set(ev.target.value) })
          : selectEl(p.basis === 'day' ? [['', t('pay.ds.none')], ['1', t('pay.ds.full')], ['0.5', t('pay.ds.half')]] : [['', t('pay.ds.present')], ['1', t('pay.ds.absent')], ['0.5', t('pay.ds.absentHalf')]], String(cur === 0 ? '' : cur), set, 'dsS-' + p.id, p.name);
        return h('tr', {}, h('td', { dir: 'auto' }, p.name, h('div', { class: 'small muted' }, rateText(p))), h('td', {}, control));
      })))) : h('p', { class: 'empty' }, t('pay.noPeople')));
  };
  const date = h('input', { type: 'date', id: 'dsDate', value: day.date, min: month + '-01', max: lastDayOf(month), onchange: (ev) => { if (String(ev.target.value).slice(0, 7) === month) { day.date = ev.target.value; day.vals = {}; draw(); } } });
  const save = act(async () => {
    const add = []; for (const p of who) {
      const v = day.vals[p.id]; if (v == null) continue; const n = Number(v) || 0;
      if (p.basis === 'hour' && n > 0) add.push(normEntry({ date: day.date, pid: p.id, type: 'work', hours: n, src: 'sheet' }));
      else if (p.basis === 'day' && n > 0) add.push(normEntry({ date: day.date, pid: p.id, type: 'work', days: n, hours: n * ctlNow().pay.dayHours, src: 'sheet' }));
      else if (p.basis === 'month' && n > 0) add.push(normEntry({ date: day.date, pid: p.id, type: 'absent', days: n, src: 'sheet' }));
    }
    const touched = new Set(Object.keys(day.vals));
    await payMutate(month, (d) => { d.entries = d.entries.filter((e) => !(e.date === day.date && touched.has(e.pid) && e.src !== 'att' && (e.type === 'work' || e.type === 'absent'))).concat(add).slice(-PAY_ENTRIES_MAX); });
    audit({ area: 'staff', act: 'update', ref: month, title: ak('pay.audit.title', { m: month }), note: ak('pay.audit.sheet', { d: day.date, n: nf(add.length) }) });
  }, 'pay.saved');
  draw();
  return h('div', { class: 'card stack-sm', id: 'daySheet' }, h('h2', {}, t('pay.dsTitle')), h('p', { class: 'hint' }, t('pay.dsHint')), fld('pay.dsDate', date), box, h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', id: 'btnSaveDay', onclick: save }, t('pay.dsSave'))));
}

/* ---------------- from the sign-in records ---------------- */
function fillCard(month, people, act) {
  const linked = people.filter((p) => p.active && p.memberId);
  const run = act(async () => {
    const files = await attReadMonth(month), ctl = ctlNow(); let made = 0;
    await payMutate(month, (d) => {
      for (const p of linked) {
        const f = files.find((x) => x.id === p.memberId); const mine = f ? entriesFromAttendance(p, month, f.sessions, policyFor({ owner: f.role === 'owner', role: f.role }), ctl.pay) : [];
        d.entries = d.entries.filter((e) => !(e.pid === p.id && e.src === 'att')).concat(mine).slice(-PAY_ENTRIES_MAX); made += mine.length;
      }
    });
    audit({ area: 'staff', act: 'update', ref: month, title: ak('pay.audit.title', { m: month }), note: ak('pay.audit.fill', { n: nf(made) }) });
  }, 'pay.filled');
  return h('div', { class: 'card stack-sm', id: 'fillCard' }, h('h2', {}, t('pay.fillTitle')), h('p', { class: 'hint' }, t('pay.fillHint')),
    linked.length ? h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btnFillAtt', onclick: run }, t('pay.fillBtn', { n: nf(linked.length) }))) : h('p', { class: 'empty' }, t('pay.fillNone')));
}

/* ---------------- one person: entries and adjustments ---------------- */
function personPay({ p, r }, month, pm, canEdit, act) {
  const mine = pm.entries.filter((e) => e.pid === p.id).sort((a, b) => b.date.localeCompare(a.date)), adj = pm.adj.filter((a) => a.pid === p.id);
  const f = { date: monthNow() === month ? todayStr() : month + '-01', type: p.basis === 'month' ? 'overtime' : 'work', hours: '', days: '1', amount: '', note: '' }, g = { type: 'bonus', amount: '', note: '' };
  const needs = () => entryNeeds(f.type, p.basis), shown = h('div', { class: 'grid2', id: 'entryNums' });
  const nums = () => shown.replaceChildren(...[needs().hours ? fld('pay.hours', h('input', { type: 'number', id: 'entHours', min: 0, max: 24, step: 0.25, value: f.hours, oninput: (ev) => { f.hours = ev.target.value; } })) : null,
    needs().days ? fld('pay.daysLabel', selectEl([['1', '1'], ['0.5', '0.5']], f.days, (v) => { f.days = v; }, 'entDays')) : null, fld('pay.amountOverride', h('input', { type: 'number', id: 'entAmount', min: 0, step: 0.01, value: f.amount, oninput: (ev) => { f.amount = ev.target.value; } }), 'pay.amountHint')].filter(Boolean));       // (replaceChildren(null) would print the word "null")
  nums();
  const addEntry = act(async () => {
    const e = normEntry({ date: f.date, pid: p.id, type: f.type, hours: f.hours, days: f.days, amount: f.amount, note: f.note, src: 'manual' });
    if (String(e.date).slice(0, 7) !== month) throw new Error(t('pay.val.month'));
    if (needs().hours && !(e.hours > 0)) throw new Error(t('pay.val.hours'));
    await payMutate(month, (d) => { d.entries.push(e); d.entries = d.entries.slice(-PAY_ENTRIES_MAX); });
    audit({ area: 'staff', act: 'update', ref: month, title: ak('pay.audit.title', { m: month }), note: ak('pay.audit.entry', { t: ak('pay.type.' + f.type) }) });
  }, 'pay.saved');
  const addAdj = act(async () => {
    const a = normAdj({ pid: p.id, type: g.type, amount: g.amount, note: g.note, date: todayStr() }); if (!(a.amount > 0)) throw new Error(t('pay.val.amount'));
    await payMutate(month, (d) => { d.adj.push(a); d.adj = d.adj.slice(-PAY_ADJ_MAX); });
    audit({ area: 'staff', act: 'update', ref: month, title: ak('pay.audit.title', { m: month }), note: ak('pay.audit.adj', { t: ak('pay.adj.' + g.type) }) });
  }, 'pay.saved');
  const delEntry = (id) => act(async () => { await payMutate(month, (d) => { d.entries = d.entries.filter((e) => e.id !== id); }); });
  const delAdj = (id) => act(async () => { await payMutate(month, (d) => { d.adj = d.adj.filter((a) => a.id !== id); }); });
  const form = !canEdit ? null : h('div', { class: 'stack-sm', id: 'entryForm' },
    h('div', { class: 'grid2' }, fld('pay.date', h('input', { type: 'date', id: 'entDate', value: f.date, min: month + '-01', max: lastDayOf(month), onchange: (ev) => { f.date = ev.target.value; } })),
      fld('pay.type', selectEl(ENTRY_TYPES.map((k) => [k, t('pay.type.' + k)]), f.type, (v) => { f.type = v; nums(); }, 'entType'))), shown,
    fld('pay.note', h('input', { type: 'text', id: 'entNote', maxlength: 200, oninput: (ev) => { f.note = ev.target.value; } })), h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', id: 'btnAddEntry', onclick: addEntry }, t('pay.addEntry'))));
  const adjForm = !canEdit ? null : h('div', { class: 'stack-sm', id: 'adjForm' }, h('div', { class: 'grid2' }, fld('pay.adjType', selectEl(ADJ_TYPES.map((k) => [k, t('pay.adj.' + k)]), g.type, (v) => { g.type = v; }, 'adjType')),
    fld('pay.amount', h('input', { type: 'number', id: 'adjAmount', min: 0, step: 0.01, oninput: (ev) => { g.amount = ev.target.value; } }))),
    fld('pay.note', h('input', { type: 'text', id: 'adjNote', maxlength: 200, oninput: (ev) => { g.note = ev.target.value; } })), h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', id: 'btnAddAdj', onclick: addAdj }, t('pay.addAdj'))));
  const del = (fn, id, label) => (canEdit ? h('button', { class: 'btn small danger', type: 'button', 'aria-label': t('act.remove') + ': ' + label, onclick: fn(id) }, t('act.remove')) : null);
  return h('div', { class: 'card stack-sm', id: 'personPay' }, h('div', { class: 'card-head' }, h('h2', { dir: 'auto' }, p.name + ' · ' + monthLabel(month)), h('a', { class: 'btn small', href: '#people/' + p.id }, t('act.edit'))),
    kpis(kpi(t('pay.base'), money(r.base)), kpi(t('pay.overtime'), money(r.overtime + r.extra), '', t('pay.otShort', { n: nf(r.otHours + r.extraHours) })), kpi(t('pay.gross'), money(r.gross)), kpi(t('pay.net'), money(r.net))),
    h('p', { class: 'hint' }, t('pay.rates', { h: money(r.hourly), d: money(r.daily) })),
    h('h3', {}, t('pay.entries')), mine.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'entryTable' }, h('tbody', {}, mine.map((e) => h('tr', { 'data-id': e.id },
      h('td', {}, fmtDay(e.date)), h('td', {}, t('pay.type.' + e.type) + (e.src === 'att' ? ' · ' + t('pay.src.att') : e.src === 'sheet' ? ' · ' + t('pay.src.sheet') : '')), h('td', {}, entryText(e, p)), h('td', { class: 'n' }, e.amount !== '' ? money(e.amount) : '—'), h('td', { class: 'small muted', dir: 'auto' }, e.note), h('td', {}, del(delEntry, e.id, fmtDay(e.date)))))))) : h('p', { class: 'empty' }, t('pay.noEntries')),
    form, h('h3', {}, t('pay.adjustments')),
    adj.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'adjTable' }, h('tbody', {}, adj.map((a) => h('tr', { 'data-id': a.id }, h('td', {}, t('pay.adj.' + a.type)), h('td', { class: 'n' }, money(a.amount)), h('td', { class: 'small muted', dir: 'auto' }, a.note), h('td', {}, del(delAdj, a.id, t('pay.adj.' + a.type)))))))) : h('p', { class: 'empty' }, t('pay.noAdj')),
    adjForm);
}
