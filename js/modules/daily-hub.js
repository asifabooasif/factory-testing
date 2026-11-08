/* daily-hub.js (v2) — Pro-level chronological daily workflow hub.
   Chronological sections (Morning / Throughout Day / Evening) with:
   ✓ Smart warnings (contradictions, pending items)
   ✓ Live progress tracking (essentials: attendance, materials, production)
   ✓ Direct action buttons (open real modals, not just navigate)
   ✓ Customizable step visibility per factory (localStorage)
   ✓ Close Day flow with summary
   ✓ Recent entries timeline
   ✓ Yesterday-not-closed reminder
   Never posts a journal entry. Pure orchestration UI.
*/
(E => {
  /* ══════════ NAV ══════════ */
  const dashIdx = E.N.findIndex(n => n.id === 'dashboard');
  const navItem = { g: 'Overview', id: 'daily', ico: '⚡', label: 'Daily Workflow' };
  if (dashIdx >= 0) E.N.splice(dashIdx + 1, 0, navItem);
  else E.nav('Overview', 'daily', '⚡', 'Daily Workflow');

  /* ══════════ SETTINGS ══════════ */
  const SKEY = () => 'erp_dh2_' + E.fid;
  const ESSENTIAL = ['attendance', 'materials', 'production'];
  function getSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SKEY()) || '{}');
      return Object.assign({ showWarnings: true, showRecent: true, hiddenSteps: [] }, s);
    } catch (e) { return { showWarnings: true, showRecent: true, hiddenSteps: [] }; }
  }
  function saveSettings(s) { localStorage.setItem(SKEY(), JSON.stringify(s)); }
  function isStepVisible(id) { return !getSettings().hiddenSteps.includes(id); }

  /* ══════════ HELPERS ══════════ */
  const today = () => E.today();
  const ym = () => today().slice(0, 7);
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const emp = id => E.D.employees.find(x => x.id === id);
  const yesterdayOf = d => new Date(Date.parse(d + 'T00:00:00') - 864e5).toISOString().slice(0, 10);

  /* ══════════ DAY STATUS ══════════ */
  function getStatus() {
    const t = today();
    const working = E.isWorkingDate ? E.isWorkingDate(t) : true;
    const dp = E.rows('dailyProduction').find(r => r.date === t);
    const activeEmps = E.rows('employees').filter(e => e.active);
    const attToday = E.rows('attendance').filter(a => a.date === t);
    const attendanceMarked = attToday.length > 0;
    const attendanceComplete = activeEmps.length > 0 && attToday.length >= activeEmps.length;
    const prodToday = E.rows('prodLogs').filter(l => l.date === t && l.status !== 'cancelled');
    const issuesToday = E.rows('issues').filter(i => i.date === t);
    const activeJobs = E.rows('jobs').filter(j => j.status === 'In Progress');
    const expToday = E.rows('expenses').filter(e => e.kind === 'voucher' && e.date === t && !e.cancelled);
    const dsToday = E.rows('wageRuns').filter(r => r.kind === 'daily-salary' && r.date === t && !r.cancelled);
    const dnToday = E.rows('deliveries').filter(d => d.date === t && d.status !== 'Cancelled');
    const invToday = E.rows('invoices').filter(i => i.date === t && !i.cancelled && !i.opening);
    const rcToday = E.rows('receipts').filter(r => r.date === t && r.kind !== 'credit');
    const purToday = E.rows('purchases').filter(p => p.date === t && !p.cancelled && !p.opening);
    const advToday = E.rows('wageRuns').filter(r => r.kind === 'advance' && r.date === t && !r.cancelled);
    const pettyToday = E.rows('journalEntries').filter(j => j.date === t && j.source === 'petty');
    const payToday = E.rows('payments').filter(p => p.date === t && p.kind !== 'debit');
    const pendDn = E.rows('deliveries').filter(d => d.status === 'Delivered');

    const yd = yesterdayOf(t);
    const ydWork = E.isWorkingDate ? E.isWorkingDate(yd) : false;
    const ydDP = E.rows('dailyProduction').find(r => r.date === yd);
    const ydUnclosed = ydWork && (!ydDP || ydDP.status === 'draft');

    const hour = new Date().getHours();
    const warnings = [];
    if (prodToday.length > 0 && !attendanceMarked && activeEmps.length > 0) {
      warnings.push({ type: 'warn', ico: '👷', msg: 'Production logged but attendance not marked today', btn: 'Mark', action: 'dhAttendance' });
    }
    if (activeJobs.length > 0 && prodToday.length === 0 && hour >= 14) {
      warnings.push({ type: 'warn', ico: '🧵', msg: activeJobs.length + ' job(s) active but no production logged today', btn: 'Log', action: 'dhProduction' });
    }
    if (activeJobs.length > 0 && issuesToday.length === 0) {
      warnings.push({ type: 'info', ico: '📦', msg: activeJobs.length + ' active job(s) with no materials issued today', btn: 'Issue', action: 'dhMaterials' });
    }
    if (pendDn.length > 0) {
      warnings.push({ type: 'info', ico: '📄', msg: pendDn.length + ' delivery note(s) waiting to be invoiced', btn: 'Invoice', action: 'dhInvoice' });
    }
    if (ydUnclosed) {
      warnings.push({ type: 'warn', ico: '📅', msg: 'Yesterday (' + yd + ') was never closed', btn: 'Review', action: 'dhReviewYesterday' });
    }

    const essential = [
      { done: attendanceMarked || activeEmps.length === 0 },
      { done: prodToday.length > 0 || activeJobs.length === 0 },
      { done: issuesToday.length > 0 || activeJobs.length === 0 }
    ];
    const doneCount = essential.filter(e => e.done).length;
    const pct = Math.round(doneCount / essential.length * 100);

    return {
      t, working, dp, dayStatus: dp ? dp.status : 'open',
      activeEmps, attToday, attendanceMarked, attendanceComplete,
      prodToday,
      prodPacks: sum(prodToday, l => l.qty),
      prodPairs: sum(prodToday, l => l.convertedQty || l.qty * (l.pairsPerPack || 1)),
      prodValue: sum(prodToday, l => l.amount),
      prodWorkers: new Set(prodToday.map(l => l.empId)).size,
      issuesToday, issuesValue: sum(issuesToday, i => i.value),
      activeJobs,
      expToday, expValue: sum(expToday, e => e.amount),
      dsToday, dsValue: sum(dsToday, r => r.net),
      dnToday, dnValue: sum(dnToday, d => d.total || 0),
      invToday, invValue: sum(invToday, i => i.total || 0),
      rcToday, rcValue: sum(rcToday, r => r.amount || 0),
      purToday, purValue: sum(purToday, p => p.total || 0),
      advToday, advValue: sum(advToday, r => r.amount || 0),
      pettyToday, payToday, payValue: sum(payToday, p => p.amount || 0),
      warnings, essential, doneCount, pct,
      ydUnclosed, yd, pendDn
    };
  }

  /* ══════════ RENDERERS ══════════ */
  function card(o) {
    const ico = o.status === 'done' ? '✅' : o.status === 'partial' ? '🟡' : o.status === 'skipped' ? '⏭' : '⏳';
    const bd  = o.status === 'done' ? '#059669' : o.status === 'partial' ? '#d97706' : o.status === 'skipped' ? '#94a3b8' : '#78718f';
    const bg  = o.status === 'done' ? 'rgba(5,150,105,.04)' : 'var(--s)';
    return `<div style="border-left:4px solid ${bd};background:${bg};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">${o.emoji}</span>
          <b style="font-size:14px">${E.esc(o.title)}</b>
        </div>
        <span style="font-size:18px">${ico}</span>
      </div>
      <div class="muted" style="font-size:12px;min-height:18px">${E.esc(o.detail || '—')}</div>
      ${o.btns && o.btns.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + o.btns.map(b =>
        `<button class="btn sm${b.primary ? ' p' : ''}" data-a="${b.action}" data-id="${b.id || ''}">${E.esc(b.label)}</button>`
      ).join('') + '</div>' : ''}
    </div>`;
  }
  function warningRow(w) {
    const bg = w.type === 'warn' ? '#fef3c7' : '#e0f2fe';
    const bd = w.type === 'warn' ? '#d97706' : '#0891b2';
    return `<div style="background:${bg};border-left:4px solid ${bd};padding:11px 14px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px">
        <span style="font-size:18px">${w.ico}</span>
        <span style="font-size:13px">${E.esc(w.msg)}</span>
      </div>
      <button class="btn sm" data-a="${w.action}" data-id="${w.actionId || ''}">${E.esc(w.btn)} →</button>
    </div>`;
  }
  function section(ico, title, cards) {
    if (!cards.length) return '';
    const doneN = cards.filter(c => c.includes('✅')).length;
    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:22px">${ico}</span>
        <b style="font-size:15px">${title}</b>
        <span class="gap"></span>
        <span class="muted" style="font-size:11px">${doneN} of ${cards.length} done</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
        ${cards.join('')}
      </div>
    </div>`;
  }

  /* ══════════ RECENT ENTRIES ══════════ */
  function recentEntries() {
    const t = today();
    const out = [];
    const push = (x) => out.push(x);
    E.rows('prodLogs').filter(l => l.date === t && l.status !== 'cancelled').forEach(l => {
      push({ ts: l.createdAt ? new Date(l.createdAt).getTime() : 0, ico: '🧵', lbl: 'Production',
        txt: `${l.qty} packs · ${(emp(l.empId) || {}).name || '?'} · ${l.opName}`,
        amt: l.amount });
    });
    E.rows('wageRuns').filter(r => r.date === t && !r.cancelled && (r.kind === 'advance' || r.kind === 'daily-salary')).forEach(r => {
      push({ ts: r.createdAt ? new Date(r.createdAt).getTime() : 0,
        ico: r.kind === 'advance' ? '💵' : '📅',
        lbl: r.kind === 'advance' ? 'Advance' : 'Daily Salary',
        txt: `${(emp(r.empId) || {}).name || '?'} · ${r.no}`,
        amt: r.kind === 'advance' ? r.amount : r.net });
    });
    E.rows('expenses').filter(x => x.kind === 'voucher' && x.date === t && !x.cancelled).forEach(x => {
      push({ ts: x.createdAt ? new Date(x.createdAt).getTime() : 0, ico: '🧾', lbl: 'Expense',
        txt: `${x.headName || x.head}${x.payee ? ' · ' + x.payee : ''}`, amt: x.amount });
    });
    E.rows('invoices').filter(i => i.date === t && !i.cancelled && !i.opening).forEach(i => {
      const p = E.D.parties.find(x => x.id === i.partyId);
      push({ ts: i.createdAt ? new Date(i.createdAt).getTime() : 0, ico: '📄', lbl: 'Invoice',
        txt: `${i.no} · ${p ? p.name : '?'}`, amt: i.total });
    });
    E.rows('purchases').filter(p => p.date === t && !p.cancelled && !p.opening).forEach(p => {
      const s = E.D.parties.find(x => x.id === p.partyId);
      push({ ts: p.createdAt ? new Date(p.createdAt).getTime() : 0, ico: '🛒', lbl: 'Purchase',
        txt: `${p.no} · ${s ? s.name : '?'}`, amt: p.total });
    });
    return out.sort((a, b) => b.ts - a.ts).slice(0, 15);
  }

  /* ══════════ ROUTE ══════════ */
  E.route('daily', 'Daily Workflow', () => {
    const s = getStatus();
    const cfg = getSettings();
    const dayDate = new Date(s.t + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const statusLabel = { posted: '✅ Posted', closed: '✅ Closed', holiday: '🏖 Holiday', draft: '📝 Draft', skipped: '⏭ Skipped' }[s.dayStatus] || '⏳ Open';
    const rateTxt = (E.dailyFixedRate && E.dailyFixedRate(ym())) ? ' · daily rate ' + E.m(E.dailyFixedRate(ym())) : '';

    /* Morning */
    const morning = [];
    if (isStepVisible('workingday')) morning.push(card({
      emoji: '📅', title: 'Working day',
      status: s.working ? 'done' : 'skipped',
      detail: s.working ? 'Today is a working day' + rateTxt : 'Holiday — no job allocation today',
      btns: [{ label: 'Change', action: 'dhOpenWD' }]
    }));
    if (isStepVisible('attendance')) morning.push(card({
      emoji: '👷', title: 'Attendance',
      status: s.attendanceComplete ? 'done' : s.attendanceMarked ? 'partial' : 'todo',
      detail: s.activeEmps.length === 0 ? 'No active employees' : `${s.attToday.length} of ${s.activeEmps.length} marked`,
      btns: [{ label: s.attendanceMarked ? 'Update' : 'Mark now', action: 'dhAttendance', primary: !s.attendanceMarked }]
    }));
    if (isStepVisible('materials')) morning.push(card({
      emoji: '📦', title: 'Materials issued',
      status: s.issuesToday.length > 0 ? 'done' : (s.activeJobs.length > 0 ? 'todo' : 'skipped'),
      detail: s.issuesToday.length > 0 ? `${s.issuesToday.length} batch(es) · ${E.m(s.issuesValue)}` : (s.activeJobs.length > 0 ? 'Issue BOM materials to active jobs' : 'No active jobs'),
      btns: [{ label: s.issuesToday.length > 0 ? 'More' : 'Issue now', action: 'dhMaterials', primary: s.issuesToday.length === 0 && s.activeJobs.length > 0 }]
    }));

    /* Throughout Day */
    const through = [];
    if (isStepVisible('production')) through.push(card({
      emoji: '🧵', title: 'Production',
      status: s.prodToday.length > 0 ? 'done' : (s.activeJobs.length > 0 ? 'todo' : 'skipped'),
      detail: s.prodToday.length > 0 ? `${s.prodPacks} packs · ${s.prodPairs} pairs · ${E.m(s.prodValue)} · ${s.prodWorkers} worker(s)` : (s.activeJobs.length > 0 ? 'Log worker × operation × packs' : 'No active jobs'),
      btns: [{ label: s.prodToday.length > 0 ? 'Log more' : 'Log now', action: 'dhProduction', primary: s.prodToday.length === 0 && s.activeJobs.length > 0 }]
    }));
    if (isStepVisible('expenses')) through.push(card({
      emoji: '🧾', title: 'Expenses',
      status: s.expToday.length > 0 ? 'done' : 'skipped',
      detail: s.expToday.length > 0 ? `${s.expToday.length} · ${E.m(s.expValue)}` : 'Utilities, transport, etc.',
      btns: [{ label: 'Record', action: 'dhExpense' }]
    }));
    if (isStepVisible('purchases')) through.push(card({
      emoji: '🛒', title: 'Purchases',
      status: s.purToday.length > 0 ? 'done' : 'skipped',
      detail: s.purToday.length > 0 ? `${s.purToday.length} bill(s) · ${E.m(s.purValue)}` : 'Materials arriving today',
      btns: [{ label: 'Record', action: 'dhPurchase' }]
    }));
    if (isStepVisible('daily_salaries')) through.push(card({
      emoji: '📅', title: 'Daily salaries',
      status: s.dsToday.length > 0 ? 'done' : 'skipped',
      detail: s.dsToday.length > 0 ? `${s.dsToday.length} paid · ${E.m(s.dsValue)}` : 'Pay Daily-Salaried workers',
      btns: [{ label: 'Pay', action: 'dhDailySalary' }]
    }));
    if (isStepVisible('advances')) through.push(card({
      emoji: '💵', title: 'Advances',
      status: s.advToday.length > 0 ? 'done' : 'skipped',
      detail: s.advToday.length > 0 ? `${s.advToday.length} given · ${E.m(s.advValue)}` : 'Give salary advance',
      btns: [{ label: 'Give', action: 'dhAdvance' }]
    }));
    if (isStepVisible('petty')) through.push(card({
      emoji: '💵', title: 'Petty cash',
      status: s.pettyToday.length > 0 ? 'done' : 'skipped',
      detail: s.pettyToday.length > 0 ? `${s.pettyToday.length} voucher(s)` : 'Small cash expenses',
      btns: [{ label: 'Open', action: 'dhPetty' }]
    }));

    /* Evening */
    const evening = [];
    if (isStepVisible('deliveries')) evening.push(card({
      emoji: '📤', title: 'Deliveries',
      status: s.dnToday.length > 0 ? 'done' : 'skipped',
      detail: s.dnToday.length > 0 ? `${s.dnToday.length} note(s) · ${E.m(s.dnValue)}` : 'Goods leaving for customer',
      btns: [{ label: 'Create', action: 'dhDelivery' }]
    }));
    if (isStepVisible('invoices')) evening.push(card({
      emoji: '📄', title: 'Invoices',
      status: s.invToday.length > 0 ? 'done' : 'skipped',
      detail: s.invToday.length > 0 ? `${s.invToday.length} · ${E.m(s.invValue)}` : s.pendDn.length > 0 ? `${s.pendDn.length} delivery note(s) ready to invoice` : 'Bill delivered goods',
      btns: [{ label: 'Create', action: 'dhInvoice', primary: s.pendDn.length > 0 && s.invToday.length === 0 }]
    }));
    if (isStepVisible('receipts')) evening.push(card({
      emoji: '💰', title: 'Receipts',
      status: s.rcToday.length > 0 ? 'done' : 'skipped',
      detail: s.rcToday.length > 0 ? `${s.rcToday.length} · ${E.m(s.rcValue)}` : 'Customer payments received',
      btns: [{ label: 'Receive', action: 'dhReceipt' }]
    }));
    if (isStepVisible('supplier_payments')) evening.push(card({
      emoji: '💸', title: 'Supplier payments',
      status: s.payToday.length > 0 ? 'done' : 'skipped',
      detail: s.payToday.length > 0 ? `${s.payToday.length} · ${E.m(s.payValue)}` : 'Pay supplier bills',
      btns: [{ label: 'Pay', action: 'dhPaySup' }]
    }));

    /* Warnings */
    const warnBlock = cfg.showWarnings && s.warnings.length ? `<div class="card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:4px solid #d97706;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <b style="font-size:15px;color:#92400e">🔔 ${s.warnings.length} thing${s.warnings.length > 1 ? 's' : ''} to check</b>
        <button class="btn sm" data-a="dhHideWarnings" style="background:none;border:none;color:#78350f">Hide</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${s.warnings.map(warningRow).join('')}
      </div>
    </div>` : '';

    /* Recent */
    const recent = cfg.showRecent ? recentEntries() : [];
    const recentBlock = recent.length ? `<div class="card">
      <h3>📋 Recent entries today</h3>
      <div class="tw"><table>
        <thead><tr><th style="width:36px"></th><th>Action</th><th>Detail</th><th class="r">Amount</th></tr></thead>
        <tbody>${recent.map(e => `<tr>
          <td style="font-size:18px">${e.ico}</td>
          <td><b>${E.esc(e.lbl)}</b></td>
          <td>${E.esc(e.txt)}</td>
          <td class="r">${e.amt ? E.m(e.amt) : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : '';

    return `<div class="card" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;padding:20px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;opacity:.85">⚡ Daily Workflow</div>
          <h2 style="margin:4px 0;color:#fff;font-size:22px">${dayDate}</h2>
          <div style="font-size:12px;opacity:.9">${statusLabel}${s.working ? '' : ' · Not a working day'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-a="dhCustomize" style="background:rgba(255,255,255,.2);color:#fff;border:none">⚙ Customize</button>
          ${s.dayStatus !== 'closed' && s.dayStatus !== 'posted' && s.dayStatus !== 'holiday' ? `<button class="btn" data-a="dhCloseDay" style="background:#fff;color:#7c3aed;border:none;font-weight:700">✅ Close Day</button>` : ''}
        </div>
      </div>
      <div style="height:8px;background:rgba(255,255,255,.25);border-radius:99px;overflow:hidden;margin-top:14px">
        <div style="height:100%;width:${s.pct}%;background:#fff;border-radius:99px;transition:width .4s"></div>
      </div>
      <div style="margin-top:8px;font-size:11px;opacity:.9">${s.doneCount} of ${s.essential.length} essentials done · ${s.pct}%</div>
    </div>
    ${warnBlock}
    ${section('🌅', 'Morning', morning)}
    ${section('☀', 'Throughout Day', through)}
    ${section('🌆', 'Evening', evening)}
    ${recentBlock}`;
  });

  /* ══════════ ACTIONS ══════════ */
  E.A.dhAttendance = () => { location.hash = '#/attendance'; };
  E.A.dhMaterials = () => {
    location.hash = '#/production';
    setTimeout(() => { try { if (E.A.prTab) E.A.prTab('batch'); } catch (e) {} }, 180);
  };
  E.A.dhProduction = () => {
    location.hash = '#/production';
    setTimeout(() => { try { if (E.A.prTab) E.A.prTab('log'); } catch (e) {} }, 180);
  };
  E.A.dhExpense = () => { if (E.A.exNew) E.A.exNew(); else location.hash = '#/expenses'; };
  E.A.dhPurchase = () => { if (E.A.newPur) E.A.newPur(); else location.hash = '#/purchases'; };
  E.A.dhDailySalary = () => { if (E.A.newDailySalary) E.A.newDailySalary(); else location.hash = '#/daily-salaries'; };
  E.A.dhAdvance = () => { if (E.A.advM) E.A.advM(); else location.hash = '#/empledger'; };
  E.A.dhPetty = () => { location.hash = '#/petty'; };
  E.A.dhDelivery = () => { if (E.A.newDN) E.A.newDN(); else location.hash = '#/sales'; };
  E.A.dhInvoice = () => { if (E.A.newInv) E.A.newInv(); else location.hash = '#/sales'; };
  E.A.dhReceipt = () => { if (E.A.recv) E.A.recv(); else location.hash = '#/sales'; };
  E.A.dhPaySup = () => { if (E.A.paySup) E.A.paySup(); else location.hash = '#/purchases'; };
  E.A.dhOpenWD = () => { location.hash = '#/workingdays'; };
  E.A.dhHideWarnings = () => { const s = getSettings(); s.showWarnings = false; saveSettings(s); E.go(); };

  /* Customize modal */
  E.A.dhCustomize = () => {
    const s = getSettings();
    const STEPS = [
      { id: 'workingday',        label: '📅 Working day status',    note: "Show today's working/holiday state" },
      { id: 'attendance',        label: '👷 Mark attendance',       note: 'Mark workers present/absent' },
      { id: 'materials',         label: '📦 Issue materials (BOM)', note: 'Deduct BOM materials to jobs' },
      { id: 'production',        label: '🧵 Log production',        note: 'Worker × operation × packs' },
      { id: 'expenses',          label: '🧾 Record expenses',       note: 'Direct / indirect / period' },
      { id: 'purchases',         label: '🛒 Record purchases',      note: 'Materials arriving' },
      { id: 'daily_salaries',    label: '📅 Daily salaries',        note: 'Pay Daily-Salaried workers' },
      { id: 'advances',          label: '💵 Give advances',         note: 'Salary advances' },
      { id: 'petty',             label: '💵 Petty cash',            note: 'Small cash expenses' },
      { id: 'deliveries',        label: '📤 Create deliveries',     note: 'Goods out to customer' },
      { id: 'invoices',          label: '📄 Create invoices',       note: 'Bill delivered goods' },
      { id: 'receipts',          label: '💰 Receive payments',      note: 'Customer cash in' },
      { id: 'supplier_payments', label: '💸 Pay suppliers',         note: 'Supplier cash out' }
    ];
    E.modal('Customize Daily Workflow', `
      <p class="muted" style="margin-bottom:14px">Hide steps you don't use. Essential steps (attendance, materials, production) always stay visible.</p>
      <label style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--s2);border-radius:8px;margin-bottom:8px;cursor:pointer">
        <span><b>🔔 Smart warnings</b><div class="muted" style="font-size:11px">Show contradictions & pending items</div></span>
        <input type="checkbox" id="dhw_warn" ${s.showWarnings ? 'checked' : ''} style="width:auto">
      </label>
      <label style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--s2);border-radius:8px;margin-bottom:14px;cursor:pointer">
        <span><b>📋 Recent entries timeline</b><div class="muted" style="font-size:11px">Show today's transactions list</div></span>
        <input type="checkbox" id="dhw_recent" ${s.showRecent ? 'checked' : ''} style="width:auto">
      </label>
      <b style="display:block;margin-bottom:8px">Steps</b>
      <div style="max-height:380px;overflow-y:auto;border:1px solid var(--bd);border-radius:8px;padding:8px">
        ${STEPS.map(st => {
          const isEss = ESSENTIAL.includes(st.id);
          const hidden = s.hiddenSteps.includes(st.id);
          return `<label style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:6px;${isEss ? 'opacity:.6' : 'cursor:pointer'}">
            <span>${st.label}<div class="muted" style="font-size:11px">${st.note}${isEss ? ' · ESSENTIAL' : ''}</div></span>
            <input type="checkbox" class="dhw_step" data-id="${st.id}" ${!hidden ? 'checked' : ''} ${isEss ? 'disabled' : ''} style="width:auto">
          </label>`;
        }).join('')}
      </div>
      <button class="btn sm" data-a="dhResetCustomize" style="margin-top:10px">↺ Reset to defaults</button>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="dhSaveCustomize">Save</button>`);
  };
  E.A.dhSaveCustomize = () => {
    const s = getSettings();
    s.showWarnings = E.$('dhw_warn').checked;
    s.showRecent = E.$('dhw_recent').checked;
    s.hiddenSteps = [...document.querySelectorAll('.dhw_step')].filter(c => !c.checked).map(c => c.dataset.id);
    saveSettings(s);
    E.closeM(); E.go();
    E.toast('Customization saved', 'success');
  };
  E.A.dhResetCustomize = () => {
    localStorage.removeItem(SKEY());
    E.closeM(); E.go();
    E.toast('Reset to defaults', 'success');
  };

  /* Close day */
  E.A.dhCloseDay = () => {
    const s = getStatus();
    const needConfirm =
      (!s.working) ||
      (s.attToday.length === 0 && s.prodToday.length === 0) ||
      (s.prodToday.length === 0 && s.activeJobs.length > 0);
    if (needConfirm) {
      const msg = !s.working ? 'Today is a holiday. Close anyway?'
        : (s.attToday.length === 0 && s.prodToday.length === 0) ? 'Neither attendance nor production entered today. Close anyway?'
        : 'Jobs active but no production logged today. Close anyway?';
      if (!confirm(msg)) return;
    }
    const summary = `
      <div class="kp">
        ${E.kpi('Production', s.prodPacks + ' packs', s.prodPairs + ' pairs · ' + E.m(s.prodValue))}
        ${E.kpi('Materials', E.m(s.issuesValue), s.issuesToday.length + ' batch(es)')}
        ${E.kpi('Expenses', E.m(s.expValue), s.expToday.length + ' voucher(s)')}
        ${E.kpi('Deliveries', E.m(s.dnValue), s.dnToday.length + ' note(s)')}
        ${E.kpi('Invoices', E.m(s.invValue), s.invToday.length + ' created')}
        ${E.kpi('Receipts', E.m(s.rcValue), s.rcToday.length + ' received')}
      </div>
      <div class="tw"><table><tbody>
        <tr><td>Attendance marked</td><td class="r"><b>${s.attToday.length} / ${s.activeEmps.length}</b></td></tr>
        <tr><td>Production entries</td><td class="r"><b>${s.prodToday.length}</b></td></tr>
        <tr><td>Materials issued (batches)</td><td class="r"><b>${s.issuesToday.length}</b></td></tr>
        <tr><td>Expenses</td><td class="r"><b>${s.expToday.length}</b></td></tr>
        <tr><td>Purchases</td><td class="r"><b>${s.purToday.length}</b></td></tr>
        <tr><td>Daily salaries paid</td><td class="r"><b>${s.dsToday.length}</b></td></tr>
        <tr><td>Advances given</td><td class="r"><b>${s.advToday.length}</b></td></tr>
        <tr><td>Deliveries / Invoices / Receipts</td><td class="r"><b>${s.dnToday.length} / ${s.invToday.length} / ${s.rcToday.length}</b></td></tr>
      </tbody></table></div>
      <p class="muted" style="margin-top:10px">Closing marks today as complete — removes it from pending reminders. All data stays editable.</p>
    `;
    E.modal('Close ' + s.t + '?', summary, `
      <button class="btn" data-a="close">Cancel</button>
      <button class="btn p" data-a="dhConfirmClose">✅ Yes, close day</button>
    `, 1);
  };
  E.A.dhConfirmClose = async () => {
    try {
      const s = getStatus();
      const t = s.t;
      const existing = E.rows('dailyProduction').find(r => r.date === t);
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      const rec = {
        date: t, status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: E.user || '',
        summary: {
          attendance: s.attToday.length + '/' + s.activeEmps.length,
          production: s.prodPacks + ' packs',
          materials: s.issuesToday.length + ' batches',
          expenses: s.expToday.length,
          purchases: s.purToday.length,
          dailySalaries: s.dsToday.length,
          advances: s.advToday.length,
          deliveries: s.dnToday.length,
          invoices: s.invToday.length,
          receipts: s.rcToday.length
        }
      };
      if (existing) { Object.assign(existing, rec); await E.save('dailyProduction', existing, b); }
      else await E.save('dailyProduction', rec);
      E.closeM(); E.go();
      E.toast('Day closed ✅', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Review yesterday (from warning) */
  E.A.dhReviewYesterday = () => {
    const t = today();
    const yd = yesterdayOf(t);
    const dp = E.rows('dailyProduction').find(r => r.date === yd);
    const prod = E.rows('prodLogs').filter(l => l.date === yd && l.status !== 'cancelled');
    const att = E.rows('attendance').filter(a => a.date === yd);
    const exp = E.rows('expenses').filter(e => e.date === yd && !e.cancelled);
    const activeEmps = E.rows('employees').filter(e => e.active);
    E.modal('Review ' + yd, `
      <div class="kp">
        ${E.kpi('Attendance', att.length + '/' + activeEmps.length, 'marked')}
        ${E.kpi('Production', sum(prod, l => l.qty) + ' packs', prod.length + ' entries')}
        ${E.kpi('Expenses', E.m(sum(exp, e => e.amount)), exp.length + ' voucher(s)')}
        ${E.kpi('Status', dp ? dp.status : 'no record', '')}
      </div>
      <p class="muted">You can enter late data via Production (set date to ${yd}), or mark the day as skipped.</p>
    `, `
      <button class="btn" data-a="close">Close</button>
      <button class="btn" data-a="dhMarkYesterdaySkipped" data-id="${yd}">Mark as Skipped</button>
      <button class="btn p" data-a="dhOpenProdForDate" data-id="${yd}">Open Production</button>
    `);
  };
  E.A.dhMarkYesterdaySkipped = async d => {
    try {
      const existing = E.rows('dailyProduction').find(r => r.date === d);
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      const rec = { date: d, status: 'skipped', skippedAt: new Date().toISOString() };
      if (existing) { Object.assign(existing, rec); await E.save('dailyProduction', existing, b); }
      else await E.save('dailyProduction', rec);
      E.closeM(); E.go();
      E.toast(d + ' marked as skipped', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.dhOpenProdForDate = () => {
    E.closeM();
    location.hash = '#/production';
  };

  /* ══════════ MORNING REMINDER (once per day per factory) ══════════ */
  setTimeout(() => {
    try {
      if (!E.fid || !E.factory || !E.factory()) return;
      if (E.role !== 'owner' && E.role !== 'accountant') return;
      const t = today();
      const yd = yesterdayOf(t);
      const ydWork = E.isWorkingDate ? E.isWorkingDate(yd) : false;
      const ydDP = E.rows('dailyProduction').find(r => r.date === yd);
      const ydUnclosed = ydWork && (!ydDP || ydDP.status === 'draft');
      const flag = 'erp_dh_remind_' + E.fid + '_' + t;
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
      if (ydUnclosed) E.toast('📅 Yesterday (' + yd + ') not closed — open Daily Workflow', 'warning');
    } catch (e) {}
  }, 4000);
})(window.ERP);