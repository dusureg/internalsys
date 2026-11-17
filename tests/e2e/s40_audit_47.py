"""Quality audit of the screens and parts added in v4.7, with the same rules as s20_audit (names on every control, tap targets, contrast in both themes, no sideways scroll,
keyboard focus): Control (with the repository test open), Staff & pay (Presence, People, one person, Rules), the Payroll sheet with its day sheet and a person's card, the Payroll report,
the Finance ledger with its source filter, the guest expense and the shipment form with its cost switch. English and Arabic, dark and light, desktop and phone.
Needs s36 to s39 (the people and the month's entries of s37)."""
import datetime
from lib import *
from s20_audit import AUDIT_JS, FOCUS_JS, HARD, set_look

MON = datetime.date.today().strftime('%Y-%m')


def run(S):
    r, pg = S.r, S.admin
    findings = {}
    on_dialog = lambda d: d.accept()                              # leaving a screen with changes asks first
    pg.on('dialog', on_dialog)

    def record(key, res):
        for rule, items in res.items():
            findings.setdefault(rule, {}).setdefault(key, []).extend(items)

    def go(h, sel):
        pg.evaluate(f'location.hash = "{h}"'); pg.wait_for_selector(sel, timeout=40000); pg.wait_for_timeout(300)

    for key, vp, lang, theme in (('admin|desktop|en|dark', (1280, 900), 'en', 'dark'), ('admin|desktop|en|light', (1280, 900), 'en', 'light'),
                                 ('admin|phone|en|dark', (360, 740), 'en', 'dark'), ('admin|phone|ar|dark', (360, 740), 'ar', 'dark'), ('admin|phone|ar|light', (360, 740), 'ar', 'light')):
        pg.set_viewport_size({'width': vp[0], 'height': vp[1]}); set_look(pg, lang, theme); phone = vp[0] < 700
        opt = {'phone': phone}

        def look(name):
            record(f'{key}|{name}', pg.evaluate(AUDIT_JS, opt))

        go('#control', '#ctlRoleTable'); look('control')
        pg.click('#btnTestRepo'); pg.wait_for_selector('#ctlTestOut li', timeout=40000); pg.wait_for_timeout(300); look('control-repository-test')
        go('#staff', '#presTable'); look('staff-presence')
        go('#staff/people', '#pplList table'); look('staff-people')
        go('#people/new', '#pplName'); look('person-new')
        go('#staff/rules', '#ruleOtDay'); look('staff-rules')
        go(f'#staff/payroll/{MON}', '#payTable'); look('payroll-sheet')
        rows = pg.locator('#payTable tr[data-id]')
        if rows.count():
            pid = rows.first.get_attribute('data-id')
            if pg.locator('#personPay').count() == 0:                            # the card of the last person opened stays open between visits (a second click would close it)
                pg.click(f'button[data-pid="{pid}"]')
            pg.wait_for_selector('#personPay', timeout=20000); pg.wait_for_timeout(300); look('payroll-person')
        go('#reports/payroll', '#rpPaper .rp-tbl'); look('report-payroll')
        go('#finance', '#finScreen'); pg.click('#finTab-expenses'); pg.wait_for_selector('#expList'); pg.wait_for_timeout(300); look('finance-ledger')
        pg.click('#btnNewGuest'); pg.wait_for_selector('#expName'); pg.wait_for_timeout(200); look('guest-expense')
        go('#logistics/new', '#lgFin'); look('shipment-cost-switch')
        go('#dashboard', '#btnNewClient')
        if key == 'admin|desktop|en|dark':                                       # keyboard: every stop of the first tab presses shows where the focus is
            for name, h, sel in (('control', '#control', '#ctlScreen'), ('staff', '#staff', '#presTable'), ('payroll', f'#staff/payroll/{MON}', '#payTable')):
                go(h, sel)
                pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.evaluate('window.scrollTo(0, 0)'); bad = []
                for _ in range(16):
                    pg.keyboard.press('Tab'); pg.wait_for_timeout(150); f = pg.evaluate(FOCUS_JS)
                    if f and not f['ring']:
                        bad.append(f['name'])
                record(f'{key}|{name}', {'focus-ring-missing': bad} if bad else {})
    pg.set_viewport_size({'width': 1280, 'height': 900}); set_look(pg, 'en', 'dark'); go('#dashboard', '#btnNewClient')
    pg.remove_listener('dialog', on_dialog)

    # =============================================================== verdict
    for rule in HARD:
        places = findings.get(rule, {})
        r.check(f'v4.7 screens audit [{rule}]: none ({sum(len(v) for v in places.values())} found)', not places, '; '.join(f'{k}: {v[:3]}' for k, v in list(places.items())[:4]))
