/* Salary & Advance Register — includes staff loans in the outstanding balance */
(E => {
  let M = E.today().slice(0, 7);
  E.nav('People & Payroll', 'advreg', '📒', 'Salary & Advance Register');
  const payCat = e => {
    const pt = (e && e.payType) || 'Wage';
    if (pt === 'MonthlySalaried' || pt === 'Monthly') return 'MonthlySalaried';
    if (pt === 'DailySalaried') return 'DailySalaried';
    return 'Wage';
  };
  const CAT_LABEL = { Wage: 'Wage', DailySalaried: 'Daily Salary', MonthlySalaried: 'Monthly Salary' };
  const CAT_STYLE = { Wage: '', DailySalaried: 'background:#dbeafe;color:#1e40af', MonthlySalaried: 'background:#f3e8ff;color:#7c3aed' };
  const isSalaried = e => payCat(e) !== 'Wage';
  const allRuns = () => E.rows('wageRuns').filter(r => !r.cancelled);
  const advances = () => E.rows('wageRuns').filter(r => r.kind === 'advance' && !r.cancelled);
  const loansOpen = empId => (E.rows('staffLoans') || [])
    .filter(l => l.empId === empId && !l.cancelled && !l.settled)
    .reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
  const recoveryOf = (r, empId) => {
    if (r.kind === 'run') {
      const line = (r.lines || []).find(l => l.empId === empId);
      return line ? (line.advRec || 0) : 0;
    }
    if (r.kind === 'daily-salary' && r.empId === empId) return r.advRec || 0;
    return 0;
  };
  const netOf = (r, empId) => {
    if (r.kind === 'run') {
      const line = (r.lines || []).find(l => l.empId === empId);
      if (!line) return null;
      return { net: line.net || 0, category: r.type === 'Monthly' ? 'monthly' : 'wages' };
    }
    if (r.kind === 'daily-salary' && r.empId === empId) return { net: r.net || 0, category: 'daily' };
    return null;
  };

  function data() {
    const f = M + '-01';
    const t = M + '-31';
    const runs = allRuns();
    const advs = advances();
    return E.rows('employees')
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      .map(e => {
        const cat = payCat(e);
        const sal = isSalaried(e);
        const loanBal = loansOpen(e.id);
        const empAdv = advs.filter(r => r.empId === e.id);
        const given0 = empAdv.filter(r => r.date < f).reduce((s, r) => s + (r.amount || 0), 0);
        const givenM = empAdv.filter(r => r.date >= f && r.date <= t).reduce((s, r) => s + (r.amount || 0), 0);
        const rec0 = runs.filter(r => r.date < f).reduce((s, r) => s + recoveryOf(r, e.id), 0);
        const recM = runs.filter(r => r.date >= f && r.date <= t).reduce((s, r) => s + recoveryOf(r, e.id), 0);
        const mRuns = runs.filter(r => r.date >= f && r.date <= t);
        let netWages = 0, netDaily = 0, netMonthly = 0;
        mRuns.forEach(r => {
          const n = netOf(r, e.id);
          if (!n) return;
          if (n.category === 'wages') netWages += n.net;
          else if (n.category === 'daily') netDaily += n.net;
          else if (n.category === 'monthly') netMonthly += n.net;
        });
        return {
          e, cat, sal, loanBal,
          open: given0 - rec0 + loanBal,
          givenM, recM,
          close: given0 - rec0 + givenM - recM + loanBal,
          netWages, netDaily, netMonthly, netTotal: netWages + netDaily + netMonthly
        };
      })
      .filter(x => x.open || x.givenM || x.recM || x.netTotal || x.close || x.loanBal);
  }

  const body = () => {
    const D = data();
    const S = k => D.reduce((s, x) => s + (x[k] || 0), 0);
    const salaried = D.filter(x => x.sal);
    return `<div class="kp">
      ${E.kpi('Advances given', E.m(salaried.reduce((s, x) => s + x.givenM, 0)), M)}
      ${E.kpi('Recovered from salaries', E.m(salaried.reduce((s, x) => s + x.recM, 0)), 'this month')}
      ${E.kpi('Total balance (incl. loans)', E.m(salaried.reduce((s, x) => s + x.close, 0)), 'advances + staff loans')}
      ${E.kpi('Wages (net)', E.m(S('netWages')), 'paid via wage runs')}
      ${E.kpi('Daily Salaries (net)', E.m(S('netDaily')), 'daily-salaried staff')}
      ${E.kpi('Monthly Salaries (net)', E.m(S('netMonthly')), 'monthly-salaried staff')}
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Employee</th><th>Category</th>
        <th class="r">Opening</th><th>Adv. Month</th><th class="r">Staff Loan</th>
        <th class="r">Recovered</th><th class="r">Closing</th>
        <th class="r">Wages Net</th><th class="r">Daily Sal.</th><th class="r">Monthly Sal.</th>
      </tr></thead>
      <tbody>${D.map(x => {
        const advCell = (val, bold) => x.sal
          ? (bold ? `<b class="${val > 0 ? 'bad' : ''}">${E.m(val)}</b>` : E.m(val))
          : '<span class="muted">N/A</span>';
        const advGiven = x.sal ? (x.givenM ? E.m(x.givenM) : '—') : '<span class="muted">—</span>';
        return `<tr>
          <td><b>${E.esc(x.e.name)}</b><br><span class="muted">${E.esc(x.e.code || '')}</span></td>
          <td><span class="tag" style="${CAT_STYLE[x.cat]}">${CAT_LABEL[x.cat]}</span></td>
          <td class="r">${advCell(x.open)}</td>
          <td>${advGiven}</td>
          <td class="r">${x.loanBal ? '<b>' + E.m(x.loanBal) + '</b>' : '<span class="muted">—</span>'}</td>
          <td class="r">${advCell(x.recM)}</td>
          <td class="r">${advCell(x.close, true)}</td>
          <td class="r">${x.netWages ? E.m(x.netWages) : '—'}</td>
          <td class="r">${x.netDaily ? E.m(x.netDaily) : '—'}</td>
          <td class="r">${x.netMonthly ? `<b>${E.m(x.netMonthly)}</b>` : '—'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No advances or payments in this month</td></tr>'}</tbody>
    </table></div>
    <p class="muted" style="margin-top:10px;font-size:12px;line-height:1.6">
      <b>How to read this:</b>
      Wage workers can only appear in <em>Wages Net</em>. Daily/Monthly staff appear in their salary columns plus any piece work.
      Closing balance = outstanding advances + unpaid staff loans. Both sit in ledger 1250.
    </p>`;
  };

  E.route('advreg', 'Salary & Advance Register', () =>
    `<div class="bar">
      <input type="month" class="fs" style="max-width:180px" data-f="ar.m" value="${M}">
      <span class="gap"></span>
      <button class="btn" data-a="advM">+ Give advance</button>
      <button class="btn" onclick="window.print()">🖨 Print</button>
    </div>
    <div id="arb">${body()}</div>`);

  E.hooks.push(e => {
    if (e.target.dataset && e.target.dataset.f === 'ar.m' && e.target.value) {
      M = e.target.value;
      E.$('arb').innerHTML = body();
    }
  });
})(window.ERP);