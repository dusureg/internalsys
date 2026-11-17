"""v4.7 costs into Finance: a shipment's cost counted as a direct or indirect cost (a switch on each shipment), guest expenses, and a discount on any expense.
Everything is measured as a change in the Finance totals for the current month, so the other suites' data does not matter."""
import datetime, json
from mockgh import ADMIN_URL
from lib import *
from s17_finance import num

MON = datetime.date.today().strftime('%Y-%m')
FIRST, TODAY = MON + '-01', datetime.date.today().isoformat()
LAST = (datetime.date(int(MON[:4]) + (int(MON[5:]) // 12), int(MON[5:]) % 12 + 1, 1) - datetime.timedelta(days=1)).isoformat()


def fin_totals(pg):
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000)
    pg.select_option('#finPreset', 'custom'); pg.wait_for_selector('#finCustom:not([hidden])'); pg.fill('#finFrom', FIRST); pg.fill('#finTo', LAST); pg.dispatch_event('#finTo', 'change')
    pg.click('#finTab-overview'); pg.wait_for_selector('#finBody .kpi'); pg.wait_for_timeout(300)
    k = {x.locator('.l').inner_text(): num(x.locator('.v').inner_text()) for x in pg.locator('#finBody .kpi').all()}
    return k['Direct cost'], k['Indirect cost'], k['Total operations cost']


def ship(pg, title, cost, fin=None, cancelled=False):
    pg.evaluate("location.hash = '#logistics/new'"); pg.wait_for_selector('#lgTitle')
    pg.fill('#lgTitle', title); pg.fill('#lgEta', TODAY); pg.fill('#lgCost', str(cost))
    if fin is not None:
        pg.select_option('#lgFin', fin)
    if cancelled:
        pg.check('#lgCancelled')
    save(pg)
    return pg.evaluate('location.hash').split('/')[-1]


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    d0, i0, t0 = fin_totals(pg)

    # ---- shipments
    pg.evaluate("location.hash = '#logistics/new'"); pg.wait_for_selector('#lgFin')
    r.check('a new shipment counts its cost as a direct cost by default', pg.input_value('#lgFin') == 'direct')
    r.check('the switch offers "Not counted", "As a direct cost" and "As an indirect cost"', pg.eval_on_selector_all('#lgFin option', 'els => els.map(e => e.textContent)') == ['Not counted', 'As a direct cost', 'As an indirect cost'])
    L1 = ship(pg, 'Feed freight direct', 1200)
    d1, i1, t1 = fin_totals(pg)
    r.check('1,200 of freight raises the direct cost by exactly 1,200 and the total with it', abs(d1 - d0 - 1200) < 0.011 and abs(i1 - i0) < 0.011 and abs(t1 - t0 - 1200) < 0.011, f'{(d0, i0, t0)} -> {(d1, i1, t1)}')
    pg.click('#finTab-expenses'); pg.wait_for_selector('#expList')
    r.check('the ledger shows it with a "Shipment" badge and an Open button to the shipment', pg.locator(f'#expList tr:has(a[href="#logistics/{L1}"]) [data-feed="shipment"]').count() == 1 and pg.locator(f'#expList a[href="#logistics/{L1}"]').count() == 1, str(pg.locator(f'#expList a[href="#logistics/{L1}"]').count()))
    L2 = ship(pg, 'Feed freight indirect', 500, 'indirect')
    d2, i2, t2 = fin_totals(pg)
    r.check('freight set as indirect raises the indirect cost by 500 and leaves the direct cost alone', abs(i2 - i1 - 500) < 0.011 and abs(d2 - d1) < 0.011, f'{(d1, i1)} -> {(d2, i2)}')
    L3 = ship(pg, 'Feed freight off', 700, 'none')
    d3, i3, t3 = fin_totals(pg)
    r.check('freight set to "Not counted" changes nothing in Finance', abs(t3 - t2) < 0.011)
    L4 = ship(pg, 'Feed freight cancelled', 900, 'direct', cancelled=True)
    d4, i4, t4 = fin_totals(pg)
    r.check('a cancelled shipment is never counted, whatever the switch says', abs(t4 - t3) < 0.011)
    pg.evaluate("location.hash = '#logistics/" + L1 + "'"); pg.wait_for_selector('#lgFin'); pg.select_option('#lgFin', 'none'); save(pg)
    d5, i5, t5 = fin_totals(pg)
    r.check('switching a shipment off later takes its cost out again', abs(t4 - t5 - 1200) < 0.011, f'{t4} -> {t5}')
    pg.evaluate("location.hash = '#logistics/" + L1 + "'"); pg.wait_for_selector('#lgFin'); pg.select_option('#lgFin', 'direct'); save(pg)
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000)

    # ---- guest expenses and discounts
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000); pg.click('#finTab-expenses'); pg.wait_for_selector('#btnNewGuest')
    base_d, base_i, base_t = fin_totals(pg)
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen'); pg.click('#finTab-expenses'); pg.click('#btnNewGuest'); pg.wait_for_selector('#expName')
    r.check('"Guest expense" opens an expense already set to an indirect cost in the Hospitality category', pg.input_value('#expKindSel') == 'indirect' and pg.input_value('#expCatSel') == 'hospitality', f"{pg.input_value('#expKindSel')} {pg.input_value('#expCatSel')}")
    pg.fill('#expName', 'Tea and sweets for the visit'); pg.fill('#expAmount', '300'); pg.fill('#expDiscount', '50'); pg.fill('#expDate', TODAY); pg.wait_for_timeout(150)
    r.check('the form shows what will be counted after the discount', 'EGP 250.00' in pg.inner_text('#expNet').replace('\xa0', ' '), pg.inner_text('#expNet'))
    save(pg)
    gid = pg.evaluate('location.hash').split('/')[-1]
    nd, ni, nt = fin_totals(pg)
    r.check('Finance counts the net 250, not the 300 on the invoice', abs(ni - base_i - 250) < 0.011 and abs(nd - base_d) < 0.011, f'{base_i} -> {ni}')
    pg.click('#finTab-expenses'); pg.wait_for_selector('#expList')
    r.check('the ledger shows the discount beside the name', 'discount EGP 50.00' in pg.inner_text('#expList').replace('\xa0', ' '), pg.inner_text('#expList')[:200])
    pg.evaluate("location.hash = '#expenses/" + gid + "'"); pg.wait_for_selector('#expDiscount'); pg.fill('#expDiscount', '999'); save(pg)
    pg.evaluate("location.hash = '#expenses/" + gid + "'"); pg.wait_for_selector('#expDiscount')
    r.check('a discount larger than the amount is cut to the amount (the net is never below zero)', pg.input_value('#expDiscount') == '300' and 'EGP 0.00' in pg.inner_text('#expNet').replace('\xa0', ' '), f"{pg.input_value('#expDiscount')} {pg.inner_text('#expNet')}")
    pg.evaluate("location.hash = '#finance'")
    pg.evaluate("location.hash = '#expenses/" + gid + "'"); pg.wait_for_selector('#btnOpsDelete'); pg.click('#btnOpsDelete'); pg.wait_for_function("() => location.hash === '#finance'", timeout=20000)

    # ---- the History says what changed without a token left over
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_function("() => document.body.innerText.includes('Feed freight')", timeout=30000)
    txt = pg.inner_text('main')
    r.check('the History shows the shipments and the expense, and no raw "@" key anywhere', 'Feed freight direct' in txt and '@' not in txt.replace('@@', ''), txt[:200])
    pg.remove_listener('dialog', on_dialog)
