/* Period Summary — includes staff loans in advances outstanding */
(E => {
  E.nav('Reports', 'summary', '📈', 'Period Summary');
  const pd = n => String(n).padStart(2, '0');
  const d0 = new Date();
  const Y = d0.getFullYear(), Mo = d0.getMonth() + 1;
  const last = (y, m) => new Date(y, m, 0).getDate();
  const F = { f: Y + '-' + pd(Mo) + '-01', t: E.today(), m: 'all' };
  const inp = d => (d || '') >= F.f && (d || '') <= F.t;
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const pty = id => (E.D.parties.find(p => p.id === id) || {}).name || '—';
  const jb = id => E.D.jobs.find(j => j.id === id) || {};
  const it = id => E.D.items.find(x => x.id === id) || {};
  const pk = id => it(id).pack || E.setting('packSize') || 1;
  const tb = (h, r, t) => `<div class="tw"><table><thead><tr>${h.map((x, i) => `<th class="${i ? 'r' : ''}">${x}</th>`).join('')}</tr></thead><tbody>${r.map(x => '<tr>' + x.map((c, i) => `<td class="${i ? 'r' : ''}">${c}</td>`).join('') + '</tr>').join('') || `<tr><td colspan="${h.length}" class="muted">Nothing in this period</td></tr>`}${t ? '<tr style="font-weight:700">' + t.map((c, i) => `<td class="${i ? 'r' : ''}">${c}</td>`).join('') + '</tr>' : ''}</tbody></table></div>`;
  const card = (t, b) => `<div class="card"><h3>${t}</h3>${b}</div>`;
  const m = E.m;

  function production() {
    const L = E.rows('journalEntries').filter(j => inp(j.date)).flatMap(j => j.lines.filter(l => l.acc === '1310' && l.job).map(l => ({ l })));
    const rel = E.rows('stockMoves').filter(x => x.type === 'release' && inp(x.date));
    const cost = (id, c) => sum(L.filter(x => (!id || x.l.job === id) && x.l.cat === c), x => x.l.dr - x.l.cr);
    const loss = id => sum(L.filter(x => (!id || x.l.job === id) && x.l.cat === 'Wastage'), x => x.l.cr);
    const packs = id => sum(rel.filter(x => !id || x.job === id), x => x.qty);
    const pairs = id => sum(rel.filter(x => !id || x.job === id), x => x.qty * pk(x.itemId));
    const val = id => sum(rel.filter(x => !id || x.job === id), x => x.value);
    const logs = E.rows('prodLogs').filter(l => inp(l.date) && l.status !== 'cancelled');
    const ids = [...new Set(L.map(x => x.l.job).concat(rel.map(x => x.job)).filter(Boolean))];
    const row = (n, id) => [n, packs(id), pairs(id), m(cost(id, 'Material')), m(cost(id, 'Labour')), m(cost(id, 'Overhead')), m(loss(id)), m(val(id))];
    const rows = F.m === 'job' ? ids.map(id => row('<b>' + E.esc(jb(id).no || 'Job') + '</b> ' + E.esc(pty(jb(id).partyId) === '—' ? 'Stock' : pty(jb(id).partyId)), id)) : [row('<b>All jobs together</b>', '')];
    const T = F.m === 'job' ? ['Total', packs(''), pairs(''), m(cost('', 'Material')), m(cost('', 'Labour')), m(cost('', 'Overhead')), m(loss('')), m(val(''))] : null;
    return card('1 · Production', `<div class="kp">${E.kpi('Packs completed', packs(''), 'released to stock')}${E.kpi('Pairs completed', pairs(''), '')}${E.kpi('Piece wages earned', m(sum(logs, l => l.amount)), logs.length + ' log entries')}${E.kpi('Cost of released goods', m(val('')), '')}</div>` + tb(['Job', 'Packs completed', 'Pairs', 'Materials used', 'Labour', 'Overhead', 'Wastage loss', 'Cost of goods released'], rows, T) + '<p class="muted">Costs are what was charged to jobs in the period; cost of goods released is the final cost moved into finished stock.</p>');
  }

  function payroll() {
    const allIn = E.rows('wageRuns').filter(r => !r.cancelled && inp(r.date));
    const W = allIn.filter(r => r.kind === 'run' && r.type !== 'Monthly');
    const S = allIn.filter(r => r.kind === 'run' && r.type === 'Monthly');
    const D = allIn.filter(r => r.kind === 'daily-salary');
    const recOf = r => {
      if (r.kind === 'run') return sum(r.lines, l => l.advRec || 0);
      if (r.kind === 'daily-salary') return r.advRec || 0;
      return 0;
    };
    const advAll = E.rows('wageRuns').filter(r => r.kind === 'advance' && !r.cancelled);
    const given = sum(advAll.filter(r => inp(r.date)), r => r.amount);
    const runsUpToT = E.rows('wageRuns').filter(r => !r.cancelled && r.date <= F.t && (r.kind === 'run' || r.kind === 'daily-salary'));
    const advGivenUpToT = sum(advAll.filter(r => r.date <= F.t), r => r.amount);
    const advRecUpToT = sum(runsUpToT, recOf);
    /* FIX: include staff loans */
    const loansOutstanding = E.rows('staffLoans').filter(l => !l.cancelled && !l.settled).reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
    const outst = advGivenUpToT - advRecUpToT + loansOutstanding;

    const per = E.rows('employees').map(e => {
      const cat = payCatName(e);
      const myAdvIn = sum(advAll.filter(r => r.empId === e.id && inp(r.date)), r => r.amount);
      const wLines = W.map(r => (r.lines || []).find(l => l.empId === e.id)).filter(Boolean);
      const wGross = sum(wLines, l => l.gross || 0);
      const wRec = sum(wLines, l => l.advRec || 0);
      const sLines = S.map(r => (r.lines || []).find(l => l.empId === e.id)).filter(Boolean);
      const sGross = sum(sLines, l => l.gross || 0);
      const sRec = sum(sLines, l => l.advRec || 0);
      const dRecs = D.filter(r => r.empId === e.id);
      const dGross = sum(dRecs, r => r.gross || 0);
      const dRec = sum(dRecs, r => r.advRec || 0);
      const myGiven = sum(advAll.filter(r => r.empId === e.id && r.date <= F.t), r => r.amount);
      const myRec = sum(runsUpToT.filter(r => (r.kind === 'run' && (r.lines || []).some(l => l.empId === e.id)) || (r.kind === 'daily-salary' && r.empId === e.id)), r => {
        if (r.kind === 'run') return sum(r.lines.filter(l => l.empId === e.id), l => l.advRec || 0);
        return r.advRec || 0;
      });
      const myLoans = E.rows('staffLoans').filter(l => l.empId === e.id && !l.cancelled && !l.settled).reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
      return { e, cat, myAdvIn, wRec, sRec, dRec, wGross, sGross, dGross, advBal: myGiven - myRec + myLoans, hasData: myAdvIn || wGross || sGross || dGross || (myGiven - myRec) || myLoans };
    }).filter(x => x.hasData);

    const totalW = sum(W, r => r.net || 0), totalS = sum(S, r => r.net || 0), totalD = sum(D, r => r.net || 0);
    const grossW = sum(W, r => r.gross || 0), grossS = sum(S, r => r.gross || 0), grossD = sum(D, r => r.gross || 0);

    return card('2 · Wages & Salaries',
      `<div class="kp">
        ${E.kpi('Wages paid', m(totalW), W.length + ' wage run(s)')}
        ${E.kpi('Daily Salaries paid', m(totalD), D.length + ' record(s)')}
        ${E.kpi('Monthly Salaries paid', m(totalS), S.length + ' run(s)')}
        ${E.kpi('Advances given', m(given), 'in period')}
        ${E.kpi('Advances outstanding', m(outst), 'advances + staff loans as of ' + F.t)}
      </div>` +
      tb(['Category', 'Count', 'Gross', 'Net paid'], [
        ['<b>Wages</b> (piece + days)', W.length, m(grossW), m(totalW)],
        ['<b>Daily Salaries</b>', D.length, m(grossD), m(totalD)],
        ['<b>Monthly Salaries</b>', S.length, m(grossS), m(totalS)]
      ], ['Total', W.length + D.length + S.length, m(grossW + grossD + grossS), m(totalW + totalD + totalS)]) +
      '<h4 style="margin:14px 0 4px">Employee breakdown</h4>' +
      tb(['Employee', 'Category', 'Advances taken', 'Advance recovered', 'Wages gross', 'Daily Sal. gross', 'Monthly Sal. gross', 'Balance'],
        per.map(x => [`<b>${E.esc(x.e.name)}</b><br><span class="muted">${x.e.code || ''}</span>`, `<span style="font-size:11px">${x.cat}</span>`, m(x.myAdvIn), m(x.wRec + x.sRec + x.dRec), m(x.wGross), m(x.dGross), m(x.sGross), m(x.advBal)]))
    );
  }

  function payCatName(e) {
    const pt = (e && e.payType) || 'Wage';
    if (pt === 'MonthlySalaried' || pt === 'Monthly') return 'Monthly';
    if (pt === 'DailySalaried') return 'Daily';
    return 'Wage';
  }

  function sales() {
    const inv = E.rows('invoices').filter(i => !i.cancelled && inp(i.date));
    const cn = E.rows('receipts').filter(r => r.kind === 'credit' && inp(r.date));
    const rc = E.rows('receipts').filter(r => r.kind !== 'credit' && inp(r.date));
    const dl = E.rows('deliveries').filter(d => d.status === 'Delivered' && inp(d.date));
    const by = {};
    inv.forEach(i => { const a = by[i.partyId] || (by[i.partyId] = { n: 0, t: 0, c: 0, r: 0 }); a.n++; a.t += i.total; });
    cn.forEach(c => { (by[c.partyId] || (by[c.partyId] = { n: 0, t: 0, c: 0, r: 0 })).c += c.amount; });
    rc.forEach(c => { (by[c.partyId] || (by[c.partyId] = { n: 0, t: 0, c: 0, r: 0 })).r += c.amount; });
    const net = sum(inv, i => i.total) - sum(cn, c => c.amount);
    const cg = sum(dl, d => d.cogs);
    return card('3 · Sales', `<div class="kp">${E.kpi('Invoiced', m(sum(inv, i => i.total)), inv.length + ' invoice(s)')}${E.kpi('Credit notes (returns)', m(sum(cn, c => c.amount)), '')}${E.kpi('Net sales', m(net), '')}${E.kpi('Collected', m(sum(rc, r => r.amount)), 'receipts')}${E.kpi('Delivered value', m(sum(dl, d => d.total)), 'cost ' + m(cg) + ' · gross profit ' + m(sum(dl, d => d.total) - cg))}</div>` + tb(['Customer', 'Invoices', 'Invoiced', 'Credit notes', 'Net sales', 'Collected'], Object.entries(by).map(([p, a]) => ['<b>' + E.esc(pty(p)) + '</b>', a.n, m(a.t), m(a.c), m(a.t - a.c), m(a.r)]), ['Total', inv.length, m(sum(inv, i => i.total)), m(sum(cn, c => c.amount)), m(net), m(sum(rc, r => r.amount))]));
  }

  function aging(c, title, led) {
    const today = new Date(E.today());
    const B = ['0–30', '31–60', '61–90', 'Over 90'], P = {};
    E.rows(c).filter(x => !x.cancelled && x.total - x.paid > 0).forEach(x => {
      const age = Math.floor((today - new Date(x.date)) / 864e5);
      const b = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
      const a = P[x.partyId] || (P[x.partyId] = [0, 0, 0, 0]);
      a[b] += x.total - x.paid;
    });
    const rows = Object.entries(P).map(([p, a]) => ['<b>' + E.esc(pty(p)) + '</b>'].concat(a.map(m), [m(sum(a, v => v))]));
    const T = B.map((_, i) => m(sum(Object.values(P), a => a[i])));
    return card(title, tb(['Party'].concat(B.map(x => x + ' days'), ['Total outstanding']), rows, ['Total'].concat(T, [m(sum(Object.values(P), a => sum(a, v => v)))])) + `<p class="muted">Balances as at today (${E.today()}) from open documents. Ledger ${led}: ${m(E.bal(led))}.</p>`);
  }

  function expenses() {
    const X = E.rows('expenses').filter(e => e.kind === 'voucher' && !e.cancelled && inp(e.date));
    const g = {};
    X.forEach(e => { const a = g[e.headName || e.head] || (g[e.headName || e.head] = [0, 0]); a[0]++; a[1] += e.amount; });
    return card('7 · Expenses by head', tb(['Expense head', 'Vouchers', 'Amount'], Object.entries(g).sort((a, b) => b[1][1] - a[1][1]).map(([h, a]) => [E.esc(h), a[0], m(a[1])]), ['Total', X.length, m(sum(X, e => e.amount))]));
  }

  function stock() {
    const sm = E.stockMap();
    let rm = 0, fg = 0;
    for (const k in sm) { const i = it(k.split('|')[0]); i.cat === 'Finished Good' ? fg += sm[k].value : rm += sm[k].value; }
    return card('8 · Stock position (today)', `<div class="kp">${E.kpi('Raw materials & others', m(rm), 'ledger 1300: ' + m(E.bal('1300')))}${E.kpi('Finished goods', m(fg), 'ledger 1320: ' + m(E.bal('1320')))}${E.kpi('Work in progress', m(E.bal('1310')), 'ledger 1310')}${E.kpi('Total stock value', m(rm + fg + E.bal('1310')), '')}</div>`);
  }

  function accounts() {
    const J = E.rows('journalEntries'), A = {};
    J.forEach(j => j.lines.forEach(l => {
      const a = A[l.acc] || (A[l.acc] = { o: 0, dr: 0, cr: 0 });
      if (j.date < F.f) a.o += l.dr - l.cr;
      else if (j.date <= F.t) { a.dr += l.dr; a.cr += l.cr; }
    }));
    const rows = E.rows('coa').sort((a, b) => a.code.localeCompare(b.code)).map(c => {
      const a = A[c.code] || { o: 0, dr: 0, cr: 0 };
      const s = c.type === 'asset' || c.type === 'expense' ? 1 : -1;
      const cl = a.o + a.dr - a.cr;
      return { c, o: a.o * s, dr: a.dr, cr: a.cr, cl: cl * s };
    }).filter(x => x.o || x.dr || x.cr || x.cl);
    return card('9 · All accounts — opening, movement and closing', tb(['Account', 'Type', 'Opening', 'Debit', 'Credit', 'Closing'], rows.map(x => [x.c.code + ' ' + E.esc(x.c.name), x.c.type, m(x.o), m(x.dr), m(x.cr), '<b>' + m(x.cl) + '</b>'])) + '<p class="muted">Balances are shown in each account\'s normal side.</p>');
  }

  const body = () => `<p class="muted">Period <b>${F.f}</b> to <b>${F.t}</b> · internal management report</p>${production()}${payroll()}${sales()}${aging('invoices', '5 · Receivables (customers owe us)', '1200')}${aging('purchases', '6 · Payables (we owe suppliers)', '2000')}${expenses()}${stock()}${accounts()}`;

  E.route('summary', 'Period Summary', () => `<div class="bar"><span class="muted">From</span><input type="date" class="fs" data-f="sm.f" value="${F.f}"><span class="muted">to</span><input type="date" class="fs" data-f="sm.t" value="${F.t}"><select class="fs" data-f="sm.m"><option value="all" ${F.m === 'all' ? 'selected' : ''}>Production: complete</option><option value="job" ${F.m === 'job' ? 'selected' : ''}>Production: job-wise</option></select><button class="btn" data-a="smPre" data-id="tm">This month</button><button class="btn" data-a="smPre" data-id="lm">Last month</button><button class="btn" data-a="smPre" data-id="ty">This year</button><span class="gap"></span><button class="btn" data-a="smPrint">🖨 Print</button></div><div id="sumb">${body()}</div>`);

  E.A.smPre = id => {
    const p = id === 'lm' ? (Mo === 1 ? [Y - 1, 12] : [Y, Mo - 1]) : [Y, Mo];
    if (id === 'ty') { F.f = Y + '-01-01'; F.t = E.today(); }
    else if (id === 'lm') { F.f = p[0] + '-' + pd(p[1]) + '-01'; F.t = p[0] + '-' + pd(p[1]) + '-' + pd(last(p[0], p[1])); }
    else { F.f = Y + '-' + pd(Mo) + '-01'; F.t = E.today(); }
    E.go();
  };

  E.A.smPrint = () => {
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    w.document.write('<html><head><title>Period Summary</title><style>body{font:12px Arial;margin:14px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border-bottom:1px solid #ccc;padding:4px;text-align:left}.r{text-align:right}.card{margin-bottom:14px}.kp{display:flex;gap:12px;flex-wrap:wrap}.k{border:1px solid #ccc;padding:6px 10px}.k small{display:block;color:#555}.muted{color:#666}</style></head><body><h2>' + E.esc(E.factory().name) + ' — Period Summary</h2>' + E.$('sumb').innerHTML + '</body></html>');
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.f;
    if (f && f.startsWith('sm.') && e.target.value) { F[f.slice(3)] = e.target.value; E.$('sumb').innerHTML = body(); }
  });
})(window.ERP);