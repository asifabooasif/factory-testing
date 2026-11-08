/* PART 6 (v9) — Payroll with per-pair + closed-job redirect to 5390.
   Wage calc uses pairs × rate/pair. Time wages split to 1310 (active) or 5390 (completed).
*/
(E => {
  ['payroll', 'salary', 'empledger'].forEach(id => {
    let i = E.N.findIndex(n => n.id === id);
    while (i >= 0) { E.N.splice(i, 1); i = E.N.findIndex(n => n.id === id); }
    if (E.R[id]) delete E.R[id];
  });

  E.nav('People & Payroll', 'wages', '💰', 'Wages');
  E.nav('People & Payroll', 'daily-salaries', '📅', 'Daily Salaries');
  E.nav('People & Payroll', 'monthly-salaries', '💼', 'Monthly Salaries');
  E.nav('People & Payroll', 'empledger', '📒', 'Employee Ledger');

  const payCat = e => {
    const pt = (e && e.payType) || 'Wage';
    if (pt === 'MonthlySalaried' || pt === 'Monthly') return 'MonthlySalaried';
    if (pt === 'DailySalaried') return 'DailySalaried';
    return 'Wage';
  };
  const isWage = e => payCat(e) === 'Wage';
  const isDailySal = e => payCat(e) === 'DailySalaried';
  const isMonthlySal = e => payCat(e) === 'MonthlySalaried';
  const isSalaried = e => !isWage(e);
  const CAT_LABEL = { Wage: 'Wage', DailySalaried: 'Daily Sal', MonthlySalaried: 'Monthly Sal' };
  const CAT_STYLE = { Wage: '', DailySalaried: 'background:#dbeafe;color:#1e40af', MonthlySalaried: 'background:#f3e8ff;color:#7c3aed' };
  const payBadge = e => `<span class="tag" style="${CAT_STYLE[payCat(e)]}">${CAT_LABEL[payCat(e)]}</span>`;

  const emp = id => E.D.employees.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const act = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const runs = () => E.rows('wageRuns').filter(r => r.kind === 'run' || r.kind === 'daily-salary');

  const advGiven = id => E.rows('wageRuns').filter(r => r.kind === 'advance' && r.empId === id && !r.cancelled).reduce((s, r) => s + r.amount, 0);
  const advRec = id => runs().filter(r => !r.cancelled).reduce((s, r) => {
    if (r.kind === 'run') return s + (r.lines || []).filter(l => l.empId === id).reduce((a, l) => a + (l.advRec || 0), 0);
    if (r.kind === 'daily-salary' && r.empId === id) return s + (r.advRec || 0);
    return s;
  }, 0);
  const advBal = id => advGiven(id) - advRec(id);
  E.advBal = advBal;

  const att = (id, from, to) => {
    const A = E.rows('attendance').filter(a => a.empId === id && a.date >= from && a.date <= to);
    return {
      days: A.filter(a => a.status === 'Present').length + A.filter(a => a.status === 'Half day').length / 2,
      absent: A.filter(a => a.status === 'Absent').length,
      ot: A.reduce((s, a) => s + (a.ot || 0), 0),
      marked: A.length
    };
  };
  const openLogs = (id, to) => E.rows('prodLogs').filter(l => l.empId === id && l.status === 'accrued' && (!to || l.date <= to));
  const logsOf = l => (l.logIds || []).map(id => E.D.prodLogs.find(x => x.id === id)).filter(Boolean);

  const WF = { tab: 'register', from: E.today().slice(0, 8) + '01', to: E.today() };

  E.route('wages', 'Wages', () => {
    const tab = WF.tab;
    return `<div class="kp">
      ${E.kpi('Wage Workers', E.rows('employees').filter(e => e.active && isWage(e)).length)}
      ${E.kpi('Piece wages accrued', E.m(E.bal('2210')), '2210')}
      ${E.kpi('Wages payable', E.m(E.bal('2200')), '2200')}
      ${E.kpi('EPF/ETF', E.m(E.bal('2100')), '2100')}
    </div>
    <div class="card"><p class="muted" style="margin:0">
      <b>Wage runs pay production-based earnings</b> (pairs × rate/pair). Advances and loans recovered here for wage workers. Late wages for closed jobs → 5390.
    </p></div>
    <div class="bar">
      <button class="btn ${tab === 'register' ? 'p' : ''}" data-a="wfTab" data-id="register">📋 Register</button>
      <button class="btn ${tab === 'daily' ? 'p' : ''}" data-a="wfTab" data-id="daily">📅 Attendance</button>
      <button class="btn ${tab === 'piece' ? 'p' : ''}" data-a="wfTab" data-id="piece">🧵 Piece work</button>
      <span class="gap"></span>
      <button class="btn" data-a="remitM">Remit EPF</button>
      <button class="btn p" data-a="newWageRun">+ New Wage Run</button>
    </div>
    <div id="wfBody">${tab === 'register' ? wageReg() : tab === 'daily' ? wageDaily() : wagePiece()}</div>`;
  });
  E.A.wfTab = t => { WF.tab = t; E.go(); };
  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.wf;
    if (f && WF[f] !== undefined) { WF[f] = e.target.value; if (E.$('wfBody')) E.$('wfBody').innerHTML = WF.tab === 'daily' ? wageDaily() : wagePiece(); }
  });

  function wageReg() {
    const R = E.rows('wageRuns').filter(r => r.kind === 'run' && r.type !== 'Monthly').sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="tw"><table>
      <thead><tr><th>Run</th><th>Type</th><th>Period</th><th class="r">Workers</th><th class="r">Piece</th><th class="r">Gross</th><th class="r">Loan</th><th class="r">Net</th><th>Status</th><th></th></tr></thead>
      <tbody>${R.map(r => {
        const piece = r.lines.reduce((s, l) => s + (l.piece || 0), 0);
        const loan = r.lines.reduce((s, l) => s + (l.loanRec || 0), 0);
        return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
          <td><b>${r.no}</b></td><td><span class="tag">${r.type}</span></td>
          <td>${r.from} → ${r.to}</td>
          <td class="r">${r.lines.length}</td>
          <td class="r">${E.m(piece)}</td>
          <td class="r">${E.m(r.gross)}</td>
          <td class="r">${loan ? E.m(loan) : '—'}</td>
          <td class="r"><b>${E.m(r.net)}</b></td>
          <td><span class="tag">${r.cancelled ? 'Cancelled' : r.paid ? 'Paid' : 'Unpaid'}</span></td>
          <td class="r">
            <button class="btn sm" data-a="slips" data-id="${r.id}">Slips</button>
            ${!r.cancelled && !r.paid ? `<button class="btn sm p" data-a="payRun" data-id="${r.id}">Pay</button>
              <button class="btn sm d" data-a="canRun" data-id="${r.id}">Cancel</button>` : ''}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No wage runs</td></tr>'}</tbody>
    </table></div>`;
  }

  function wageDaily() {
    const from = WF.from, to = WF.to;
    const workers = E.rows('employees').filter(e => e.active && isWage(e)).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const rows = workers.map(e => {
      const a = att(e.id, from, to);
      const base = Math.round(a.days * (e.amount || 0));
      const hourly = (e.amount || 0) / 8;
      const ot = Math.round(a.ot * hourly * 1.5);
      return { e, a, base, ot, total: base + ot };
    }).filter(x => x.a.marked > 0);
    return `<div class="card">
      <h3>Attendance wages</h3>
      <div class="bar">
        <div class="f" style="margin:0">From <input class="fs" type="date" data-wf="from" value="${from}"></div>
        <div class="f" style="margin:0">To <input class="fs" type="date" data-wf="to" value="${to}"></div>
      </div>
      <div class="tw"><table>
        <thead><tr><th>Worker</th><th class="r">Days</th><th class="r">Rate</th><th class="r">Base</th><th class="r">OT</th><th class="r">Total</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td><b>${E.esc(x.e.name)}</b> ${payBadge(x.e)}</td>
          <td class="r">${x.a.days}</td><td class="r">${E.m(x.e.amount)}</td>
          <td class="r">${E.m(x.base)}</td><td class="r">${E.m(x.ot)}</td>
          <td class="r"><b>${E.m(x.total)}</b></td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">No attendance</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  function wagePiece() {
    const from = WF.from, to = WF.to;
    const workers = E.rows('employees').filter(e => e.active).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const rows = workers.map(e => {
      const logs = openLogs(e.id, to).filter(l => l.date >= from);
      return { e, amount: logs.reduce((s, l) => s + l.amount, 0), pairs: logs.reduce((s, l) => s + (l.convertedQty || l.qty), 0), count: logs.length };
    }).filter(x => x.count > 0);
    return `<div class="card">
      <h3>Unpaid piece work</h3>
      <div class="bar">
        <div class="f" style="margin:0">From <input class="fs" type="date" data-wf="from" value="${from}"></div>
        <div class="f" style="margin:0">To <input class="fs" type="date" data-wf="to" value="${to}"></div>
      </div>
      <div class="tw"><table>
        <thead><tr><th>Worker</th><th>Type</th><th class="r">Entries</th><th class="r">Pairs</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td><b>${E.esc(x.e.name)}</b></td><td>${payBadge(x.e)}</td>
          <td class="r">${x.count}</td><td class="r">${x.pairs}</td>
          <td class="r"><b>${E.m(x.amount)}</b></td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted">No unpaid piece work</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  const W = { date: E.today() };
  const inp = (k, w, v) => `<input class="pw" data-k="${k}" type="number" step="0.01" value="${v || ''}" style="width:${w || 64}px;padding:6px;border:1px solid var(--bd);border-radius:8px">`;

  E.A.newWageRun = () => {
    if (!E.rows('employees').some(x => x.active)) return E.toast('Add employees first', 'error');
    E.modal('New Wage Run', `
      <div class="g2">
        <div class="f">Type<select id="w_t"><option>Weekly</option><option>Fortnightly</option><option>Daily</option></select></div>
        <div class="f">Pay date<input id="w_d" type="date" value="${W.date}"></div>
        <div class="f">Period from<input id="w_f" type="date" value="${E.today().slice(0, 8)}01"></div>
        <div class="f">Period to<input id="w_e" type="date" value="${E.today()}"></div>
      </div>
      <div class="bar">
        <button class="btn p" data-a="loadWageSelect">📋 Select employees</button>
      </div>
      <div id="wrb"><p class="muted">Choose period then select employees.</p></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveWageRun">Post</button>`, 1);
  };

  E.A.loadWageSelect = () => {
    const f = E.val('w_f'), to = E.val('w_e');
    if (!f || !to || f > to) return E.toast('Check dates', 'error');
    const allEmps = E.rows('employees').filter(x => x.active).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const rows = allEmps.map(e => {
      const logs = openLogs(e.id, to).filter(l => l.date >= f);
      const pc = logs.reduce((s, l) => s + l.amount, 0);
      const a = att(e.id, f, to);
      const isW = isWage(e);
      const hasActivity = pc > 0 || (isW && a.days > 0);
      return `<tr data-id="${e.id}" class="emp-row" data-default="${hasActivity ? '1' : '0'}">
        <td><input type="checkbox" class="emp-cb" ${hasActivity ? 'checked' : ''}></td>
        <td><b>${E.esc(e.name)}</b> ${payBadge(e)}<br><span class="muted">${e.code}</span></td>
        <td class="r">${isW ? a.days : '—'}</td>
        <td class="r">${pc ? E.m(pc) : '—'}</td>
        <td class="r muted">${logs.reduce((s, l) => s + (l.convertedQty || l.qty), 0) || '—'}</td>
        <td class="muted" style="font-size:11px">${isW ? (a.days > 0 && pc > 0 ? 'days + piece' : a.days > 0 ? 'days' : pc > 0 ? 'piece' : 'none') : (pc > 0 ? 'piece only' : 'none')}</td>
      </tr>`;
    }).join('');
    E.$('wrb').innerHTML = `<div class="card">
      <div class="bar" style="margin-bottom:8px">
        <button class="btn sm" data-a="selectAllEmps" data-id="1">All</button>
        <button class="btn sm" data-a="selectAllEmps" data-id="0">Clear</button>
        <button class="btn sm" data-a="selectDefaultEmps">With activity</button>
      </div>
      <div class="tw"><table>
        <thead><tr><th></th><th>Employee</th><th class="r">Days</th><th class="r">Piece</th><th class="r">Pairs</th><th>Will pay</th></tr></thead>
        <tbody id="empList">${rows}</tbody>
      </table></div>
      <button class="btn p" data-a="buildWageRun" style="margin-top:12px">➡️ Build</button>
    </div>`;
  };
  E.A.selectAllEmps = v => document.querySelectorAll('.emp-cb').forEach(cb => cb.checked = v === '1');
  E.A.selectDefaultEmps = () => document.querySelectorAll('.emp-row').forEach(tr => { tr.querySelector('.emp-cb').checked = tr.dataset.default === '1'; });

  E.A.buildWageRun = () => {
    const f = E.val('w_f'), to = E.val('w_e');
    const ids = [...document.querySelectorAll('.emp-row')].filter(tr => tr.querySelector('.emp-cb').checked).map(tr => tr.dataset.id);
    if (!ids.length) return E.toast('Select at least one', 'error');
    const js = act();
    const toSel = d => `<select data-k="to" style="padding:6px;border:1px solid var(--bd);border-radius:8px;max-width:150px">
      <option value="OH" ${d === 'OH' ? 'selected' : ''}>Factory OH</option>
      <option value="ADM" ${d === 'ADM' ? 'selected' : ''}>Admin</option>
      ${js.length ? '<option value="SPLIT">Split</option>' : ''}
      ${js.map(j => `<option value="${j.id}">${j.no}</option>`).join('')}
    </select>`;
    const rows = ids.map(id => {
      const e = emp(id);
      const isW = isWage(e);
      const logs = openLogs(e.id, to).filter(l => l.date >= f);
      const pc = logs.reduce((s, l) => s + l.amount, 0);
      const pairs = logs.reduce((s, l) => s + (l.convertedQty || l.qty), 0);
      const a = att(e.id, f, to);
      const advBal = E.advBal(id);
      const loanDue = E.staffLoanDue ? E.staffLoanDue(id, to.slice(0, 7)) : 0;
      const advDefault = advBal > 0 && e.payType === 'MonthlySalaried' && e.advInstall ? Math.min(advBal, e.advInstall) : (advBal > 0 ? advBal : 0);
      const ops = {};
      logs.forEach(l => { const o = ops[l.opName] || (ops[l.opName] = { q: 0, pairs: 0, a: 0, r: l.rate }); o.q += l.qty; o.pairs += (l.convertedQty || l.qty); o.a += l.amount; });
      return `<tr data-id="${e.id}" data-piece="${pc}" data-advbal="${advBal}" data-loandue="${loanDue}" data-kind="${isW ? 'wage' : 'salaried'}">
        <td><b>${E.esc(e.name)}</b> ${payBadge(e)}<br><span class="muted">${e.code} · ${isW ? E.m(e.amount) + '/day' : 'salary separate'}</span></td>
        <td>${isW ? inp('days', 56, a.days || '') : '<span class="muted">—</span>'}</td>
        <td class="r">${pc ? `<b>${E.m(pc)}</b><div class="muted" style="font-size:11px;text-align:left">${Object.entries(ops).map(([n, o]) => E.esc(n) + ': ' + o.pairs + ' pairs × ' + E.m(o.r)).join('<br>')}</div>` : '—'}</td>
        <td>${isW ? inp('ot', 52, a.ot || '') : '<span class="muted">—</span>'}</td>
        <td>${inp('bonus', 70)}</td>
        <td class="r">${advBal ? E.m(advBal) : '—'}</td>
        <td>${advBal ? inp('adv', 70, advDefault ? (advDefault / 100).toFixed(2) : '') : '<input type="hidden" data-k="adv" value="0">—'}</td>
        <td class="r">${loanDue ? '<b>' + E.m(loanDue) + '</b>' : '—'}</td>
        <td>${loanDue ? inp('loan', 70, (loanDue / 100).toFixed(2)) : '<input type="hidden" data-k="loan" value="0">—'}</td>
        <td>${inp('other', 60)}</td>
        <td>${toSel(e.target || 'OH')}</td>
        <td class="r gv"></td>
        <td class="r nv"></td>
      </tr>`;
    }).join('');
    E.$('wrb').innerHTML = `<div class="tw"><table>
      <thead><tr><th>Employee</th><th>Days</th><th class="r">Piece</th><th>OT</th><th>Bonus</th><th class="r">Advance</th><th>Recover</th><th class="r">Loan</th><th>Recover</th><th>Other</th><th>Charge</th><th class="r">Gross</th><th class="r">Net</th></tr></thead>
      <tbody id="wr">${rows}</tbody>
    </table></div>
    <div class="tot"><span id="w_g"></span></div>
    <button class="btn p" data-a="saveWageRun" style="margin-top:12px">➡️ Review</button>`;
    recalcWage();
  };

  function recalcWage() {
    let G = 0, N = 0;
    document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
      const e = emp(tr.dataset.id);
      const pc = +tr.dataset.piece;
      const kind = tr.dataset.kind;
      const i = rowIn(tr);
      let basic = 0, ot = 0;
      if (kind === 'wage') {
        basic = Math.round((i.days || 0) * (e.amount || 0));
        const hourly = (e.amount || 0) / 8;
        ot = Math.round((i.ot || 0) * hourly * 1.5);
      }
      const bonus = E.c(i.bonus || 0);
      const gross = basic + pc + ot + bonus;
      const on = E.setting('epfOn') && e.epf;
      const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
      const od = E.c(i.other || 0);
      const net = gross - ee - i.adv - i.loan - od;
      tr.querySelector('.gv').textContent = gross ? E.m(gross) : '';
      tr.querySelector('.nv').textContent = gross ? E.m(net) : '';
      tr.querySelector('.nv').style.color = net < 0 ? '#dc2626' : '';
      G += gross; N += net;
    });
    if (E.$('w_g')) E.$('w_g').textContent = `Gross ${E.m(G)} · Net ${E.m(N)}`;
  }

  const rowIn = tr => {
    const g = k => { const x = tr.querySelector('[data-k=' + k + ']'); return x ? parseFloat(x.value) || 0 : 0; };
    return { days: g('days'), ot: g('ot'), bonus: g('bonus'), adv: E.c(tr.querySelector('[data-k=adv]').value), loan: E.c(tr.querySelector('[data-k=loan]').value), other: g('other'), to: tr.querySelector('[data-k=to]').value };
  };

  E.hooks.push(e => { if (e.target.closest && e.target.closest('#wr')) recalcWage(); });

  E.A.saveWageRun = async () => {
    try {
      if (!document.querySelectorAll('#wr tr[data-id]').length) throw new Error('Build first');
      const w_t = document.getElementById('w_t');
      const type = w_t ? w_t.value : 'Weekly';
      const to = E.val('w_e');
      const f = E.val('w_f');
      const d = E.val('w_d');
      const L = [];
      let split = [];

      document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
        const e = emp(tr.dataset.id);
        const i = rowIn(tr);
        const kind = tr.dataset.kind;
        const logs = openLogs(e.id, to).filter(l => l.date >= f);
        const pc = logs.reduce((s, l) => s + l.amount, 0);
        const on = E.setting('epfOn') && e.epf;
        let basic = 0, ot = 0;
        if (kind === 'wage') {
          basic = Math.round((i.days || 0) * (e.amount || 0));
          const hourly = (e.amount || 0) / 8;
          ot = Math.round((i.ot || 0) * hourly * 1.5);
        }
        const bonus = E.c(i.bonus || 0);
        const gross = basic + pc + ot + bonus;
        if (!gross) return;
        const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
        const ec = on ? Math.round(gross * E.setting('epfCo') / 100) : 0;
        const et = on ? Math.round(gross * E.setting('etf') / 100) : 0;
        const od = E.c(i.other || 0);
        const net = gross - ee - i.adv - i.loan - od;
        if (net < 0) throw new Error(e.name + ': deductions exceed pay');
        const ops = {};
        logs.forEach(l => { const o = ops[l.opName] || (ops[l.opName] = { opName: l.opName, qty: 0, pairs: 0, amount: 0, rate: l.rate }); o.qty += l.qty; o.pairs += (l.convertedQty || l.qty); o.amount += l.amount; });
        L.push({
          empId: e.id, name: e.name, payType: e.payType, payCat: kind,
          basic, piece: pc, ot, bonus, gross,
          epfEmp: ee, epfCo: ec, etf: et, advRec: i.adv, loanRec: i.loan, otherDed: od, net,
          days: i.days || 0, nopay: 0, otHrs: i.ot || 0,
          target: i.to, pieceDetail: Object.values(ops), logIds: logs.map(l => l.id),
          advBefore: E.advBal(e.id), advAfter: E.advBal(e.id) - i.adv
        });
      });

      if (!L.length) throw new Error('Nothing to pay');
      if (L.some(l => l.target === 'SPLIT')) {
        split = [...document.querySelectorAll('.wsp')].map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
        if (split.reduce((a, x) => a + x.p, 0) !== 10000) throw new Error('Split must = 100%');
      }

      const totalLoanRec = L.reduce((s, l) => s + l.loanRec, 0);
      showConfirmWage({ L, split, type, to, f, wd: d, monthly: false, totalLoanRec });
    } catch (e) { E.toast(e.message, 'error'); }
  };

  function showConfirmWage({ L, split, type, to, f, wd, monthly, totalLoanRec }) {
    const S = k => L.reduce((a, l) => a + (l[k] || 0), 0);
    const G = S('gross'), ee = S('epfEmp'), od = S('otherDed'), net = S('net'), adv = S('advRec'), loan = S('loanRec');
    const mb = document.querySelector('#mw .mb');
    if (!mb) return;
    const formHTML = mb.innerHTML;
    mb.innerHTML = `<div style="display:none">${formHTML}</div>
      <p><b>✔ Ready to post</b></p>
      <div class="tw"><table><tbody>
        <tr><td>Type</td><td class="r"><b>${type}</b></td></tr>
        <tr><td>Period</td><td class="r">${f} → ${to}</td></tr>
        <tr><td>Pay date</td><td class="r">${wd}</td></tr>
        <tr><td>Employees</td><td class="r"><b>${L.length}</b></td></tr>
        <tr style="border-top:2px solid var(--bd)"><td><b>Gross</b></td><td class="r"><b>${E.m(G)}</b></td></tr>
        ${ee ? `<tr><td>EPF employee</td><td class="r">-${E.m(ee)}</td></tr>` : ''}
        ${adv ? `<tr><td>Advance recovery</td><td class="r">-${E.m(adv)}</td></tr>` : ''}
        ${loan ? `<tr><td>Loan recovery</td><td class="r">-${E.m(loan)}</td></tr>` : ''}
        ${od ? `<tr><td>Other deductions</td><td class="r">-${E.m(od)}</td></tr>` : ''}
        <tr style="background:var(--acs)"><td><b>Net pay</b></td><td class="r"><b style="font-size:16px">${E.m(net)}</b></td></tr>
      </tbody></table></div>
      ${loan ? '<p class="muted" style="margin-top:10px;font-size:12px"><b>Loan recovery</b> will mark instalments paid.</p>' : ''}`;
    const mf = document.querySelector('#mw .mf');
    if (mf) mf.innerHTML = `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="confirmWagePost">✔ Confirm & Post</button>`;
    E._pendWage = { L, split, type, to, f, wd, monthly };
  }

  E.A.confirmWagePost = async () => {
    try {
      const p = E._pendWage;
      if (!p) throw new Error('No pending');
      const { L, split, type, to, f, wd, monthly } = p;
      delete E._pendWage;

      /* Split lines by job status */
      const dr = {};
      const closedVar = [];
      const add = (acc, job, v, cat) => { if (!v) return; const k = acc + '|' + job; dr[k] = dr[k] || { acc, job, dr: 0, cat }; dr[k].dr += v; };

      L.forEach(l => {
        const oncost = l.epfCo + l.etf;
        const timeBase = l.basic + l.ot + l.bonus;
        const tot = l.gross || 1;
        const onP = Math.round(oncost * l.piece / tot);
        const onT = oncost - onP;
        const time = timeBase + onT;
        if (l.piece) {
          add('2210', '', l.piece);
          const byJob = {};
          logsOf(l).forEach(g => { byJob[g.jobId] = (byJob[g.jobId] || 0) + g.amount; });
          let left = onP;
          const ks = Object.keys(byJob);
          ks.forEach((jid, i) => {
            const a = i === ks.length - 1 ? left : Math.round(onP * byJob[jid] / l.piece);
            left -= a;
            const job = J(jid);
            if (job && job.status === 'Completed') {
              closedVar.push({ jobId: jid, jobNo: job.no, amount: a });
            } else {
              add('1310', jid, a, 'Labour');
            }
          });
        }
        if (!time) return;
        if (l.target === 'OH') add('5270', '', time);
        else if (l.target === 'ADM') add('6050', '', time);
        else if (l.target === 'SPLIT') {
          let left = time;
          split.forEach((s, i) => {
            const a = i === split.length - 1 ? left : Math.round(time * s.p / 10000);
            left -= a;
            const job = J(s.id);
            if (job && job.status === 'Completed') {
              closedVar.push({ jobId: s.id, jobNo: job.no, amount: a });
            } else {
              add('1310', s.id, a, 'Labour');
            }
          });
        } else {
          const job = J(l.target);
          if (job && job.status === 'Completed') {
            closedVar.push({ jobId: l.target, jobNo: job.no, amount: time });
          } else {
            add('1310', l.target, time, 'Labour');
          }
        }
      });

      const S = k => L.reduce((a, l) => a + l[k], 0);
      const G = S('gross'), ee = S('epfEmp'), ec = S('epfCo'), et = S('etf');
      const ar = S('advRec'), lr = S('loanRec'), od = S('otherDed'), net = S('net');
      const no = await E.next(monthly ? 'SAL' : 'WG');

      const lines = Object.values(dr).filter(x => x.dr).map(x =>
        x.acc === '1310' ? { acc: '1310', dr: x.dr, job: x.job, cat: 'Labour', head: monthly ? '5130' : '5110' } : { acc: x.acc, dr: x.dr }
      ).concat([{ acc: '2200', cr: net }]);
      if (ee + ec + et) lines.push({ acc: '2100', cr: ee + ec + et });
      if (ar) lines.push({ acc: '1250', cr: ar });
      if (lr) lines.push({ acc: '1250', cr: lr });
      if (od) lines.push({ acc: '2230', cr: od });

      const je = await E.post({ date: wd, ref: no, narr: `${type} ${monthly ? 'salaries' : 'wages'} ${f} to ${to}`, source: 'payroll', lines });
      const run = await E.save('wageRuns', {
        no, kind: 'run', type, date: wd, from: f, to, lines: L, split,
        gross: G, epfEmp: ee, epfCo: ec, etf: et,
        advRec: ar, loanRec: lr, otherDed: od, net,
        jeId: je.id, paid: false, cancelled: false,
        closedVarCount: closedVar.length
      });

      /* Closed job variances */
      if (closedVar.length) {
        const totalClosed = closedVar.reduce((s, x) => s + x.amount, 0);
        const no2 = await E.next('WGADJ');
        await E.post({ date: wd, ref: no2, narr: 'Wage allocation for closed jobs', source: 'closed-job-adjustment',
          lines: [{ acc: '5390', dr: totalClosed }, { acc: '5270', cr: totalClosed }] });
        for (const cv of closedVar) {
          await E.save('closedJobVariances', {
            factoryId: E.fid, jobId: cv.jobId, jobNo: cv.jobNo,
            type: 'late-wage', amount: cv.amount, date: wd,
            closedDate: J(cv.jobId).completedAt, notes: 'Wage run ' + no,
            sourceJeId: je.id, createdAt: new Date().toISOString()
          });
        }
      }

      /* Staff loan apply */
      if (lr) {
        for (const l of L) if (l.loanRec > 0) {
          try { await E.staffLoanApply(l.empId, l.loanRec, run.id, no, wd); } catch (e) { console.warn(e); }
        }
      }

      for (const l of L) for (const id of l.logIds) {
        const g = E.D.prodLogs.find(x => x.id === id);
        if (!g) continue;
        const b = JSON.parse(JSON.stringify(g));
        g.status = 'paid'; g.runId = run.id; g.runNo = no;
        await E.save('prodLogs', g, b);
      }
      E.closeM(); E.go();
      E.toast(no + ' posted' + (closedVar.length ? ' · ' + closedVar.length + ' → 5390' : ''), closedVar.length ? 'warning' : 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.route('daily-salaries', 'Daily Salaries', () => {
    const R = E.rows('wageRuns').filter(r => r.kind === 'daily-salary').sort((a, b) => b.no.localeCompare(a.no));
    const emps = E.rows('employees').filter(e => e.active && isDailySal(e));
    const month = E.today().slice(0, 7);
    return `<div class="kp">
      ${E.kpi('Daily-Salaried', emps.length)}
      ${E.kpi('This month', R.filter(r => r.date.slice(0, 7) === month && !r.cancelled).length, 'records')}
      ${E.kpi('Paid', E.m(R.filter(r => r.date.slice(0, 7) === month && !r.cancelled).reduce((s, r) => s + r.net, 0)))}
      ${E.kpi('Advance bal', E.m(emps.reduce((s, e) => s + E.advBal(e.id), 0)))}
    </div>
    <div class="bar"><span class="gap"></span><button class="btn p" data-a="newDailySalary">+ Record</button></div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Date</th><th>Employee</th><th class="r">Days</th><th class="r">Rate</th><th class="r">Gross</th><th class="r">Advance</th><th class="r">Loan</th><th class="r">Net</th><th></th></tr></thead>
      <tbody>${R.map(r => {
        const e = emp(r.empId) || { name: '?' };
        return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
          <td>${r.no}</td><td>${r.date}</td><td>${E.esc(e.name)}</td>
          <td class="r">${r.days}</td><td class="r">${E.m(r.rate)}</td>
          <td class="r">${E.m(r.gross)}</td>
          <td class="r">${r.advRec ? E.m(r.advRec) : '—'}</td>
          <td class="r">${r.loanRec ? E.m(r.loanRec) : '—'}</td>
          <td class="r"><b>${E.m(r.net)}</b></td>
          <td class="r">${!r.cancelled ? `<button class="btn sm d" data-a="dailyCancel" data-id="${r.id}">Cancel</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No records</td></tr>'}</tbody>
    </table></div>`;
  });

  E.A.newDailySalary = () => {
    const emps = E.rows('employees').filter(e => e.active && isDailySal(e));
    if (!emps.length) return E.toast('No Daily-Salaried employees', 'error');
    E.modal('Record Daily Salary', `
      <div class="f">Employee *<select id="ds_e" onchange="E.A.dsDailyUpdate()">${emps.map(e => `<option value="${e.id}">${E.esc(e.name)} · ${E.m(e.amount)}/day</option>`).join('')}</select></div>
      <div class="g2">
        <div class="f">From<input id="ds_f" type="date" value="${E.today()}"></div>
        <div class="f">To<input id="ds_t" type="date" value="${E.today()}"></div>
        <div class="f">Days *<input id="ds_d" type="number" step="0.5" value="1" oninput="E.A.dsDailyUpdate()"></div>
        <div class="f">Pay date<input id="ds_pd" type="date" value="${E.today()}"></div>
        <div class="f">Daily rate<input id="ds_r" readonly></div>
        <div class="f">Advance recovery<input id="ds_adv" type="number" step="0.01" value="0" oninput="E.A.dsDailyUpdate()"></div>
        <div class="f">Loan recovery<input id="ds_loan" type="number" step="0.01" value="0" oninput="E.A.dsDailyUpdate()"></div>
      </div>
      <div class="f">Paid from *<select id="ds_s"><option value="">—</option>${E.opts(a => a.bank || a.code === '1010')}</select></div>
      <div class="f">Notes<input id="ds_n"></div>
      <div class="tot"><span>Gross</span><span id="ds_g">Rs 0</span></div>
      <div class="tot"><span>Net to pay</span><b id="ds_n2">Rs 0</b></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveDailySalary">Post</button>`);
    setTimeout(() => E.A.dsDailyUpdate(), 50);
  };

  E.A.dsDailyUpdate = () => {
    const e = emp(E.val('ds_e'));
    const rate = e ? e.amount : 0;
    if (E.$('ds_r')) E.$('ds_r').value = (rate / 100).toFixed(2);
    const days = parseFloat(E.val('ds_d')) || 0;
    const gross = Math.round(days * rate);
    const adv = E.c(E.val('ds_adv')), loan = E.c(E.val('ds_loan'));
    if (E.$('ds_g')) E.$('ds_g').textContent = E.m(gross);
    if (E.$('ds_n2')) E.$('ds_n2').textContent = E.m(gross - adv - loan);
  };

  E.A.saveDailySalary = async () => {
    try {
      const e = emp(E.val('ds_e'));
      if (!e) throw new Error('Select employee');
      const days = parseFloat(E.val('ds_d')) || 0;
      if (days <= 0) throw new Error('Enter days');
      const rate = e.amount || 0;
      const gross = Math.round(days * rate);
      const adv = E.c(E.val('ds_adv')), loan = E.c(E.val('ds_loan'));
      const advB = E.advBal(e.id);
      if (adv > advB) throw new Error('Advance exceeds balance (' + E.m(advB) + ')');
      const src = E.val('ds_s');
      if (!src) throw new Error('Choose account');
      const net = gross - adv - loan;
      if (net < 0) throw new Error('Net negative');
      if (E.bal(src) < net && !confirm('Balance < pay. Continue?')) return;
      const no = await E.next('DS');
      const lines = [{ acc: '5120', dr: gross }, { acc: src, cr: net }];
      if (adv) lines.push({ acc: '1250', cr: adv });
      if (loan) lines.push({ acc: '1250', cr: loan });
      const je = await E.post({ date: E.val('ds_pd'), ref: no, narr: `Daily salary · ${e.name}`, source: 'payroll', lines });
      const rec = await E.save('wageRuns', {
        no, kind: 'daily-salary', empId: e.id, date: E.val('ds_pd'), from: E.val('ds_f'), to: E.val('ds_t'),
        days, rate, gross, advRec: adv, loanRec: loan, net, bank: src, notes: E.val('ds_n'), jeId: je.id, paid: true, cancelled: false
      });
      if (loan) { try { await E.staffLoanApply(e.id, loan, rec.id, no, E.val('ds_pd')); } catch (x) { console.warn(x); } }
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (err) { E.toast(err.message, 'error'); }
  };

  E.A.dailyCancel = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      if (!confirm('Cancel ' + r.no + '?')) return;
      await E.reverse(r.jeId);
      if (r.loanRec) { try { await E.staffLoanReverseRun(r.id); } catch (x) { console.warn(x); } }
      const b = JSON.parse(JSON.stringify(r));
      r.cancelled = true;
      await E.save('wageRuns', r, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.route('monthly-salaries', 'Monthly Salaries', () => {
    const R = E.rows('wageRuns').filter(r => r.kind === 'run' && r.type === 'Monthly').sort((a, b) => b.no.localeCompare(a.no));
    const emps = E.rows('employees').filter(e => e.active && isMonthlySal(e));
    return `<div class="kp">
      ${E.kpi('Monthly-Salaried', emps.length)}
      ${E.kpi('Unpaid', R.filter(r => !r.cancelled && !r.paid).length)}
      ${E.kpi('EPF/ETF', E.m(E.bal('2100')))}
      ${E.kpi('Loan recovery', E.m(R.reduce((s, r) => s + (r.loanRec || 0), 0)))}
    </div>
    <div class="bar"><span class="gap"></span><button class="btn" data-a="remitM">Remit EPF</button><button class="btn p" data-a="newMonthlyRun">+ New Monthly Run</button></div>
    <div class="tw"><table>
      <thead><tr><th>Run</th><th>Period</th><th class="r">Staff</th><th class="r">Gross</th><th class="r">Loan</th><th class="r">Net</th><th>Status</th><th></th></tr></thead>
      <tbody>${R.map(r => `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
        <td><b>${r.no}</b></td><td>${r.from} → ${r.to}</td><td class="r">${r.lines.length}</td>
        <td class="r">${E.m(r.gross)}</td><td class="r">${r.loanRec ? E.m(r.loanRec) : '—'}</td>
        <td class="r"><b>${E.m(r.net)}</b></td>
        <td><span class="tag">${r.cancelled ? 'Cancelled' : r.paid ? 'Paid' : 'Unpaid'}</span></td>
        <td class="r"><button class="btn sm" data-a="slips" data-id="${r.id}">Slips</button>
          ${!r.cancelled && !r.paid ? `<button class="btn sm p" data-a="payRun" data-id="${r.id}">Pay</button><button class="btn sm d" data-a="canRun" data-id="${r.id}">Cancel</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No runs</td></tr>'}</tbody>
    </table></div>`;
  });

  E.A.newMonthlyRun = () => {
    if (!E.rows('employees').some(x => x.active && isMonthlySal(x))) return E.toast('No monthly staff', 'error');
    E.modal('New Monthly Salary Run', `
      <div class="g2">
        <div class="f">Pay date<input id="w_d" type="date" value="${W.date}"></div>
        <div class="f">Period from<input id="w_f" type="date" value="${E.today().slice(0, 8)}01"></div>
        <div class="f">Period to<input id="w_e" type="date" value="${E.today()}"></div>
      </div>
      <input type="hidden" id="w_t" value="Monthly">
      <div class="bar"><button class="btn p" data-a="loadMonthlyRun">⟳ Load</button></div>
      <div id="wrb"><p class="muted">Click Load.</p></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveMonthlyRun">Post</button>`, 1);
  };

  E.A.loadMonthlyRun = () => {
    const f = E.val('w_f'), to = E.val('w_e');
    if (!f || !to || f > to) return E.toast('Check dates', 'error');
    const emps = E.rows('employees').filter(x => x.active && isMonthlySal(x)).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!emps.length) return E.toast('No staff', 'error');
    const js = act();
    const toSel = d => `<select data-k="to" style="padding:6px;border:1px solid var(--bd);border-radius:8px;max-width:150px">
      <option value="OH" ${d === 'OH' ? 'selected' : ''}>Factory OH</option>
      <option value="ADM" ${d === 'ADM' ? 'selected' : ''}>Admin</option>
      ${js.length ? '<option value="SPLIT">Split</option>' : ''}
      ${js.map(j => `<option value="${j.id}">${j.no}</option>`).join('')}
    </select>`;
    const rows = emps.map(e => {
      const a = att(e.id, f, to);
      const advBal = E.advBal(e.id);
      const loanDue = E.staffLoanDue ? E.staffLoanDue(e.id, to.slice(0, 7)) : 0;
      const adv0 = e.advInstall ? Math.min(advBal, e.advInstall) : advBal;
      return `<tr data-id="${e.id}">
        <td><b>${E.esc(e.name)}</b><br><span class="muted">${e.code} · ${E.m(e.amount)}/mo</span></td>
        <td>${inp('days', 56, a.absent || '')}</td>
        <td>${inp('ot', 52, a.ot || '')}</td>
        <td>${inp('bonus', 70)}</td>
        <td class="r">${advBal ? E.m(advBal) : '—'}</td>
        <td>${advBal ? inp('adv', 70, adv0 ? (adv0 / 100).toFixed(2) : '') : '<input type="hidden" data-k="adv" value="0">—'}</td>
        <td class="r">${loanDue ? '<b>' + E.m(loanDue) + '</b>' : '—'}</td>
        <td>${loanDue ? inp('loan', 70, (loanDue / 100).toFixed(2)) : '<input type="hidden" data-k="loan" value="0">—'}</td>
        <td>${toSel(e.target || 'ADM')}</td>
        <td class="r gv"></td>
        <td class="r nv"></td>
      </tr>`;
    }).join('');
    E.$('wrb').innerHTML = `<div class="tw"><table>
      <thead><tr><th>Employee</th><th>No-pay</th><th>OT</th><th>Bonus</th><th class="r">Advance</th><th>Recover</th><th class="r">Loan</th><th>Recover</th><th>Charge</th><th class="r">Gross</th><th class="r">Net</th></tr></thead>
      <tbody id="wr">${rows}</tbody>
    </table></div>
    <div class="tot"><span id="w_g"></span></div>
    <button class="btn p" data-a="saveMonthlyRun" style="margin-top:12px">➡️ Review</button>`;
    recalcMonthly();
  };

  function recalcMonthly() {
    let G = 0, N = 0;
    document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
      const e = emp(tr.dataset.id);
      const i = rowIn(tr);
      const nopayDed = Math.round((e.amount || 0) / 30 * (i.days || 0));
      const basic = Math.max(0, (e.amount || 0) + (e.allow || 0) - nopayDed);
      const hourly = (e.amount || 0) / 240;
      const ot = Math.round((i.ot || 0) * hourly * 1.5);
      const bonus = E.c(i.bonus || 0);
      const gross = basic + ot + bonus;
      const on = E.setting('epfOn') && e.epf;
      const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
      const od = E.c(i.other || 0);
      const net = gross - ee - i.adv - i.loan - od;
      tr.querySelector('.gv').textContent = gross ? E.m(gross) : '';
      tr.querySelector('.nv').textContent = gross ? E.m(net) : '';
      tr.querySelector('.nv').style.color = net < 0 ? '#dc2626' : '';
      G += gross; N += net;
    });
    if (E.$('w_g')) E.$('w_g').textContent = `Gross ${E.m(G)} · Net ${E.m(N)}`;
  }
  E.hooks.push(e => { if (e.target.closest && e.target.closest('#wr')) recalcMonthly(); });

  E.A.saveMonthlyRun = async () => {
    try {
      if (!document.querySelectorAll('#wr tr[data-id]').length) throw new Error('Load first');
      const f = E.val('w_f'), to = E.val('w_e'), wd = E.val('w_d');
      const L = [];
      let split = [];
      document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
        const e = emp(tr.dataset.id);
        const i = rowIn(tr);
        const on = E.setting('epfOn') && e.epf;
        const nopay = parseInt(i.days) || 0;
        const nopayDed = Math.round((e.amount || 0) / 30 * nopay);
        const basic = Math.max(0, (e.amount || 0) + (e.allow || 0) - nopayDed);
        const hourly = (e.amount || 0) / 240;
        const ot = Math.round((i.ot || 0) * hourly * 1.5);
        const bonus = E.c(i.bonus || 0);
        const gross = basic + ot + bonus;
        const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
        const ec = on ? Math.round(gross * E.setting('epfCo') / 100) : 0;
        const et = on ? Math.round(gross * E.setting('etf') / 100) : 0;
        const od = E.c(i.other || 0);
        const net = gross - ee - i.adv - i.loan - od;
        const advB = E.advBal(e.id);
        if (i.adv > advB) throw new Error(e.name + ': advance exceeds balance');
        if (net < 0) throw new Error(e.name + ': net negative');
        L.push({ empId: e.id, name: e.name, payType: e.payType, basic, piece: 0, ot, bonus, gross,
          epfEmp: ee, epfCo: ec, etf: et, advRec: i.adv, loanRec: i.loan, otherDed: od, net,
          days: 0, nopay: nopay || 0, otHrs: i.ot || 0, target: i.to, pieceDetail: [], logIds: [],
          advBefore: advB, advAfter: advB - i.adv
        });
      });
      if (!L.length) throw new Error('Nothing to pay');
      if (L.some(l => l.target === 'SPLIT')) {
        split = [...document.querySelectorAll('.wsp')].map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
        if (split.reduce((a, x) => a + x.p, 0) !== 10000) throw new Error('Split must = 100%');
      }
      const totalLoanRec = L.reduce((s, l) => s + l.loanRec, 0);
      showConfirmWage({ L, split, type: 'Monthly', to, f, wd, monthly: true, totalLoanRec });
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.canRun = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      if (r.paid) throw new Error('Already paid');
      if (!confirm('Cancel ' + r.no + '?')) return;
      await E.reverse(r.jeId);
      if (r.loanRec) { try { await E.staffLoanReverseRun(r.id); } catch (x) {} }
      for (const l of r.lines) for (const lid of (l.logIds || [])) {
        const g = E.D.prodLogs.find(x => x.id === lid);
        if (g && g.status === 'paid') { const b = JSON.parse(JSON.stringify(g)); g.status = 'accrued'; g.runId = ''; g.runNo = ''; await E.save('prodLogs', g, b); }
      }
      const b = JSON.parse(JSON.stringify(r)); r.cancelled = true;
      await E.save('wageRuns', r, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  const srcForm = (t, amt, btn, id, note) => E.modal(t, `
    <div class="g2"><div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div><div class="f">Amount<input id="z_a" type="number" step="0.01" value="${amt ? amt / 100 : ''}"></div></div>
    <div class="f">Paid from *<select id="z_s"><option value="">—</option>${E.opts(a => a.bank)}</select></div>
    <p class="muted">${note}</p>
  `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="${btn}" data-id="${id || ''}">Post</button>`);

  const chk = () => {
    const a = E.c(E.val('z_a')), s = E.val('z_s');
    if (a <= 0) throw new Error('Enter amount');
    if (!s) throw new Error('Choose account');
    return { a, s, d: E.val('z_d') };
  };

  E.A.payRun = id => { const r = E.D.wageRuns.find(x => x.id === id); srcForm('Pay ' + r.no, r.net, 'savePayRun', id, 'Dr 2200 / Cr bank'); };
  E.A.savePayRun = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      const c = chk();
      if (c.a !== r.net) throw new Error('Pay full net ' + E.m(r.net));
      const no = await E.next('WP');
      const je = await E.post({ date: c.d, ref: no, narr: 'Pay ' + r.no, source: 'payroll', lines: [{ acc: '2200', dr: c.a }, { acc: c.s, cr: c.a }] });
      const b = JSON.parse(JSON.stringify(r)); r.paid = true; r.payJe = je.no; await E.save('wageRuns', r, b);
      E.closeM(); E.go(); E.toast('Paid', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.remitM = () => srcForm('Remit EPF/ETF', E.bal('2100'), 'saveRemit', '', 'Balance: ' + E.m(E.bal('2100')));
  E.A.saveRemit = async () => {
    try {
      const c = chk();
      if (c.a > E.bal('2100')) throw new Error('Exceeds payable');
      const no = await E.next('EPF');
      await E.post({ date: c.d, ref: no, narr: 'EPF/ETF remit', source: 'payroll', lines: [{ acc: '2100', dr: c.a }, { acc: c.s, cr: c.a }] });
      await E.save('wageRuns', { no, kind: 'remit', date: c.d, amount: c.a });
      E.closeM(); E.go(); E.toast('Remitted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.advM = id => {
    const es = E.rows('employees').filter(x => x.active);
    if (!es.length) return E.toast('No employees', 'error');
    E.modal('Give Advance', `
      <div class="f">Employee *<select id="v_e">${es.map(e => `<option value="${e.id}" ${e.id === id ? 'selected' : ''}>${E.esc(e.name)} · ${payCat(e)}${advBal(e.id) > 0 ? ' · owes ' + E.m(advBal(e.id)) : ''}</option>`).join('')}</select></div>
      <div class="g2"><div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div><div class="f">Amount<input id="z_a" type="number" step="0.01"></div></div>
      <div class="f">Paid from *<select id="z_s"><option value="">—</option>${E.opts(a => a.bank || a.code === '1010')}</select></div>
      <div class="f">Note<input id="z_n"></div>
      <p class="muted">Dr 1250 / Cr bank. Recovered in wage or salary runs.</p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveAdv">Post</button>`);
  };
  E.A.saveAdv = async () => {
    try {
      const c = chk();
      const e = emp(E.val('v_e'));
      const no = await E.next('ADV');
      await E.post({ date: c.d, ref: no, narr: 'Advance · ' + e.name, source: 'payroll', lines: [{ acc: '1250', dr: c.a }, { acc: c.s, cr: c.a }] });
      await E.save('wageRuns', { no, kind: 'advance', empId: e.id, date: c.d, amount: c.a, note: E.val('z_n'), cancelled: false });
      E.closeM(); E.go(); E.toast('Advance posted', 'success');
    } catch (err) { E.toast(err.message, 'error'); }
  };

  E.A.slips = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    const f = E.factory();
    const h = `<html><head><title>${r.no}</title><style>
      @page{size:A4;margin:14mm}body{font:13px Arial}
      .s{border:1px solid #444;padding:12px;margin-bottom:16px;page-break-inside:avoid}
      table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}
    </style></head><body>${r.lines.map(l => `<div class="s">
      <b>${E.esc(f.name)}</b> — PAY SLIP<br>${r.type} · ${r.from} to ${r.to} · ${r.date}<br><b>${E.esc(l.name)}</b>
      <table>
        <tr><td>Basic</td><td class="r">${E.m(l.basic)}</td></tr>
        ${l.pieceDetail && l.pieceDetail.length ? `<tr><td colspan="2"><b>Piece work</b>
          <table><tr><th>Operation</th><th class="r">Pairs</th><th class="r">Rate/pair</th><th class="r">Amount</th></tr>
          ${l.pieceDetail.map(o => `<tr><td>${E.esc(o.opName)}</td><td class="r">${o.pairs || o.qty}</td><td class="r">${E.m(o.rate)}</td><td class="r">${E.m(o.amount)}</td></tr>`).join('')}
          </table></td></tr>` : ''}
        ${l.ot ? `<tr><td>Overtime</td><td class="r">${E.m(l.ot)}</td></tr>` : ''}
        ${l.bonus ? `<tr><td>Bonus</td><td class="r">${E.m(l.bonus)}</td></tr>` : ''}
        <tr><td><b>Gross</b></td><td class="r"><b>${E.m(l.gross)}</b></td></tr>
        ${l.epfEmp ? `<tr><td>EPF</td><td class="r">-${E.m(l.epfEmp)}</td></tr>` : ''}
        ${l.advRec ? `<tr><td>Advance</td><td class="r">-${E.m(l.advRec)}</td></tr>` : ''}
        ${l.loanRec ? `<tr><td>Staff loan</td><td class="r">-${E.m(l.loanRec)}</td></tr>` : ''}
        ${l.otherDed ? `<tr><td>Other</td><td class="r">-${E.m(l.otherDed)}</td></tr>` : ''}
        <tr><td><b>Net</b></td><td class="r"><b>${E.m(l.net)}</b></td></tr>
      </table><br>Signature: ____________________</div>`).join('')}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    w.document.write(h); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const LG = { emp: '', from: E.today().slice(0, 4) + '-01-01', to: E.today() };

  function ledgerEvents(id) {
    const ev = [];
    E.rows('prodLogs').filter(l => l.empId === id && l.status !== 'cancelled').forEach(l => {
      ev.push({ d: l.date, k: 'Production', t: l.opName + ' · ' + l.code + ' · ' + (l.convertedQty || l.qty) + ' pairs × ' + E.m(l.rate), earn: l.amount, adv: 0, loan: 0, pay: 0 });
    });
    runs().filter(r => !r.cancelled).forEach(r => {
      if (r.kind === 'run') {
        const x = (r.lines || []).find(l => l.empId === id);
        if (!x) return;
        ev.push({ d: r.date, k: (r.type === 'Monthly' ? 'Salary run' : 'Wage run'),
          t: `${r.no} · gross ${E.m(x.gross)}` + (x.piece ? ' (piece ' + E.m(x.piece) + ')' : '') + (x.advRec ? ' · adv ' + E.m(x.advRec) : '') + (x.loanRec ? ' · loan ' + E.m(x.loanRec) : ''),
          earn: x.gross - (x.piece || 0), adv: -(x.advRec || 0), loan: -(x.loanRec || 0), pay: 0 });
        if (r.paid) ev.push({ d: r.date, k: 'Paid', t: 'Net ' + r.no, earn: 0, adv: 0, loan: 0, pay: x.net });
      } else if (r.kind === 'daily-salary' && r.empId === id) {
        ev.push({ d: r.date, k: 'Daily salary', t: `${r.no} · ${r.days}×${E.m(r.rate)}`, earn: r.gross, adv: -(r.advRec || 0), loan: -(r.loanRec || 0), pay: 0 });
        ev.push({ d: r.date, k: 'Paid', t: 'Net ' + r.no, earn: 0, adv: 0, loan: 0, pay: r.net });
      }
    });
    E.rows('wageRuns').filter(r => r.kind === 'advance' && r.empId === id && !r.cancelled).forEach(r => {
      ev.push({ d: r.date, k: 'Advance', t: r.note || 'Advance', earn: 0, adv: r.amount, loan: 0, pay: 0 });
    });
    E.rows('staffLoans').filter(l => l.empId === id && !l.cancelled).forEach(l => {
      ev.push({ d: l.date, k: 'Loan given', t: l.no + ' · ' + E.m(l.principal), earn: 0, adv: 0, loan: l.principal, pay: 0 });
      l.rows.forEach(r => { if (r.paid) ev.push({ d: r.paidDate, k: 'Loan recovered', t: `${l.no} · #${r.n}`, earn: 0, adv: 0, loan: -r.paidPrincipal, pay: 0 }); });
    });
    return ev.sort((a, b) => a.d.localeCompare(b.d));
  }

  E.route('empledger', 'Employee Ledger', () => {
    const es = E.rows('employees').sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!LG.emp && es.length) LG.emp = es[0].id;
    const e = emp(LG.emp);
    if (!e) return '<div class="card muted">Add employees first.</div>';
    const ev = ledgerEvents(e.id);
    const ins = ev.filter(x => x.d >= LG.from && x.d <= LG.to);
    const before = ev.filter(x => x.d < LG.from).reduce((s, x) => s + x.adv + x.loan, 0);
    let ab = before;
    const paid = ev.reduce((s, x) => s + x.pay, 0);
    const loanBal = E.rows('staffLoans').filter(l => l.empId === e.id && !l.cancelled && !l.settled).reduce((s, l) => s + E.staffLoanTotals(l).principalOut, 0);
    return `<div class="bar">
      <select class="fs" data-f="lg.emp" style="min-width:240px">${es.map(x => `<option value="${x.id}" ${x.id === LG.emp ? 'selected' : ''}>${E.esc(x.code + ' — ' + x.name)}</option>`).join('')}</select>
      <span class="muted">From</span><input type="date" class="fs" data-f="lg.from" value="${LG.from}">
      <span class="muted">to</span><input type="date" class="fs" data-f="lg.to" value="${LG.to}">
      <span class="gap"></span>
      <button class="btn" data-a="lgPrint">🖨 Statement</button>
      <button class="btn" data-a="advM" data-id="${e.id}">Give Advance</button>
    </div>
    <div class="kp">
      ${E.kpi('Category', CAT_LABEL[payCat(e)], e.amount ? E.m(e.amount) : '')}
      ${E.kpi('Advance balance', E.m(E.advBal(e.id)))}
      ${E.kpi('Staff loan', E.m(loanBal))}
      ${E.kpi('Total paid', E.m(paid))}
    </div>
    <div class="tw" id="elt"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="r">Earned</th><th class="r">Given</th><th class="r">Recovered</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
      <tbody>
        <tr><td colspan="7" class="muted">Brought forward</td><td class="r"><b>${E.m(before)}</b></td></tr>
        ${ins.map(x => { ab += x.adv + x.loan; return `<tr>
          <td>${x.d}</td><td><span class="tag">${x.k}</span></td><td>${E.esc(x.t)}</td>
          <td class="r">${x.earn ? E.m(x.earn) : ''}</td>
          <td class="r">${(x.adv + x.loan) > 0 ? E.m(x.adv + x.loan) : ''}</td>
          <td class="r">${(x.adv + x.loan) < 0 ? E.m(-(x.adv + x.loan)) : ''}</td>
          <td class="r">${x.pay ? E.m(x.pay) : ''}</td>
          <td class="r"><b>${E.m(ab)}</b></td>
        </tr>`; }).join('') || '<tr><td colspan="8" class="muted">No activity</td></tr>'}
      </tbody>
    </table></div>`;
  });

  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f && f.startsWith('lg.')) { LG[f.slice(3)] = e.target.value; E.go(); } });

  E.A.lgPrint = () => {
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const e = emp(LG.emp);
    w.document.write(`<html><head><title>Statement</title><style>body{font:13px Arial;margin:16px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}.r{text-align:right}</style></head><body>
      <h3>${E.esc(E.factory().name)} — Employee Statement</h3>
      <p><b>${E.esc(e.name)}</b> (${E.esc(e.code)}) · ${LG.from} → ${LG.to}</p>
      ${E.$('elt').innerHTML}
    </body></html>`);
    w.document.close(); w.print();
  };
})(window.ERP);