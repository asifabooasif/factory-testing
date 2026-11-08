/* Daily Allocation Engine — the core calculation.
   For each working day:
     dailyRate = (totalFixedForMonth + salaryAgg) / workingDaysInMonth
     activeJobs = all jobs where job.date <= day AND (job.completedAt || today) >= day
     perJobShare = dailyRate / activeJobs.length
   Accumulate per job. Never posts to journal.
*/
(E => {
  /* ═══════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════ */

  function activeJobsOn(date) {
    return E.rows('jobs').filter(j => {
      if (j.status === 'Cancelled') return false;
      if (!j.date) return false;
      if (j.date > date) return false;
      if (j.completedAt && j.completedAt < date) return false;
      return true;
    });
  }

  function dateInRange(d, start, end) {
    return d >= start && d <= end;
  }

  function addDays(d, n) {
    return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  }

  function daysBetween(start, end) {
    const out = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════
     COMPUTE ONE DAY
     ═══════════════════════════════════════════════════════════ */
  function computeDay(date) {
    const month = date.slice(0, 7);
    const isWorking = E.isWorkingDate ? E.isWorkingDate(date) : false;

    if (!isWorking) {
      return {
        id: 'DA-' + E.fid + '-' + date,
        factoryId: E.fid,
        date,
        isWorkingDay: false,
        dailyFixedTotal: 0,
        breakdown: {},
        activeJobs: [],
        perJobShare: 0,
        computedAt: new Date().toISOString()
      };
    }

    const activeJobs = activeJobsOn(date);
    if (!activeJobs.length) {
      return {
        id: 'DA-' + E.fid + '-' + date,
        factoryId: E.fid,
        date,
        isWorkingDay: true,
        dailyFixedTotal: E.dailyFixedRate ? E.dailyFixedRate(month) : 0,
        breakdown: {},
        activeJobs: [],
        perJobShare: 0,
        isIdle: true,
        computedAt: new Date().toISOString()
      };
    }

    const totalDaily = E.dailyFixedRate ? E.dailyFixedRate(month) : 0;
    const perJobShare = Math.round(totalDaily / activeJobs.length);

    /* Breakdown by expense code */
    const breakdown = {};
    const expList = E.fixedDaysExpenses ? E.fixedDaysExpenses(month) : [];
    const wd = E.workingDaysIn ? E.workingDaysIn(month) : 1;
    if (wd > 0) {
      expList.forEach(e => {
        breakdown[e.code] = Math.round(e.amount / wd);
      });
      const salaryAgg = E.salaryAggregate ? E.salaryAggregate(month) : 0;
      if (salaryAgg > 0) breakdown['SAL'] = Math.round(salaryAgg / wd);
    }

    return {
      id: 'DA-' + E.fid + '-' + date,
      factoryId: E.fid,
      date,
      isWorkingDay: true,
      dailyFixedTotal: totalDaily,
      breakdown,
      activeJobs: activeJobs.map(j => j.id),
      perJobShare,
      computedAt: new Date().toISOString()
    };
  }

  /* ═══════════════════════════════════════════════════════════
     SAVE ONE DAY
     ═══════════════════════════════════════════════════════════ */
  async function saveDay(date) {
    const d = computeDay(date);
    const existing = E.rows('dailyAllocations').find(x => x.date === date);
    const b = existing ? JSON.parse(JSON.stringify(existing)) : null;

    if (d.isWorkingDay && d.activeJobs.length > 0) {
      /* Update each active in-progress job's accumulator */
      for (const jobId of d.activeJobs) {
        const job = E.D.jobs.find(j => j.id === jobId);
        if (!job) continue;
        if (job.status === 'Completed') continue; /* frozen */
        const jb = JSON.parse(JSON.stringify(job));
        job.shadowDaily = job.shadowDaily || {};
        job.shadowDaily[date] = d.perJobShare;
        await E.save('jobs', job, jb);
      }
    }

    if (existing) {
      Object.assign(existing, d);
      await E.save('dailyAllocations', existing, b);
    } else {
      await E.save('dailyAllocations', d);
    }
    return d;
  }

  /* ═══════════════════════════════════════════════════════════
     COMPUTE MONTH
     ═══════════════════════════════════════════════════════════ */
  async function computeMonth(month) {
    const [y, m] = month.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    let n = 0;
    for (let day = 1; day <= dim; day++) {
      const date = month + '-' + String(day).padStart(2, '0');
      await saveDay(date);
      n++;
    }
    return n;
  }

  /* ═══════════════════════════════════════════════════════════
     RECOMPUTE FROM A DATE (for back-dated jobs)
     ═══════════════════════════════════════════════════════════ */
  async function recomputeFrom(startDate) {
    const today = E.today();
    if (startDate > today) return 0;

    /* Clear shadowDaily for all in-progress jobs starting from startDate */
    const inProgress = E.rows('jobs').filter(j => j.status === 'In Progress' && j.date <= today);
    for (const job of inProgress) {
      const b = JSON.parse(JSON.stringify(job));
      if (job.shadowDaily) {
        for (const d in job.shadowDaily) {
          if (d >= startDate) delete job.shadowDaily[d];
        }
        await E.save('jobs', job, b);
      }
    }

    /* Recompute each day from startDate to today */
    const dates = daysBetween(startDate, today);
    for (const date of dates) {
      await saveDay(date);
    }
    return dates.length;
  }

  /* ═══════════════════════════════════════════════════════════
     RECOMPUTE MONTH (from calendar edits or expense changes)
     ═══════════════════════════════════════════════════════════ */
  async function recomputeMonth(month) {
    return computeMonth(month);
  }

  /* ═══════════════════════════════════════════════════════════
     FREEZE ON COMPLETION
     ═══════════════════════════════════════════════════════════ */
  async function freezeJobShadow(jobId) {
    const job = E.D.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Job not found');
    if (job.status !== 'In Progress') throw new Error('Job not in progress');

    const daily = job.shadowDaily || {};
    let totalFixed = 0;
    const perExpense = {};

    for (const date in daily) {
      const dailyShare = daily[date];
      totalFixed += dailyShare;
      const daRec = E.rows('dailyAllocations').find(x => x.date === date);
      if (daRec && daRec.activeJobs.length > 0) {
        const share = dailyShare / daRec.activeJobs.length;
        for (const code in (daRec.breakdown || {})) {
          perExpense[code] = (perExpense[code] || 0) + share;
        }
      }
    }

    /* Round per-expense totals */
    for (const code in perExpense) {
      perExpense[code] = Math.round(perExpense[code]);
    }

    /* Accrued unpaid wages */
    const accruedWages = computeAccruedWages(job);

    /* Posted cost from ledger */
    const postedCost = E.rows('journalEntries')
      .flatMap(j => j.lines.filter(l => l.job === jobId && l.acc === '1310'))
      .reduce((s, l) => s + l.dr - l.cr, 0);

    const completeCost = postedCost + totalFixed + accruedWages.total;
    const packs = E.rows('jobLines').filter(l => l.jobId === jobId).reduce((s, l) => s + (l.released || 0), 0);
    const pairs = packs * (E.rows('jobLines').filter(l => l.jobId === jobId).reduce((s, l) => {
      const item = E.D.items.find(i => i.id === l.itemId);
      return s + ((item && item.pack) || 1);
    }, 0) / Math.max(1, E.rows('jobLines').filter(l => l.jobId === jobId).length));

    return {
      frozenAt: new Date().toISOString(),
      dailyAllocBreakdown: daily,
      totalFixedAllocated: totalFixed,
      perExpenseTotal: perExpense,
      accruedWages,
      postedCostAtCompletion: postedCost,
      completeCost,
      packsInJob: packs,
      completeCostPerPack: packs ? Math.round(completeCost / packs) : 0,
      completeCostPerPair: packs && pairs ? Math.round(completeCost / pairs) : 0,
      pairsInJob: Math.round(pairs)
    };
  }

  function computeAccruedWages(job) {
    const today = E.today();
    const completedAt = job.completedAt || today;

    /* Week start: most recent Monday before completion */
    function mostRecentMonday(date) {
      const d = new Date(date + 'T00:00:00');
      const dow = d.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
      return new Date(d - diff * 864e5).toISOString().slice(0, 10);
    }

    const weekStart = mostRecentMonday(completedAt);

    /* Daily-salaried workers on this job */
    let dailyOwed = 0;
    const dailyEmps = E.rows('employees').filter(e => e.active && e.payType === 'DailySalaried');
    for (const emp of dailyEmps) {
      const att = E.rows('attendance').filter(a => a.empId === emp.id && a.date >= weekStart && a.date <= completedAt && a.date >= job.date && (a.status === 'Present' || a.status === 'Half day'));
      const daysWorked = att.reduce((s, a) => s + (a.status === 'Half day' ? 0.5 : 1), 0);
      const paidRecs = E.rows('wageRuns').filter(r => r.kind === 'daily-salary' && r.empId === emp.id && r.date >= weekStart && r.date <= completedAt && !r.cancelled);
      const daysPaid = paidRecs.reduce((s, r) => s + (r.days || 0), 0);
      const unpaid = Math.max(0, daysWorked - daysPaid);
      dailyOwed += Math.round(unpaid * (emp.amount || 0));
    }

    /* Wage workers on this job */
    let weeklyOwed = 0;
    const wageEmps = E.rows('employees').filter(e => e.active && e.payType === 'Wage');
    for (const emp of wageEmps) {
      const att = E.rows('attendance').filter(a => a.empId === emp.id && a.date >= weekStart && a.date <= completedAt && a.date >= job.date && (a.status === 'Present' || a.status === 'Half day'));
      const daysWorked = att.reduce((s, a) => s + (a.status === 'Half day' ? 0.5 : 1), 0);
      /* Approximate: if any wage run in this week covering this employee, assume 0 */
      const runsThisWeek = E.rows('wageRuns').filter(r => r.kind === 'run' && !r.cancelled && r.date >= weekStart && r.date <= completedAt && (r.lines || []).some(l => l.empId === emp.id));
      if (runsThisWeek.length === 0) {
        weeklyOwed += Math.round(daysWorked * (emp.amount || 0));
      }
    }

    return {
      dailySalaries: dailyOwed,
      weeklyTimeWages: weeklyOwed,
      total: dailyOwed + weeklyOwed
    };
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */
  E.dailyAllocation = {
    computeDay,
    saveDay,
    computeMonth,
    recomputeFrom,
    recomputeMonth,
    freezeJobShadow,
    activeJobsOn
  };

  /* ═══════════════════════════════════════════════════════════
     HOOK: JOB CREATION (back-dated → recompute)
     ═══════════════════════════════════════════════════════════ */
  function hookJobCreation() {
    if (!E.A.saveJob || E.A.saveJob.__hooked_da) return;
    const orig = E.A.saveJob;
    const wrapped = async function () {
      const beforeIds = new Set(E.rows('jobs').map(j => j.id));
      await orig.apply(this, arguments);
      /* Find newly created job */
      const newJobs = E.rows('jobs').filter(j => !beforeIds.has(j.id));
      if (newJobs.length) {
        const j = newJobs[0];
        if (j.date && j.date <= E.today()) {
          try {
            await recomputeFrom(j.date);
            E.toast('Recomputed daily allocations from ' + j.date, 'success');
          } catch (e) { console.warn('Allocation recompute failed:', e); }
        }
      }
    };
    wrapped.__hooked_da = true;
    E.A.saveJob = wrapped;
  }

  /* ═══════════════════════════════════════════════════════════
     DAILY COMPUTE ON LOAD (catch-up)
     ═══════════════════════════════════════════════════════════ */
  async function catchUpToday() {
    if (!E.fid || !E.factory || !E.factory()) return;
    const today = E.today();
    const existing = E.rows('dailyAllocations').find(x => x.date === today);
    if (existing) return;
    try {
      await saveDay(today);
    } catch (e) {
      console.warn('Daily allocation catch-up failed:', e);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════ */
  const init = () => {
    if (!E.fid || !E.factory || !E.factory()) { setTimeout(init, 1000); return; }
    hookJobCreation();
    setTimeout(catchUpToday, 2000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);
})(window.ERP);