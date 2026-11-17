/**
 * <admin>/js/staff-data.js  -  staff and pay: control settings, people and rates, time entries, overtime, payroll, cost feeds for Finance
 * Three kinds of sealed data: the people (data/private/ops/people.json, edited like a supplier), one file per month of time entries / bonuses / deductions
 * (data/private/staff/pay-YYYY-MM.json), and one file per person and month of sign-in records (data/private/staff/att/YYYY-MM/<id>.json, written by that person only).
 * The pay rules are plain functions of (person, month, entries, adjustments, rules): the same numbers are on the payroll screen, the report and in Finance.
 * The settings that steer it live in settings.control (sessions, shifts, week days, pay rules) and settings.tech (switches, limits); both are normalised here.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Control settings: sessions and shifts, pay rules, technical switches
   ===================================================================== */
const PAY_BASES = ['month', 'day', 'hour'], PERSON_KINDS = ['staff', 'casual'], PAY_COSTS = ['direct', 'indirect'];
const ENTRY_TYPES = ['work', 'overtime', 'extra', 'absent', 'leave'], ADJ_TYPES = ['bonus', 'deduction', 'advance'], ENTRY_SRC = ['manual', 'sheet', 'att'];
const PAY_ENTRIES_MAX = 2500, PAY_ADJ_MAX = 600, SHIFTS_MAX = 6;
const rnd2 = (x) => Math.round(num(x) * 100) / 100;
const hhmmOk = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const hhmmMin = (s) => { const [a, b] = String(s).split(':').map(Number); return a * 60 + b; };
const intIn = (v, lo, hi, def) => { const n = Math.round(Number(v)); return v !== '' && v != null && isFinite(n) && n >= lo && n <= hi ? n : def; };
const decIn = (v, lo, hi, def) => { const n = Number(v); return v !== '' && v != null && isFinite(n) && n >= lo && n <= hi ? rnd2(n) : def; };

const defaultControl = () => ({
  idleDefault: 30,                                            // minutes of inactivity before a team member is signed out (the administrator keeps the device setting unless a value is set for them)
  roles: {},                                                  // role id (or 'owner') -> { idle, shiftId, closeAtEnd, grace, outside }
  shifts: [{ id: 'day', name: { en: 'Day shift', ar: 'الوردية النهارية' }, start: '08:00', end: '17:00' }],
  workDays: [6, 0, 1, 2, 3, 4],                               // Saturday to Thursday (0 = Sunday)
  ping: 15,                                                   // minutes between "last seen" writes while somebody works
  pay: { monthDays: 26, dayHours: 8, otDay: 1.5, otRest: 2, round: 15, minOt: 15, toFinance: true },
});
function normControl(c) {
  const d = defaultControl(); c = c && typeof c === 'object' ? c : {};
  const seen = new Set(), shifts = (Array.isArray(c.shifts) ? c.shifts : d.shifts).map((x) => {
    x = x || {}; const nm = x.name && typeof x.name === 'object' ? x.name : {};
    return { id: /^[a-z0-9]{2,12}$/.test(String(x.id || '')) ? x.id : '', name: { en: ostr(nm.en, 40), ar: ostr(nm.ar, 40) }, start: hhmmOk(x.start) ? x.start : '08:00', end: hhmmOk(x.end) ? x.end : '17:00' };
  }).filter((x) => x.id && (x.name.en || x.name.ar) && hhmmMin(x.end) > hhmmMin(x.start) && !seen.has(x.id) && seen.add(x.id)).slice(0, SHIFTS_MAX);
  const roles = {};
  for (const [k, v0] of Object.entries(c.roles && typeof c.roles === 'object' ? c.roles : {})) {
    if (!/^[\w-]{1,24}$/.test(k)) continue; const v = v0 && typeof v0 === 'object' ? v0 : {};
    roles[k] = { idle: intIn(v.idle, 0, 480, 0), shiftId: shifts.some((s) => s.id === v.shiftId) ? v.shiftId : '', closeAtEnd: v.closeAtEnd === true, grace: intIn(v.grace, 0, 180, 15), outside: v.outside === 'block' ? 'block' : 'allow' };
  }
  const wd = Array.isArray(c.workDays) ? [...new Set(c.workDays.map((x) => Math.round(Number(x))).filter((x) => x >= 0 && x <= 6))].sort() : d.workDays, p = c.pay && typeof c.pay === 'object' ? c.pay : {};
  return { idleDefault: intIn(c.idleDefault, 5, 480, d.idleDefault), roles, shifts, workDays: wd, ping: intIn(c.ping, 5, 60, d.ping),
    pay: { monthDays: intIn(p.monthDays, 20, 31, 26), dayHours: decIn(p.dayHours, 1, 16, 8), otDay: decIn(p.otDay, 1, 5, 1.5), otRest: decIn(p.otRest, 1, 5, 2), round: intIn(p.round, 1, 60, 15), minOt: intIn(p.minOt, 0, 240, 15), toFinance: p.toFinance !== false } };
}
const TECH_LIMIT = { videoMb: [1, 50, 24], fileMb: [1, 50, 24], accessWatch: [30, 900, 120] };
function normTech(c) {
  c = c && typeof c === 'object' ? c : {}; const f = c.features && typeof c.features === 'object' ? c.features : {}, features = {};
  for (const k of FEATURE_KEYS) features[k] = f[k] !== false;
  const lim = (k) => intIn(c[k], TECH_LIMIT[k][0], TECH_LIMIT[k][1], TECH_LIMIT[k][2]);
  const site = String(c.siteUrl || '').trim().slice(0, 200);
  return { features, videoMb: lim('videoMb'), fileMb: lim('fileMb'), accessWatch: lim('accessWatch'), siteUrl: /^https:\/\/[^\s<>"']{3,190}$/.test(site) ? site : '' };
}
const ctlNow = () => (session && session.settings && session.settings.control) || defaultControl();
const techNow = () => (session && session.settings && session.settings.tech) || normTech(null);

// What applies to one signed-in person: idle minutes (0 = use the device setting), shift, close at the end, grace, and whether work outside the shift is allowed
function policyFor(user) {
  const c = ctlNow(), key = user && user.owner ? 'owner' : (user && user.role) || '', r = c.roles[key] || {}, shift = c.shifts.find((s) => s.id === r.shiftId) || null;
  return { idleMin: r.idle || (user && user.owner ? 0 : c.idleDefault), shift, closeAtEnd: !!(r.closeAtEnd && shift), grace: r.grace == null ? 15 : r.grace, outside: r.outside === 'block' ? 'block' : 'allow', workDays: c.workDays, ping: c.ping };
}

/* =====================================================================
   People, time entries, adjustments
   ===================================================================== */
function normPerson(x) {
  x = x || {};
  return { id: ostr(x.id, 20), name: ostr(x.name, 100), kind: PERSON_KINDS.includes(x.kind) ? x.kind : 'staff', basis: PAY_BASES.includes(x.basis) ? x.basis : 'month', rate: rnd2(Math.max(0, num(x.rate))),
    cost: PAY_COSTS.includes(x.cost) ? x.cost : 'indirect', memberId: ostr(x.memberId, 24), phone: ostr(x.phone, 40), start: oday(x.start), end: oday(x.end), active: x.active !== false,
    otDay: onum(x.otDay), otRest: onum(x.otRest), notes: ostr(x.notes, 1000), createdAt: ostr(x.createdAt, 30), updatedAt: ostr(x.updatedAt, 30) };
}
function normEntry(x) {
  x = x || {};
  return { id: ostr(x.id, 12) || uid(), date: oday(x.date), pid: ostr(x.pid, 20), type: ENTRY_TYPES.includes(x.type) ? x.type : 'work', hours: rnd2(Math.min(24, Math.max(0, num(x.hours)))), days: rnd2(Math.min(1, Math.max(0, x.days === '' || x.days == null ? 1 : num(x.days)))),
    amount: onum(x.amount) === '' ? '' : rnd2(num(x.amount)), sku: ostr(x.sku, 40), note: ostr(x.note, 200), src: ENTRY_SRC.includes(x.src) ? x.src : 'manual' };
}
const normAdj = (x) => { x = x || {}; return { id: ostr(x.id, 12) || uid(), pid: ostr(x.pid, 20), type: ADJ_TYPES.includes(x.type) ? x.type : 'bonus', amount: rnd2(Math.max(0, num(x.amount))), note: ostr(x.note, 200), date: oday(x.date) }; };
const monthOk = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
function normPayMonth(d, month) {
  d = d && typeof d === 'object' ? d : {};
  return { v: 1, month, closed: d.closed === true, closedAt: ostr(d.closedAt, 30), updatedAt: ostr(d.updatedAt, 30),
    entries: oarr(d.entries).map(normEntry).filter((e) => e.pid && e.date.slice(0, 7) === month).slice(0, PAY_ENTRIES_MAX), adj: oarr(d.adj).map(normAdj).filter((a) => a.pid && a.amount > 0).slice(0, PAY_ADJ_MAX) };
}

/* =====================================================================
   Pay: rates, overtime, one person's month, everybody's month
   ===================================================================== */
const isRestDay = (date, workDays) => { const d = parseDay(date); return !!d && !workDays.includes(d.getDay()); };
function personRates(p, rules) {
  const hourly = p.basis === 'hour' ? p.rate : p.basis === 'day' ? p.rate / rules.dayHours : p.rate / (rules.monthDays * rules.dayHours);
  const daily = p.basis === 'day' ? p.rate : p.basis === 'hour' ? p.rate * rules.dayHours : p.rate / rules.monthDays;
  return { hourly, daily };
}
// the share of the month the person is employed (start and end dates inside the month shorten it)
const empStart = (p) => p.start || String(p.createdAt || '').slice(0, 10);                  // a person with no start date counts from the day they were added
function monthFraction(p, month) {
  const first = parseDay(month + '-01'); if (!first) return 0;
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0), n = last.getDate(), s = parseDay(empStart(p)), e = p.end ? parseDay(p.end) : null;
  const from = s && s > first ? s : first, to = e && e < last ? e : last;
  return to < from ? 0 : (Math.round((to - from) / 864e5) + 1) / n;
}
// everything one person earned in one month. entries / adj are the lists of that month (any person), ctl the control settings
function payFor(p, month, entries, adj, ctl) {
  const rules = ctl.pay, rt = personRates(p, rules), mine = entries.filter((e) => e.pid === p.id), my = adj.filter((a) => a.pid === p.id);
  const sum = (list, f) => list.reduce((a, x) => a + num(f(x)), 0), mult = (date) => (isRestDay(date, ctl.workDays) ? (p.otRest === '' ? rules.otRest : p.otRest) : (p.otDay === '' ? rules.otDay : p.otDay));
  const work = mine.filter((e) => e.type === 'work'), leave = mine.filter((e) => e.type === 'leave'), absent = sum(mine.filter((e) => e.type === 'absent'), (e) => e.days);
  let base = 0, days = 0, hours = 0;
  if (p.basis === 'month') { const gross = p.rate * monthFraction(p, month); base = Math.max(0, gross - Math.min(gross, absent * rt.daily)); days = sum(work, (e) => e.days); }
  else if (p.basis === 'day') { days = sum(work.concat(leave), (e) => e.days); base = sum(work.concat(leave), (e) => (e.amount !== '' ? e.amount : e.days * p.rate)); }
  else { hours = sum(work, (e) => e.hours); base = sum(work, (e) => (e.amount !== '' ? e.amount : e.hours * p.rate)); }
  const ot = mine.filter((e) => e.type === 'overtime'), ex = mine.filter((e) => e.type === 'extra');
  const line = (e) => (e.amount !== '' ? e.amount : e.hours * rt.hourly * mult(e.date));
  const otPay = sum(ot, line), exPay = sum(ex, line), bonus = sum(my.filter((a) => a.type === 'bonus'), (a) => a.amount), ded = sum(my.filter((a) => a.type === 'deduction'), (a) => a.amount), adv = sum(my.filter((a) => a.type === 'advance'), (a) => a.amount);
  const gross = Math.max(0, base + otPay + exPay + bonus - ded);
  return { pid: p.id, base: rnd2(base), overtime: rnd2(otPay), extra: rnd2(exPay), bonus: rnd2(bonus), deduction: rnd2(ded), advance: rnd2(adv), gross: rnd2(gross), net: rnd2(gross - adv),
    days: rnd2(days), hours: rnd2(hours), otHours: rnd2(sum(ot, (e) => e.hours)), extraHours: rnd2(sum(ex, (e) => e.hours)), absent: rnd2(absent), hourly: rnd2(rt.hourly), daily: rnd2(rt.daily) };
}
// the people who are employed in that month (or have entries in it), with their pay
function payMonthRows(month, people, pm, ctl) {
  const ent = pm ? pm.entries : [], adj = pm ? pm.adj : [], used = new Set(ent.map((e) => e.pid).concat(adj.map((a) => a.pid)));
  return people.filter((p) => monthFraction(p, month) > 0 || used.has(p.id)).map((p) => ({ p, r: payFor(p, month, ent, adj, ctl) }));
}
const payTotals = (rows) => ({ gross: rnd2(sumBy(rows, (x) => x.r.gross)), net: rnd2(sumBy(rows, (x) => x.r.net)), overtime: rnd2(sumBy(rows, (x) => x.r.overtime)), extra: rnd2(sumBy(rows, (x) => x.r.extra)),
  bonus: rnd2(sumBy(rows, (x) => x.r.bonus)), deduction: rnd2(sumBy(rows, (x) => x.r.deduction)), advance: rnd2(sumBy(rows, (x) => x.r.advance)), base: rnd2(sumBy(rows, (x) => x.r.base)) });

/* =====================================================================
   Attendance: sessions -> worked and overtime minutes per day
   ===================================================================== */
const dayKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
// sessions: [{ in, seen, out }] (ISO); pol: policyFor(...); rules: control.pay. Returns Map date -> { inMin, otMin, rest } (overtime rounded down to the step and dropped below the minimum)
function attDays(sessions, pol, rules) {
  const days = new Map();
  for (const s of sessions) {
    const a = new Date(s.in).getTime(), b = new Date(s.out || s.seen || s.in).getTime(); if (!isFinite(a) || !isFinite(b) || b <= a) continue;
    for (let d0 = new Date(new Date(a).getFullYear(), new Date(a).getMonth(), new Date(a).getDate()); d0.getTime() < b; d0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1)) {
      const t0 = d0.getTime(), t1 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1).getTime(), x = Math.max(a, t0), y = Math.min(b, t1); if (y <= x) continue;
      const rest = !pol.workDays.includes(d0.getDay()), seg = (y - x) / 60000, rec = days.get(dayKey(d0)) || { inMin: 0, otMin: 0, rest };
      if (rest) rec.otMin += seg;
      else if (!pol.shift) rec.inMin += seg;
      else {
        const w0 = t0 + hhmmMin(pol.shift.start) * 60000, w1 = t0 + hhmmMin(pol.shift.end) * 60000, inside = Math.max(0, Math.min(y, w1) - Math.max(x, w0)) / 60000;
        rec.inMin += inside; rec.otMin += Math.max(0, y - Math.max(x, w1)) / 60000;
      }
      days.set(dayKey(d0), rec);
    }
  }
  for (const rec of days.values()) {
    rec.inMin = Math.round(rec.inMin); const step = Math.max(1, rules.round), ot = Math.floor(rec.otMin / step) * step;
    rec.otMin = ot >= Math.max(step, rules.minOt) ? ot : 0;
  }
  return days;
}
// Time entries made from the sign-in records of one linked person for one month: hours inside the shift (for people paid by the hour or the day) and overtime
function entriesFromAttendance(p, month, sessions, pol, rules) {
  const out = [];
  for (const [date, v] of [...attDays(sessions, pol, rules)].sort()) {
    if (date.slice(0, 7) !== month) continue;
    if (v.inMin > 0 && p.basis === 'hour') out.push(normEntry({ date, pid: p.id, type: 'work', hours: v.inMin / 60, src: 'att' }));
    else if (v.inMin > 0 && p.basis === 'day') out.push(normEntry({ date, pid: p.id, type: 'work', days: 1, hours: v.inMin / 60, src: 'att' }));
    if (v.otMin > 0) out.push(normEntry({ date, pid: p.id, type: 'overtime', hours: v.otMin / 60, src: 'att' }));
  }
  return out;
}

/* =====================================================================
   Reading and writing the month files and the sign-in records
   ===================================================================== */
let payCache = {}, staffDir = null;                    // month -> { data, sha } · the listing of the staff folder (names only)
const payPath = (m) => STAFF_DIR + 'pay-' + m + '.json';
const attDir = (m) => STAFF_DIR + 'att/' + m, attPath = (id, m) => attDir(m) + '/' + id + '.json';        // one folder per month: a folder listing holds at most 1,000 files
const monthNow = () => todayStr().slice(0, 7);
const monthShift = (m, n) => { const d = parseDay(m + '-01'); const x = new Date(d.getFullYear(), d.getMonth() + n, 1); return x.getFullYear() + '-' + pad2(x.getMonth() + 1); };
async function listStaffDir(force) { if (force || !staffDir) staffDir = await listDir(STAFF_DIR.replace(/\/$/, '')); return staffDir; }
async function loadPayMonth(month, force) {
  if (!force && payCache[month]) return payCache[month];
  await needMaster(); let data = null, sha = null;
  try { const f = await getFile(payPath(month)); sha = f.sha; data = await openObj(f.text); } catch (e) { if (e.status !== 404) throw e; }
  return (payCache[month] = { data: normPayMonth(data, month), sha });
}
async function savePayMonth(month) {
  const o = payCache[month]; o.data.updatedAt = oiso();
  const body = await sealObj(o.data); if (body.length > OPS_MAX_SEALED) throw new Error(t('ops.tooBig'));
  try { o.sha = await putFile(payPath(month), body, (o.sha ? 'Update ' : 'Add ') + 'pay ' + month, o.sha ? { sha: o.sha } : { create: true }); } catch (e) {
    if (e.status === 409 || e.status === 422) throw Object.assign(new Error(t('ops.conflict')), { status: 409 });
    throw e;
  }
  staffDir = null;
}
// apply one change to a month (fn edits the data in place) and save; when another device saved first, take its copy and apply the same change again
async function payMutate(month, fn) {
  await loadPayMonth(month);
  for (let attempt = 0; ; attempt++) {
    fn(payCache[month].data);
    try { await savePayMonth(month); return payCache[month].data; } catch (e) { if (e.status === 409 && attempt < 2) { await loadPayMonth(month, true); continue; } delete payCache[month]; throw e; }
  }
}
// the months with a pay file inside a period (the last 120 at most)
const payMonthsIn = (from, to) => (staffDir || []).map((f) => /^pay-(\d{4}-\d{2})\.json$/.exec(f.name)).filter(Boolean).map((m) => m[1]).sort().filter((m) => (!from || m >= from.slice(0, 7)) && (!to || m <= to.slice(0, 7))).slice(-120);
// do the people and the pay files of that period still have to be read? (Finance asks before it counts; false when payroll is not fed to Finance)
function payNeeds(from, to) {
  if (!ctlNow().pay.toFinance) return false;
  return !ops.people || !staffDir || payMonthsIn(from, to).some((m) => !payCache[m]);
}
async function payEnsure(from, to) { await loadOps('people'); await listStaffDir(); await pool(payMonthsIn(from, to), 4, (m) => loadPayMonth(m)); }
// one person's sign-in records of a month
async function loadAtt(id, month) {
  let data = { v: 1, uid: id, month, sessions: [] }, sha = null;
  try { const f = await getFile(attPath(id, month)); sha = f.sha; data = await openObj(f.text); } catch (e) { if (e.status !== 404) throw e; }
  data.sessions = oarr(data.sessions).map((s) => ({ id: ostr(s.id, 12), in: ostr(s.in, 30), seen: ostr(s.seen, 30), out: ostr(s.out, 30), how: ostr(s.how, 12), shift: ostr(s.shift, 12), stay: s.stay === true })).filter((s) => s.in);
  return { data, sha };
}

/* =====================================================================
   What the pay feeds into Finance: payroll of every month, and shipment costs that are switched on
   ===================================================================== */
const lastDayOf = (month) => { const d = parseDay(month + '-01'); return d ? endOfMonth(d.getFullYear(), d.getMonth()) : ''; };
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); };
// one line per month and kind (direct / indirect): the people's own amounts stay in Staff & pay, which only people with that permission open
function payFeed(from, to) {
  const ctl = ctlNow(), people = opsList('people'), out = []; if (!ctl.pay.toFinance || !people.length) return out;
  const cur = monthNow(), starts = people.map((p) => empStart(p).slice(0, 7)).filter(monthOk).sort(), first = from && from.slice(0, 7) > (starts[0] || '') ? from.slice(0, 7) : (starts[0] || cur);
  const last = to && to.slice(0, 7) < cur ? to.slice(0, 7) : cur;
  for (let m = first, n = 0; m <= last && monthOk(m) && n < 240; m = monthShift(m, 1), n++) {
    const pm = payCache[m] ? payCache[m].data : null, day = m === cur ? (todayStr() < lastDayOf(m) ? todayStr() : lastDayOf(m)) : lastDayOf(m), rows = payMonthRows(m, people, pm, ctl);
    for (const kind of PAY_COSTS) {
      const amount = rnd2(sumBy(rows.filter((x) => x.p.cost === kind), (x) => x.r.gross)); if (!(amount > 0)) continue;
      out.push({ e: { id: 'PAY-' + m + '-' + kind, name: t('pay.feed.' + kind, { m: monthLabel(m) }), kind, cat: kind === 'direct' ? 'labor' : 'salaries', repeat: 'none', notes: '', supplierId: '', discount: 0, feed: 'payroll', href: '#staff/payroll/' + m }, date: day, amount });
    }
  }
  return out.filter((o) => (!from || o.date >= from) && (!to || o.date <= to));
}
function shipFeed(from, to) {
  const out = [];
  for (const x of opsList('logistics')) {
    if (!(x.cost > 0) || x.cancelled || x.fin !== 'direct' && x.fin !== 'indirect') continue;
    const date = x.received || x.eta || String(x.createdAt || '').slice(0, 10); if (!oday(date) || (from && date < from) || (to && date > to)) continue;
    out.push({ e: { id: x.id, name: x.title || x.code || x.id, kind: x.fin, cat: x.fin === 'direct' ? 'delivery' : 'other', repeat: 'none', notes: '', supplierId: x.supplierId || '', discount: 0, feed: 'shipment', href: '#logistics/' + x.id }, date, amount: num(x.cost) });
  }
  return out;
}
