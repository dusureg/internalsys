/**
 * <admin>/js/attend.js  -  sign-in records: who worked when, the shift clock, "last seen"
 * While somebody is signed in, this device keeps ONE record in that person's own sealed file for the month (data/private/staff/att/YYYY-MM/<id>.json):
 * when they signed in, when they were last seen (written every few minutes while the page is open), and how it ended (signed out, idle, shift end, lost).
 * A person writes only their own file, so records never collide; the people who manage staff read them for the live status, the payroll and the reports.
 * The shift clock (when the person's role has a shift) asks near the end whether to stay (the time after the end counts as overtime) and signs out when nobody answers.
 * Everything is best-effort: a failed write never stops the work. The times come from the device clock; a tab that is closed leaves the last "seen" as the end.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   The running record of this device
   ===================================================================== */
let att = null, attTimers = [];                 // { month, sid, cache: { data, sha }, stay, asked } · the interval ids
const ATTEND_KEEP = 300, attIso = () => new Date().toISOString();
const attAlive = (ping) => (ping * 2 + 3) * 60000;          // a person counts as online while their last "seen" is younger than this

// change this person's file for the month: fn edits the data in place. When another device of the same person saved first, read again and apply the same change.
async function attWrite(fn) {
  const u = session.user;
  for (let attempt = 0; ; attempt++) {
    if (!att.cache || attempt > 0) att.cache = await loadAtt(u.id, att.month);
    const c = att.cache, d = c.data;
    d.v = 1; d.uid = u.id; d.name = ostr(u.name || u.username, 80); d.role = ostr(u.owner ? 'owner' : u.role, 24); d.month = att.month;
    fn(d); if (d.sessions.length > ATTEND_KEEP) d.sessions = d.sessions.slice(-ATTEND_KEEP);
    try { c.sha = await putFile(attPath(u.id, att.month), await sealObj(d), 'Attendance', c.sha ? { sha: c.sha } : { create: true }); return; } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 2) { att.cache = null; continue; }
      throw e;
    }
  }
}

// inside the shift of this person's role right now? (a day off is outside)
function attInShift(pol, when) {
  if (!pol.shift) return true;
  if (!pol.workDays.includes(when.getDay())) return false;
  const m = when.getHours() * 60 + when.getMinutes();
  return m >= hhmmMin(pol.shift.start) && m < hhmmMin(pol.shift.end);
}
const attShiftEnd = (pol, when) => { const d = new Date(when.getFullYear(), when.getMonth(), when.getDate()); d.setMinutes(hhmmMin(pol.shift.end)); return d; };

// start recording when somebody has signed in (called by the router; does nothing twice)
async function attBegin() {
  if (!session || !session.user || session.attOn || (session.attTry && Date.now() - session.attTry < 60000)) return;
  session.attOn = true; session.attTry = Date.now();
  const sess = session;
  try {
    await loadSettings(); if (session !== sess) return;
    const u = session.user, pol = policyFor(u), now = new Date();
    if (!u.owner && pol.shift && pol.outside === 'block' && !attInShift(pol, now)) return attBlock(pol);
    att = { month: monthNow(), sid: uid(), cache: null, stay: false, asked: false };
    const iso = attIso(), alive = attAlive(pol.ping);
    await attWrite((d) => {
      for (const s of d.sessions) if (!s.out && now - new Date(s.seen || s.in) > alive) { s.out = s.seen || s.in; s.how = 'lost'; }          // an old record that nobody closed ends where it was last seen
      d.sessions.push({ id: att.sid, in: iso, seen: iso, out: '', how: '', shift: pol.shift ? pol.shift.id : '', stay: false });
    });
    attTimers.forEach(clearInterval);
    attTimers = [setInterval(attPing, pol.ping * 60000), setInterval(attShiftTick, 20000)];
  } catch (_) { session.attOn = false; att = null; }                                      // tried again later (the next screen), never in the way
}
async function attBlock(pol) {
  const u = session.user;
  audit({ area: 'session', act: 'forced', ref: u.id, title: u.name, note: ak('att.audit.outside', { s: pol.shift.start + '–' + pol.shift.end }) });
  await Promise.race([flushAudit(), sleep(2500)]);
  lock(true, 'outside');
}
async function attPing() {
  if (!att || !session || !session.master) return;
  try {
    if (monthNow() !== att.month) return attRoll();
    await attWrite((d) => { const s = d.sessions.find((x) => x.id === att.sid), iso = attIso(); if (s) { s.seen = iso; s.stay = att.stay; } else d.sessions.push({ id: att.sid, in: iso, seen: iso, out: '', how: '', shift: '', stay: att.stay }); });
  } catch (_) { /* the next ping tries again */ }
}
// the month changed while somebody worked: close this month's record and open the next one
async function attRoll() {
  const old = att, next = { month: monthNow(), sid: uid(), cache: null, stay: old.stay, asked: old.asked }, pol = policyFor(session.user);
  await attWrite((d) => { const s = d.sessions.find((x) => x.id === old.sid); if (s) { s.out = attIso(); s.how = 'month'; } });
  att = next;
  await attWrite((d) => { const iso = attIso(); d.sessions.push({ id: att.sid, in: iso, seen: iso, out: '', how: '', shift: pol.shift ? pol.shift.id : '', stay: att.stay }); });
}
// the end of this device's record: how = manual | idle | shift (a forced stop writes nothing: the keys are taken away)
async function attEnd(how) {
  attTimers.forEach(clearInterval); attTimers = [];
  if (!att || !session || !session.master) { att = null; return; }
  try { await attWrite((d) => { const s = d.sessions.find((x) => x.id === att.sid); if (s) { s.out = attIso(); s.seen = s.out; s.how = how; s.stay = att.stay; } }); } catch (_) { /* the last "seen" stays as the end */ }
  att = null;
}

/* =====================================================================
   The shift clock
   ===================================================================== */
function attShiftTick() {
  if (!att || !session || !session.user || att.asked) return;
  const pol = policyFor(session.user); if (!pol.closeAtEnd || !pol.shift || !pol.workDays.includes(new Date().getDay())) return;
  const end = attShiftEnd(pol, new Date()), now = Date.now();
  if (now < end.getTime() || now > end.getTime() + 12 * 3600000) return;
  att.asked = true; attAskStay(pol, end);
}
// "Your shift has ended": stay (the time that follows is overtime) or sign out; with no answer the sign-out happens after the grace time
function attAskStay(pol, end) {
  const left = pol.grace * 60000, until = Date.now() + left, text = h('p', { id: 'shiftText' }), dlg = h('dialog', { class: 'modal', id: 'shiftDlg', 'aria-labelledby': 'shiftTitle' });
  let tick = 0;
  const close = () => { clearInterval(tick); if (dlg.open) dlg.close(); dlg.remove(); };
  const out = () => { close(); lock(true, '', 'shift'); };
  const paint = () => { const s = Math.max(0, Math.round((until - Date.now()) / 1000)); text.textContent = t('att.shiftText', { e: pad2(end.getHours()) + ':' + pad2(end.getMinutes()), n: nf(Math.floor(s / 60)) + ':' + pad2(s % 60) }); if (s <= 0) out(); };
  dlg.append(h('div', { class: 'stack-sm' }, h('h2', { id: 'shiftTitle' }, t('att.shiftTitle')), text, h('div', { class: 'actions' },
    h('button', { class: 'btn primary', type: 'button', id: 'btnShiftStay', onclick: () => { att.stay = true; close(); toast(t('att.stayNote'), 'ok'); attPing(); } }, t('att.stay')),
    h('button', { class: 'btn', type: 'button', id: 'btnShiftOut', onclick: out }, t('att.signOut')))));
  dlg.addEventListener('cancel', (ev) => ev.preventDefault());
  document.body.append(dlg); paint(); tick = setInterval(paint, 1000); dlg.showModal();
}

/* =====================================================================
   Reading the records of everybody (the people who manage staff)
   ===================================================================== */
// every sign-in file of a month: [{ id, name, role, sessions }]
async function attReadMonth(month) {
  await needMaster(); const files = (await listDir(attDir(month))).filter((f) => /^[\w-]+\.json$/.test(f.name)), out = [];
  await pool(files, 4, async (f) => {
    try { const x = await getFile(f.path); const d = await openObj(x.text); out.push({ id: f.name.replace(/\.json$/, ''), name: ostr(d.name, 80), role: ostr(d.role, 24), sessions: oarr(d.sessions).map((s) => ({ id: ostr(s.id, 12), in: ostr(s.in, 30), seen: ostr(s.seen, 30), out: ostr(s.out, 30), how: ostr(s.how, 12), shift: ostr(s.shift, 12), stay: s.stay === true })).filter((s) => s.in) }); } catch (_) { /* one unreadable file does not stop the list */ }
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, locale()));
}
// one person's state from their sessions: online (a session without an end, seen lately), the last time seen, minutes worked today
function attState(sessions, ping) {
  const last = sessions.slice().sort((a, b) => String(a.in).localeCompare(String(b.in))).pop(), alive = attAlive(ping);
  const seen = last ? new Date(last.out || last.seen || last.in).getTime() : 0, online = !!last && !last.out && Date.now() - seen < alive;
  return { online, seen: seen || 0, since: last && !last.out ? last.in : '', how: last ? last.how : '' };
}
