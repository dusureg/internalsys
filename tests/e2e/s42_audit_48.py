"""Quality audit of the screens added in v4.8 (Labels & receipts), with the same rules as s20_audit (names on every control, tap targets, contrast in both themes, no sideways scroll,
keyboard focus): the five tabs of the Labels screen with everything selected (projects, parts, inventory, shipments, receipts), the designer open, the receipts filter, the scan result and the
menu with its new Production group. English and Arabic, dark and light, desktop and phone. Needs the data of the earlier suites (projects with parts, inventory, shipments, costs)."""
from lib import *
from s20_audit import AUDIT_JS, FOCUS_JS, HARD, set_look


def run(S):
    r, pg = S.r, S.admin
    findings, looked = {}, []
    on_dialog = lambda d: d.accept()                              # leaving a screen with changes asks first
    pg.on('dialog', on_dialog)

    def record(key, res):
        for rule, items in res.items():
            findings.setdefault(rule, {}).setdefault(key, []).extend(items)

    def go(h, sel, want=None):
        pg.evaluate(f'location.hash = "{h}"'); pg.wait_for_selector(sel, timeout=40000)
        if want: pg.wait_for_selector(want, timeout=15000)
        pg.evaluate("document.querySelectorAll('.toast').forEach((e) => e.remove())"); pg.wait_for_timeout(400)

    def everything():
        pg.click('#lkNone'); pg.click('#lkAll'); pg.wait_for_timeout(500)

    for key, vp, lang, theme in (('admin|desktop|en|dark', (1280, 900), 'en', 'dark'), ('admin|desktop|en|light', (1280, 900), 'en', 'light'),
                                 ('admin|phone|en|dark', (360, 740), 'en', 'dark'), ('admin|phone|ar|dark', (360, 740), 'ar', 'dark'), ('admin|phone|ar|light', (360, 740), 'ar', 'light')):
        pg.set_viewport_size({'width': vp[0], 'height': vp[1]}); set_look(pg, lang, theme); phone = vp[0] < 700
        opt = {'phone': phone}

        def look(name):
            looked.append(f'{key}|{name}'); record(f'{key}|{name}', pg.evaluate(AUDIT_JS, opt))

        go('#labels/project', '#lkPicker', '#lkTab-project[aria-selected=true]'); look('labels-first')
        everything(); look('labels-projects')
        pg.evaluate("document.getElementById('lkDesigner').open = true"); pg.wait_for_timeout(300); look('labels-designer')
        pg.evaluate("document.getElementById('lkDesigner').open = false")
        sku = pg.evaluate("() => store.items[0].rec.projects[0].sku")
        pg.fill('#lkScan', sku); pg.click('#lkScanGo')
        pg.wait_for_timeout(500); look('labels-scan-result')
        go('#labels/part', '#lkPicker', '#lkTab-part[aria-selected=true]'); everything(); look('labels-parts')
        go('#labels/inventory', '#lkPicker', '#lkTab-inventory[aria-selected=true]'); everything(); look('labels-inventory')
        go('#labels/shipment', '#lkPicker', '#lkTab-shipment[aria-selected=true]'); everything(); look('labels-shipments')
        go('#labels/receipt', '#lkPicker', '#lkTab-receipt[aria-selected=true]'); look('receipts-first')
        pg.fill('#lkFrom', ''); pg.fill('#lkTo', ''); pg.dispatch_event('#lkFrom', 'change'); pg.dispatch_event('#lkTo', 'change'); pg.click('#lkRcLoad'); pg.wait_for_selector('#lkPicker')
        pg.wait_for_timeout(500); everything(); look('receipts')
        go('#dashboard', '#btnNewClient'); look('menu-with-production-group')
        if key == 'admin|desktop|en|dark':                                       # keyboard: every stop of the first tab presses shows where the focus is
            for name, h, sel in (('labels', '#labels/project', '#lkPicker'), ('receipts', '#labels/receipt', '#lkRcLoad')):
                go(h, sel)
                pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.evaluate('window.scrollTo(0, 0)'); bad = []
                for _ in range(24):
                    pg.keyboard.press('Tab'); pg.wait_for_timeout(120); f = pg.evaluate(FOCUS_JS)
                    if f and not f['ring']:
                        bad.append(f['name'])
                record(f'{key}|{name}', {'focus-ring-missing': bad} if bad else {})
    pg.set_viewport_size({'width': 1280, 'height': 900}); set_look(pg, 'en', 'dark'); go('#dashboard', '#btnNewClient')
    pg.remove_listener('dialog', on_dialog)

    # =============================================================== verdict
    r.check('v4.8 screens audit: every screen was looked at (10 screens in each of 5 looks)', len(looked) == 50 and len(set(looked)) == 50, str(len(looked)))
    for rule in HARD:
        places = findings.get(rule, {})
        r.check(f'v4.8 screens audit [{rule}]: none ({sum(len(v) for v in places.values())} found)', not places, '; '.join(f'{k}: {v[:3]}' for k, v in list(places.items())[:4]))
