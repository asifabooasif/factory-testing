/* Daily Allocation Engine — the core calculation.
   For each working day:
     dailyRate = (totalFixedForMonth + salaryAgg) / workingDaysInMonth
     activeJobs = all jobs where job.date <= day AND (job.completedAt || today) >= day
     perJobShare = dailyRate / activeJobs.length
   Accumulate per job. Never posts to journal.
*/
(E => {
  function activeJobsOn(date) {
    return E.rows('jobs').filter(j => {
      if (j.status === 'Cancelled') return false;
      if (!j.date) return false;
      if (j.date > date) return false;
      if (j.completedAt && j.completedAt < date) return false;
      return true;
    });
  }
  function addDays(d, n) {
    return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  }
  function daysBetween(start, end) {
    const out = [];
    let d = start;
    while (d <= end) { out.push(d); d = addDays(d, 1); }
    return out;
  }

  function computeDay(date) {
    const month = date.slice(0, 7);
    const isWorking = E.isWorkingDate ? E.isWorkingDate(date) : false;
    if (!isWorking) {
      return {
        id: 'DA-' + E.fid + '-' + date, factoryId: E.fid, date,
        isWorkingDay: false, dailyFixedTotal: 0, breakdown: {},
        activeJobs: [], perJobShare: 0, computedAt: new Date().toISOString()
      };
    }
    const activeJobs = activeJobsOn(date);
    if (!activeJobs.length) {
      return {
        id: 'DA-' + E.fid + '-' + date, factoryId: E.fid, date,
        isWorkingDay: true,
        dailyFixedTotal: E.dailyFixedRate ? E.dailyFixedRate(month) : 0,
        breakdown: {}, activeJobs: [], perJobShare: 0, isIdle: true,
        computedAt: new Date().toISOString()
      };
    }
    const totalDaily = E.dailyFixedRate ? E.dailyFixedRate(month) : 0;
    const perJobShare = Math.round(totalDaily / activeJobs.length);
    const breakdown = {};
    const expList = E.fixedDaysExpenses ? E.fixedDaysExpenses(month) : [];
    const wd = E.workingDaysIn ? E.workingDaysIn(month) : 1;
    if (wd > 0) {
      expList.forEach(e => { breakdown[e.code] = Math.round(e.amount / wd); });
      const salaryAgg = E.salaryAggregate ? E.salaryAggregate(month) : 0;
      if (salaryAgg > 0) breakdown['SAL'] = Math.round(salaryAgg / wd);
    }
    return {
      id: 'DA-' + E.fid + '-' + date, factoryId: E.fid, date,
      isWorkingDay: true, dailyFixedTotal: totalDaily,
      breakdown, activeJobs: activeJobs.map(j => j.id),
      perJobShare, computedAt: new Date().toISOString()
    };
  }

  async function saveDay(date) {
    const d = computeDay(date);
    const existing = E.rows('dailyAllocations').find(x => x.date === date);
    const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
    if (d.isWorkingDay && d.activeJobs.length > 0) {
      for (const jobId of d.activeJobs) {
        const job = E.D.jobs.find(j => j.id === jobId);
        if (!job) continue;
        if (job.status === 'Completed') continue;
        const jb = JSON.parse(JSON.stringify(job));
        job.shadowDaily = job.shadowDaily || {};
        job.shadowDaily[date] = d.perJobShare;
        await E.save('jobs', job, jb);
      }
    }
    if (existing) { Object.assign(existing, d); await E.save('dailyAllocations', existing, b); }
    else await E.save('dailyAllocations', d);
    return d;
  }

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

  async function recomputeFrom(startDate) {
    const today = E.today();
    if (startDate > today) return 0;
    const inProgress = E.rows('jobs').filter(j => j.status === 'In Progress' && j.date <= today);
    for (const job of inProgress) {
      const b = JSON.parse(JSON.stringify(job));
      if (job.shadowDaily) {
        for (const d in job.shadowDaily) { if (d >= startDate) delete job.shadowDaily[d]; }
        await E.save('jobs', job, b);
      }
    }
    const dates = daysBetween(startDate, today);
    for (const date of dates) await saveDay(date);
    return dates.length;
  }

  async function recomputeMonth(month) { return computeMonth(month); }

  /* ── FREEZE ON COMPLETION ─────────────────────────────────────
     FIXES APPLIED:
       1. Per-expense split was double-dividing (dailyShare / activeJobs / activeJobs).
          Now splits each expense code's daily amount by the number of active jobs.
       2. Attendance-based time wages cannot be attributed to a specific job without
          per-job attendance tracking. We now freeze ONLY:
            - postedCost (includes piece wages, materials, direct overheads)
            - totalFixedAllocated (shadow allocation)
          Time wages are correctly posted to 1310 (if job open) or 5390 (if job closed)
          by the wage run — no double-counting, no wrong attribution.
  */
  async function freezeJobShadow(jobId) {
    const job = E.D.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Job not found');
    if (job.status !== 'In Progress') throw new Error('Job not in progress');

    const daily = job.shadowDaily || {};
    let totalFixed = 0;
    const perExpense = {};

    for (const date in daily) {
      totalFixed += daily[date];
      const daRec = E.rows('dailyAllocations').find(x => x.date === date);
      if (daRec && daRec.activeJobs.length > 0) {
        const jobFraction = 1 / daRec.activeJobs.length;
        for (const code in (daRec.breakdown || {})) {
          perExpense[code] = (perExpense[code] || 0) + Math.round(daRec.breakdown[code] * jobFraction);
        }
      }
    }

    const postedCost = E.rows('journalEntries')
      .flatMap(j => j.lines.filter(l => l.job === jobId && l.acc === '1310'))
      .reduce((s, l) => s + l.dr - l.cr, 0);

    const completeCost = postedCost + totalFixed;
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
      postedCostAtCompletion: postedCost,
      completeCost,
      packsInJob: packs,
      completeCostPerPack: packs ? Math.round(completeCost / packs) : 0,
      completeCostPerPair: packs && pairs ? Math.round(completeCost / pairs) : 0,
      pairsInJob: Math.round(pairs)
    };
  }

  E.dailyAllocation = {
    computeDay, saveDay, computeMonth, recomputeFrom,
    recomputeMonth, freezeJobShadow, activeJobsOn
  };

  function hookJobCreation() {
    if (!E.A.saveJob || E.A.saveJob.__hooked_da) return;
    const orig = E.A.saveJob;
    const wrapped = async function () {
      const beforeIds = new Set(E.rows('jobs').map(j => j.id));
      await orig.apply(this, arguments);
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

  async function catchUpToday() {
    if (!E.fid || !E.factory || !E.factory()) return;
    const today = E.today();
    if (E.rows('dailyAllocations').find(x => x.date === today)) return;
    try { await saveDay(today); } catch (e) { console.warn('Daily allocation catch-up failed:', e); }
  }

  const init = () => {
    if (!E.fid || !E.factory || !E.factory()) { setTimeout(init, 1000); return; }
    hookJobCreation();
    setTimeout(catchUpToday, 2000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);
})(window.ERP);