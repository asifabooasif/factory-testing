/* Working Days Calendar — month-start setup.
   User marks each day of the month as working or holiday.
   Daily allocation rate = monthly fixed total / working days in month.
   No daily nagging. Sundowns auto-holiday, Mon-Sat auto-working.
*/
(E => {
  E.nav('System', 'workingdays', '📅', 'Working Days');

  const KEY = () => 'erp_wd_' + E.fid;
  let CM = E.today().slice(0, 7); /* current month in view */

  const rec = month => E.rows('workingDays').find(w => w.month === month);
  const wd = month => rec(month) || { month, days: {} };
  const isWorking = (month, day) => wd(month).days[day] === 'working';
  const isHoliday = (month, day) => wd(month).days[day] === 'holiday';

  /* Days of month */
  const daysInMonth = month => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };
  const dayOfWeek = (month, day) => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, day).getDay(); /* 0=Sun, 6=Sat */
  };

  /* Default for a day: Sunday = holiday, others = working */
  const defaultStatus = (month, day) => dayOfWeek(month, day) === 0 ? 'holiday' : 'working';

  /* Compute effective status (marked or default) */
  const effectiveStatus = (month, day) => {
    const w = wd(month);
    const dayKey = String(day).padStart(2, '0');
    return w.days[dayKey] || defaultStatus(month, day);
  };

  /* Count working days for a month using effective status */
  function workingDaysIn(month) {
    const dim = daysInMonth(month);
    let n = 0;
    for (let d = 1; d <= dim; d++) {
      if (effectiveStatus(month, d) === 'working') n++;
    }
    return n;
  }
  E.workingDaysIn = workingDaysIn;

  /* Check if a specific date is working */
  E.isWorkingDate = function(date) {
    if (!date) return false;
    const month = date.slice(0, 7);
    const day = parseInt(date.slice(8, 10), 10);
    return effectiveStatus(month, day) === 'working';
  };

  /* Custom holidays list (used by other modules) */
  E.customHolidays = function() {
    const all = E.rows('workingDays');
    const out = [];
    all.forEach(w => {
      Object.entries(w.days || {}).forEach(([d, status]) => {
        if (status === 'holiday') {
          /* Only if not a Sunday (Sundays are default) */
          const dd = parseInt(d, 10);
          if (dayOfWeek(w.month, dd) !== 0) out.push(w.month + '-' + d);
        }
      });
    });
    return out;
  };

  /* ═══════════════════════════════════════════════════════════
     ROUTE
     ═══════════════════════════════════════════════════════════ */
  E.route('workingdays', 'Working Days', () => {
    const month = CM;
    const w = wd(month);
    const dim = daysInMonth(month);
    const wdCount = workingDaysIn(month);
    const markedCount = Object.keys(w.days || {}).length;

    /* Calendar grid (Mon-Sun columns) */
    const firstDow = dayOfWeek(month, 1); /* 0=Sun */
    /* Convert to Mon-first: Mon=0, Tue=1, ... Sun=6 */
    const startCol = firstDow === 0 ? 6 : firstDow - 1;

    const days = [];
    for (let i = 0; i < startCol; i++) days.push(null);
    for (let d = 1; d <= dim; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const canRecompute = wdCount > 0;

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <h3 style="margin:0">📅 Working Days Calendar</h3>
          <p class="muted" style="margin:4px 0 0;font-size:12px">Mark the whole month once at the start. No daily prompts — used for exact overhead allocation.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn sm" data-a="wdPrev">◀</button>
          <input type="month" class="fs" value="${month}" onchange="E.A.wdMonth(this.value)">
          <button class="btn sm" data-a="wdNext">▶</button>
        </div>
      </div>

      <div class="kp">
        ${E.kpi('Working days', wdCount, 'in this month')}
        ${E.kpi('Holidays', (dim - wdCount), 'including Sundays')}
        ${E.kpi('Marked manually', markedCount, 'user-set overrides')}
        ${E.kpi('Status', markedCount === dim ? '<span class="ok">✓ Complete</span>' : markedCount === 0 ? '<span class="bad">⚠ Not started</span>' : '<span style="color:#d97706">🟡 Partial</span>')}
      </div>

      ${!markedCount ? `<div style="background:#e0f2fe;padding:14px;border-radius:10px;border-left:4px solid #0891b2;margin-bottom:14px">
        <b>💡 First time this month?</b> Days default to Mon-Sat = working, Sun = holiday.
        Click any day to override, or click <b>Use defaults</b> to confirm all.
      </div>` : ''}

      <div class="tw"><table style="table-layout:fixed">
        <thead><tr>
          <th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th>
        </tr></thead>
        <tbody>
          ${weeks.map(week => `<tr>${week.map(d => {
            if (!d) return '<td style="padding:4px"></td>';
            const dayKey = String(d).padStart(2, '0');
            const status = effectiveStatus(month, d);
            const isUserSet = w.days[dayKey] !== undefined;
            const bg = status === 'working' ? '#f0fdf4' : '#fef2f2';
            const border = status === 'working' ? '#059669' : '#dc2626';
            const icon = status === 'working' ? '✅' : '🏖';
            return `<td style="padding:4px">
              <button data-a="wdToggle" data-id="${month}|${d}" style="width:100%;padding:14px 4px;border:1px solid ${border};background:${bg};border-radius:6px;cursor:pointer;text-align:center;font-size:13px">
                <div style="font-size:16px;font-weight:700;color:${border}">${d}</div>
                <div style="font-size:16px;margin-top:2px">${icon}</div>
                ${isUserSet ? '<div style="font-size:9px;color:#78718f;margin-top:2px">custom</div>' : ''}
              </button>
            </td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table></div>

      <div class="bar" style="margin-top:16px">
        <button class="btn" data-a="wdDefaults">✓ Use defaults (Mon-Sat working)</button>
        <button class="btn" data-a="wdClear">🗑 Clear custom markings</button>
        <span class="gap"></span>
        <button class="btn p" data-a="wdSave">💾 Save month</button>
        ${canRecompute ? `<button class="btn" data-a="wdRecompute">🔄 Recompute allocations</button>` : ''}
      </div>

      <div style="margin-top:14px;padding:12px;background:var(--s2);border-radius:8px;font-size:12px;color:var(--t3)">
        <b>How this is used:</b> Monthly fixed expenses (rent, electricity, salaries) ÷ working days = daily rate.
        Every working day, that day's fixed cost is split across all active jobs. Cost sheet stays ready on job completion.
      </div>
    </div>`;
  });

  E.A.wdMonth = m => { CM = m; E.go(); };
  E.A.wdPrev = () => {
    const [y, mo] = CM.split('-').map(Number);
    const prev = mo === 1 ? y - 1 : y;
    const pm = mo === 1 ? 12 : mo - 1;
    CM = prev + '-' + String(pm).padStart(2, '0');
    E.go();
  };
  E.A.wdNext = () => {
    const [y, mo] = CM.split('-').map(Number);
    const next = mo === 12 ? y + 1 : y;
    const nm = mo === 12 ? 1 : mo + 1;
    CM = next + '-' + String(nm).padStart(2, '0');
    E.go();
  };

  E.A.wdToggle = id => {
    const [month, dayStr] = id.split('|');
    const day = parseInt(dayStr, 10);
    const dayKey = String(day).padStart(2, '0');
    let w = rec(month);
    if (!w) {
      w = { month, days: {} };
    }
    const b = w ? JSON.parse(JSON.stringify(w)) : null;
    const current = effectiveStatus(month, day);
    const newStatus = current === 'working' ? 'holiday' : 'working';
    /* Check for production on this day */
    const dateStr = month + '-' + dayKey;
    const hasProduction = E.rows('prodLogs').some(l => l.date === dateStr && l.status !== 'cancelled');
    const hasActiveJobs = E.rows('jobs').some(j => j.date <= dateStr && (!j.completedAt || j.completedAt >= dateStr) && j.status !== 'Cancelled');
    if (hasProduction && !confirm('This day has production logged. Change to ' + newStatus + ' anyway? (Allocations will be recomputed)')) return;
    if (!hasProduction && hasActiveJobs && !confirm('This day has active jobs. Change to ' + newStatus + '?')) return;
    w.days[dayKey] = newStatus;
    E.put('workingDays', w.id ? w : Object.assign(w, { id: 'WD-' + E.fid + '-' + month, factoryId: E.fid })).then(() => {
      E.go();
      if (hasProduction || hasActiveJobs) {
        setTimeout(() => E.A.wdRecompute(), 100);
      }
    });
  };

  E.A.wdDefaults = () => {
    const month = CM;
    const dim = daysInMonth(month);
    const w = rec(month) || { month, days: {} };
    const b = w.id ? JSON.parse(JSON.stringify(w)) : null;
    for (let d = 1; d <= dim; d++) {
      w.days[String(d).padStart(2, '0')] = defaultStatus(month, d);
    }
    E.put('workingDays', w.id ? w : Object.assign(w, { id: 'WD-' + E.fid + '-' + month, factoryId: E.fid })).then(() => {
      E.go();
      E.toast('Applied defaults for ' + month, 'success');
    });
  };

  E.A.wdClear = async () => {
    if (!confirm('Clear all custom markings for ' + CM + '?')) return;
    const w = rec(CM);
    if (w) await E.del('workingDays', w.id);
    E.go();
    E.toast('Custom markings cleared — defaults restored', 'success');
  };

  E.A.wdSave = async () => {
    const month = CM;
    const dim = daysInMonth(month);
    const w = rec(month) || { month, days: {} };
    /* Fill any unmarked days with default */
    for (let d = 1; d <= dim; d++) {
      const key = String(d).padStart(2, '0');
      if (w.days[key] === undefined) w.days[key] = defaultStatus(month, d);
    }
    if (!w.id) {
      w.id = 'WD-' + E.fid + '-' + month;
      w.factoryId = E.fid;
    }
    await E.put('workingDays', w);
    E.go();
    E.toast('Saved ' + month + ' · ' + workingDaysIn(month) + ' working days', 'success');
  };

  E.A.wdRecompute = () => {
    if (!E.dailyAllocation) return E.toast('Allocation engine not loaded', 'error');
    E.dailyAllocation.recomputeMonth(CM).then(n => {
      E.toast('Recomputed ' + n + ' day(s) of allocation', 'success');
      E.go();
    }).catch(e => E.toast(e.message, 'error'));
  };

  /* ═══════════════════════════════════════════════════════════
     PENDING MONTH CHECK (called from Daily Hub)
     ═══════════════════════════════════════════════════════════ */
  E.A.wdCheckMonth = () => {
    const thisMonth = E.today().slice(0, 7);
    const nextMonth = (() => {
      const [y, m] = thisMonth.split('-').map(Number);
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      return ny + '-' + String(nm).padStart(2, '0');
    })();

    /* If current month not marked, prompt */
    const cur = rec(thisMonth);
    if (!cur || Object.keys(cur.days || {}).length < 20) {
      return { prompt: true, month: thisMonth, reason: 'Current month not fully marked' };
    }

    /* If we're past the 25th and next month not marked, prompt */
    const today = parseInt(E.today().slice(8, 10), 10);
    if (today >= 25) {
      const next = rec(nextMonth);
      if (!next || Object.keys(next.days || {}).length < 20) {
        return { prompt: true, month: nextMonth, reason: 'Next month is coming soon — set up working days' };
      }
    }

    return { prompt: false };
  };
})(window.ERP);