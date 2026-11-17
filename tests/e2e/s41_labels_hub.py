"""Admin (4.8): Labels & receipts. #labels opens the Labels screen (read on demand): labels for projects, parts, inventory items and shipments, and a receipt for every cost.
Every label and receipt carries a QR code and a Code 128 barcode of the record's number; many are printed at once (one per page of exactly their size, or side by side on a sheet),
saved as pictures (one, or all in a ZIP), designed (colours, font, size, order of the lines, extra paragraphs, saved per kind), found again from a scanned or typed code; roles see only what
they may open. QR codes are decoded with a real decoder (OpenCV) from the printed PDF and from the saved pictures; the Code 128 bars are read back from the drawn rectangles by a decoder written here.
A real printer, a real scanner and a phone camera were not available."""
import io, json, os, re, subprocess, tempfile, zipfile
from lib import *
from s33_labels import pdf_of, pdf_pages, decode_qr, settle

try:
    import cv2, numpy as np
    from PIL import Image
except Exception:                                                      # the decoders are development tools only
    cv2 = None

MM = 72 / 25.4


def hub(pg, kind='', want=None):
    pg.evaluate(f"location.hash = '#labels{'/' + kind if kind else ''}'")
    pg.wait_for_selector('#lkPicker', timeout=40000); pg.wait_for_selector(f'#lkTab-{want or kind or "project"}[aria-selected=true]', timeout=15000)
    pg.evaluate("document.querySelectorAll('.toast').forEach((e) => e.remove())"); settle(pg)


def labs(pg, sel='#lkSheet .lbl'):
    return pg.evaluate("""(sel) => [...document.querySelectorAll(sel)].map((e) => ({ code: e.dataset.code, kind: e.dataset.kind, vw: e.style.getPropertyValue('--w'), vh: e.style.getPropertyValue('--hh'), text: e.innerText,
      lines: [...e.querySelectorAll('[data-f]')].map((x) => x.dataset.f), qr: (e.querySelector('.lbl-qr') || {dataset: {}}).dataset.code || null, bar: (e.querySelector('.lbl-bar') || {dataset: {}}).dataset.code || null,
      over: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1, tight: e.hasAttribute('data-tight') }))""", sel)


def set_val(pg, sel, v):                                               # colour inputs: set the value and tell the page
    pg.evaluate("([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }", [sel, v]); settle(pg)


def pick(pg, kind):
    pg.click('#lkNone'); pg.click('#lkAll'); settle(pg)


def decode_bar(pg, n=0, sel='#lkSheet .lbl'):                          # the bars of the n-th label read back the way a scanner would: widths -> symbols -> text
    info = pg.evaluate("""([sel, n]) => { const svg = document.querySelectorAll(sel)[n].querySelector('.lbl-bar');
      return { rects: [...svg.querySelectorAll('rect')].map((e) => [Number(e.getAttribute('x')), Number(e.getAttribute('width'))]), table: C128 }; }""", [sel, n])
    rects, table = info['rects'], info['table']; widths = []
    for i, (x, w) in enumerate(rects):
        if i: widths.append(x - (rects[i - 1][0] + rects[i - 1][1]))
        widths.append(w)
    sym = [''.join(str(w) for w in widths[k:k + 6]) for k in range(0, len(widths) - 7, 6)]
    vals = [table.index(s) if s in table else -1 for s in sym]
    ok = vals and vals[0] == 104 and (104 + sum(x * i for i, x in enumerate(vals[1:-1], 1))) % 103 == vals[-1]
    return ''.join(chr(x + 32) for x in vals[1:-1]) if ok else None


def printed(pg, path):                                                 # press Print (the page rule and the file name are set), then make the PDF of what would be printed
    pg.evaluate("() => { window.__printed = null; window.print = () => { window.__printed = document.title; }; }")
    pg.click('#lkPrint'); pg.wait_for_function("() => window.__printed !== null", timeout=15000)
    pdf_of(pg, path); pg.evaluate("() => window.dispatchEvent(new Event('afterprint'))")


def page_png(pdf, n, dpi, tmp):
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', '-f', str(n), '-l', str(n), pdf, os.path.join(tmp, 'p')], check=True)
    f = sorted(x for x in os.listdir(tmp) if x.startswith('p-') and x.endswith('.png'))[-1]
    p = os.path.join(tmp, f); im = cv2.imread(p, cv2.IMREAD_GRAYSCALE); os.remove(p); return im


def qr_all(img):
    det = cv2.QRCodeDetector(); out = set()
    try:
        ok, info, _, _ = det.detectAndDecodeMulti(img)
        if ok: out |= {x for x in info if x}
    except Exception:
        pass
    if hasattr(cv2, 'QRCodeDetectorAruco'):                                          # OpenCV 5 reads some codes only with this detector
        try:
            ok, info, _, _ = cv2.QRCodeDetectorAruco().detectAndDecodeMulti(img)
            if ok: out |= {x for x in info if x}
        except Exception:
            pass
    return out


def run(S):
    r, mock, pg, cid = S.r, S.mock, S.admin, S.cid
    tmp = tempfile.mkdtemp(prefix='lkh')
    pg.set_viewport_size({'width': 1280, 'height': 900})
    on_dialog = lambda d: d.accept()
    pg.on('dialog', on_dialog)
    # what the records hold, read from the page after the screens have loaded them
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient', timeout=30000)

    # ================= the menu and the code that is read on demand =================
    groups = pg.evaluate("() => [...document.querySelectorAll('#navLinks .navgroup')].map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('a')].map((a) => a.dataset.route)])")
    gd = dict(groups)
    r.check('the menu has a Production group (Progress, Labels & receipts); Work keeps the Dashboard and Contracting', gd.get('Production') == ['progress', 'labels'] and gd.get('Work') == ['dashboard', 'contracting'], str(groups))
    pg.click('#navLinks a[data-route=labels]'); pg.wait_for_selector('#lkPicker', timeout=40000)
    one = pg.evaluate("() => [typeof renderLabelHub, document.querySelectorAll('script[src=\"js/views/labels-hub.js\"]').length, document.querySelectorAll('link[href=\"css/labels-hub.css\"]').length, document.querySelectorAll('script[src=\"js/lazy.js\"]').length]")
    r.check('the menu entry opens the Labels screen; its code was read once, on demand (a script and a stylesheet each)', one == ['function', 1, 1, 1], str(one))
    hub(pg, 'part'); hub(pg, 'project')
    r.check('opening the screen again does not read the code again', pg.evaluate("() => document.querySelectorAll('script[src=\"js/views/labels-hub.js\"]').length") == 1)
    r.check('five tabs: projects, parts, inventory, shipments, receipts; no raw dictionary key shows on any of them',
            pg.evaluate("() => [...document.querySelectorAll('#lkTab-project, #lkTab-part, #lkTab-inventory, #lkTab-shipment, #lkTab-receipt')].map((e) => e.textContent)") == ['Projects', 'Parts', 'Inventory', 'Shipments', 'Receipts']
            and not re.search(r'\blk\.[a-z]', pg.inner_text('.lk-screen')))
    r.check('a first look: nothing is chosen yet, so a preview with the first record is shown and printing is off', pg.locator('#lkSheet .lbl').count() == 1 and pg.is_disabled('#lkPrint') and pg.is_disabled('#lkPng') and 'Preview with the first record' in pg.inner_text('#lkCount'))

    projects = pg.evaluate("() => store.items.flatMap((it) => it.rec.projects.map((p) => ({ cid: it.rec.id, sku: p.sku, parts: (p.parts || []).map((x) => ({ name: x.name, qty: Math.max(1, Math.min(200, Math.round(Number(x.qty)) || 1)) })) })))")
    inv = pg.evaluate("() => opsList('inventory').map((x) => ({ id: x.id, name: x.name, cat: x.category, loc: x.location }))") if pg.evaluate("typeof opsList") == 'function' else []
    r.check('there is data to print labels for (projects, inventory items, shipments)', len(projects) >= 2, str(len(projects)))

    # ================= project labels, many at once =================
    pg.click('#lkAll'); settle(pg)
    ls = labs(pg)
    r.check('every project gets a label; the QR code and the barcode both carry its SKU', sorted(x['code'] for x in ls) == sorted(p['sku'] for p in projects) and all(x['qr'] == x['code'] and x['bar'] == x['code'] for x in ls), str([x['code'] for x in ls]))
    r.check('the first label holds the client number, the SKU and the title; its size is 50 x 30 mm and it fits', ls[0]['vw'] == '50mm' and ls[0]['vh'] == '30mm' and ls[0]['code'] in ls[0]['text'] and not any(x['over'] for x in ls), str(ls[0]))
    r.check('the count line says how many labels and how big', pg.inner_text('#lkCount').startswith(f'{len(projects)} label(s), 50 × 30 mm each.'), pg.inner_text('#lkCount'))
    pg.fill('#lkCopies', '3'); settle(pg)
    r.check('three copies of each label', len(labs(pg)) == 3 * len(projects))
    pg.fill('#lkCopies', '1'); settle(pg)
    sizes = {}
    for sz, (w, h) in (('sq', (25, 25)), ('strip', (60, 25)), ('p70x40', (70, 40)), ('p100x60', (100, 60)), ('p100x150', (100, 150))):
        pg.select_option('#lkSize', sz); settle(pg); x = labs(pg)[0]; sizes[sz] = x
        ok = x['vw'] == f'{w}mm' and x['vh'] == f'{h}mm'
        r.check(f'size {sz}: {w} x {h} mm' + (' (the text is shrunk to fit, or the screen says it does not fit)' if sz in ('sq', 'strip') else ', everything fits'), ok and (not x['over'] if sz not in ('sq', 'strip') else (not x['over'] or x['tight'])), str(x))
    pg.select_option('#lkSize', 'strip'); settle(pg)
    vis = pg.evaluate("() => [document.getElementById('lkLen').offsetParent !== null, document.getElementById('lkW').offsetParent !== null]")
    r.check('the strip length field shows only for a strip, the width and height only for a custom size', vis == [True, False], str(vis))
    pg.fill('#lkLen', '8'); settle(pg)
    r.check('a strip is 25 mm tall and as long as asked (8 cm)', labs(pg)[0]['vw'] == '80mm' and labs(pg)[0]['vh'] == '25mm')
    pg.select_option('#lkSize', 'custom'); pg.fill('#lkW', '80'); pg.fill('#lkH', '45'); settle(pg)
    r.check('a custom size: 80 x 45 mm', labs(pg)[0]['vw'] == '80mm' and labs(pg)[0]['vh'] == '45mm')
    pg.fill('#lkW', '5'); settle(pg)
    r.check('a custom width below the smallest allowed is raised to 15 mm', labs(pg)[0]['vw'] == '15mm')
    pg.select_option('#lkSize', 'p50x30'); settle(pg)

    # ---- printed: one label per page of exactly its size, QR decoded by a real decoder, bars read back
    pdf = os.path.join(tmp, 'projects.pdf'); printed(pg, pdf); n, sz = pdf_pages(pdf)
    r.check('printed: one page per label, each exactly 50 x 30 mm', n == len(projects) and all(abs(a - 50 * MM) < 1 and abs(b - 30 * MM) < 1 for a, b in sz), f'{n} {sz[:2]}')
    if cv2 is not None:
        got = qr_all(page_png(pdf, 1, 300, tmp)) | decode_one(page_png(pdf, 1, 300, tmp))
        r.check('the QR code of the first printed label is decoded by OpenCV as its SKU', ls[0]['code'] in got, str(got))
    r.check('the barcode of the first label, read back from its bars, is the SKU', decode_bar(pg, 0) == ls[0]['code'], str(decode_bar(pg, 0)))

    # ================= parts: every piece of every part =================
    hub(pg, 'part'); pick(pg, 'part')
    allparts = [(p['sku'], j + 1, x) for p in projects for j, x in enumerate(p['parts'])]
    ls = labs(pg)
    r.check('one label for every piece of every part (the default): the count is the sum of the quantities', len(ls) == sum(x['qty'] for _, _, x in allparts) and len(ls) >= len(allparts), f'{len(ls)}')
    r.check('each carries SKU.part.piece in both codes, and the line "name k/n"', all(re.fullmatch(r'.+\.\d+\.\d+', x['code']) and x['qr'] == x['code'] == x['bar'] for x in ls) and re.search(r'\d+/\d+', ls[0]['text']) is not None, ls[0]['code'])
    pg.select_option('#lkScope', 'part'); settle(pg); ls = labs(pg)
    r.check('"each part (one label)": one label per part, the code is SKU.part, the line shows the number of pieces', len(ls) == len(allparts) and all(re.fullmatch(r'.+\.\d+', x['code']) for x in ls) and '×' in ls[0]['text'], str(ls[:1]))
    pg.select_option('#lkScope', 'piece')
    pj = next((p for p in projects if p['parts']), projects[0])                      # the first project that has parts (a project with none gives no part labels)
    if pg.locator('#lkGroup').count():
        pg.select_option('#lkGroup', pj['sku']); settle(pg)
        r.check('the filter shows only the parts of one project', pg.locator('.lk-item').count() == len(pj['parts']), str(pg.locator('.lk-item').count()))
        pg.select_option('#lkGroup', '')
    query = (pj['parts'][0]['name'] or '').strip()[:5].strip() if pj['parts'] else 'zzz'
    pg.fill('#lkSearch', query); settle(pg)
    shown = pg.locator('.lk-item').count()
    r.check('the search narrows the list', 0 < shown <= len(allparts), f'query {query!r}: {shown} of {len(allparts)}; first names {[x["name"] for x in pj["parts"][:3]]}')
    pg.fill('#lkSearch', '')
    pdf = os.path.join(tmp, 'parts.pdf'); printed(pg, pdf); n, _ = pdf_pages(pdf)
    r.check('printed: one page per piece label', n == len(labs(pg)), f'{n}')
    r.check('the barcode of the second piece, read back, is its code', decode_bar(pg, 1) == labs(pg)[1]['code'])

    # ================= inventory =================
    hub(pg, 'inventory'); pick(pg, 'inventory'); ls = labs(pg)
    r.check('one label per inventory item, the code is the item number (MAT-...) in both codes', len(ls) >= 2 and all(re.fullmatch(r'MAT-\d+', x['code']) and x['qr'] == x['code'] == x['bar'] for x in ls) and len(ls) == pg.locator('.lk-item').count(), str(len(ls)))
    r.check('an item label shows the number, the name and the place', 'MAT-' in ls[0]['text'] and ls[0]['lines'][:3] == ['id', 'name', 'location'], str(ls[0]['lines']))
    r.check('the barcode of an item, read back, is its number', decode_bar(pg, 0) == ls[0]['code'])
    pdf = os.path.join(tmp, 'inv.pdf'); printed(pg, pdf)
    if cv2 is not None:
        r.check('the QR code of an item, decoded from the printed page, is its number', ls[0]['code'] in (qr_all(page_png(pdf, 1, 300, tmp)) | decode_one(page_png(pdf, 1, 300, tmp))))

    # ---- sheet mode: labels side by side on a sheet of paper
    pg.select_option('#lkMode', 'sheet'); settle(pg)
    pdf = os.path.join(tmp, 'sheet.pdf'); printed(pg, pdf); n, sz = pdf_pages(pdf)
    r.check('on a sheet: the labels sit side by side on A4 pages (far fewer pages than labels)', 1 <= n < len(ls) and abs(sz[0][0] - 595) < 3 and abs(sz[0][1] - 842) < 3, f'{n} {sz[:1]}')
    if cv2 is not None:
        got = qr_all(page_png(pdf, 1, 300, tmp)); codes = {x['code'] for x in ls}
        r.check('on the printed sheet, QR codes are read back as item numbers', len(got & codes) >= 1, str(got))
    pg.select_option('#lkMode', 'page'); settle(pg)

    # ================= shipments =================
    hub(pg, 'shipment'); pick(pg, 'shipment')
    ships = pg.evaluate("() => opsList('logistics').map((s) => ({ id: s.id, lines: s.lines.length }))")
    ls = labs(pg)
    r.check('one label per shipment (100 x 60 mm), the code is its number (LG-...)', len(ls) == len(ships) and all(re.fullmatch(r'LG-\d+', x['code']) and x['qr'] == x['code'] == x['bar'] and x['vw'] == '100mm' for x in ls), str([x['code'] for x in ls]))
    pg.select_option('#lkScope', 'lines'); settle(pg); ls = labs(pg)
    r.check('"each line of a shipment": one label per box or item, the code is LG-....n; a shipment without lines still gets one', len(ls) == sum(max(1, s['lines']) for s in ships), f'{len(ls)}')
    pdf = os.path.join(tmp, 'ship.pdf'); printed(pg, pdf); n, sz = pdf_pages(pdf)
    r.check('printed: one 100 x 60 mm page per label', n == len(ls) and all(abs(a - 100 * MM) < 1 and abs(b - 60 * MM) < 1 for a, b in sz), f'{n} {sz[:1]}')
    if cv2 is not None:
        r.check('the QR code of a shipment label, decoded from the printed page, is its code', ls[0]['code'] in (qr_all(page_png(pdf, 1, 300, tmp)) | decode_one(page_png(pdf, 1, 300, tmp))))
    pg.select_option('#lkScope', 'shipment')

    # ================= the design =================
    hub(pg, 'inventory'); pick(pg, 'inventory'); pg.evaluate("document.getElementById('lkDesigner').open = true")
    lb = lambda: pg.evaluate("""() => { const e = document.querySelector('#lkSheet .lbl'), c = getComputedStyle(e), q = getComputedStyle(e.querySelector('.lbl-qrbox'));
      return { bg: c.backgroundColor, fg: c.color, font: c.fontFamily, size: parseFloat(c.fontSize), bw: parseFloat(c.borderTopWidth), align: e.dataset.align, qrbg: q.backgroundColor, lines: [...e.querySelectorAll('[data-f]')].map((x) => x.dataset.f),
        extra: [...e.querySelectorAll('.lk-x')].map((x) => [x.innerText, x.classList.contains('b'), x.classList.contains('i')]) }; }""")
    base = lb()
    pg.click('#lkTheme-dark'); settle(pg); d = lb()
    r.check('the dark theme: light text on a dark label, and the QR code stays black on white', d['bg'] == 'rgb(27, 27, 27)' and d['fg'] == 'rgb(255, 255, 255)' and d['qrbg'] == 'rgb(255, 255, 255)', str(d))
    pg.click('#lkTheme-light'); settle(pg)
    set_val(pg, '#lkBg', '#777777'); set_val(pg, '#lkFg', '#7a7a7a')
    r.check('colours too close to read warn the person', pg.is_visible('#lkLow'))
    set_val(pg, '#lkFg', '#000000'); set_val(pg, '#lkBg', '#f4efe6')
    r.check('colours are free: a chosen background and text colour are used by the label', lb()['bg'] == 'rgb(244, 239, 230)' and not pg.is_visible('#lkLow'))
    pg.select_option('#lkFont', 'serif'); settle(pg)
    r.check('the font can be changed (serif)', 'Georgia' in lb()['font'])
    s100 = lb()['size']; pg.fill('#lkScale', '130'); settle(pg)
    r.check('the text size can be raised (130 %)', lb()['size'] > s100 * 1.2, f"{s100} -> {lb()['size']}")
    pg.fill('#lkScale', '100'); pg.select_option('#lkAlign', 'center'); settle(pg)
    r.check('the text can be centred', lb()['align'] == 'center')
    pg.select_option('#lkBorder', 'thick'); settle(pg); thick = lb()['bw']; pg.select_option('#lkBorder', 'none'); settle(pg)
    r.check('the border can be thick or none', thick > base['bw'] and lb()['bw'] == 0, f"{base['bw']} {thick} {lb()['bw']}")
    pg.select_option('#lkBorder', 'thin'); pg.select_option('#lkAlign', 'start')
    pg.click('#lkDown-id'); settle(pg)
    r.check('the order of the text lines can be changed (the number moves below the name)', lb()['lines'][:2] == ['name', 'id'], str(lb()['lines']))
    pg.click('#lkUp-id'); pg.check('#lkField-category'); settle(pg)
    r.check('a line can be added (the category) and removed again', 'category' in lb()['lines'])
    pg.uncheck('#lkField-category'); settle(pg)
    r.check('un-ticking the QR code and the barcode removes them', True)
    pg.uncheck('#lkField-qr'); pg.uncheck('#lkField-barcode'); settle(pg)
    r.check('QR code and barcode can each be left out', pg.locator('#lkSheet .lbl-qr, #lkSheet .lbl-bar').count() == 0)
    pg.check('#lkField-qr'); pg.check('#lkField-barcode'); settle(pg)
    pg.click('#lkXAdd'); pg.fill('#lkX-0', 'Property of {brand} - {code} - {nothing}'); pg.check('#lkXb-0'); pg.check('#lkXi-0'); settle(pg)
    ex = lb()['extra']
    brand = pg.evaluate("brandName()")
    code0 = labs(pg)[0]['code']
    r.check('an extra paragraph: {brand} and {code} are filled in, an unknown word stays, bold and italic apply', len(ex) == 1 and ex[0][0] == f'Property of {brand} - {code0} - {{nothing}}' and ex[0][1] and ex[0][2], str(ex))
    for _ in range(7): pg.click('#lkXAdd')
    r.check('at most six extra paragraphs', pg.locator('#lkExtra .lk-xrow').count() == 6)
    pg.locator('#lkExtra .lk-xrow button.danger').first.click(); settle(pg)
    r.check('a paragraph can be removed', pg.locator('#lkExtra .lk-xrow').count() == 5)
    while pg.locator('#lkExtra .lk-xrow').count():
        pg.locator('#lkExtra .lk-xrow button.danger').first.click()
    pg.click('#lkXAdd'); pg.fill('#lkX-0', 'Keep dry'); settle(pg)
    norm = pg.evaluate("() => lkNorm('inventory', { size: 'nope', scale: 999, fg: 'red', bg: '#ABCDEF', fields: ['id', 'evil', 'id', 'name'], extra: Array(10).fill({ text: 'x', size: 'huge' }), border: 'zigzag', mode: 'sheet' })")
    r.check('a design read from the settings is always checked: unknown size, colour, field, border and an out-of-range text size are replaced; ids once; six paragraphs at most',
            norm['size'] == 'p50x30' and norm['scale'] == 100 and norm['fg'] == '#000000' and norm['bg'] == '#abcdef' and norm['fields'] == ['id', 'name'] and len(norm['extra']) == 6 and norm['extra'][0]['size'] == 'm'
            and norm['border'] == 'thin' and norm['mode'] == 'sheet', str(norm))

    # ---- saved as the default of the kind
    before = {k: v['sha'] for k, v in mock.files.items() if 'settings' in k}
    pg.click('#lkSave'); toast_text(pg, 'Saved')
    after = {k: v['sha'] for k, v in mock.files.items() if 'settings' in k}
    r.check('"Save as default" writes the settings file', before != after, str(list(after)))
    saved = pg.evaluate("() => session.settings.labelKinds.inventory")
    r.check('the design of the kind is kept with the settings (and the other kinds are untouched)', saved['bg'] == '#f4efe6' and saved['extra'][0]['text'] == 'Keep dry' and 'project' not in pg.evaluate("() => session.settings.labelKinds"), str(saved)[:200])
    pg.evaluate("lkS.d = {}"); hub(pg, 'project'); hub(pg, 'inventory')
    r.check('coming back to the kind: the saved design is there (colour and paragraph)', pg.input_value('#lkBg') == '#f4efe6' and pg.input_value('#lkX-0') == 'Keep dry')
    pg.evaluate("document.getElementById('lkDesigner').open = true"); set_val(pg, '#lkBg', '#102a1b'); pg.click('#lkReset'); pg.wait_for_selector('#lkPicker'); settle(pg)
    r.check('"Back to the saved design" drops the changes that were not saved', pg.input_value('#lkBg') == '#f4efe6')
    pg.evaluate("document.getElementById('lkDesigner').open = true"); pg.click('#lkTheme-light'); pg.click('#lkSave'); toast_text(pg, 'Saved')
    pg.evaluate("location.hash = '#audit'"); pg.wait_for_selector('#audList li.audit-item', timeout=30000)
    r.check('History records the saved design', 'Labels & receipts' in pg.inner_text('#audList'))

    # ================= receipts for every cost =================
    hub(pg, 'receipt')
    pg.fill('#lkFrom', ''); pg.fill('#lkTo', ''); pg.dispatch_event('#lkFrom', 'change'); pg.dispatch_event('#lkTo', 'change')
    pg.click('#lkRcLoad'); pg.wait_for_selector('#lkPicker'); settle(pg)
    srcs = pg.evaluate("() => [...document.querySelectorAll('[id^=lkSrc-]')].map((e) => e.id.slice(6))")
    r.check('the receipts list offers expenses, shipment costs, payroll (to those who may open Staff & pay) and project costs', srcs == ['expense', 'shipment', 'payroll', 'project'], str(srcs))
    def only(*names):
        for s in srcs:
            (pg.check if s in names else pg.uncheck)(f'#lkSrc-{s}')
        pg.click('#lkRcLoad'); pg.wait_for_selector('#lkPicker'); settle(pg)
    only('project'); keys = pg.evaluate("() => [...document.querySelectorAll('.lk-item input')].map((e) => e.dataset.key)")
    cost_lines = pg.evaluate("() => store.items.flatMap((it) => it.rec.projects.flatMap((p) => (p.costs || []).map((c, i) => [p.sku + '-' + (i + 1), Number(c.amount)]).filter((x) => x[1] > 0)))")
    r.check('project costs: one receipt per cost line with an amount, numbered V-<SKU>-<line>', sorted(keys) == sorted('V-' + k for k, _ in cost_lines) and len(keys) > 0, f'{len(keys)} / {len(cost_lines)}')
    only('shipment'); keys = pg.evaluate("() => [...document.querySelectorAll('.lk-item input')].map((e) => e.dataset.key)")
    ship_costs = pg.evaluate("() => opsList('logistics').filter((s) => s.cost > 0 && !s.cancelled).map((s) => 'V-' + s.id)")
    r.check('shipment costs: one receipt per shipment that has a cost, numbered V-LG-....', len(keys) > 0 and sorted(keys) == sorted(ship_costs), f'{keys} {ship_costs}')
    only('expense'); keys = pg.evaluate("() => [...document.querySelectorAll('.lk-item input')].map((e) => e.dataset.key)")
    r.check('company expenses: receipts numbered V-EXP-.... (a repeating expense gets one for every period)', len(keys) > 0 and all(re.fullmatch(r'V-EXP-\d+(-\d{4})?', k) for k in keys), str(keys[:4]))
    if 'payroll' in srcs:
        only('payroll'); keys = pg.evaluate("() => [...document.querySelectorAll('.lk-item input')].map((e) => e.dataset.key)")
        names = pg.evaluate("() => opsList('people').map((p) => p.name)")
        r.check('payroll: one receipt per person and month, numbered V-PAY-<month>-<person>', len(keys) > 0 and all(re.fullmatch(r'V-PAY-\d{4}-\d{2}-PPL-\d+', k) for k in keys), str(keys[:3]))
        r.check('the payroll receipt shows the person and the net pay', any(n in pg.inner_text('#lkList') for n in names))
    only(*srcs); pick(pg, 'receipt'); cards = labs(pg, '#lkSheet .lk-rc')
    r.check('every chosen cost has its receipt, with its number as QR code and barcode', len(cards) == pg.locator('.lk-item').count() and all(c['code'].startswith('V-') and c['qr'] == c['code'] == c['bar'] for c in cards) and len(cards) > 0, str(len(cards)))
    tot = pg.evaluate("() => [...document.querySelectorAll('#lkSheet .lk-rc')].map((e) => [e.dataset.code, e.querySelector('.lk-rc-line.total').innerText])")
    r.check('a receipt shows the number, the date, what it is for, who was paid, the category, the cost type and the total; a place for two signatures',
            all(re.search(r'\d', t) for _, t in tot) and 'Cost receipt' in cards[0]['text'] and 'Prepared by' in cards[0]['text'] and 'Received by' in cards[0]['text'] and cards[0]['code'] in cards[0]['text'], cards[0]['text'][:200])
    ship = next((c for c in cards if c['code'].startswith('V-LG-')), None)
    if ship:
        cost = pg.evaluate(f"() => opsFind('logistics', '{ship['code'][2:]}').cost")
        r.check('a shipment receipt shows the shipment\'s cost as its total', money_in(dict(tot)[ship['code']], cost), f"{dict(tot)[ship['code']]} {cost}")
    r.check('the barcode of the first receipt, read back, is its number', decode_bar(pg, 0, '#lkSheet .lk-rc') == cards[0]['code'])
    for paper, (w, h) in (('a4', (210, 297)), ('a5', (148, 210))):
        pg.select_option('#lkSize', paper); settle(pg)
        pdf = os.path.join(tmp, f'rc-{paper}.pdf'); printed(pg, pdf); n, sz = pdf_pages(pdf)
        r.check(f'printed on {paper.upper()}: one page per receipt, {w} x {h} mm', n == len(cards) and all(abs(a - w * MM) < 2 and abs(b - h * MM) < 2 for a, b in sz), f'{n} {sz[:1]}')
        if cv2 is not None and paper == 'a5':
            r.check('the QR code of the first printed receipt is decoded as its number', cards[0]['code'] in (qr_all(page_png(pdf, 1, 200, tmp)) | decode_one(page_png(pdf, 1, 200, tmp))))
    pg.select_option('#lkSize', 'roll80'); settle(pg)
    pdf = os.path.join(tmp, 'rc-roll.pdf'); printed(pg, pdf); n, sz = pdf_pages(pdf)
    r.check('printed on an 80 mm roll: the page is 80 mm wide and as tall as the longest receipt', all(abs(a - 80 * MM) < 2 for a, b in sz) and 60 < sz[0][1] / MM < 400, f'{n} {sz[:1]}')
    pg.evaluate("document.getElementById('lkDesigner').open = true"); pg.select_option('#lkSize', 'a5'); pg.uncheck('#lkField-signatures'); pg.uncheck('#lkField-barcode'); settle(pg)
    r.check('a receipt\'s parts can be left out (signature lines, barcode)', pg.locator('#lkSheet .lk-rc-sign, #lkSheet .lk-rc .lbl-bar').count() == 0)
    pg.check('#lkField-signatures'); pg.check('#lkField-barcode'); settle(pg)

    # ================= scanning: a code -> the record =================
    hub(pg, 'project')
    def scan(code):
        pg.fill('#lkScan', code); pg.press('#lkScan', 'Enter'); pg.wait_for_selector('#lkFound .lk-hit, #lkFound .msg, #lkFound .hint:not(:has-text("Loading"))', timeout=30000); pg.wait_for_timeout(300)
        return pg.inner_text('#lkFound')
    sku = pj['sku']; i0 = pg.evaluate(f"() => store.items.find((x) => x.rec.id === '{pj['cid']}').rec.projects.findIndex((p) => p.sku === '{sku}')")
    scan(sku.lower()); r.check('a project code (any letter case) finds the project and opens its record', pg.get_attribute('#lkOpen', 'href') == f"#manage/{pj['cid']}", pg.inner_text('#lkFound'))
    if pj['parts']:
        scan(f'{sku}.1.1'); r.check('a piece code finds the part and opens its progress', pg.get_attribute('#lkOpen', 'href') == f"#progress/{pj['cid']}/{i0}" and pj['parts'][0]['name'] in pg.inner_text('#lkFound'), pg.inner_text('#lkFound'))
    iid = pg.evaluate("() => opsList('inventory')[0].id"); scan(iid)
    r.check('an inventory number finds the item', pg.get_attribute('#lkOpen', 'href') == f'#inventory/{iid}')
    sid = pg.evaluate("() => opsList('logistics')[0].id"); scan(sid + '.1')
    r.check('a shipment number (with a line) finds the shipment', pg.get_attribute('#lkOpen', 'href') == f'#logistics/{sid}')
    rc0 = pg.evaluate("() => (opsList('logistics').find((s) => s.cost > 0 && !s.cancelled) || {}).id")
    if rc0:
        scan('V-' + rc0); r.check('a receipt number finds the cost and opens the shipment it came from', pg.get_attribute('#lkOpen', 'href') == f'#logistics/{rc0}', pg.inner_text('#lkFound'))
    scan('ZZZ-999'); r.check('an unknown code says so', pg.locator('#lkNoHit').count() == 1 and 'ZZZ-999' in pg.inner_text('#lkNoHit'))
    pg.fill('#lkScan', ''); pg.press('#lkScan', 'Enter'); pg.wait_for_timeout(300)
    r.check('an empty box asks for a code', 'Type or scan a code' in pg.inner_text('#lkFound'))
    pg.evaluate("() => lkSelOf('inventory').clear()")                                  # the earlier steps left every item ticked: "select it" adds one to what is ticked
    scan(iid); pg.click('#lkPickIt'); pg.wait_for_selector('#lkTab-inventory[aria-selected=true]'); settle(pg)
    r.check('"Select it for printing" opens the right tab with the record ticked', pg.is_checked(f'input[data-key="{iid}"]') and '1 selected' in pg.inner_text('#lkPicked') and len(labs(pg)) == 1 and labs(pg)[0]['code'] == iid)

    # ================= pictures =================
    pg.click('#lkNone'); pg.check(f'input[data-key="{iid}"]'); settle(pg)
    with pg.expect_download(timeout=60000) as dl: pg.click('#lkPng')
    d = dl.value; f = os.path.join(tmp, d.suggested_filename); d.save_as(f)
    r.check('"Save as picture" gives a PNG named after the code', d.suggested_filename == f'{iid}.png', d.suggested_filename)
    if cv2 is not None:
        im = Image.open(f); w, h = im.size
        r.check('the picture has exactly the shape of the label (50 x 30 mm)', abs(w / h - 50 / 30) < 0.03, f'{w}x{h}')
        r.check('the QR code in the picture is decoded as the item number', iid in (qr_all(cv2.imread(f, cv2.IMREAD_GRAYSCALE)) | decode_one(cv2.imread(f, cv2.IMREAD_GRAYSCALE))))
    pick(pg, 'inventory'); n_inv = len(labs(pg))
    with pg.expect_download(timeout=120000) as dl: pg.click('#lkPng')
    d = dl.value; f = os.path.join(tmp, d.suggested_filename); d.save_as(f)
    z = zipfile.ZipFile(f); names = z.namelist()
    r.check('several labels: one ZIP file with a PNG for each, no name used twice', d.suggested_filename.endswith('.zip') and len(names) == n_inv == len(set(names)) and all(n.endswith('.png') for n in names), f'{d.suggested_filename} {len(names)}/{n_inv}')
    r.check('every picture in the ZIP is a real PNG', all(z.read(n)[:8] == b'\x89PNG\r\n\x1a\n' for n in names))
    hub(pg, 'receipt'); pick(pg, 'receipt'); pg.fill('#lkSearch', 'V-LG-'); settle(pg); pg.click('#lkNone'); pg.click('#lkAll'); settle(pg)
    if pg.locator('#lkSheet .lk-rc').count():
        with pg.expect_download(timeout=60000) as dl: pg.click('#lkPng')
        d = dl.value; f = os.path.join(tmp, d.suggested_filename); d.save_as(f)
        r.check('a receipt can be saved as a picture too', d.suggested_filename.endswith('.png') or d.suggested_filename.endswith('.zip'), d.suggested_filename)
    pg.fill('#lkSearch', '')

    # ================= roles: each person sees only what they may open =================
    save_user = pg.evaluate("() => { window.__lkUser = session.user; return true; }")
    def as_role(perms):
        pg.evaluate("(p) => { session.user = { id: 'tester', owner: false, username: 'tester', name: 'Tester', role: 'custom', perms: mkPerms(p), status: 'active' }; }", perms)
    as_role({'inventory': 1}); pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_timeout(400); pg.evaluate("location.hash = '#labels/shipment'")
    pg.wait_for_selector('#lkPicker', timeout=30000); settle(pg)
    tabs = pg.evaluate("() => [...document.querySelectorAll('.lk-screen .tab')].map((e) => e.id.slice(6))")
    r.check('a person who may only see Inventory gets the Inventory tab only (a link to another kind opens an allowed one)', tabs == ['inventory'] and pg.locator('#lkTab-inventory[aria-selected=true]').count() == 1, str(tabs))
    r.check('without the right to edit Settings there is no "Save as default", only a note; printing and pictures stay', pg.locator('#lkSave').count() == 0 and pg.locator('#lkPrint').count() == 1)
    pg.fill('#lkScan', 'LG-0001'); pg.press('#lkScan', 'Enter'); pg.wait_for_timeout(500)
    r.check('a code for something they may not open says so, and shows nothing about it', 'may not open' in pg.inner_text('#lkFound') and pg.locator('#lkOpen').count() == 0)
    as_role({'finance': 1}); pg.evaluate("location.hash = '#labels/receipt'"); pg.wait_for_selector('#lkPicker', timeout=30000); settle(pg)
    r.check('with Finance but not Staff & pay, payroll is not offered and no payroll receipt is listed', pg.locator('#lkSrc-payroll').count() == 0 and 'V-PAY-' not in pg.inner_text('#lkList'))
    as_role({'staff': 2}); pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_timeout(400)
    r.check('a role with no label kind has no Labels entry in the menu', pg.locator('#navLinks a[data-route=labels]').count() == 0)
    pg.evaluate("location.hash = '#labels'"); pg.wait_for_timeout(800)
    r.check('opening the address anyway shows the "no access" notice, not the screen', pg.locator('#lkPicker').count() == 0)
    pg.evaluate("() => { session.user = window.__lkUser; }"); pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_selector('#btnNewClient', timeout=30000)

    # ================= the screen of one project's labels stays, with a way to the new one =================
    pg.evaluate(f"location.hash = '#labels/{cid}/0'"); pg.wait_for_selector('#lblOptions', timeout=30000)
    r.check('the labels of one project (#labels/<client>/<n>) still open, with a link to the other kinds', pg.locator('#lblMore').count() == 1 and pg.get_attribute('#lblMore', 'href') == '#labels/project')
    pg.click('#lblMore'); pg.wait_for_selector('#lkPicker', timeout=30000)
    r.check('the link opens the new Labels screen', pg.locator('#lkTab-project[aria-selected=true]').count() == 1)

    # ================= Arabic =================
    from s20_audit import set_look
    set_look(pg, 'ar', 'dark'); hub(pg, 'part'); pick(pg, 'part')
    r.check('in Arabic the screen is Arabic (tabs, buttons) and shows no raw key', 'القطع' in pg.inner_text('#lkTab-part') and 'طباعة' in pg.inner_text('#lkPrint') and not re.search(r'\blk\.[a-z]', pg.inner_text('.lk-screen')), pg.inner_text('#lkTab-part'))
    r.check('the labels themselves are left-to-right codes with the part text kept readable', pg.locator('#lkSheet .lbl[dir=ltr]').count() == pg.locator('#lkSheet .lbl').count())
    set_look(pg, 'en', 'dark')
    pg.remove_listener('dialog', on_dialog)


def decode_one(img):
    if cv2 is None: return set()
    v = decode_qr(img)
    return {v} if v else set()
