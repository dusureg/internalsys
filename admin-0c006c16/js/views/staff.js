/**
 * <admin>/js/views/staff.js  -  Staff & pay: who is working now, the people and their pay rates, the pay rules
 * Four tabs under #staff: Presence (live status from the sign-in records), People (the list and one form each, #people/<id>), Payroll (views/payroll.js) and Rules
 * (week days, overtime, rounding, whether payroll is counted in Finance). The shifts and the sessions of each role are set in Control (views/control.js).
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Staff & pay
   ===================================================================== */
const STAFF_TABS = ['presence', 'people', 'payroll', 'rules'];
let staffSel = { month: monthNow(), pid: '', show: 'active' };
const minText = (m) => { m = Math.max(0, Math.round(m)); return Math.floor(m / 60) + ':' + pad2(m % 60); };
const rateText = (p) => money(p.rate) + ' / ' + t('pay.per.' + p.basis);
const roleText = (id) => (id === 'owner' ? t('team.owner') : roleLabel(teamRole(id) || { id }));
const staffTabs = (cur) => h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('staff.tabs') }, STAFF_TABS.map((k) => h('a', { class: 'tab pill', role: 'tab', id: 'staffTab-' + k, href: '#staff/' + k, 'aria-selected': String(k === cur) }, t('staff.tab.' + k))));
const staffHead = (cur, ...actions) => [h('div', { class: 'page-head' }, h('h1', {}, t('staff.title')), h('div', { class: 'actions' }, encBadge(), actions)), h('p', { class: 'hint' }, t('staff.hint')), staffTabs(cur)];
const staffRetry = (token, e) => mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] }));

async function renderStaff(token, sub) {
  const [tab, arg] = String(sub || 'presence').split('/'), cur = STAFF_TABS.includes(tab) ? tab : 'presence';
  if (!(await ensureOps(token, ['people']))) return;
  try {
    await listStaffDir();
    if (cur === 'payroll') { staffSel.month = monthOk(arg) ? arg : staffSel.month; await loadPayMonth(staffSel.month); }
  } catch (e) { if (token === routeToken) staffRetry(token, e); return; }
  if (token !== routeToken) return;
  ({ presence: drawPresence, people: drawPeople, payroll: drawPayroll, rules: drawRules })[cur]();
}

/* ---------------- presence: who is working now ---------------- */
const attDaySum = (sessions, day) => {                                    // minutes of work inside one calendar day (from the raw sign-in records)
  const a0 = parseDay(day).getTime(), a1 = a0 + 864e5; let m = 0;
  for (const s of sessions) { const x = Math.max(a0, new Date(s.in).getTime()), y = Math.min(a1, new Date(s.out || s.seen || s.in).getTime()); if (y > x) m += (y - x) / 60000; }
  return m;
};
function drawPresence() {
  const ctl = ctlNow(), body = h('div', { class: 'tablewrap', id: 'presList' }), note = h('p', { class: 'hint', id: 'presNote', role: 'status' });
  const how = (k) => (k ? t('att.how.' + k) : t('att.how.running'));
  const fill = async () => {
    let list; try { list = await attReadMonth(monthNow()); } catch (e) { body.replaceChildren(h('p', { class: 'msg bad' }, e.message)); return; }
    if (!body.isConnected) return;
    const today = todayStr(), rows = list.map((x) => {
      const pol = policyFor({ owner: x.role === 'owner', role: x.role }), days = attDays(x.sessions, pol, ctl.pay), st = attState(x.sessions, ctl.ping);
      return { x, st, today: attDaySum(x.sessions, today), month: [...days.values()].reduce((a, v) => a + v.inMin + v.otMin, 0), ot: [...days.values()].reduce((a, v) => a + v.otMin, 0), pol };
    }).sort((a, b) => (b.st.online - a.st.online) || b.st.seen - a.st.seen);
    const on = rows.filter((r) => r.st.online).length;
    note.textContent = t('pres.summary', { n: nf(on), total: nf(rows.length), at: fmtDateTime(new Date().toISOString()) });
    body.replaceChildren(rows.length ? h('table', { class: 'tbl', id: 'presTable' },
      h('thead', {}, h('tr', {}, h('th', {}, t('pres.person')), h('th', {}, t('pres.status')), h('th', {}, t('pres.lastSeen')), h('th', { class: 'n' }, t('pres.today')), h('th', { class: 'n' }, t('pres.month')), h('th', { class: 'n' }, t('pres.overtime')))),
      h('tbody', {}, rows.map((r) => h('tr', { 'data-uid': r.x.id },
        h('td', {}, h('strong', { dir: 'auto' }, r.x.name || r.x.id), h('div', { class: 'small muted' }, roleText(r.x.role) + (r.pol.shift ? ' · ' + L(r.pol.shift.name) : '')),
          h('details', { class: 'small' }, h('summary', {}, t('pres.sessions')), h('ul', { class: 'plainlist' }, r.x.sessions.slice().reverse().slice(0, 12).map((s) => h('li', { class: 'muted' }, fmtDateTime(s.in) + ' → ' + (s.out ? fmtDateTime(s.out) : t('att.how.running')) + ' · ' + how(s.out ? s.how : '')))))),
        h('td', {}, h('span', { class: 'badge ' + (r.st.online ? 'done' : 'pending'), 'data-online': r.st.online ? '1' : '0' }, r.st.online ? t('pres.online') : t('pres.offline'))),
        h('td', { class: 'small' }, r.st.seen ? fmtDateTime(new Date(r.st.seen).toISOString()) : '—'),
        h('td', { class: 'n' }, minText(r.today)), h('td', { class: 'n' }, minText(r.month)), h('td', { class: 'n' }, r.ot ? minText(r.ot) : '—'))))) : h('p', { class: 'empty' }, t('pres.empty')));
  };
  mount(h('section', { class: 'stack', id: 'staffScreen' }, ...staffHead('presence', h('button', { class: 'btn', type: 'button', id: 'btnPresRefresh', onclick: () => fill() }, t('act.refresh'))),
    kpis(kpi(t('pres.k.people'), nf(opsList('people').filter((p) => p.active).length)), kpi(t('pres.k.ping'), t('pres.every', { n: nf(ctl.ping) }))),
    h('div', { class: 'card stack-sm' }, h('p', { class: 'hint' }, t('pres.hint')), note, body)));
  fill();
  const tick = setInterval(() => { if (!body.isConnected) clearInterval(tick); else if (document.visibilityState !== 'hidden') fill(); }, 60000);
}

/* ---------------- people ---------------- */
function drawPeople() {
  const all = opsList('people'), ctl = ctlNow(), list = h('div', { class: 'tablewrap', id: 'pplList' }), cur = monthNow();
  const pm = payCache[cur] ? payCache[cur].data : null, tot = payTotals(payMonthRows(cur, all.filter((p) => p.active), pm, ctl));
  const draw = () => {
    const rows = all.filter((p) => staffSel.show === 'all' || (staffSel.show === 'active') === p.active).sort((a, b) => a.name.localeCompare(b.name, locale()));
    list.replaceChildren(rows.length ? h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, t('ppl.name')), h('th', {}, t('ppl.kind')), h('th', {}, t('ppl.pay')), h('th', {}, t('ppl.cost')), h('th', {}, t('ppl.status')), h('th', {}, h('span', { class: 'sr' }, t('act.edit'))))),
      h('tbody', {}, rows.map((p) => h('tr', { 'data-id': p.id },
        h('td', {}, h('strong', { dir: 'auto' }, p.name), h('div', { class: 'small muted mono' }, p.id)), h('td', {}, t('ppl.kind.' + p.kind)), h('td', {}, rateText(p)), h('td', {}, t('ppl.cost.' + p.cost)),
        h('td', {}, h('span', { class: 'badge ' + (p.active ? 'done' : 'pending') }, p.active ? t('ppl.active') : t('ppl.inactive'))),
        h('td', {}, h('a', { class: 'btn small', href: '#people/' + p.id, 'aria-label': t('act.edit') + ' ' + p.name }, t(can('staff', PERM_EDIT) ? 'act.edit' : 'act.open'))))))) : h('p', { class: 'empty' }, all.length ? t('ppl.noMatch') : t('ppl.empty')));
  };
  const show = selectEl([['active', t('ppl.showActive')], ['inactive', t('ppl.showInactive')], ['all', t('ppl.showAll')]], staffSel.show, (v) => { staffSel.show = v; draw(); }, 'pplShow', t('ppl.showLabel'));
  mount(h('section', { class: 'stack', id: 'staffScreen' }, ...staffHead('people', h('a', { class: 'btn primary', href: '#people/new', id: 'btnNewPerson', 'data-edit': 'staff' }, t('ppl.add'))),
    kpis(kpi(t('ppl.k.active'), nf(all.filter((p) => p.active).length)), kpi(t('ppl.k.casual'), nf(all.filter((p) => p.active && p.kind === 'casual').length)), kpi(t('ppl.k.month'), money(tot.gross), '', t('ppl.k.monthSub'))),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'filters3' }, show), list)));
  draw();
}

const blankPerson = () => normPerson({ kind: 'staff', basis: 'month', cost: 'indirect', start: todayStr() });
async function renderPerson(token, sub) {
  if (!(await ensureOps(token, ['people']))) return;
  if (!team && can('team')) { try { await loadTeam(); } catch (_) { /* the list of logins stays empty */ } }
  if (token !== routeToken) return;
  opsOpen('people', sub, blankPerson, '#staff/people', 'staff.back', drawPersonForm);
}
function savePerson() {
  const r = opsEd.rec; r.name = String(r.name || '').trim(); r.rate = rnd2(num(r.rate));
  if (!r.name) { toast(t('ppl.val.name'), 'bad'); return; }
  if (!(r.rate >= 0)) { toast(t('ppl.val.rate'), 'bad'); return; }
  if (r.end && r.start && r.end < r.start) { toast(t('ppl.val.dates'), 'bad'); return; }
  if (r.memberId && opsList('people').some((x) => x.id !== r.id && x.memberId === r.memberId)) { toast(t('ppl.val.member'), 'bad'); return; }
  return opsSaveOpen().then(() => { payCache = {}; });
}
function drawPersonForm() {
  const e = opsEd, r = e.rec; e.save = savePerson; e.live = () => { eq.textContent = eqText(); };
  const rules = ctlNow().pay, eqText = () => { const q = personRates(normPerson(r), rules); return t('ppl.equals', { h: money(q.hourly), d: money(q.daily) }); }, eq = h('p', { class: 'hint', id: 'pplEq', role: 'status' }, eqText());
  const members = (team ? team.data.users : []).map((u) => [u.id, (u.name || u.username) + ' · ' + u.username]);
  const member = selectEl([['', t('ppl.noMember')], ['owner', t('team.owner')]].concat(members), r.memberId, (v) => { r.memberId = v; touch(); }, 'pplMember');
  const form = h('div', { class: 'card stack-sm' },
    fld('ppl.name', tin(r, 'name', { id: 'pplName', max: 100, req: true })),
    h('div', { class: 'grid2' }, fld('ppl.kind', selectEl(PERSON_KINDS.map((k) => [k, t('ppl.kind.' + k)]), r.kind, (v) => { r.kind = v; touch(); }, 'pplKind'), 'ppl.kindHint'), fld('ppl.cost', selectEl(PAY_COSTS.map((k) => [k, t('ppl.cost.' + k)]), r.cost, (v) => { r.cost = v; touch(); }, 'pplCost'), 'ppl.costHint')),
    h('div', { class: 'grid2' },
      fld('ppl.basis', selectEl(PAY_BASES.map((k) => [k, t('pay.basis.' + k)]), r.basis, (v) => { r.basis = v; touch(); e.redraw(); }, 'pplBasis'), 'ppl.basisHint'),
      fld('ppl.rate', tin(r, 'rate', { id: 'pplRate', type: 'number', num: true, min: 0, step: 0.01, mode: 'decimal', req: true }), 'pay.per.' + r.basis)),
    eq,
    h('div', { class: 'grid2' }, fld('ppl.start', tin(r, 'start', { id: 'pplStart', type: 'date' }), 'ppl.startHint'), fld('ppl.end', tin(r, 'end', { id: 'pplEnd', type: 'date' }), 'ppl.endHint')),
    h('div', { class: 'grid2' }, fld('ppl.otDay', tin(r, 'otDay', { id: 'pplOtDay', type: 'number', num: true, min: 1, step: 0.05, mode: 'decimal' }), 'ppl.otHint'), fld('ppl.otRest', tin(r, 'otRest', { id: 'pplOtRest', type: 'number', num: true, min: 1, step: 0.05, mode: 'decimal' }), 'ppl.otHint')),
    fld('ppl.member', member, 'ppl.memberHint'),
    fld('ppl.phone', tin(r, 'phone', { id: 'pplPhone', dir: 'ltr', max: 40, mode: 'tel' })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pplActive', checked: r.active, onchange: (ev) => { r.active = ev.target.checked; touch(); } }), h('span', {}, t('ppl.activeLabel'))),
    fld('ppl.notes', tarea(r, 'notes', { id: 'pplNotes', rows: 3, max: 1000 })));
  const del = e.isNew ? null : h('div', { class: 'actions', 'data-edit': 'staff' }, opsDeleteBtn(() => opsDeleteOpen(t('ppl.delConfirm', { n: r.name || e.id }), '#staff/people')), h('span', { class: 'hint' }, t('ppl.delHint')));
  opsFormPage('#staff/people', 'staff.back', e.isNew ? t('ppl.new') : r.name || e.id, form, del);
}

/* ---------------- rules: week, overtime, rounding, Finance ---------------- */
// keep the sessions and shifts settings as they are and change only the pay rules and the week
async function saveControl(mut, auditNote) {
  await loadSettings(); const before = clone(session.settings.control || defaultControl()), next = normControl(mut(clone(before)));
  session.settings = Object.assign({}, session.settings, { control: next }); await saveSettings();
  auditSave('settings', 'update', 'control', ak('ctl.auditTitle'), before, next, auditNote);
  armIdle(); return next;
}
function drawRules() {
  const ro = readOnly('staff'), d = clone(ctlNow()), msg = h('p', { class: 'msg', id: 'rulesMsg', role: 'status', hidden: true });
  const num2 = (obj, key, id, o) => tin(obj, key, Object.assign({ id, type: 'number', num: true, step: 'any', mode: 'decimal' }, o || {}));
  const days = [6, 0, 1, 2, 3, 4, 5].map((k) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ruleDay' + k, checked: d.workDays.includes(k), onchange: (ev) => { d.workDays = ev.target.checked ? [...new Set(d.workDays.concat(k))].sort() : d.workDays.filter((x) => x !== k); } }), h('span', {}, new Date(2024, 0, 7 + k).toLocaleDateString(locale(), { weekday: 'long' }))));
  const save = async () => {
    if (!d.workDays.length) { msg.hidden = false; msg.className = 'msg bad'; msg.textContent = t('rules.val.days'); return; }
    try { await saveControl((c) => Object.assign(c, { workDays: d.workDays, ping: num(d.ping), pay: d.pay })); msg.hidden = false; msg.className = 'msg ok'; msg.textContent = t('rules.saved'); } catch (e) { msg.hidden = false; msg.className = 'msg bad'; msg.textContent = e.message; }
  };
  const form = [h('div', { class: 'card stack-sm' }, h('h2', {}, t('rules.week')), h('p', { class: 'hint' }, t('rules.weekHint')), h('div', { class: 'checks' }, days)),
    h('div', { class: 'card stack-sm' }, h('h2', {}, t('rules.pay')),
      h('div', { class: 'grid2' }, fld('rules.monthDays', num2(d.pay, 'monthDays', 'ruleMonthDays', { min: 20, max: 31 }), 'rules.monthDaysHint'), fld('rules.dayHours', num2(d.pay, 'dayHours', 'ruleDayHours', { min: 1, max: 16 }), 'rules.dayHoursHint')),
      h('div', { class: 'grid2' }, fld('rules.otDay', num2(d.pay, 'otDay', 'ruleOtDay', { min: 1, max: 5 }), 'rules.otDayHint'), fld('rules.otRest', num2(d.pay, 'otRest', 'ruleOtRest', { min: 1, max: 5 }), 'rules.otRestHint')),
      h('div', { class: 'grid2' }, fld('rules.round', num2(d.pay, 'round', 'ruleRound', { min: 1, max: 60 }), 'rules.roundHint'), fld('rules.minOt', num2(d.pay, 'minOt', 'ruleMinOt', { min: 0, max: 240 }), 'rules.minOtHint')),
      fld('rules.ping', num2(d, 'ping', 'rulePing', { min: 5, max: 60 }), 'rules.pingHint'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ruleFeed', checked: d.pay.toFinance, onchange: (ev) => { d.pay.toFinance = ev.target.checked; } }), h('span', {}, t('rules.feed'))), h('p', { class: 'hint' }, t('rules.feedHint')))];
  mount(h('section', { class: 'stack', id: 'staffScreen' }, ...staffHead('rules'), ...roWrap(ro, form), ro ? null : h('div', { class: 'savebar' }, msg, h('button', { class: 'btn primary', type: 'button', id: 'btnSaveRules', onclick: save }, t('ops.save')))));
}
