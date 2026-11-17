"""v4.7 Control: sessions and shifts by role, the sign-in records and the shift clock, feature switches, limits, the share address, the repository test.
Needs s01 (the administrator signed in) and works with the team of s15 (a new member is added here)."""
import datetime, json
from mockgh import ADMIN_URL, BASE, OWNER, REPO
from lib import *
from s15_team import member_login, add_member, routes

SET = 'data/private/settings.json'


def ctl(pg, expr):
    return pg.evaluate(expr)


def save_control(pg):
    pg.click('#btnSaveControl'); toast_text(pg, 'Control settings saved', 30000); pg.wait_for_selector('#ctlScreen')


def open_control(pg):
    pg.evaluate("location.hash = '#control'"); pg.wait_for_selector('#ctlRoleTable'); pg.wait_for_timeout(200)


def run(S):
    n0 = len(S.errors)
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ---- the sign-in record of the administrator
    mon = datetime.date.today().strftime('%Y-%m')
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnRefresh')
    pg.wait_for_function("() => typeof att !== 'undefined' && att && att.sid", timeout=30000)
    path = f'data/private/staff/att/{mon}/owner.json'
    r.check('signing in writes one record in the administrator\'s own file for the month, one folder per month', path in mock.files, str([p for p in mock.files if 'staff' in p]))
    raw = mock.text(path)
    r.check('the sign-in file is sealed (an envelope only, no name, time or role in the clear)', set(json.loads(raw)) == {'v', 'iv', 'ct'} and 'sessions' not in raw)
    recs = pg.evaluate("attReadMonth(monthNow())")
    me = [x for x in recs if x['id'] == 'owner']
    r.check('the record holds one open session that started a moment ago', len(me) == 1 and len(me[0]['sessions']) >= 1 and me[0]['sessions'][-1]['out'] == '' and me[0]['sessions'][-1]['in'], str(me)[:200])
    pg.evaluate("attPing()"); pg.wait_for_timeout(800)
    s_after = pg.evaluate("attReadMonth(monthNow())")
    r.check('a ping moves "last seen" forward in the same session (no second session)', len(s_after[0]['sessions']) == len(me[0]['sessions']) and s_after[0]['sessions'][-1]['seen'] >= me[0]['sessions'][-1]['seen'])
    pg.evaluate("location.hash = '#staff/presence'"); pg.wait_for_selector('#presTable')
    r.check('Presence shows the administrator as online with an hour count', 'Online' in pg.inner_text('#presTable') and pg.locator('#presTable tr[data-uid="owner"]').count() == 1)

    # ---- the Control screen
    open_control(pg)
    roles = pg.eval_on_selector_all('#ctlRoleTable tbody tr', 'els => els.map(e => e.dataset.role)')
    r.check('Control lists the administrator and every role, including the new IT role', roles[0] == 'owner' and 'it' in roles and 'manager' in roles and len(roles) >= 7, str(roles))
    r.check('the administrator\'s own sign-in cannot be refused outside a shift (no such choice is offered)', pg.locator('#ctlOutside-owner').count() == 0)
    r.check('the default idle time for the team is 30 minutes', pg.input_value('#ctlIdleDefault') == '30')
    r.check('the nav shows Staff & pay and Control for the administrator', all(x in routes(pg) for x in ('staff', 'control')), str(routes(pg)))

    # idle time for a role
    pg.fill('#ctlIdle-production', '7'); save_control(pg)
    r.check('the idle time of a role is saved into the settings', ctl(pg, "session.settings.control.roles.production.idle") == 7)
    r.check('the settings file is still sealed after saving control values', set(json.loads(mock.text(SET))) == {'v', 'iv', 'ct'} and 'production' not in mock.text(SET))
    r.check('idleMs() follows the role: 7 minutes for production, 30 for another team role, the device value for the administrator',
            ctl(pg, "[policyFor({ role: 'production' }).idleMin, policyFor({ role: 'sales' }).idleMin, policyFor({ owner: true }).idleMin]") == [7, 30, 0])

    # shifts: add one, give it to production, sign out at the end
    pg.click('#btnAddShift'); pg.fill('#shEn1', 'Evening'); pg.fill('#shAr1', 'مسائية'); pg.fill('#shStart1', '16:00'); pg.fill('#shEnd1', '23:00')
    pg.select_option('#ctlShift-production', index=2); pg.check('#ctlClose-production'); pg.fill('#ctlGrace-production', '1')
    save_control(pg)
    c = ctl(pg, "session.settings.control")
    r.check('two shifts are kept; production works the new one, signs out at its end with a one-minute grace', len(c['shifts']) == 2 and c['roles']['production']['shiftId'] == c['shifts'][1]['id'] and c['roles']['production']['closeAtEnd'] and c['roles']['production']['grace'] == 1, str(c)[:240])
    pg.fill('#shEnd1', '15:00'); pg.fill('#ctlIdleDefault', '30'); pg.click('#btnSaveControl'); pg.wait_for_timeout(600)
    r.check('a shift that ends before it starts is dropped by the settings (never saved as is)', len(ctl(pg, "session.settings.control.shifts")) == 1, str(ctl(pg, "session.settings.control.shifts")))
    open_control(pg)
    r.check('and the role that used it is left without a shift', ctl(pg, "session.settings.control.roles.production.shiftId") == '')

    # ---- the sections switches
    pg.uncheck('#feat-suppliers'); pg.uncheck('#feat-labels'); save_control(pg)
    pg.wait_for_function("() => !document.querySelector('#adminNav a[data-route=\"suppliers\"]')", timeout=10000)
    r.check('a switched-off section disappears from the menu', 'suppliers' not in routes(pg) and 'inventory' in routes(pg), str(routes(pg)))
    pg.evaluate("location.hash = '#suppliers'"); pg.wait_for_selector('#app .card.state')
    r.check('its address is refused for everybody, with the plain "no access" notice', 'do not have access' in pg.inner_text('#app'))
    open_control(pg); pg.check('#feat-suppliers'); pg.check('#feat-labels'); save_control(pg)
    pg.wait_for_selector('#adminNav a[data-route="suppliers"]', timeout=10000)
    r.check('switching it on again brings the section back, nothing was deleted', 'suppliers' in routes(pg))

    # ---- limits
    pg.fill('#ctlVideoMb', '9'); pg.fill('#ctlFileMb', '3'); pg.fill('#ctlAccessWatch', '45'); save_control(pg)
    r.check('the video and download limits and the access check interval are kept', ctl(pg, "[techNow().videoMb, techNow().fileMb, techNow().accessWatch]") == [9, 3, 45])
    pg.fill('#ctlVideoMb', '999'); pg.click('#btnSaveControl'); pg.wait_for_timeout(500)
    r.check('a value out of range falls back to the default (24 MB)', ctl(pg, "techNow().videoMb") == 24)
    open_control(pg); pg.fill('#ctlVideoMb', '24'); pg.fill('#ctlFileMb', '24'); pg.fill('#ctlAccessWatch', '120'); save_control(pg)

    # ---- the address of share links
    default_link = ctl(pg, "shareLink('DS-CL-1001')")
    r.check('share links are built from the address the page is served from', default_link == BASE + '#client/DS-CL-1001', default_link)
    open_control(pg); pg.fill('#ctlSiteUrl', 'https://portal.example.com/app'); pg.wait_for_timeout(200)
    r.check('the sample under the field shows the typed address at once', pg.inner_text('#ctlSample') == 'https://portal.example.com/app/#client/DS-CL-1001', pg.inner_text('#ctlSample'))
    save_control(pg)
    r.check('a typed address is used by every share link', ctl(pg, "shareLink('DS-CL-1001')") == 'https://portal.example.com/app/#client/DS-CL-1001')
    open_control(pg); pg.fill('#ctlSiteUrl', 'http://insecure.example.com/'); save_control(pg)
    r.check('an address that is not https:// is refused and the automatic one is used again', ctl(pg, "shareLink('DS-CL-1001')") == default_link)
    ctl(pg, "location.hash = '#manage/' + store.items[0].rec.id"); pg.wait_for_selector('#edName')
    r.check('the client editor shows the same link', default_link.replace('DS-CL-1001', '') in (pg.inner_text('main') + ' '.join(pg.eval_on_selector_all('input', 'els => els.map(e => e.value)'))))
    pg.evaluate("location.hash = '#control'"); pg.wait_for_selector('#ctlRoleTable')

    # ---- repository test
    pg.click('#btnTestRepo'); pg.wait_for_selector('#ctlTestOut li', timeout=30000); pg.wait_for_timeout(300)
    out = pg.inner_text('#ctlTestOut')
    r.check('the test names the repository and branch, says the token can write and counts the data folders', f'{OWNER}/{REPO}' in out and 'main' in out and 'can write' in out and 'data/private/ holds' in out and 'vault file is there' in out, out[:300])
    r.check('no token or password appears in the test output', 'github_pat' not in out and 'TESTTOKEN' not in out)
    r.check('the page says the data folder cannot be renamed here', 'data/' in pg.inner_text('#ctlAddress') and 'cannot be renamed' in pg.inner_text('#ctlAddress'))

    # ---- the History records the change in words that follow the reader's language
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audScreen, .aud-list, #audList', timeout=30000)
    pg.wait_for_function("() => document.body.innerText.includes('Control settings')", timeout=30000)
    r.check('the History shows "Control settings" for the saves above', 'Control settings' in pg.inner_text('main'))
    pg.click('#btnLang'); pg.wait_for_timeout(500)
    pg.wait_for_function("() => document.body.innerText.includes('إعدادات التحكم')", timeout=20000)
    r.check('the same entry reads in Arabic after switching the language (it is saved as a key, not as words)', 'إعدادات التحكم' in pg.inner_text('main'))
    pg.click('#btnLang'); pg.wait_for_timeout(400)
    r.check('and back in English', 'Control settings' in pg.inner_text('main'))

    # ---- a team member: shifts, idle time, the shift clock, the refusal outside the shift
    pg.evaluate("location.hash = '#team'"); pg.wait_for_selector('#teamScreen')
    pw = add_member(pg, 'Shift Worker', 'shift.worker', 'production'); pg.click('#btnCredDone')
    open_control(pg)
    now = datetime.datetime.now()
    start = (now - datetime.timedelta(minutes=30)).strftime('%H:%M'); end = (now - datetime.timedelta(minutes=2)).strftime('%H:%M')
    ok_time = now.hour >= 1 and now.weekday() != 4                       # a shift ending a few minutes ago needs the day to be past 00:30; Friday is a day off by default
    S.shift_ok = ok_time
    if ok_time:
        pg.fill('#shStart0', '00:00'); pg.fill('#shEnd0', end)
        pg.select_option('#ctlShift-production', index=1); pg.check('#ctlClose-production'); pg.fill('#ctlGrace-production', '1'); pg.fill('#ctlIdle-production', '7')
        save_control(pg)
    ctx, mp = member_login(S, 'shift.worker', pw)
    mp.wait_for_selector('#accountScreen', timeout=40000)
    mp.fill('#acOld', pw); mp.fill('#acNew', 'a much longer password 456'); mp.fill('#acNew2', 'a much longer password 456'); mp.click('#btnPwChange'); toast_text(mp, 'Password changed', 30000)
    mp.evaluate("location.hash = '#dashboard'"); mp.wait_for_selector('#btnRefresh', timeout=40000)
    mp.wait_for_function("() => typeof att !== 'undefined' && att && att.sid", timeout=30000)
    r.check('the member\'s sign-in is recorded in their own file (named by their id, not the administrator\'s)', any(p.startswith(f'data/private/staff/att/{mon}/') and not p.endswith('owner.json') for p in mock.files))
    r.check('the member has the idle time of their role (7 minutes) once the settings are read', ok_time is False or mp.evaluate("idleMs()") == 7 * 60000, str(mp.evaluate("idleMs()")))
    if ok_time:
        mp.evaluate("attShiftTick()"); mp.wait_for_selector('#shiftDlg', timeout=10000)
        r.check('when the shift has ended a dialog offers Stay or Sign out and counts down', mp.locator('#btnShiftStay').count() == 1 and mp.locator('#btnShiftOut').count() == 1 and 'signed out in' in mp.inner_text('#shiftText'))
        mp.click('#btnShiftStay'); toast_text(mp, 'Staying on', 10000)
        r.check('Stay closes the dialog and is remembered on the record (overtime follows from the times)', mp.locator('#shiftDlg').count() == 0 and mp.evaluate("att.stay") is True)
        mp.evaluate("att.asked = false; attShiftTick()"); mp.wait_for_selector('#shiftDlg', timeout=10000); mp.click('#btnShiftOut')
        mp.wait_for_selector('#tmUser, #lockPw', timeout=30000)
        r.check('Sign out ends the session at once and the member lands on the sign-in page', mp.locator('#shiftDlg').count() == 0 and mp.evaluate("session === null"))
        pg.evaluate("location.hash = '#staff/presence'"); pg.wait_for_selector('#presTable'); pg.click('#btnPresRefresh'); pg.wait_for_timeout(1200)
        row = pg.locator('#presTable tr', has_text='Shift Worker')
        r.check('Presence lists the member as offline with how the session ended (shift ended)', row.count() == 1 and 'Offline' in row.inner_text() and 'Shift ended' in row.text_content(), row.text_content() if row.count() else 'no row')
    ctx.close()

    # refused outside the shift
    open_control(pg)
    out_start, out_end = ('22:00', '23:00') if now.hour < 20 else ('01:00', '02:00')
    pg.fill('#shStart0', out_start); pg.fill('#shEnd0', out_end); pg.select_option('#ctlShift-production', index=1); pg.uncheck('#ctlClose-production'); pg.select_option('#ctlOutside-production', 'block')
    save_control(pg)
    ctx, mp = member_login(S, 'shift.worker', 'a much longer password 456')
    mp.wait_for_selector('#tmUser', timeout=40000); mp.wait_for_function("() => /shift/i.test(document.body.innerText) && document.querySelector('#tmErr, .msg, .notice, #lockNote')", timeout=40000)
    mp.wait_for_timeout(1500)
    r.check('signing in outside the shift is refused with a plain message and the person is signed out again', mp.evaluate("session === null") and 'only during your shift' in mp.inner_text('body'), mp.inner_text('body')[:200])
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_function("() => document.body.innerText.includes('outside the shift')", timeout=30000)
    r.check('the refusal is written to the History', 'Sign-in refused' in pg.inner_text('main'))
    ctx.close()
    open_control(pg)
    pg.select_option('#ctlOutside-production', 'allow'); pg.select_option('#ctlShift-production', ''); save_control(pg)
    pg.remove_listener('dialog', on_dialog)
    # a person's own sign-in file is written by this page and by the other sessions of the same person at the moment: GitHub answers 409 to the second writer and the app reads again and re-applies (the browser prints the 409 itself)
    S.errors[n0:] = [e for e in S.errors[n0:] if not (e[1] == 'error' and 'Failed to load resource' in e[2] and '409' in e[2])]
