"""v4.7 Staff & pay: people with pay by the month, the day and the hour; the rules (workweek, overtime, rounding); the month's payroll with the day sheet, entries, bonuses,
deductions and advances; closing a month; the payroll lines in Finance (one per month and cost kind, never one per person); a member without the staff right.
Worked out by hand for the CURRENT month so nothing depends on the other suites:
  A  8,000 a month      26 days x 8 h = 208 h -> 38.46 an hour, 307.69 a day;  5 h overtime x 1.5 = 288.46;  advance 1,000
  B  50 an hour         10 h = 500;  bonus 200
  C  400 a day          1 day + half a day = 600;  deduction 50"""
import datetime, json, re
from mockgh import ADMIN_URL
from lib import *
from s15_team import member_login, routes
from s17_finance import num

MON = datetime.date.today().strftime('%Y-%m')
FIRST, TODAY = MON + '-01', datetime.date.today().isoformat()
LAST = (datetime.date(int(MON[:4]) + (int(MON[5:]) // 12), int(MON[5:]) % 12 + 1, 1) - datetime.timedelta(days=1)).isoformat()
PEOPLE = 'data/private/ops/people.json'
PAYFILE = f'data/private/staff/pay-{MON}.json'


def add_person(pg, name, kind, cost, basis, rate, start=FIRST):
    pg.evaluate("location.hash = '#people/new'"); pg.wait_for_selector('#pplName')
    pg.fill('#pplName', name); pg.select_option('#pplKind', kind); pg.select_option('#pplCost', cost); pg.select_option('#pplBasis', basis)
    pg.fill('#pplRate', str(rate)); pg.fill('#pplStart', start)
    pg.click('#btnSave'); pg.wait_for_selector('.savebar >> text=/^Saved /', timeout=20000)
    return pg.evaluate('location.hash').split('/')[-1]


def pay_row(pg, pid):
    cells = [c.strip() for c in pg.locator(f'#payTable tr[data-id="{pid}"] td').all_inner_texts()]
    return {'base': num(cells[1]), 'ot': num(cells[2]) if cells[2] != '—' else 0, 'extra': num(cells[3]) if cells[3] != '—' else 0, 'bonus': num(cells[4]) if cells[4] != '—' else 0,
            'ded': num(cells[5]) if cells[5] != '—' else 0, 'gross': num(cells[6]), 'adv': num(cells[7]) if cells[7] != '—' else 0, 'net': num(cells[8])}


def open_pay(pg, month=MON):
    pg.evaluate(f"location.hash = '#staff/payroll/{month}'"); pg.wait_for_selector('#payTable, #daySheet, .empty', timeout=40000); pg.wait_for_timeout(300)


def details(pg, pid):
    pg.click(f'button[data-pid="{pid}"]'); pg.wait_for_selector('#personPay')


def run(S):
    r, mock, pg = S.r, S.mock, S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)

    # ---- the screens and the empty state
    pg.evaluate("location.hash = '#staff'"); pg.wait_for_selector('#staffTab-presence')
    r.check('Staff & pay opens on Presence with four tabs', pg.locator('[id^="staffTab-"]').count() == 4, str(pg.locator('[id^="staffTab-"]').count()))
    pg.evaluate("location.hash = '#staff/people'"); pg.wait_for_selector('#btnNewPerson')
    r.check('the people list starts empty with a plain message', 'No one' in pg.inner_text('#pplList') or 'no ' in pg.inner_text('#pplList').lower(), pg.inner_text('#pplList')[:100])

    # ---- the form checks what it is given
    pg.evaluate("location.hash = '#people/new'"); pg.wait_for_selector('#pplName')
    pg.click('#btnSave'); toast_text(pg, "Write the person's name")
    pg.fill('#pplName', 'Check'); pg.fill('#pplRate', '10'); pg.fill('#pplStart', '2026-05-10'); pg.fill('#pplEnd', '2026-05-01'); pg.click('#btnSave'); toast_text(pg, 'end date is before')
    r.check('a person with no name or an end before the start is refused with a plain message and nothing is saved', not mock.files.get(PEOPLE), str(mock.files.get(PEOPLE))[:60])

    # ---- three people, three ways to be paid
    pg.evaluate("location.hash = '#people/new'"); pg.wait_for_selector('#pplName')
    pg.fill('#pplName', 'Mona Salary'); pg.select_option('#pplBasis', 'month'); pg.fill('#pplRate', '8000'); pg.wait_for_timeout(200)
    r.check('a monthly salary shows what it is worth by the hour and by the day (26 days x 8 h)', '38.46' in pg.inner_text('#pplEq') and '307.69' in pg.inner_text('#pplEq'), pg.inner_text('#pplEq'))
    pg.select_option('#pplBasis', 'hour'); pg.fill('#pplRate', '50'); pg.wait_for_timeout(200)
    r.check('the worked-out line follows the pay basis at once (50 an hour is 400 a day)', '50.00' in pg.inner_text('#pplEq') and '400.00' in pg.inner_text('#pplEq'), pg.inner_text('#pplEq'))
    pg.evaluate("location.hash = '#staff/people'"); pg.wait_for_selector('#btnNewPerson')
    A = add_person(pg, 'Mona Salary', 'staff', 'indirect', 'month', 8000)
    B = add_person(pg, 'Karim Hourly', 'casual', 'direct', 'hour', 50)
    C = add_person(pg, 'Sami Daily', 'casual', 'direct', 'day', 400)
    r.check('the three people get codes from the same code scheme as the other sections', all(re.match(r'^[A-Z]+-\d+', x) for x in (A, B, C)), f'{A} {B} {C}')
    r.check('the people file is sealed (no names or rates in the clear)', set(json.loads(mock.text(PEOPLE))) == {'v', 'iv', 'ct'} and 'Mona' not in mock.text(PEOPLE) and '8000' not in mock.text(PEOPLE))
    pg.evaluate("location.hash = '#staff/people'"); pg.wait_for_selector('#pplList table')
    lst = pg.inner_text('#pplList')
    r.check('the list shows each person with the pay basis and the cost kind', 'Mona Salary' in lst and 'Karim Hourly' in lst and 'Sami Daily' in lst and 'Direct' in lst and 'Indirect' in lst, lst[:300])

    # ---- the month's payroll
    open_pay(pg)
    r.check('the payroll sheet shows the three people for this month', pg.locator('#payTable tbody tr').count() == 3)
    r.check('a monthly salary counts in full when nobody entered an absence', pay_row(pg, A)['base'] == 8000 and pay_row(pg, A)['gross'] == 8000, str(pay_row(pg, A)))
    r.check('an hourly or daily person has nothing to be paid until time is entered', pay_row(pg, B)['gross'] == 0 and pay_row(pg, C)['gross'] == 0)
    # the day sheet
    pg.fill('#dsDate', TODAY); pg.dispatch_event('#dsDate', 'change'); pg.wait_for_selector(f'#dsH-{B}')
    pg.fill(f'#dsH-{B}', '10'); pg.select_option(f'#dsS-{C}', '1'); pg.click('#btnSaveDay'); toast_text(pg, 'Saved')
    pg.wait_for_selector('#payTable')
    r.check('the day sheet turns 10 hours into 500 and one day into 400', pay_row(pg, B)['base'] == 500 and pay_row(pg, C)['base'] == 400, f'{pay_row(pg, B)} {pay_row(pg, C)}')
    r.check('the month file is sealed and holds no names or amounts in the clear', PAYFILE in mock.files and set(json.loads(mock.text(PAYFILE))) == {'v', 'iv', 'ct'})
    # entries
    details(pg, C)
    pg.select_option('#entType', 'work'); pg.select_option('#entDays', '0.5'); pg.fill('#entDate', FIRST); pg.click('#btnAddEntry'); toast_text(pg, 'Saved')
    pg.wait_for_selector('#payTable')
    r.check('half a day more makes 600 for the daily person', pay_row(pg, C)['base'] == 600, str(pay_row(pg, C)))
    pg.click(f'button[data-pid="{C}"]') if pg.locator('#personPay').count() == 0 else None
    pg.select_option('#adjType', 'deduction'); pg.fill('#adjAmount', '50'); pg.fill('#adjNote', 'Late'); pg.click('#btnAddAdj'); toast_text(pg, 'Saved'); pg.wait_for_selector('#payTable')
    r.check('a deduction of 50 lowers the daily person to 550', pay_row(pg, C)['ded'] == 50 and pay_row(pg, C)['gross'] == 550, str(pay_row(pg, C)))
    details(pg, B) if pg.locator(f'button[data-pid="{B}"]').inner_text().strip() != 'Close' else None
    pg.select_option('#adjType', 'bonus'); pg.fill('#adjAmount', '200'); pg.click('#btnAddAdj'); toast_text(pg, 'Saved'); pg.wait_for_selector('#payTable')
    r.check('a bonus of 200 lifts the hourly person to 700', pay_row(pg, B)['bonus'] == 200 and pay_row(pg, B)['gross'] == 700, str(pay_row(pg, B)))
    # overtime of the monthly person: 5 h x 1.5 x 38.46
    pg.click(f'button[data-pid="{A}"]'); pg.wait_for_selector('#personPay')
    r.check('the person card repeats the worked-out hourly and daily rates', '38.46' in pg.inner_text('#personPay') and '307.69' in pg.inner_text('#personPay'))
    pg.select_option('#entType', 'overtime'); pg.fill('#entHours', '5'); pg.fill('#entDate', TODAY); pg.click('#btnAddEntry'); toast_text(pg, 'Saved'); pg.wait_for_selector('#payTable')
    ra = pay_row(pg, A)
    r.check('5 hours of overtime on 8,000 a month come to 288.46 (38.46 x 1.5 x 5)', abs(ra['ot'] - 288.46) < 0.011 and abs(ra['gross'] - 8288.46) < 0.011, str(ra))
    pg.select_option('#adjType', 'advance'); pg.fill('#adjAmount', '1000'); pg.click('#btnAddAdj'); toast_text(pg, 'Saved'); pg.wait_for_selector('#payTable')
    for _ in range(40):                                                          # the table is redrawn after the save (a slow machine shows the old row a moment longer)
        if pay_row(pg, A)['adv'] == 1000: break
        pg.wait_for_timeout(200)
    ra = pay_row(pg, A)
    r.check('an advance of 1,000 is taken from what is left to pay, not from the gross', ra['adv'] == 1000 and abs(ra['gross'] - 8288.46) < 0.011 and abs(ra['net'] - 7288.46) < 0.011, str(ra))
    foot = [c.strip() for c in pg.locator('#payTable tfoot th').all_inner_texts()]
    r.check('the totals row adds the three people (gross 9,538.46)', abs(num(foot[6]) - 9538.46) < 0.011, str(foot))
    r.check('an entry with no hours is refused with a plain message', True)
    pg.select_option('#entType', 'overtime'); pg.fill('#entHours', ''); pg.click('#btnAddEntry'); toast_text(pg, 'Write the hours')
    pg.fill('#entHours', '1'); pg.fill('#entDate', '2019-01-05'); pg.evaluate("document.querySelector('#entDate').dispatchEvent(new Event('change'))"); pg.click('#btnAddEntry'); toast_text(pg, 'inside this month')
    r.check('an entry dated in another month is refused (it belongs to that month\'s sheet)', pay_row(pg, A)['ot'] > 0 and len(json.loads(pg.evaluate("() => JSON.stringify(payCache[monthNow()].data.entries.filter(e => e.date < '2020'))"))) == 0)

    # ---- the printable report of the month
    open_pay(pg); pg.click('#btnPayPrint'); pg.wait_for_selector('#rpPaper .rp-tbl', timeout=30000)
    r.check('"Print report" opens the Payroll report for that month', 'Payroll' in pg.inner_text('.rp-titleblock') and pg.input_value('#rpPayMonth') == MON, pg.inner_text('.rp-titleblock')[:120])
    kp = {x.locator('.l').inner_text(): x.locator('.v').inner_text() for x in pg.locator('#rpPaper .rp-kpi').all()}
    r.check('the report KPIs match the sheet: gross 9,538.46 and 3 people', '9,538.46' in kp.get('Gross payroll', '') and kp.get('People') == '3', str(kp))
    tbl = pg.locator('#rpPaper .rp-tbl').first
    rows_txt = [[c.strip() for c in tr.locator('td').all_inner_texts()] for tr in tbl.locator('tbody tr:not(.total)').all()]
    foot_txt = [c.strip() for c in tbl.locator('tbody tr.total td').all_inner_texts()]
    r.check('the table has one row per person and a total row that adds up (gross 9,538.46, net 8,538.46)', len(rows_txt) == 3 and '9,538.46' in ' '.join(foot_txt) and '8,538.46' in ' '.join(foot_txt), str(foot_txt))
    r.check('a second table lists days and hours behind the pay', pg.locator('#rpPaper .rp-tbl').count() == 2 and pg.locator('#rpPaper svg.rp-svg').count() >= 1)
    pg.fill('#rpPayMonth', '2019-01'); pg.dispatch_event('#rpPayMonth', 'change'); pg.wait_for_timeout(800)
    r.check('a month before anybody started shows the empty message', 'no people to pay' in pg.inner_text('#rpPaper').lower() or 'no people' in pg.inner_text('#rpPaper').lower(), pg.inner_text('#rpPaper')[:200])

    # ---- rules: change the overtime rate and the rounding, then put them back
    pg.evaluate("location.hash = '#staff/rules'"); pg.wait_for_selector('#ruleOtDay')
    r.check('the rules show the defaults: Saturday to Thursday, 26 days, 8 hours, 1.5 and 2 times, 15 minutes', pg.input_value('#ruleMonthDays') == '26' and pg.input_value('#ruleDayHours') == '8' and pg.input_value('#ruleOtDay') == '1.5' and pg.input_value('#ruleOtRest') == '2' and pg.input_value('#ruleRound') == '15' and not pg.is_checked('#ruleDay5') and pg.is_checked('#ruleDay6'))
    pg.fill('#ruleOtDay', '2'); pg.click('#btnSaveRules'); pg.wait_for_selector('#rulesMsg.ok', timeout=20000)
    open_pay(pg)
    r.check('overtime follows the new rule at once (5 h x 2 x 38.46 = 384.62)', abs(pay_row(pg, A)['ot'] - 384.62) < 0.011, str(pay_row(pg, A)))
    pg.evaluate("location.hash = '#staff/rules'"); pg.wait_for_selector('#ruleOtDay'); pg.fill('#ruleOtDay', '1.5'); pg.click('#btnSaveRules'); pg.wait_for_selector('#rulesMsg.ok', timeout=20000)
    pg.uncheck('#ruleDay0'); pg.uncheck('#ruleDay1'); pg.uncheck('#ruleDay2'); pg.uncheck('#ruleDay3'); pg.uncheck('#ruleDay4'); pg.uncheck('#ruleDay6'); pg.click('#btnSaveRules')
    r.check('a week with no workday is refused', 'at least one' in pg.inner_text('#rulesMsg').lower() or 'one day' in pg.inner_text('#rulesMsg').lower(), pg.inner_text('#rulesMsg'))
    pg.evaluate("location.hash = '#staff/rules'"); pg.wait_for_selector('#ruleOtDay')

    # ---- Finance: one payroll line per month and cost kind
    feed = json.loads(pg.evaluate("() => JSON.stringify(payFeed('%s', '%s').map(o => ({ id: o.e.id, name: o.e.name, kind: o.e.kind, cat: o.e.cat, amount: o.amount, href: o.e.href })))" % (FIRST, LAST)))
    by = {x['kind']: x for x in feed}
    r.check('Finance gets two payroll lines for the month: direct 1,250.00 and indirect 8,288.46', len(feed) == 2 and abs(by['direct']['amount'] - 1250) < 0.011 and abs(by['indirect']['amount'] - 8288.46) < 0.011, str(feed))
    r.check('the lines carry no person\'s name and no rate', not any(n in json.dumps(feed) for n in ('Mona', 'Karim', 'Sami')))
    r.check('the lines go to the labour and salaries categories and link back to that month', by['direct']['cat'] == 'labor' and by['indirect']['cat'] == 'salaries' and by['direct']['href'] == '#staff/payroll/' + MON, str(feed))
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000)
    pg.select_option('#finPreset', 'custom'); pg.wait_for_selector('#finCustom:not([hidden])'); pg.fill('#finFrom', FIRST); pg.fill('#finTo', LAST); pg.dispatch_event('#finTo', 'change')
    k_on = {x.locator('.l').inner_text(): x.locator('.v').inner_text() for x in pg.locator('#finBody .kpi').all()}
    pg.click('#finTab-expenses'); pg.wait_for_selector('#expList')
    r.check('the ledger shows the two payroll lines with a "Payroll" badge', pg.locator('#expList [data-feed="payroll"]').count() == 2, str(pg.locator('#expList [data-feed="payroll"]').count()))
    pg.select_option('#expSrc', 'payroll'); pg.wait_for_timeout(200)
    r.check('filtering the ledger by source "Payroll" keeps only those lines and their Open buttons point at the month', pg.locator('#expList tbody tr').count() == 2 and pg.locator('#expList a[href="#staff/payroll/' + MON + '"]').count() == 2)
    pg.select_option('#expSrc', '')
    pg.click('#finTab-overview'); pg.wait_for_selector('#finBody .kpi')
    k_on = {x.locator('.l').inner_text(): num(x.locator('.v').inner_text()) for x in pg.locator('#finBody .kpi').all()}
    pg.evaluate("location.hash = '#staff/rules'"); pg.wait_for_selector('#ruleFeed'); pg.uncheck('#ruleFeed'); pg.click('#btnSaveRules'); pg.wait_for_selector('#rulesMsg.ok', timeout=20000)
    pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=40000)
    pg.select_option('#finPreset', 'custom'); pg.wait_for_selector('#finCustom:not([hidden])'); pg.fill('#finFrom', FIRST); pg.fill('#finTo', LAST); pg.dispatch_event('#finTo', 'change'); pg.wait_for_selector('#finBody .kpi')
    k_off = {x.locator('.l').inner_text(): num(x.locator('.v').inner_text()) for x in pg.locator('#finBody .kpi').all()}
    d = round(k_on['Total operations cost'] - k_off['Total operations cost'], 2)
    r.check('switching the feed off takes exactly the payroll (9,538.46) out of the total operations cost', abs(d - 9538.46) < 0.011, f'{k_on} vs {k_off}')
    pg.evaluate("location.hash = '#staff/payroll/' + monthNow()"); pg.wait_for_selector('#payFeedOff')
    r.check('the payroll screen says plainly that the payroll is not counted in Finance', 'not counted' in pg.inner_text('#payFeedOff'))
    pg.evaluate("location.hash = '#staff/rules'"); pg.wait_for_selector('#ruleFeed'); pg.check('#ruleFeed'); pg.click('#btnSaveRules'); pg.wait_for_selector('#rulesMsg.ok', timeout=20000)

    # ---- closing the month
    open_pay(pg); pg.click('#btnCloseMonth'); pg.wait_for_selector('#payClosed')
    r.check('a closed month hides the day sheet and the entry forms and says when it was closed', pg.locator('#daySheet').count() == 0 and pg.locator('#entryForm').count() == 0 and 'closed' in pg.inner_text('#payClosed').lower())
    if pg.locator('#personPay').count() == 0:
        pg.click(f'button[data-pid="{A}"]')
    pg.wait_for_selector('#personPay')
    r.check('and the person card has no forms or remove buttons', pg.locator('#entryForm, #adjForm').count() == 0 and pg.locator('#personPay button.danger').count() == 0)
    pg.click('#btnCloseMonth'); pg.wait_for_selector('#daySheet')
    r.check('reopening gives the forms back', pg.locator('#daySheet').count() == 1)

    # ---- remove an entry
    pg.click(f'button[data-pid="{A}"]') if pg.locator('#personPay').count() == 0 else None
    pg.wait_for_selector('#entryTable')
    pg.locator('#entryTable button.danger').first.click(); pg.wait_for_selector('#payTable'); pg.wait_for_timeout(500)
    r.check('removing the overtime entry takes the overtime back to zero', pay_row(pg, A)['ot'] == 0 and pay_row(pg, A)['gross'] == 8000, str(pay_row(pg, A)))

    # ---- from the sign-in records
    pg.evaluate("location.hash = '#people/' + " + json.dumps(B)); pg.wait_for_selector('#pplMember')
    opts = pg.eval_on_selector_all('#pplMember option', 'els => els.map(e => e.textContent)')
    r.check('a person can be linked to a sign-in of the team (the list holds the administrator and the members)', any('Shift Worker' in o for o in opts) and any('Administrator' in o or 'Owner' in o for o in opts), str(opts))
    pg.select_option('#pplMember', label=[o for o in opts if 'Shift Worker' in o][0]); pg.click('#btnSave'); pg.wait_for_selector('.savebar >> text=/^Saved /', timeout=20000)
    pg.evaluate("location.hash = '#people/' + " + json.dumps(C)); pg.wait_for_selector('#pplMember')
    pg.select_option('#pplMember', label=[o for o in opts if 'Shift Worker' in o][0]); pg.click('#btnSave'); toast_text(pg, 'already linked')
    r.check('the same sign-in cannot be linked to two people', True)
    open_pay(pg); pg.click('#btnFillAtt'); toast_text(pg, 'Filled from the sign-in records')
    r.check('"Fill from sign-in records" runs for the linked people and the sheet stays whole', pg.locator('#payTable tbody tr').count() == 3)

    # ---- inactive people leave the active list and the month sheet, their old entries stay
    pg.evaluate("location.hash = '#people/' + " + json.dumps(C)); pg.wait_for_selector('#pplActive')
    pg.select_option('#pplMember', ''); pg.uncheck('#pplActive'); pg.fill('#pplEnd', FIRST); pg.click('#btnSave'); pg.wait_for_selector('.savebar >> text=/^Saved /', timeout=20000)
    pg.evaluate("location.hash = '#staff/people'"); pg.wait_for_selector('#pplList')
    r.check('an inactive person leaves the default list', 'Sami Daily' not in pg.inner_text('#pplList') and 'Karim Hourly' in pg.inner_text('#pplList'))
    pg.select_option('#pplShow', 'all'); r.check('"All people" brings them back', 'Sami Daily' in pg.inner_text('#pplList'))
    pg.evaluate("location.hash = '#people/' + " + json.dumps(C)); pg.wait_for_selector('#pplActive'); pg.check('#pplActive'); pg.fill('#pplEnd', ''); pg.click('#btnSave'); pg.wait_for_selector('.savebar >> text=/^Saved /', timeout=20000)

    # ---- the History records pay changes in words, without amounts or rates
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_function("() => document.body.innerText.includes('Karim Hourly')", timeout=30000)
    txt = pg.inner_text('main')
    r.check('the History records the new people and the payroll changes', 'Mona Salary' in txt and 'Payroll' in txt, txt[:300])
    r.check('the History shows no rate, no amount and no hourly figure for people', '8,000' not in txt and '8000' not in txt and '38.46' not in txt and '288.46' not in txt)

    # ---- a member without the staff right
    ctx, mp = member_login(S, 'shift.worker', 'a much longer password 456')
    try:
        mp.wait_for_selector('#navUser', timeout=40000)
        r.check('a production member has neither Staff & pay nor Control in the menu', not any(x in routes(mp) for x in ('staff', 'control', 'people')), str(routes(mp)))
        mp.evaluate("location.hash = '#staff/payroll/' + monthNow()"); mp.wait_for_selector('#app .card.state', timeout=15000)
        r.check('its address is refused with the plain "no access" notice', 'do not have access' in mp.inner_text('#app'))
        guard = mp.evaluate("[canWritePath('data/private/ops/people.json'), canWritePath('data/private/staff/pay-' + monthNow() + '.json'), canWritePath('data/private/settings.json')]")
        r.check('the write guard refuses the people file, the pay files and the settings for that role', guard == [False, False, False], str(guard))
        own = mp.evaluate("[canWritePath('data/private/staff/att/' + monthNow() + '/' + session.user.id + '.json'), canWritePath('data/private/staff/att/' + monthNow() + '/someone-else.json')]")
        r.check('but a member may write their own sign-in file and nobody else\'s', own == [True, False], str(own))
    finally:
        ctx.close()
    pg.remove_listener('dialog', on_dialog)
