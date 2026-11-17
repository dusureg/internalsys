/**
 * <admin>/js/views/reports/model-pay.js  -  report model of Staff & pay: one month's payroll
 * Who earned what (base, overtime, extra shifts, bonuses, deductions, advances, net), the split between direct and indirect labour, and the days and hours behind the pay,
 * as plain data (KPIs, charts, tables) like the other reports: the paper view and the Excel file both read it. Private to people who may see Staff & pay.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Payroll report
   ===================================================================== */
REPORT_TYPES.push('payroll');
REPORT_AREA.payroll = 'staff'; REPORT_NEEDS.payroll = ['people']; REPORT_FILTERS.payroll = ['pmonth'];
REPORT_PREP.payroll = async (sel) => { if (!monthOk(sel.pmonth)) sel.pmonth = monthNow(); await loadOps('people'); await loadPayMonth(sel.pmonth); };

function payrollModel(sel) {
  const month = monthOk(sel.pmonth) ? sel.pmonth : monthNow(), pm = payCache[month] ? payCache[month].data : null, ctl = ctlNow();
  const rows = payMonthRows(month, opsList('people'), pm, ctl).sort((a, b) => a.p.name.localeCompare(b.p.name, locale())), tot = payTotals(rows);
  const base = { private: true, land: true, period: monthLabel(month) + (pm && pm.closed ? ' · ' + t('rp.payClosed') : ''), scope: t('rp.nPeople', { n: nf(rows.length) }) };
  if (!rows.length) return Object.assign(base, { empty: true });
  const direct = rnd2(sumBy(rows.filter((x) => x.p.cost === 'direct'), (x) => x.r.gross)), indirect = rnd2(tot.gross - direct);
  const kpis = [{ label: t('pay.k.gross'), v: tot.gross, kind: 'money' }, { label: t('pay.k.net'), v: tot.net, kind: 'money', sub: t('pay.k.netSub', { a: money(tot.advance) }) },
    { label: t('pay.k.overtime'), v: tot.overtime + tot.extra, kind: 'money' }, { label: t('pay.k.bonus'), v: tot.bonus - tot.deduction, kind: 'money', tone: tot.bonus - tot.deduction < 0 ? 'neg' : '' },
    { label: t('rp.k.people'), v: rows.length, kind: 'int' }];
  const top = rows.filter((x) => x.r.gross > 0).sort((a, b) => b.r.gross - a.r.gross).slice(0, 10);
  const charts = [donutOf(t('rp.c.payKinds'), 'money', [[t('ppl.cost.direct'), direct, PALETTE[0]], [t('ppl.cost.indirect'), indirect, PALETTE[1]]], true),
    top.length > 1 ? { kind: 'hbar', title: t('rp.c.payPeople'), fmt: 'money', cats: top.map((x) => x.p.name), series: [{ name: t('pay.gross'), color: PALETTE[0], values: top.map((x) => x.r.gross) }] } : null].filter(Boolean);
  const tables = [
    { title: t('rp.t.payroll'), cols: [{ h: t('pay.person'), kind: 'text' }, { h: t('ppl.pay'), kind: 'text', nw: true }, { h: t('pay.base'), kind: 'money' }, { h: t('pay.overtime'), kind: 'money' }, { h: t('pay.extra'), kind: 'money' }, { h: t('pay.bonus'), kind: 'money' },
      { h: t('pay.deduction'), kind: 'money' }, { h: t('pay.gross'), kind: 'money' }, { h: t('pay.advance'), kind: 'money' }, { h: t('pay.net'), kind: 'money' }],
    rows: rows.map(({ p, r }) => [p.name, rateText(p), r.base, r.overtime, r.extra, r.bonus, r.deduction, r.gross, r.advance, r.net]),
    foot: [t('fin.total'), '', tot.base, tot.overtime, tot.extra, tot.bonus, tot.deduction, tot.gross, tot.advance, tot.net] },
    { title: t('rp.t.payHours'), cols: [{ h: t('pay.person'), kind: 'text' }, { h: t('ppl.cost'), kind: 'text', nw: true }, { h: t('rp.col.payDays'), kind: 'qty' }, { h: t('rp.col.payHours'), kind: 'qty' }, { h: t('rp.col.payOt'), kind: 'qty' },
      { h: t('rp.col.payExtra'), kind: 'qty' }, { h: t('rp.col.payAbsent'), kind: 'qty' }, { h: t('rp.col.payHourly'), kind: 'money' }],
    rows: rows.map(({ p, r }) => [p.name, t('ppl.cost.' + p.cost), r.days, r.hours, r.otHours, r.extraHours, r.absent, r.hourly]),
    foot: [t('fin.total'), '', sumBy(rows, (x) => x.r.days), sumBy(rows, (x) => x.r.hours), sumBy(rows, (x) => x.r.otHours), sumBy(rows, (x) => x.r.extraHours), sumBy(rows, (x) => x.r.absent), null] }];
  return Object.assign(base, { kpis, charts, tables });
}
REPORT_OPS.payroll = payrollModel;
