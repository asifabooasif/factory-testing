/* Fixed Expenses — monthly amounts used for daily allocation.
   User enters each month's budgeted amount per expense head.
   System computes daily rate = total / working days.
*/
(E => {
  E.nav('Accounting', 'fixedexpenses', '🏢', 'Fixed Expenses');

  let CM = E.today().slice(0, 7);

  const monthRec = m => E.rows('fixedExpenses').filter(f => f.month === m);
  const getExpense = (m, code) => monthRec(m).find(f => f.code === code);

  /* Monthly salary aggregate from employees + salaryHistory */
  E.salaryAggregate = function(month) {
    const emps = E.rows('employees').filter(e => e.active && e.payType === 'MonthlySalaried');
    let total = 0;
    emps.forEach(e => {
      /* Use latest salaryHistory ≤ month-end, or current employee.amount */
      const hist = E.rows('salaryHistory')
        .filter(h => h.empId === e.id && h.effectiveDate <= month + '-31')
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
      const amt = hist.length ? hist[0].amount : (e.amount || 0);
      const allow = hist.length ? (hist[0].allow || 0) : (e.allow || 0);
      total += amt + allow;
    });
    return total;
  };

  /* Get all fixed 'days'-method expenses for month */
  E.fixedDaysExpenses = function(month) {
    const recs = monthRec(month).filter(f => f.allocMethod === 'days' && f.amount > 0);
    return recs.map(r => ({ code: r.code, name: r.name, amount: r.amount }));
  };

  /* Total for month: days-method expenses + salary aggregate */
  E.totalFixedForMonth = function(month) {
    const days = E.fixedDaysExpenses(month).reduce((s, e) => s + e.amount, 0);
    return days + E.salaryAggregate(month);
  };

  /* Daily rate */
  E.dailyFixedRate = function(month) {
    const wd = E.workingDaysIn ? E.workingDaysIn(month) : 0;
    if (wd === 0) return 0;
    return Math.round(E.totalFixedForMonth(month) / wd);
  };

  /* ═══════════════════════════════════════════════════════════
     ROUTE
     ═══════════════════════════════════════════════════════════ */
  E.route('fixedexpenses', 'Fixed Expenses', () => {
    const month = CM;
    const existing = monthRec(month);
    const salaryAgg = E.salaryAggregate(month);
    const wdCount = E.workingDaysIn ? E.workingDaysIn(month) : 0;
    const daysMethodExp = existing.filter(f => f.allocMethod === 'days');
    const totalDaysMethod = daysMethodExp.reduce((s, f) => s + f.amount, 0);
    const totalAll = totalDaysMethod + salaryAgg;
    const dailyRate = wdCount > 0 ? Math.round(totalAll / wdCount) : 0;

    /* Available expense heads */
    const heads = E.rows('coa')
      .filter(a => a.type === 'expense' && a.nature && !['contra', 'cogs', 'loss', 'dm', 'dl'].includes(a.nature) && !a.inactive)
      .sort((a, b) => a.code.localeCompare(b.code));

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <h3 style="margin:0">🏢 Fixed Expenses — ${month}</h3>
          <p class="muted" style="margin:4px 0 0;font-size:12px">Budgeted monthly amounts used for daily job costing. Not actual payments — those go to the ledger normally.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn sm" data-a="fePrev">◀</button>
          <input type="month" class="fs" value="${month}" onchange="E.A.feMonth(this.value)">
          <button class="btn sm" data-a="feNext">▶</button>
        </div>
      </div>

      <div class="kp">
        ${E.kpi('Days-method total', E.m(totalDaysMethod), daysMethodExp.length + ' expense(s)')}
        ${E.kpi('Salary aggregate', E.m(salaryAgg), 'auto from employees')}
        ${E.kpi('Working days', wdCount, 'this month')}
        ${E.kpi('Daily rate', dailyRate > 0 ? E.m(dailyRate) + '/day' : '—', dailyRate > 0 ? 'split across active jobs' : 'set working days first')}
      </div>

      ${wdCount === 0 ? '<div style="background:#fef3c7;padding:12px;border-radius:8px;border-left:4px solid #d97706;margin-bottom:14px"><b>⚠ Working days not set</b> — open <a href="#/workingdays" style="color:var(--ac)">System → Working Days</a> first.</div>' : ''}

      <div class="tw"><table>
        <thead><tr>
          <th>Expense head</th>
          <th>Allocation method</th>
          <th class="r">Monthly amount</th>
          <th class="r">Daily rate</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${heads.map(h => {
            const rec = getExpense(month, h.code);
            const isIncluded = rec && rec.allocMethod === 'days' && rec.amount > 0;
            const amt = rec ? rec.amount : 0;
            const rate = wdCount > 0 && isIncluded ? Math.round(amt / wdCount) : 0;
            const prevRec = E.rows('fixedExpenses')
              .filter(f => f.code === h.code && f.month < month && f.amount > 0)
              .sort((a, b) => b.month.localeCompare(a.month))[0];
            return `<tr style="${isIncluded ? '' : 'opacity:.6'}">
              <td><b>${h.code}</b> — ${E.esc(h.name)}</td>
              <td>${rec ? (rec.allocMethod === 'days' ? '<span class="tag" style="background:#d1fae5;color:#065f46">📅 Days</span>' : rec.allocMethod === 'pool' ? '<span class="tag" style="background:#fef3c7;color:#92400e">🏭 Pool</span>' : rec.allocMethod === 'period' ? '<span class="tag" style="background:#e0e7ff;color:#3730a3">📄 Period</span>' : '<span class="tag">' + rec.allocMethod + '</span>') : '<span class="muted">—</span>'}</td>
              <td class="r">${isIncluded ? E.m(amt) : '<span class="muted">—</span>'}</td>
              <td class="r">${rate ? E.m(rate) : '<span class="muted">—</span>'}</td>
              <td class="r">
                <button class="btn sm" data-a="feEdit" data-id="${h.code}">Edit</button>
                ${prevRec && !isIncluded ? `<button class="btn sm" data-a="feInherit" data-id="${h.code}|${prevRec.amount}">↩ Use ${E.m(prevRec.amount)}</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>

      <div style="margin-top:14px;padding:12px;background:var(--s2);border-radius:8px;font-size:12px;color:var(--t3)">
        <b>💡 Two numbers, two purposes:</b><br>
        • <b>Fixed Expenses (this page)</b> — budgeted amount for cost allocation to jobs by days.<br>
        • <b>Actual Expenses</b> — enter when you pay a bill (Expenses & Costs page). Real amount hits the ledger.<br>
        Both can differ — reconciliation report shows the variance.
      </div>

      <div class="card" style="margin-top:16px;background:var(--acs)">
        <h3>📊 Salary aggregate detail</h3>
        <p class="muted" style="margin-bottom:8px">Sum of all active Monthly-Salaried employees. Salary changes are tracked per effective date.</p>
        <div class="tw"><table>
          <thead><tr><th>Employee</th><th class="r">Base</th><th class="r">Allowance</th><th class="r">Total</th><th>Effective</th></tr></thead>
          <tbody>${E.rows('employees').filter(e => e.active && e.payType === 'MonthlySalaried').map(e => {
            const hist = E.rows('salaryHistory')
              .filter(h => h.empId === e.id && h.effectiveDate <= month + '-31')
              .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
            const h = hist[0];
            const amt = h ? h.amount : (e.amount || 0);
            const allow = h ? (h.allow || 0) : (e.allow || 0);
            return `<tr>
              <td>${E.esc(e.name)}</td>
              <td class="r">${E.m(amt)}</td>
              <td class="r">${allow ? E.m(allow) : '—'}</td>
              <td class="r"><b>${E.m(amt + allow)}</b></td>
              <td>${h ? h.effectiveDate : 'current'}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="muted">No monthly-salaried employees</td></tr>'}
          <tr style="background:var(--s2)"><td colspan="3"><b>Total salary aggregate</b></td><td class="r"><b>${E.m(salaryAgg)}</b></td><td></td></tr>
          </tbody>
        </table></div>
        <p class="muted" style="margin-top:8px;font-size:11px">To change someone's salary: edit them in <a href="#/employees" style="color:var(--ac)">Employees</a>. The system auto-records the change with effective date.</p>
      </div>

      <div class="bar" style="margin-top:16px">
        <button class="btn" data-a="feCopyPrev">↩ Copy all from last month</button>
        <span class="gap"></span>
        ${wdCount > 0 ? `<button class="btn p" data-a="feRecompute">🔄 Recompute allocations with new amounts</button>` : ''}
      </div>
    </div>`;
  });

  E.A.feMonth = m => { CM = m; E.go(); };
  E.A.fePrev = () => {
    const [y, mo] = CM.split('-').map(Number);
    CM = (mo === 1 ? y - 1 : y) + '-' + String(mo === 1 ? 12 : mo - 1).padStart(2, '0');
    E.go();
  };
  E.A.feNext = () => {
    const [y, mo] = CM.split('-').map(Number);
    CM = (mo === 12 ? y + 1 : y) + '-' + String(mo === 12 ? 1 : mo + 1).padStart(2, '0');
    E.go();
  };

  E.A.feEdit = code => {
    const h = E.acct(code);
    if (!h) return;
    const existing = getExpense(CM, code) || {};
    E.modal('Edit ' + h.name + ' for ' + CM, `
      <p class="muted" style="margin-bottom:14px">Set the budgeted amount for this month. Used only for daily allocation — actual payments go to the ledger separately.</p>
      <div class="g2">
        <div class="f">Allocation method
          <select id="fe_m">
            <option value="" ${!existing.allocMethod ? 'selected' : ''}>Not allocated (period/pool)</option>
            <option value="days" ${existing.allocMethod === 'days' ? 'selected' : ''}>📅 Days — split across jobs by working days</option>
            <option value="pool" ${existing.allocMethod === 'pool' ? 'selected' : ''}>🏭 Pool — absorbed at month end by packs</option>
            <option value="period" ${existing.allocMethod === 'period' ? 'selected' : ''}>📄 Period — P&L only, no job cost</option>
          </select>
        </div>
        <div class="f">Monthly amount (Rs)
          <input id="fe_a" type="number" step="0.01" value="${existing.amount ? (existing.amount / 100).toFixed(2) : ''}">
        </div>
      </div>
      <div class="f">Notes<input id="fe_n" value="${E.esc(existing.notes || '')}" placeholder="e.g. Actual bill last month Rs 32,000"></div>
      <p class="muted" style="font-size:12px">Tip: enter slightly higher than last month's actual for a safety margin — the reconciliation report will show the variance.</p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="feSave" data-id="${code}">Save</button>`);
  };

  E.A.feSave = async code => {
    try {
      const h = E.acct(code);
      const method = E.val('fe_m');
      const amt = E.c(E.val('fe_a'));
      const notes = E.val('fe_n');

      if (method && !(amt > 0)) throw new Error('Enter amount > 0 or choose a non-allocated method');

      const existing = getExpense(CM, code);
      const id = 'FE-' + E.fid + '-' + CM + '-' + code;
      const rec = {
        id, factoryId: E.fid, month: CM, code,
        name: h.name, allocMethod: method || '',
        amount: method ? amt : 0, notes,
        updatedAt: new Date().toISOString()
      };
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      await E.save('fixedExpenses', rec, b);
      E.closeM(); E.go();
      E.toast(h.name + ' saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.feInherit = async id => {
    const [code, amtStr] = id.split('|');
    const h = E.acct(code);
    const amt = parseInt(amtStr, 10);
    const existing = getExpense(CM, code);
    const rec = {
      id: 'FE-' + E.fid + '-' + CM + '-' + code,
      factoryId: E.fid, month: CM, code,
      name: h.name, allocMethod: 'days', amount: amt, notes: 'Copied from previous month',
      updatedAt: new Date().toISOString()
    };
    const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
    await E.save('fixedExpenses', rec, b);
    E.go();
    E.toast('Inherited ' + E.m(amt), 'success');
  };

  E.A.feCopyPrev = async () => {
    /* Get previous month */
    const [y, m] = CM.split('-').map(Number);
    const pm = (m === 1 ? y - 1 : y) + '-' + String(m === 1 ? 12 : m - 1).padStart(2, '0');
    const prevRecs = monthRec(pm);
    if (!prevRecs.length) return E.toast('No expenses in ' + pm + ' to copy', 'error');
    let n = 0;
    for (const r of prevRecs) {
      if (r.amount <= 0) continue;
      const existing = getExpense(CM, r.code);
      const id = 'FE-' + E.fid + '-' + CM + '-' + r.code;
      const newRec = {
        id, factoryId: E.fid, month: CM, code: r.code,
        name: r.name, allocMethod: r.allocMethod, amount: r.amount,
        notes: 'Copied from ' + pm,
        updatedAt: new Date().toISOString()
      };
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      await E.save('fixedExpenses', newRec, b);
      n++;
    }
    E.go();
    E.toast(n + ' expense(s) copied from ' + pm, 'success');
  };

  E.A.feRecompute = () => {
    if (!E.dailyAllocation) return E.toast('Allocation engine not loaded', 'error');
    if (!confirm('Recompute daily allocations for ' + CM + '? In-progress jobs will update, completed jobs stay frozen.')) return;
    E.dailyAllocation.recomputeMonth(CM).then(n => {
      E.toast('Recomputed ' + n + ' day(s)', 'success');
      E.go();
    }).catch(e => E.toast(e.message, 'error'));
  };
})(window.ERP);