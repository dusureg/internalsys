"""v4.7 languages: the client search (live suggestions while a number is typed, Arabic digits and loose spelling) and no Arabic words left in the English screens of the admin
(a shipment made while the screen was in Arabic reads in English afterwards)."""
import re
from mockgh import BASE
from lib import *
from s15_team import routes

LEAK_JS = """() => {
  const ar = /[\\u0600-\\u06FF]/, out = [];
  const sel = 'label,button,th,h1,h2,h3,h4,legend,summary,.hint,.badge,.small,a.btn,.kpi .l,.kpi .s,#adminNav a,.empty,.msg,.card.state,.chip,.tab,.back';
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('#btnLang,[dir="auto"],[lang],td,input,textarea,select,.toast')) continue;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
    if (ar.test(own)) out.push((el.id || el.tagName) + ': ' + own.trim().slice(0, 50));
    const al = el.getAttribute('aria-label'); if (al && ar.test(al) && !el.closest('[dir="auto"]')) out.push((el.id || el.tagName) + ' [aria-label]: ' + al.slice(0, 50));
  }
  return out;
}"""
ASCII_DIGITS = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')


def run(S):
    r, mock, cid, secret = S.r, S.mock, S.cid, S.secret
    # ================= the client site =================
    ctx, cp = new_page(S, 'client-lang')
    cp.goto(BASE); cp.wait_for_selector('#clQ')
    cp.fill('#clQ', 'ds'); cp.wait_for_selector('#clPartial', timeout=8000)
    r.check('while a number is still being typed the page says "keep typing" and shows what a number looks like (no "does not look like" error)', 'Keep typing' in cp.inner_text('.live-out') and 'does not look like' not in cp.inner_text('.live-out'))
    chips = cp.eval_on_selector_all('#clPartial .chip', 'els => els.map(e => e.textContent)')
    r.check('two suggestions are offered: the start of a Client ID and the start of a project number', len(chips) == 2 and 'DS-CL-' in chips[0] and 'DS-' in chips[1], str(chips))
    cp.click('#clPartial .chip >> nth=0'); cp.wait_for_timeout(500)
    r.check('tapping the first suggestion puts "DS-CL-" in the box and the page keeps waiting for the digits', cp.input_value('#clQ') == 'DS-CL-' and cp.locator('#clPartial').count() == 1 and 'Keep typing' in cp.inner_text('.live-out'))
    cp.fill('#clQ', '١٢'); cp.wait_for_selector('#clPartial', timeout=8000)
    r.check('Arabic digits are accepted as digits (no format error)', 'does not look like' not in cp.inner_text('.live-out'))
    cp.fill('#clQ', 'hello world!'); cp.wait_for_selector('.live-out:has-text("does not look like")', timeout=8000)
    r.check('text that cannot become a number gets the format message with an example', 'DS-CL-1001' in cp.inner_text('.live-out'))
    num = cid.split('-')[-1]
    for label, text in (('Arabic digits', 'ds-cl-' + num.translate(ASCII_DIGITS)), ('no dashes', 'DSCL' + num), ('spaces', 'ds cl ' + num), ('underscores', 'ds_cl_' + num), ('a pasted link', 'https://x.github.io/p/#client/' + cid.lower())):
        cp.fill('#clQ', text); cp.wait_for_selector('.result.found #btnOpen', timeout=15000)
        r.check(f'the client is found when the number is typed with {label}', cid in cp.inner_text('.found-head'), cp.inner_text('.live-out')[:100])
        cp.fill('#clQ', ''); cp.wait_for_timeout(250)
    cp.fill('#clQ', 'ds'); cp.wait_for_selector('#clPartial', timeout=8000); cp.click('#btnLang'); cp.wait_for_timeout(500)
    r.check('in Arabic the same hint and the suggestions are in Arabic', 'أكمل الكتابة' in cp.inner_text('.live-out') and any(re.search('[؀-ۿ]', c) for c in cp.eval_on_selector_all('#clPartial .chip', 'els => els.map(e => e.textContent)')), cp.inner_text('.live-out')[:80])
    cp.click('#btnLang'); cp.wait_for_timeout(300)
    r.check('and back in English', 'Keep typing' in cp.inner_text('.live-out'))
    ctx.close()

    # ================= the administrator =================
    pg = S.admin
    pg.set_viewport_size({'width': 1280, 'height': 900})
    dialogs = []
    on_dialog = lambda d: (dialogs.append(d.message), d.accept())
    pg.on('dialog', on_dialog)
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnRefresh')
    if pg.evaluate("document.documentElement.lang") != 'en':
        pg.click('#btnLang'); pg.wait_for_timeout(400)
    # a shipment made on an Arabic screen
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'", timeout=10000)
    pg.evaluate("location.hash = '#logistics/new'"); pg.wait_for_selector('#lgTitle')
    ar_steps = pg.eval_on_selector_all('#lgSteps input[id^="lgStepName"]', 'els => els.map(e => e.value)')
    r.check('on the Arabic screen the standard steps are Arabic', len(ar_steps) == 7 and all(re.search('[؀-ۿ]', x) for x in ar_steps), str(ar_steps[:2]))
    pg.fill('#lgTitle', 'Language check shipment'); pg.fill('#lgCost', '10'); pg.select_option('#lgFin', 'none'); pg.click('#btnSave'); pg.wait_for_function("() => location.hash !== '#logistics/new'", timeout=20000)
    lg = pg.evaluate('location.hash').split('/')[-1]
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'", timeout=10000)
    pg.evaluate("location.hash = '#logistics/" + lg + "'"); pg.wait_for_selector('#lgTitle'); pg.wait_for_timeout(300)
    en_steps = pg.eval_on_selector_all('#lgSteps input[id^="lgStepName"]', 'els => els.map(e => e.value)')
    r.check('the same shipment opened in English shows the standard steps in English, not the Arabic they were made in', en_steps[:2] == ['Order placed', 'Confirmed by the supplier'] and not any(re.search('[؀-ۿ]', x) for x in en_steps), str(en_steps))
    pg.evaluate("location.hash = '#logistics'"); pg.wait_for_selector('#lgList'); pg.select_option('#lgShow', 'all'); pg.select_option('#lgKind', ''); pg.fill('#lgSearch', 'Language check'); pg.wait_for_timeout(500)       # (earlier suites leave a filter set)
    card = pg.inner_text('#lgList')
    r.check('the list card shows the current step in English too', not re.search('[؀-ۿ]', card) and 'Order placed' in card, card[:200])
    pg.evaluate("location.hash = '#logistics/" + lg + "'"); pg.wait_for_selector('#lgTitle')
    pg.fill('#lgStepName1', 'My own step'); save(pg)
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'ar'", timeout=10000); pg.wait_for_timeout(400)
    steps_ar = pg.eval_on_selector_all('#lgSteps input[id^="lgStepName"]', 'els => els.map(e => e.value)')
    r.check('a step the person renamed keeps their words in every language; the others follow the screen', steps_ar[1] == 'My own step' and re.search('[؀-ۿ]', steps_ar[0]) and re.search('[؀-ۿ]', steps_ar[2]), str(steps_ar[:3]))
    pg.click('#btnLang'); pg.wait_for_function("() => document.documentElement.lang === 'en'", timeout=10000)

    # ================= every screen in English =================
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#adminNav a[data-route]')
    nav = routes(pg)
    mon = pg.evaluate('monthNow()')
    hashes = ['#' + x for x in nav] + ['#staff/presence', '#staff/people', '#staff/payroll/' + mon, '#staff/rules', '#control', '#people/new', '#expenses/new', '#expenses/new-guest', '#logistics/new', '#suppliers/new', '#inventory/new', '#manage/new']
    seen, leaks = set(), []
    for hsh in hashes:
        if hsh in seen:
            continue
        seen.add(hsh)
        pg.evaluate(f"location.hash = '{hsh}'"); pg.wait_for_timeout(1100)
        try:
            pg.wait_for_selector('#app > *', timeout=10000)
        except Exception:
            continue
        found = pg.evaluate(LEAK_JS)
        if found:
            leaks.append((hsh, found[:4]))
    for tab in ('overview', 'projects', 'expenses'):
        pg.evaluate("location.hash = '#finance'"); pg.wait_for_selector('#finScreen', timeout=30000); pg.click('#finTab-' + tab); pg.wait_for_timeout(500)
        found = pg.evaluate(LEAK_JS)
        if found:
            leaks.append(('#finance/' + tab, found[:4]))
    r.check(f'no Arabic words on any of {len(seen) + 3} admin screens in English mode', not leaks, str(leaks[:6]))
    pg.remove_listener('dialog', on_dialog)
