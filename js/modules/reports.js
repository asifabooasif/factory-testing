/* PART 8 — Ledger search, financial reports, health check.
   FIX: Health Check 1250 now includes staff loans. Variable rename (pairs→packsReleased).
*/
(E => {
  const at = E.N.findIndex(n => n.id === 'settings');
  [['ledger', '📖', 'Ledger Search'], ['reports', '📈', 'Financial Reports'], ['health', '🩺', 'Health Check']].forEach((x, i) => E.N.splice(at + i, 0, { g: 'Reports', id: x[0], ico: x[1], label: x[2] }));
  const rt = (f, t) => { const m = {}; E.rows('journalEntries').forEach(j => { if ((f && j.date < f) || (t && j.date > t)) return; j.lines.forEach(l => { const x = m[l.acc] || (m[l.acc] = { dr: 0, cr: 0 }); x.dr += l.dr; x.cr += l.cr }) }); return m };
  const nat = (a, x) => x ? ((a.type === 'asset' || a.type === 'expense') ? x.dr - x.cr : x.cr - x.dr) : 0, cs = (a, b) => a.code.localeCompare(b.code);
  const L = { acc: '', q: '', from: '', to: '' }, F = { tab: 'pl', from: E.today().slice(0, 4) + '-01-01', to: E.today() };

  function ltbl() {
    const q = L.q.toLowerCase(), a = E.acct(L.acc), dn = a && (a.type === 'asset' || a.type === 'expense');
    let run = 0, rows = [];
    E.rows('journalEntries').slice().sort((x, y) => x.date.localeCompare(y.date) || x.no.localeCompare(y.no)).forEach(j => j.lines.forEach(l => {
      if (L.acc && l.acc !== L.acc) return;
      if (L.from && j.date < L.from) { if (a) run += dn ? l.dr - l.cr : l.cr - l.dr; return }
      if (L.to && j.date > L.to) return;
      const jb = l.job ? (E.D.jobs.find(x => x.id === l.job)?.no || '') : '', ac = E.acct(l.acc);
      if (q && !(j.no + ' ' + j.ref + ' ' + j.narr + ' ' + jb + ' ' + l.acc + ' ' + (ac?.name || '') + ' ' + ((l.dr || l.cr) / 100)).toLowerCase().includes(q)) return;
      if (a) run += dn ? l.dr - l.cr : l.cr - l.dr;
      rows.push(`<tr><td>${j.date}</td><td>${j.no}</td>${a ? '' : `<td>${l.acc} ${E.esc(ac?.name)}</td>`}<td>${E.esc(j.narr)}</td><td>${jb}</td><td class="r">${l.dr ? E.m(l.dr) : ''}</td><td class="r">${l.cr ? E.m(l.cr) : ''}</td>${a ? `<td class="r"><b>${E.m(run)}</b></td>` : ''}</tr>`)
    }));
    return `<div class="tw"><table><thead><tr><th>Date</th><th>Entry</th>${a ? '' : '<th>Account</th>'}<th>Narration</th><th>Job</th><th class="r">Debit</th><th class="r">Credit</th>${a ? '<th class="r">Balance</th>' : ''}</tr></thead><tbody>${rows.join('') || '<tr><td colspan="8" class="muted">No matching entries</td></tr>'}</tbody></table></div><p class="muted">${rows.length} line(s)</p>`;
  }
  E.route('ledger', 'Ledger Search', () => `<div class="bar"><select class="fs" data-f="lg.acc" style="max-width:300px"><option value="">All accounts</option>${E.opts(null, L.acc)}</select><input class="fs" style="min-width:240px" data-f="lg.q" placeholder="Search narration, entry, job, account, amount…" value="${E.esc(L.q)}"><input class="fs" type="date" data-f="lg.from" value="${L.from}" title="From"><input class="fs" type="date" data-f="lg.to" value="${L.to}" title="To"></div><div id="tbl">${ltbl()}</div>`);
  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f && f.startsWith('lg.')) { L[f.slice(3)] = e.target.value; E.$('tbl').innerHTML = ltbl() } });

  const R = (n, v, b) => `<tr><td>${b ? '<b>' : ''}${n}${b ? '</b>' : ''}</td><td class="r">${b ? '<b>' : ''}${E.m(v)}${b ? '</b>' : ''}</td></tr>`,
    H = t => `<tr><td colspan="2" style="background:var(--s2)"><b>${t}</b></td></tr>`,
    T = b => `<div class="tw"><table><tbody>${b}</tbody></table></div>`;
  const sum = (ac, m, f) => ac.filter(f).reduce((s, a) => s + nat(a, m[a.code]), 0),
    lst = (ac, m, f) => ac.filter(a => f(a) && nat(a, m[a.code])).sort(cs).map(a => R(a.code + ' · ' + E.esc(a.name), nat(a, m[a.code]))).join('');

  function pl() {
    const m = rt(F.from, F.to), A = E.rows('coa');
    const inc = sum(A, m, a => a.type === 'income'), cg = sum(A, m, a => a.code === '5400'), ex = sum(A, m, a => a.type === 'expense' && a.code !== '5400');
    return T(H('Income') + lst(A, m, a => a.type === 'income') + R('Total income', inc, 1) + H('Cost of goods sold') + lst(A, m, a => a.code === '5400') + R('Gross profit', inc - cg, 1) + H('Expenses') + lst(A, m, a => a.type === 'expense' && a.code !== '5400') + R('Total expenses', ex, 1) + R('NET PROFIT / (LOSS)', inc - cg - ex, 1));
  }
  function bs() {
    const m = rt('', F.to), A = E.rows('coa'), as = sum(A, m, a => a.type === 'asset'), li = sum(A, m, a => a.type === 'liability'), eq = sum(A, m, a => a.type === 'equity'), pr = sum(A, m, a => a.type === 'income') - sum(A, m, a => a.type === 'expense');
    return `<p class="muted">As at ${F.to}</p>` + T(H('Assets') + lst(A, m, a => a.type === 'asset') + R('Total assets', as, 1) + H('Liabilities') + lst(A, m, a => a.type === 'liability') + R('Total liabilities', li, 1) + H('Equity') + lst(A, m, a => a.type === 'equity') + R('Profit / (loss) to date', pr) + R('Total equity', eq + pr, 1) + R('Liabilities + equity', li + eq + pr, 1)) + `<p class="${as === li + eq + pr ? 'ok' : 'bad'}">${as === li + eq + pr ? '✓ Balance sheet balances' : '✗ Out of balance'}</p>`;
  }
  function prod() {
    const j = E.rows('journalEntries').filter(x => x.date >= F.from && x.date <= F.to), m = rt(F.from, F.to), A = E.rows('coa'), jr = {};
    j.forEach(x => x.lines.forEach(l => { if (l.acc === '1310' && l.job && ['Material', 'Labour', 'Overhead'].includes(l.cat)) { const r = jr[l.job] || (jr[l.job] = { Material: 0, Labour: 0, Overhead: 0 }); r[l.cat] += l.dr - l.cr } }));
    const ids = Object.keys(jr), jt = ids.reduce((s, k) => s + jr[k].Material + jr[k].Labour + jr[k].Overhead, 0),
      g = (codes, n) => `${H(n)}${lst(A, m, a => codes.includes(a.code))}${R('Total ' + n.toLowerCase(), sum(A, m, a => codes.includes(a.code)), 1)}`,
      byN = (ns, def) => { const c = A.filter(x => x.type === 'expense' && ns.includes(x.nature)).map(x => x.code); return c.length ? c : def },
      mt = byN(['oh'], ['6000', '6010', '6040']), ad = byN(['adm', 'sel', 'oth'], ['6050', '6030', '6020']), fi = byN(['fin'], ['6060']),
      ab = (E.acct('5290') ? nat(E.acct('5290'), m['5290']) : 0) || 0,
      ot = [...mt, ...ad, ...fi].reduce((s, c) => s + nat(E.acct(c), m[c]), 0) + ab;
    /* FIX: renamed pairs → packsReleased */
    const packsReleased = E.rows('stockMoves').filter(x => x.type === 'release' && x.date >= F.from && x.date <= F.to).reduce((s, x) => s + x.qty, 0);
    const tot = jt + ot;
    return T(H('Production costs for the period (all jobs together)') + R('Materials used', ids.reduce((s, k) => s + jr[k].Material, 0)) + R('Production wages (labour)', ids.reduce((s, k) => s + jr[k].Labour, 0)) + R('Overheads charged to production', ids.reduce((s, k) => s + jr[k].Overhead, 0)) + R('Total production costs', jt, 1) + g(mt, 'Indirect factory overhead') + (ab ? R('Less: overhead absorbed into jobs (already in job costs above)', ab) : '') + g(ad, 'Administration, selling & other expenses') + g(fi, 'Finance expenses') + R('TOTAL COST OF PRODUCT', tot, 1)) + `<p class="muted">Packs released to finished goods in the period: <b>${packsReleased}</b>${packsReleased ? ' · cost per pack incl. overheads: <b>' + E.m(Math.round(tot / packsReleased)) + '</b>' : ''}. Wastage booked as factory loss is excluded.</p>`;
  }
  function cf() {
    const A = E.rows('coa').filter(a => a.bank), cod = new Set(A.map(a => a.code)), open = E.rows('journalEntries').filter(j => j.date < F.from).reduce((s, j) => s + j.lines.filter(l => cod.has(l.acc)).reduce((a, l) => a + l.dr - l.cr, 0), 0), by = {};
    E.rows('journalEntries').filter(j => j.date >= F.from && j.date <= F.to).forEach(j => { const v = j.lines.filter(l => cod.has(l.acc)).reduce((a, l) => a + l.dr - l.cr, 0); if (v) by[j.source] = (by[j.source] || 0) + v });
    const N = { receipt: 'Customer receipts', payment: 'Supplier payments', payroll: 'Payroll, advances & EPF/ETF', petty: 'Petty cash', jobcost: 'Factory production costs paid', cheque: 'Cheques cleared', adjust: 'Adjustments', manual: 'Manual journals', sale: 'Sales', purchase: 'Purchases' },
      ks = Object.keys(by), net = ks.reduce((s, k) => s + by[k], 0);
    return T(R('Opening cash & bank', open, 1) + ks.map(k => R(N[k] || k, by[k])).join('') + R('Net movement', net, 1) + R('Closing cash & bank', open + net, 1));
  }
  E.route('reports', 'Financial Reports', () => {
    const tabs = [['pl', 'Profit & Loss'], ['bs', 'Balance Sheet'], ['pa', 'Production Account'], ['cf', 'Cash Flow']];
    return `<div class="bar">${tabs.map(t => `<button class="btn ${F.tab === t[0] ? 'p' : ''}" data-a="rtab" data-id="${t[0]}">${t[1]}</button>`).join('')}<span class="gap"></span>${F.tab === 'bs' ? '' : '<input id="r_f" type="date" class="fs" value="' + F.from + '">'}<input id="r_t" type="date" class="fs" value="${F.to}"><button class="btn" data-a="rapply">Apply</button><button class="btn" data-a="rprint">Print</button></div><div id="rep">${({ pl, bs, pa: prod, cf })[F.tab]()}</div>`;
  });
  E.A.rtab = t => { F.tab = t; E.go(); };
  E.A.rapply = () => { F.from = E.val('r_f') || F.from; F.to = E.val('r_t') || F.to; E.go(); };
  E.A.rprint = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write('<html><head><title>Report</title><style>body{font:13px Arial;padding:20px}table{width:100%;border-collapse:collapse}td{padding:5px;border-bottom:1px solid #ccc}.r{text-align:right}</style></head><body><h2>' + E.esc(E.factory().name) + '</h2>' + E.$('rep').innerHTML + '</body></html>'); w.document.close(); setTimeout(() => w.print(), 300) };

  /* Health check — FIX 1250 with staff loans */
  E.route('health', 'Health Check', () => {
    const t = E.totals(), sm = E.stockMap(), it = id => E.D.items.find(x => x.id === id), C = [];
    let rm = 0, fg = 0, neg = 0;
    for (const k in sm) { const i = it(k.split('|')[0]); if (i) i.cat === 'Finished Good' ? fg += sm[k].value : rm += sm[k].value; if (sm[k].qty < 0) neg++ }
    const dr = Object.values(t).reduce((s, x) => s + x.dr, 0), cr = Object.values(t).reduce((s, x) => s + x.cr, 0),
      je = E.rows('journalEntries').filter(j => j.lines.reduce((s, l) => s + l.dr - l.cr, 0) !== 0).length;
    const wipJ = E.rows('journalEntries').flatMap(j => j.lines).filter(l => l.acc === '1310' && l.job).reduce((s, l) => s + l.dr - l.cr, 0),
      pc = E.rows('cheques').filter(c => c.dir === 'in' && c.status === 'Pending').reduce((s, c) => s + c.amount, 0),
      pi = E.rows('cheques').filter(c => c.dir === 'out' && c.status === 'Pending').reduce((s, c) => s + c.amount, 0);
    const ck = (n, a, b, d) => C.push([a === b, n, a === b ? 'Agrees' : d + ' differs by ' + E.m(a - b)]);
    C.push([dr === cr, 'Total debits equal total credits', dr === cr ? E.m(dr) : 'Difference ' + E.m(dr - cr)]);
    C.push([je === 0, 'Every journal entry is balanced', je ? je + ' unbalanced entries' : 'All balanced']);
    ck('Materials stock = ledger 1300', rm, E.bal('1300'), 'Stock records');
    ck('Finished goods stock = ledger 1320', fg, E.bal('1320'), 'Stock records');
    ck('Supplier bills = ledger 2000', E.rows('purchases').filter(p => !p.cancelled).reduce((s, p) => s + p.total - p.paid, 0), E.bal('2000'), 'Bills');
    ck('Customer invoices = ledger 1200', E.rows('invoices').filter(i => !i.cancelled).reduce((s, i) => s + i.total - i.paid, 0), E.bal('1200'), 'Invoices');
    ck('Job WIP = ledger 1310', wipJ, E.bal('1310'), 'Job records');
    ck('Cheques in hand = ledger 1110', pc, E.bal('1110'), 'Cheque list');
    ck('Issued cheques = ledger 2150', pi, E.acct('2150') ? E.bal('2150') : 0, 'Cheque list');
    C.push([neg === 0, 'No negative stock', neg ? neg + ' item(s) negative' : 'OK']);
    C.push([E.bal('1010') >= 0, 'Petty cash not negative', E.m(E.bal('1010'))]);
    E.rows('coa').filter(a => a.bank).forEach(a => { if (E.bal(a.code) < 0) C.push([false, a.name + ' is overdrawn', E.m(E.bal(a.code))]) });
    const wr = E.rows('wageRuns').filter(r => r.kind === 'run' && !r.cancelled), emps = E.rows('employees');
    /* FIX: advances + staff loans */
    const advBalances = emps.reduce((s, e) => s + (E.advBal ? E.advBal(e.id) : 0), 0);
    const loanBalances = E.rows('staffLoans').filter(l => !l.cancelled && !l.settled)
      .reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
    ck('Employee advances + staff loans = ledger 1250', advBalances + loanBalances, E.acct('1250') ? E.bal('1250') : 0, 'Staff balances');
    ck('Wages & salaries payable = unpaid runs (ledger 2200)', wr.filter(r => !r.paid).reduce((s, r) => s + r.net, 0), E.acct('2200') ? E.bal('2200') : 0, 'Unpaid runs');
    ck('Piece wages accrued = unpaid production logs (ledger 2210)', E.rows('prodLogs').filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0), E.acct('2210') ? E.bal('2210') : 0, 'Production logs');
    const nb = emps.filter(e => E.advBal && E.advBal(e.id) < 0); C.push([!nb.length, 'No worker has recovered more advance than given', nb.length ? nb.map(e => e.name).join(', ') : 'OK']);
    const dup = ['invoices', 'deliveries', 'purchases', 'quotes', 'jobs', 'receipts', 'wageRuns'].filter(c => { const n = E.rows(c).map(x => x.no).filter(Boolean); return n.length !== new Set(n).size }); C.push([!dup.length, 'No duplicate document numbers', dup.length ? 'Duplicates in: ' + dup.join(', ') : 'OK']);
    const ov = E.rows('invoices').filter(i => !i.cancelled && i.paid > i.total).length + E.rows('purchases').filter(p => !p.cancelled && p.paid > p.total).length; C.push([!ov, 'No invoice or bill paid more than its total', ov ? ov + ' document(s) overpaid' : 'OK']);
    const bad = C.filter(c => !c[0]).length;
    return `<div class="kp">${E.kpi('Status', bad ? '<span class="bad">' + bad + ' issue(s)</span>' : '<span class="ok">All checks passed</span>', C.length + ' checks')}</div><div class="tw"><table><thead><tr><th></th><th>Check</th><th>Result</th></tr></thead><tbody>${C.map(c => `<tr><td>${c[0] ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`).join('')}</tbody></table></div><p class="muted">A difference on supplier or customer checks can come from manual journal entries posted straight to Payables / Receivables.</p>`;
  });
})(window.ERP);