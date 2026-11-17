/**
 * <admin>/js/views/control.js  -  Control: the technical settings (for the IT role and the administrator)
 * Sessions and shifts per role (idle time, shift, sign-out at the end, work outside the shift), the list of shifts, feature switches, upload and check limits,
 * the address that share links are built from, and a test of the repository connection. Saved into settings.control and settings.tech (sealed like every setting).
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Control
   ===================================================================== */
const FEAT_ICON = { suppliers: 'factory', inventory: 'box', logistics: 'truck', finance: 'coins', collections: 'calendar', contracting: 'doc', labels: 'tag', staff: 'users' };

async function renderControl(token) {
  try { await loadSettings(); if (!team) { try { await loadTeam(); } catch (_) { /* the built-in roles are listed */ } } } catch (e) { if (token === routeToken) mount(notice(t('err.load'), e.message, 'bad', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => route() }, t('act.retry'))] })); return; }
  if (token !== routeToken) return;
  drawControl();
}
function drawControl() {
  const ro = readOnly('technical'), c = clone(ctlNow()), tech = clone(techNow()), msg = h('p', { class: 'msg', id: 'ctlMsg', role: 'status', hidden: true });
  const say = (kind, text) => { msg.hidden = false; msg.className = 'msg ' + kind; msg.textContent = text; };
  const roles = [{ id: 'owner', name: t('team.owner') }].concat((team ? team.data.roles : BUILTIN_ROLES.map((id) => ({ id, name: '' }))).map((r) => ({ id: r.id, name: roleLabel(r) })));
  const n = (obj, key, id, o) => tin(obj, key, Object.assign({ id, type: 'number', num: true, step: 1, mode: 'numeric' }, o || {}));

  // ---- sessions and shifts of each role
  const shiftOpts = () => [['', t('ctl.noShift')]].concat(c.shifts.map((s) => [s.id, (L(s.name) || s.id) + ' · ' + s.start + '–' + s.end]));
  const syncShifts = () => {                    // the shift lists of the role rows follow the shifts being typed (a shift added, renamed or removed shows at once)
    for (const sel of document.querySelectorAll('#ctlRoleTable select[id^="ctlShift-"]')) {
      const keep = sel.value; sel.replaceChildren(...shiftOpts().map(([v, l]) => h('option', { value: v }, l))); sel.value = c.shifts.some((x) => x.id === keep) ? keep : '';
    }
  };
  const rolesCard = h('div', { class: 'card stack-sm', id: 'ctlRoles' }, h('h2', {}, t('ctl.rolesTitle')), h('p', { class: 'hint' }, t('ctl.rolesHint')),
    fld('ctl.idleDefault', n(c, 'idleDefault', 'ctlIdleDefault', { min: 5, max: 480 }), 'ctl.idleDefaultHint'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'tbl', id: 'ctlRoleTable' },
      h('thead', {}, h('tr', {}, h('th', {}, t('ctl.role')), h('th', {}, t('ctl.idle')), h('th', {}, t('ctl.shift')), h('th', {}, t('ctl.closeAtEnd')), h('th', {}, t('ctl.grace')), h('th', {}, t('ctl.outside')))),
      h('tbody', {}, roles.map((r) => {
        const x = c.roles[r.id] || (c.roles[r.id] = { idle: 0, shiftId: '', closeAtEnd: false, grace: 15, outside: 'allow' });
        return h('tr', { 'data-role': r.id }, h('td', {}, h('strong', {}, r.name)),
          h('td', {}, n(x, 'idle', 'ctlIdle-' + r.id, { min: 0, max: 480, label: t('ctl.idle') + ': ' + r.name })),
          h('td', {}, selectEl(shiftOpts(), x.shiftId, (v) => { x.shiftId = v; }, 'ctlShift-' + r.id, t('ctl.shift') + ': ' + r.name)),
          h('td', {}, h('input', { type: 'checkbox', id: 'ctlClose-' + r.id, checked: x.closeAtEnd, 'aria-label': t('ctl.closeAtEnd') + ': ' + r.name, onchange: (ev) => { x.closeAtEnd = ev.target.checked; } })),
          h('td', {}, n(x, 'grace', 'ctlGrace-' + r.id, { min: 0, max: 180, label: t('ctl.grace') + ': ' + r.name })),
          h('td', {}, r.id === 'owner' ? h('span', { class: 'muted small' }, t('ctl.ownerAlways')) : selectEl([['allow', t('ctl.outside.allow')], ['block', t('ctl.outside.block')]], x.outside, (v) => { x.outside = v; }, 'ctlOutside-' + r.id, t('ctl.outside') + ': ' + r.name)));
      })))), h('p', { class: 'hint' }, t('ctl.rolesNote')));

  // ---- the shifts themselves
  const shiftBox = h('div', { class: 'stack-sm', id: 'ctlShifts' });
  const drawShifts = () => {
    shiftBox.replaceChildren(...c.shifts.map((s, i) => h('div', { class: 'card inner stack-sm', 'data-shift': s.id },
      h('div', { class: 'grid2' }, fld('ctl.shiftEn', tin(s.name, 'en', { id: 'shEn' + i, max: 40, dir: 'ltr', on: syncShifts })), fld('ctl.shiftAr', tin(s.name, 'ar', { id: 'shAr' + i, max: 40, dir: 'rtl', on: syncShifts }))),
      h('div', { class: 'grid2' }, fld('ctl.shiftStart', tin(s, 'start', { id: 'shStart' + i, type: 'time', on: syncShifts })), fld('ctl.shiftEnd', tin(s, 'end', { id: 'shEnd' + i, type: 'time', on: syncShifts }), 'ctl.shiftEndHint')),
      h('div', { class: 'actions' }, h('button', { class: 'btn small danger', type: 'button', onclick: () => { c.shifts.splice(i, 1); for (const x of Object.values(c.roles)) if (x.shiftId === s.id) x.shiftId = ''; drawShifts(); syncShifts(); } }, t('act.remove'))))));
  };
  drawShifts();
  const shiftsCard = h('div', { class: 'card stack-sm' }, h('h2', {}, t('ctl.shiftsTitle')), h('p', { class: 'hint' }, t('ctl.shiftsHint')), shiftBox,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btnAddShift', onclick: () => { if (c.shifts.length >= SHIFTS_MAX) return say('bad', t('ctl.shiftMax', { n: SHIFTS_MAX })); c.shifts.push({ id: uid().slice(0, 6).toLowerCase(), name: { en: '', ar: '' }, start: '08:00', end: '16:00' }); drawShifts(); syncShifts(); } }, t('ctl.addShift'))));

  // ---- features and limits
  const feats = h('div', { class: 'checks', id: 'ctlFeatures' }, FEATURE_KEYS.map((k) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'feat-' + k, checked: tech.features[k] !== false, onchange: (ev) => { tech.features[k] = ev.target.checked; } }), h('span', {}, t('ctl.feat.' + k)))));
  const featCard = h('div', { class: 'card stack-sm' }, h('h2', {}, t('ctl.featTitle')), h('p', { class: 'hint' }, t('ctl.featHint')), feats);
  const limCard = h('div', { class: 'card stack-sm' }, h('h2', {}, t('ctl.limTitle')),
    h('div', { class: 'grid2' }, fld('ctl.videoMb', n(tech, 'videoMb', 'ctlVideoMb', { min: TECH_LIMIT.videoMb[0], max: TECH_LIMIT.videoMb[1] }), 'ctl.videoMbHint'), fld('ctl.fileMb', n(tech, 'fileMb', 'ctlFileMb', { min: TECH_LIMIT.fileMb[0], max: TECH_LIMIT.fileMb[1] }), 'ctl.fileMbHint')),
    fld('ctl.accessWatch', n(tech, 'accessWatch', 'ctlAccessWatch', { min: TECH_LIMIT.accessWatch[0], max: TECH_LIMIT.accessWatch[1] }), 'ctl.accessWatchHint'));

  // ---- share link address and repository test
  const sample = h('p', { class: 'small mono', id: 'ctlSample', dir: 'ltr' });
  const paintSample = () => { const d = String(tech.siteUrl || '').trim(); sample.textContent = (/^https:\/\/[^\s<>"']{3,190}$/.test(d) ? d.replace(/\/?$/, '/') : siteBaseAuto()) + '#client/DS-CL-1001'; };
  const site = fld('ctl.siteUrl', tin(tech, 'siteUrl', { id: 'ctlSiteUrl', dir: 'ltr', max: 200, mode: 'url', ph: 'https://portal.example.com/', on: paintSample }), 'ctl.siteUrlHint');
  const testOut = h('div', { class: 'stack-sm', id: 'ctlTestOut', 'aria-live': 'polite' });
  const test = async (ev) => {
    const b = ev.currentTarget; b.disabled = true; testOut.replaceChildren(h('p', { class: 'muted' }, t('ctl.testing')));
    const rows = [], row = (ok, text) => rows.push(h('li', { class: ok === true ? 'ok' : ok === false ? 'bad' : 'muted', 'data-ok': String(ok) }, (ok === true ? '✓ ' : ok === false ? '✗ ' : '• ') + text));
    try {
      const cfg = loadCfg(), repo = await gh(repoBase(cfg.user, cfg.repo));
      row(true, t('ctl.test.repo', { r: cfg.user + '/' + cfg.repo, b: repo.default_branch, v: repo.private ? t('ctl.test.private') : t('ctl.test.public') }));
      row(!!(repo.permissions && repo.permissions.push), repo.permissions && repo.permissions.push ? t('ctl.test.push') : t('ctl.test.nopush'));
      for (const d of ['data', 'data/private', 'data/clients', 'data/public']) { const l = await listDir(d); row(l.length ? true : null, t('ctl.test.dir', { d: d + '/', n: nf(l.length) })); }
      try { await getFile('data/private/vault.json'); row(true, t('ctl.test.vault')); } catch (e) { row(false, t('ctl.test.novault')); }
      try { const rl = await gh('/rate_limit'); row(null, t('ctl.test.rate', { n: nf(rl.resources.core.remaining), t: nf(rl.resources.core.limit) })); } catch (_) { /* optional */ }
      row(null, t('ctl.test.site', { u: siteBase() }));
    } catch (e) { row(false, e.message); }
    testOut.replaceChildren(h('ul', { class: 'plainlist testlist' }, rows)); b.disabled = false;
  };
  const addrCard = h('div', { class: 'card stack-sm', id: 'ctlAddress' }, h('h2', {}, t('ctl.addrTitle')), h('p', { class: 'hint' }, t('ctl.addrHint')), site, sample,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btnTestRepo', onclick: test }, t('ctl.testBtn')), isOwner() ? h('a', { class: 'btn', href: '#config', id: 'btnChangeRepo' }, t('ctl.changeRepo')) : null), testOut, h('p', { class: 'hint' }, t('ctl.dataFolder')));
  paintSample();

  const save = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try {
      await loadSettings(); const beforeC = clone(session.settings.control || defaultControl()), beforeT = clone(session.settings.tech || normTech(null)), nc = normControl(c), nt = normTech(tech);
      session.settings = Object.assign({}, session.settings, { control: nc, tech: nt }); await saveSettings();
      auditSave('settings', 'update', 'control', ak('ctl.auditTitle'), { c: beforeC, t: beforeT }, { c: nc, t: nt });
      armIdle(); route({ keep: true }); toast(t('ctl.saved'), 'ok');
    } catch (e) { say('bad', e.message); } finally { b.disabled = false; }
  };
  mount(h('section', { class: 'stack', id: 'ctlScreen' }, h('div', { class: 'page-head' }, h('h1', {}, t('ctl.title')), h('div', { class: 'actions' }, encBadge())), h('p', { class: 'hint' }, t('ctl.hint')),
    ...roWrap(ro, [rolesCard, shiftsCard, featCard, limCard, addrCard]), ro ? null : h('div', { class: 'savebar' }, msg, h('button', { class: 'btn primary', type: 'button', id: 'btnSaveControl', onclick: save }, t('ops.save')))));
}
