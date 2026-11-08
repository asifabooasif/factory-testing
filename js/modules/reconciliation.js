/* Cost Reconciliation — Compare shadow allocation vs actual expenses per month.
   Shows if the estimates from Fixed Expenses matched real spending.
   Also shows per-job allocations and idle cost.
*/
(E => {
  E.nav('Reports', 'reconciliation', '📊', 'Cost Reconciliation');

  let CM = E.today().slice(0, 7);

  function computeRecon(month) {
    /* Actual 'days'-method expenses from journal */
    const actualByCode = {};
    const daysMethodCodes = new Set();
    E.rows('fixedExpenses').filter(f => f.month === month && f.allocMethod === 'days').forEach(f => {
      daysMethodCodes.add(f.code);
    });
    if (daysMethodCodes.size === 0) {
      E.rows('coa').filter(a => a.nature === 'oh' && a.type === 'expense').forEach(a => {
        if (!['5290', '5295', '5390'].includes(a.code)) daysMethodCodes.add(a.code);
      });
    }

    E.rows('journalEntries').filter(j => j.date && j.date.slice(0, 7) === month).forEach(j => {
      j.lines.forEach(l => {
        if (!daysMethodCodes.has(l.acc)) return;
        actualByCode[l.acc] = (actualByCode[l.acc] || 0) + (l.dr - l.cr);
      });
    });

    /* Actual monthly salary (compare to aggregate) */
    const actualSalary = E.rows('journalEntries')
      .filter(j => j.date && j.date.slice(0, 7) === month)
      .flatMap(j => j.lines.filter(l => ['5130', '6050'].includes(l.acc)))
      .reduce((s, l) => s + (l.dr - l.cr), 0);

    /* Planned (from fixed expenses) */
    const plannedByCode = {};
    let plannedSalary = E.salaryAggregate ? E.salaryAggregate(month) : 0;
    E.rows('fixedExpenses').filter(f => f.month === month && f.allocMethod === 'days').forEach(f => {
      plannedByCode[f.code] = f.amount;
    });

    /* Per-job allocated amounts from dailyAllocations */
    const perJob = {};
    const idleDays = [];
    let idleCost = 0;

    E.rows('dailyAllocations').filter(d => d.date.slice(0, 7) === month).forEach(d => {
      if (!d.isWorkingDay) return;
      if (!d.activeJobs || !d.activeJobs.length) {
        idleDays.push(d.date);
        idleCost += d.dailyFixedTotal || 0;
        return;
      }
      d.activeJobs.forEach(jobId => {
        if (!perJob[jobId]) perJob[jobId] = { total: 0, days: 0 };
        perJob[jobId].total += d.perJobShare || 0;
        perJob[jobId].days += 1;
      });
    });

    /* Totals */
    const totalActual = Object.values(actualByCode).reduce((s, v) => s + v, 0) + actualSalary;
    const totalPlanned = Object.values(plannedByCode).reduce((s, v) => s + v, 0) + plannedSalary;
    const totalAllocated = Object.values(perJob).reduce((s, p) => s + p.total, 0);
    const totalUnallocated = totalActual - totalAllocated;

    /* Variance: planned vs actual */
    const allCodes = new Set([...Object.keys(actualByCode), ...Object.keys(plannedByCode)]);
    const perHead = [];
    allCodes.forEach(code => {
      const a = E.acct(code);
      const planned = plannedByCode[code] || 0;
      const actual = actualByCode[code] || 0;
      perHead.push({ code, name: a ? a.name : code, planned, actual, variance: actual - planned });
    });
    perHead.push({ code: 'SAL', name: 'Monthly Salaries', planned: plannedSalary, actual: actualSalary, variance: actualSalary - plannedSalary });

    return {
      month,
      perHead,
      totalActual, totalPlanned, totalAllocated, totalUnallocated,
      perJob, idleDays, idleCost,
      variancePlanned: totalActual - totalPlanned
    };
  }

  E.route('reconciliation', 'Cost Reconciliation', () => {
    const r = computeRecon(CM);

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <h3 style="margin:0">📊 Cost Reconciliation — ${CM}</h3>
          <p class="muted" style="margin:4px 0 0;font-size:12px">Compare estimated fixed expenses (used for daily allocation) with actual spend from the ledger.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn sm" data-a="recPrev">◀</button>
          <input type="month" class="fs" value="${CM}" onchange="E.A.recMonth(this.value)">
          <button class="btn sm" data-a="recNext">▶</button>
        </div>
      </div>

      <div class="kp">
        ${E.kpi('Planned (estimates)', E.m(r.totalPlanned), 'from Fixed Expenses')}
        ${E.kpi('Actual (paid)', E.m(r.totalActual), 'from ledger')}
        ${E.kpi('Allocated to jobs', E.m(r.totalAllocated), 'daily accumulation')}
        ${E.kpi('Unallocated', E.m(r.totalUnallocated), r.idleDays.length + ' idle day(s)')}
      </div>

      <h3 style="margin-top:20px">Per-expense comparison</h3>
      <div class="tw"><table>
        <thead><tr>
          <th>Expense</th><th class="r">Planned</th><th class="r">Actual</th><th class="r">Variance</th><th>Status</th>
        </tr></thead>
        <tbody>${r.perHead.map(h => {
          const abs = Math.abs(h.variance);
          const pct = h.planned ? (h.variance / h.planned * 100) : 0;
          const ok = abs < Math.max(100, h.planned * 0.05);
          const status = !h.planned && !h.actual ? '' : ok ? '<span class="ok">✓ matched</span>' : h.variance > 0 ? '<span class="bad">over budget</span>' : '<span style="color:#d97706">under budget</span>';
          return `<tr>
            <td>${h.code} — ${E.esc(h.name)}</td>
            <td class="r">${E.m(h.planned)}</td>
            <td class="r">${E.m(h.actual)}</td>
            <td class="r ${!ok ? 'bad' : ''}">${h.variance > 0 ? '+' : ''}${E.m(h.variance)}</td>
            <td>${status}</td>
          </tr>`;
        }).join('')}
        <tr style="background:var(--s2)">
          <td><b>TOTAL</b></td>
          <td class="r"><b>${E.m(r.totalPlanned)}</b></td>
          <td class="r"><b>${E.m(r.totalActual)}</b></td>
          <td class="r"><b>${r.variancePlanned > 0 ? '+' : ''}${E.m(r.variancePlanned)}</b></td>
          <td></td>
        </tr>
        </tbody>
      </table></div>

      ${r.idleDays.length > 0 ? `<div class="card" style="background:#fef3c7;border-left:4px solid #d97706">
        <h3 style="margin-top:0">⚠ Idle capacity cost</h3>
        <p><b>${r.idleDays.length} working day(s) had no active jobs.</b> Fixed cost during these days: <b>${E.m(r.idleCost)}</b></p>
        <p class="muted" style="font-size:12px">Idle days: ${r.idleDays.slice(0, 15).join(', ')}${r.idleDays.length > 15 ? '…' : ''}</p>
        <p class="muted" style="font-size:12px">This cost was NOT allocated to any job. Consider: was this downtime intentional or a scheduling gap?</p>
      </div>` : ''}

      <h3 style="margin-top:20px">Per-job allocation</h3>
      <div class="tw"><table>
        <thead><tr>
          <th>Job</th><th>Customer</th><th class="r">Days active</th><th class="r">Allocated fixed</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${Object.entries(r.perJob).map(([jobId, p]) => {
          const job = E.D.jobs.find(j => j.id === jobId) || {};
          const party = E.D.parties.find(x => x.id === job.partyId);
          return `<tr>
            <td><b>${E.esc(job.no || '?')}</b></td>
            <td>${E.esc(party ? party.name : 'Stock production')}</td>
            <td class="r">${p.days}</td>
            <td class="r"><b>${E.m(p.total)}</b></td>
            <td><span class="tag">${job.status || '?'}</span></td>
            <td class="r"><button class="btn sm" data-a="openJob" data-id="${jobId}">Open</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">No jobs allocated this month</td></tr>'}
        <tr style="background:var(--s2)">
          <td colspan="3"><b>Total allocated</b></td>
          <td class="r"><b>${E.m(r.totalAllocated)}</b></td>
          <td colspan="2"></td>
        </tr>
        </tbody>
      </table></div>

      <div style="margin-top:16px;padding:14px;background:var(--s2);border-radius:8px">
        <b style="font-size:14px">Summary</b>
        <ul style="margin:10px 0 0 20px;line-height:1.7;font-size:13px">
          <li>Planned expense estimates: <b>${E.m(r.totalPlanned)}</b></li>
          <li>Actual expenses paid: <b>${E.m(r.totalActual)}</b></li>
          <li>Variance (actual − planned): <b class="${r.variancePlanned > 0 ? 'bad' : 'ok'}">${r.variancePlanned > 0 ? '+' : ''}${E.m(r.variancePlanned)}</b></li>
          <li>Allocated to jobs: <b>${E.m(r.totalAllocated)}</b></li>
          <li>Unallocated (idle): <b>${E.m(r.totalUnallocated)}</b></li>
          <li style="margin-top:8px;color:var(--t3)">P&amp;L shows actual (${E.m(r.totalActual)}). Jobs' cost sheets use allocated (${E.m(r.totalAllocated)}). Variance is informational, not a posting.</li>
        </ul>
      </div>

      <div class="bar" style="margin-top:16px">
        <span class="gap"></span>
        <button class="btn" onclick="window.print()">🖨 Print report</button>
      </div>
    </div>`;
  });

  E.A.recMonth = m => { CM = m; E.go(); };
  E.A.recPrev = () => {
    const [y, mo] = CM.split('-').map(Number);
    CM = (mo === 1 ? y - 1 : y) + '-' + String(mo === 1 ? 12 : mo - 1).padStart(2, '0');
    E.go();
  };
  E.A.recNext = () => {
    const [y, mo] = CM.split('-').map(Number);
    CM = (mo === 12 ? y + 1 : y) + '-' + String(mo === 12 ? 1 : mo + 1).padStart(2, '0');
    E.go();
  };
})(window.ERP);