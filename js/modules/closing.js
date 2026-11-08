/* Month-end close checklist — every control total in one place */
(E => {
  const ri = E.N.findIndex(n => n.id === 'health');
  E.N.splice(ri < 0 ? E.N.length : ri + 1, 0, { g: 'Reports', id: 'closing', ico: '🔒', label: 'Month-end Close' });
  const OK = 1, WARN = 2;

  function checks() {
    const t = E.totals(), sm = E.stockMap(), C = [];
    let rm = 0, fg = 0;
    for (const k in sm) {
      const i = E.D.items.find(x => x.id === k.split('|')[0]);
      if (i) i.cat === 'Finished Good' ? fg += sm[k].value : rm += sm[k].value;
    }
    const add = (n, ok, d, go) => C.push({ n, ok: ok ? OK : WARN, d, go });

    /* 1. trial balance */
    const dr = Object.values(t).reduce((s, x) => s + x.dr, 0);
    const cr = Object.values(t).reduce((s, x) => s + x.cr, 0);
    add('Trial balance is balanced', dr === cr, 'Debits ' + E.m(dr) + ' · Credits ' + E.m(cr), 'tb');

    /* 2. materials stock */
    add('Materials & accessories stock agrees with the ledger (1300)', rm === E.bal('1300', t), 'Stock records ' + E.m(rm) + ' · Ledger ' + E.m(E.bal('1300', t)), 'matledger');

    /* 3. finished goods stock */
    add('Finished goods stock agrees with the ledger (1320)', fg === E.bal('1320', t), 'Stock records ' + E.m(fg) + ' · Ledger ' + E.m(E.bal('1320', t)), 'stock');

    /* 4. WIP — FIXED: real comparison against open jobs */
    const act = E.rows('jobs').filter(j => j.status === 'In Progress');
    const wipLedger = E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.acc === '1310')).reduce((s, l) => s + l.dr - l.cr, 0);
    let wipOpenJobs = 0;
    act.forEach(j => {
      E.rows('journalEntries').flatMap(jj => jj.lines).filter(l => l.job === j.id && l.acc === '1310').forEach(l => {
        wipOpenJobs += l.dr - l.cr;
      });
    });
    const wipDiff = wipLedger - wipOpenJobs;
    add('Work-in-progress (1310) is explained by open jobs', Math.abs(wipDiff) <= 1,
      'Ledger ' + E.m(wipLedger) + ' · Open jobs ' + E.m(wipOpenJobs) + (wipDiff ? ' · Differs by ' + E.m(wipDiff) : ''), 'jobs');

    /* 5. piece wages accrual */
    const piece = E.rows('prodLogs').filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0);
    add('Piece wages earned (2210) agree with unpaid production entries', piece === E.bal('2210', t), 'Production log ' + E.m(piece) + ' · Ledger ' + E.m(E.bal('2210', t)), 'wages');

    /* 6. all runs paid — includes daily-salary */
    const unp = E.rows('wageRuns').filter(r => !r.cancelled && (r.kind === 'run' || r.kind === 'daily-salary') && !r.paid).length;
    add('All wage & salary runs are paid', !unp, unp ? unp + ' run(s) unpaid — wages payable ' + E.m(E.bal('2200', t)) : 'Wages payable ' + E.m(E.bal('2200', t)), 'wages');

    /* 7. staff advances — FIXED: includes staff loans */
    const advAdvances = E.rows('employees').reduce((s, e) => s + (E.advBal ? E.advBal(e.id) : 0), 0);
    const advLoans = E.rows('staffLoans')
      .filter(l => !l.cancelled && !l.settled)
      .reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
    const advTotal = advAdvances + advLoans;
    add('Staff advance + loan balances agree with the ledger (1250)', advTotal === E.bal('1250', t),
      'Advances ' + E.m(advAdvances) + ' + Loans ' + E.m(advLoans) + ' = ' + E.m(advTotal) + ' · Ledger ' + E.m(E.bal('1250', t)), 'advreg');

    /* 8. overhead pool — ignores 5390 */
    const un = E.unabsorbed ? E.unabsorbed() : 0;
    add('Factory overhead pool is absorbed into jobs', un <= 0, 'Not yet absorbed: ' + E.m(un), 'expenses');

    /* 9. accrued expenses */
    add('Accrued expenses are paid', E.bal('2300', t) === 0, 'Accrued expenses unpaid ' + E.m(E.bal('2300', t)), 'expenses');

    /* 10. supplier bills */
    const pay = E.rows('purchases').filter(p => !p.cancelled).reduce((s, p) => s + p.total - p.paid, 0);
    add('Supplier bills agree with payables (2000)', pay === E.bal('2000', t), 'Bills ' + E.m(pay) + ' · Ledger ' + E.m(E.bal('2000', t)), 'purchases');

    /* 11. no negative stock */
    const neg = E.skuList().filter(s => E.stock(s.itemId, s.variantId).qty < 0).length;
    add('No negative stock', !neg, neg + ' item(s) below zero', 'stock');

    /* 12. purchase prices present */
    const nop = E.skuList(i => i.cat !== 'Finished Good').filter(s => !((E.D.items.find(i => i.id === s.itemId) || {}).buyPrice)).length;
    add('Every material has a purchase price', !nop, nop + ' material(s) without a purchase price', 'items');

    return C;
  }

  E.route('closing', 'Month-end Close', () => {
    const C = checks(), bad = C.filter(c => c.ok === WARN).length, lk = E.setting('lockedUntil') || '';
    return `<div class="kp">${E.kpi('Checks passed', (C.length - bad) + ' / ' + C.length, bad ? '<span class="bad">' + bad + ' need attention</span>' : '<span class="ok">Ready to close</span>')}${E.kpi('Period locked until', lk || 'not locked', 'Entries on or before this date cannot be changed')}</div>
    <div class="card"><h3>Close checklist</h3><div class="tw"><table><tbody>${C.map(c => `<tr><td style="width:34px;font-size:18px">${c.ok === OK ? '✅' : '⚠️'}</td><td><b>${E.esc(c.n)}</b><div class="muted">${E.esc(c.d)}</div></td><td class="r"><button class="btn sm" data-nav="${c.go}">Open</button></td></tr>`).join('')}</tbody></table></div></div>
    ${E.role === 'owner' ? `<div class="card"><h3>Lock the period</h3><p class="muted" style="margin-bottom:10px">Once locked, nothing on or before the date can be posted, changed or cancelled. Do this after every check above is green and reports are printed.</p><div class="g2"><div class="f">Lock all entries up to (inclusive)<input id="lk_d" type="date" value="${lk || E.today().slice(0, 8) + '01'}"></div></div><button class="btn p" data-a="lkSave">Lock period</button> <button class="btn" data-a="lkClear">Unlock</button></div>` : ''}`;
  });

  E.A.lkSave = async () => {
    const d = E.val('lk_d');
    if (!d) return E.toast('Choose a date', 'error');
    if (!confirm('Lock all entries up to ' + d + '?')) return;
    await E.setSetting({ lockedUntil: d });
    E.go();
    E.toast('Period locked until ' + d, 'success');
  };
  E.A.lkClear = async () => {
    if (!confirm('Unlock all periods?')) return;
    await E.setSetting({ lockedUntil: '' });
    E.go();
  };
})(window.ERP);