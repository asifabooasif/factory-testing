/* Staff Loans Register — with partial recovery support */
(E => {
  E.nav('People & Payroll', 'staffloans', '💵', 'Staff Loans');
  const emp = id => E.D.employees.find(x => x.id === id);
  const DT = /^\d{4}-\d{2}-\d{2}$/;

  function addMonths(date, k) {
    const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1, d = +date.slice(8, 10);
    const t = m + k;
    const ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12;
    const dim = new Date(ny, nm + 1, 0).getDate();
    return ny + '-' + String(nm + 1).padStart(2, '0') + '-' + String(Math.min(d, dim)).padStart(2, '0');
  }

  function buildSchedule(principal, rate, n, firstDue, method) {
    const rows = [];
    const r = (rate || 0) / 1200;
    let emi, flatInterest = 0;
    if (r === 0) emi = Math.round(principal / n);
    else if (method === 'flat') {
      flatInterest = Math.round(principal * (rate / 100) * n / 12);
      emi = Math.round((principal + flatInterest) / n);
    } else emi = Math.round(principal * r / (1 - Math.pow(1 + r, -n)));
    let bal = principal, leftInterest = flatInterest;
    for (let i = 0; i < n; i++) {
      const op = bal;
      const last = i === n - 1;
      let int = 0, pr = 0;
      if (r === 0) { int = 0; pr = last ? bal : Math.round(principal / n); }
      else if (method === 'flat') {
        int = last ? leftInterest : Math.round(flatInterest / n);
        leftInterest -= int;
        pr = last ? op : Math.round(principal / n);
      } else { int = Math.round(op * r); pr = last ? op : emi - int; }
      if (pr > op) pr = op;
      bal = op - pr;
      rows.push({ n: i + 1, due: addMonths(firstDue, i), opening: op, principal: pr, interest: int, emi: pr + int, closing: bal, paid: false, paidDate: '', paidPrincipal: 0, paidInterest: 0, paidEmi: 0, runId: '', runNo: '', manualPayNo: '', waived: false, partialPaid: 0, partialPrin: 0 });
    }
    return { emi, rows };
  }

  const loanTotals = l => {
    const principalOut = l.rows.filter(r => !r.paid && !r.waived).reduce((s, r) => s + r.principal, 0);
    const totalPaid = l.rows.filter(r => r.paid).reduce((s, r) => s + r.paidEmi, 0) + l.rows.reduce((s, r) => s + (r.partialPaid || 0), 0);
    const totalInterestPaid = l.rows.filter(r => r.paid).reduce((s, r) => s + r.paidInterest, 0);
    const paidCount = l.rows.filter(r => r.paid).length;
    const nextDue = l.rows.find(r => !r.paid && !r.waived);
    const status = l.cancelled ? 'Cancelled' : l.settled ? 'Settled early' : (principalOut <= 0 ? 'Completed' : 'Active');
    return { principalOut, totalPaid, totalInterestPaid, paidCount, nextDue, status };
  };
  E.staffLoanTotals = loanTotals;

  E.staffLoanDue = (empId, month) => {
    const loans = E.rows('staffLoans').filter(l =>
      l.empId === empId && !l.cancelled && !l.settled &&
      !(l.rows.every(r => r.paid || r.waived))
    );
    let total = 0;
    loans.forEach(l => {
      const nxt = l.rows.find(r => !r.paid && !r.waived);
      if (nxt && nxt.due.slice(0, 7) <= month) total += nxt.emi;
    });
    return total;
  };

  /* FIX: Partial recovery supported */
  E.staffLoanApply = async (empId, amount, runId, runNo, payDate) => {
    if (!amount || amount <= 0) return { applied: 0, loans: [] };
    const loans = E.rows('staffLoans')
      .filter(l => l.empId === empId && !l.cancelled && !l.settled)
      .sort((a, b) => (a.firstDue || '').localeCompare(b.firstDue || ''));
    let left = amount;
    const applied = [];
    for (const loan of loans) {
      if (left <= 0) break;
      const b = JSON.parse(JSON.stringify(loan));
      let loanApplied = 0;
      for (const row of loan.rows) {
        if (row.paid || row.waived) continue;
        if (left >= row.emi) {
          row.paid = true; row.paidDate = payDate;
          row.paidPrincipal = row.principal; row.paidInterest = row.interest; row.paidEmi = row.emi;
          row.runId = runId; row.runNo = runNo;
          left -= row.emi; loanApplied += row.emi;
        } else if (left > 0) {
          /* Partial payment: reduce principal, keep interest, instalment stays open */
          const partial = left;
          const ratio = partial / row.emi;
          const partPrin = Math.round(row.principal * ratio);
          const partInt = partial - partPrin;
          row.partialPaid = (row.partialPaid || 0) + partial;
          row.partialPrin = (row.partialPrin || 0) + partPrin;
          row.principal = Math.max(0, row.principal - partPrin);
          row.interest = Math.max(0, row.interest - partInt);
          row.emi = row.principal + row.interest;
          row.opening = row.principal;
          row.runId = runId; row.runNo = runNo;
          loanApplied += partial;
          left = 0;
          break;
        }
      }
      if (loanApplied > 0) {
        await E.save('staffLoans', loan, b);
        applied.push({ loanId: loan.id, no: loan.no, amount: loanApplied });
      }
    }
    return { applied: amount - left, loans: applied };
  };

  E.staffLoanReverseRun = async runId => {
    const loans = E.rows('staffLoans').filter(l => l.rows.some(r => r.runId === runId));
    for (const loan of loans) {
      const b = JSON.parse(JSON.stringify(loan));
      loan.rows.forEach(r => {
        if (r.runId === runId) {
          /* Reverse both full and partial */
          if (r.partialPaid) {
            r.principal += r.partialPrin || 0;
            r.interest += (r.partialPaid - (r.partialPrin || 0));
            r.emi = r.principal + r.interest;
            r.opening = r.principal;
            r.partialPaid = 0; r.partialPrin = 0;
          } else if (r.paid) {
            r.paid = false; r.paidDate = ''; r.paidPrincipal = 0; r.paidInterest = 0; r.paidEmi = 0;
          }
          r.runId = ''; r.runNo = '';
        }
      });
      await E.save('staffLoans', loan, b);
    }
  };

  const F = { q: '', status: 'Active' };

  E.route('staffloans', 'Staff Loans', () => {
    const all = E.rows('staffLoans').sort((a, b) => b.no.localeCompare(a.no));
    const filtered = all.filter(l => {
      const T = loanTotals(l);
      if (F.status && T.status !== F.status) return false;
      if (F.q) {
        const q = F.q.toLowerCase();
        const e = emp(l.empId) || {};
        if (!((l.no || '') + ' ' + (e.name || '') + ' ' + (e.code || '')).toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const active = all.filter(l => loanTotals(l).status === 'Active');
    const totalOut = active.reduce((s, l) => s + loanTotals(l).principalOut, 0);
    const thisMonth = E.today().slice(0, 7);
    const dueThisMonth = active.reduce((s, l) => {
      const nxt = l.rows.find(r => !r.paid && !r.waived);
      return nxt && nxt.due.slice(0, 7) === thisMonth ? s + nxt.emi : s;
    }, 0);
    const overdue = active.reduce((s, l) => {
      const nxt = l.rows.find(r => !r.paid && !r.waived);
      return nxt && nxt.due < E.today() ? s + nxt.emi : s;
    }, 0);
    return `<div class="kp">
      ${E.kpi('Active Loans', active.length, 'running loans')}
      ${E.kpi('Total outstanding', E.m(totalOut), 'principal to recover')}
      ${E.kpi('Due this month', E.m(dueThisMonth), thisMonth)}
      ${E.kpi('Overdue', overdue ? '<span class="bad">' + E.m(overdue) + '</span>' : E.m(0), overdue ? 'past due date' : 'none')}
    </div>
    <div class="bar">
      <input class="fs" style="max-width:280px" placeholder="Search loan no or employee…" value="${E.esc(F.q)}" oninput="E.A.slFilter(this.value)">
      <select class="fs" onchange="E.A.slStatus(this.value)">
        <option value="Active" ${F.status === 'Active' ? 'selected' : ''}>Active only</option>
        <option value="Completed" ${F.status === 'Completed' ? 'selected' : ''}>Completed</option>
        <option value="Settled early" ${F.status === 'Settled early' ? 'selected' : ''}>Settled early</option>
        <option value="Cancelled" ${F.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        <option value="" ${F.status === '' ? 'selected' : ''}>All</option>
      </select>
      <span class="gap"></span>
      <button class="btn p" data-a="slNew">+ New Staff Loan</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Employee</th><th class="r">Principal</th><th>Rate</th><th class="r">Instalment</th><th class="r">Paid</th><th class="r">Outstanding</th><th>Next due</th><th>Status</th><th></th></tr></thead>
      <tbody>${filtered.map(l => {
        const e = emp(l.empId) || { name: '?' };
        const T = loanTotals(l);
        const overdue = T.nextDue && T.nextDue.due < E.today() && T.status === 'Active';
        return `<tr>
          <td><b>${E.esc(l.no)}</b></td>
          <td>${E.esc(e.name)}<div class="muted" style="font-size:11px">${E.esc(e.code || '')}</div></td>
          <td class="r">${E.m(l.principal)}</td>
          <td>${l.rate ? l.rate + '% ' + (l.method === 'flat' ? 'flat' : 'reducing') : 'Interest-free'}</td>
          <td class="r">${E.m(l.emi)}<div class="muted" style="font-size:11px">× ${l.n}</div></td>
          <td class="r">${T.paidCount}/${l.n}</td>
          <td class="r"><b>${E.m(T.principalOut)}</b></td>
          <td>${T.nextDue ? T.nextDue.due + (overdue ? ' <span class="bad">overdue</span>' : '') : '—'}</td>
          <td><span class="tag" style="${T.status === 'Active' ? 'background:#fef3c7;color:#92400e' : T.status === 'Completed' ? 'background:#d1fae5;color:#065f46' : T.status === 'Cancelled' ? 'background:#fee2e2;color:#b91c1c' : 'background:#e0e7ff;color:#3730a3'}">${T.status}</span></td>
          <td class="r"><button class="btn sm" data-a="slView" data-id="${l.id}">View</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No loans match this filter</td></tr>'}</tbody>
    </table></div>
    <p class="muted">Balance sits in <b>1250 Employee Advances</b>. Recovery happens automatically in wage/salary runs (full or partial), or manually here.</p>`;
  });

  E.A.slFilter = v => { F.q = v; E.go(); };
  E.A.slStatus = v => { F.status = v; E.go(); };

  E.A.slNew = () => {
    const emps = E.rows('employees').filter(e => e.active).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!emps.length) return E.toast('Add employees first', 'error');
    const banks = E.rows('coa').filter(a => a.bank && !a.inactive);
    if (!banks.length) return E.toast('Add a bank/cash account first', 'error');
    const today = E.today();
    const nextMonth = (() => {
      const y = +today.slice(0, 4), m = +today.slice(5, 7);
      const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
      return ny + '-' + String(nm).padStart(2, '0') + '-01';
    })();
    E.modal('New Staff Loan', `
      <div class="f">Employee *<select id="sl_emp" onchange="E.A.slPreview()">${emps.map(e => `<option value="${e.id}">${E.esc(e.name)} · ${e.code || ''} · ${e.payType}</option>`).join('')}</select></div>
      <div class="g2">
        <div class="f">Loan amount (Rs) *<input id="sl_amt" type="number" step="0.01" oninput="E.A.slPreview()"></div>
        <div class="f">Interest rate % per year<input id="sl_rate" type="number" step="0.01" value="0" oninput="E.A.slPreview()"></div>
      </div>
      <div class="g2">
        <div class="f">Method<select id="sl_method" onchange="E.A.slPreview()"><option value="reducing">Reducing balance</option><option value="flat">Flat rate</option></select></div>
        <div class="f">Instalments *<input id="sl_n" type="number" step="1" min="1" max="120" value="12" oninput="E.A.slPreview()"></div>
      </div>
      <div class="g2">
        <div class="f">Loan date<input id="sl_date" type="date" value="${today}"></div>
        <div class="f">First instalment due<input id="sl_first" type="date" value="${nextMonth}" oninput="E.A.slPreview()"></div>
      </div>
      <div class="g2">
        <div class="f">Paid from *<select id="sl_bank">${banks.map(a => `<option value="${a.code}">${a.code} · ${E.esc(a.name)}</option>`).join('')}</select></div>
        <div class="f">Notes<input id="sl_notes"></div>
      </div>
      <div id="sl_prev" style="padding:14px;background:var(--s2);border-radius:8px;margin-top:12px">
        <p class="muted">Enter amount and instalments to preview the schedule.</p>
      </div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="slSave">Create Loan</button>`);
    setTimeout(() => E.A.slPreview(), 100);
  };

  E.A.slPreview = () => {
    const amount = E.c(E.val('sl_amt'));
    const rate = parseFloat(E.val('sl_rate')) || 0;
    const n = parseInt(E.val('sl_n')) || 0;
    const first = E.val('sl_first');
    const method = E.val('sl_method') || 'reducing';
    const box = E.$('sl_prev');
    if (!box) return;
    if (!(amount > 0) || n < 1 || !DT.test(first)) {
      box.innerHTML = '<p class="muted">Enter amount, instalments, and first due date to preview.</p>';
      return;
    }
    const { emi, rows } = buildSchedule(amount, rate, n, first, method);
    const totalInt = rows.reduce((s, r) => s + r.interest, 0);
    const last = rows[rows.length - 1].due;
    box.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px">
      <div><small class="muted">Instalment</small><div style="font-size:18px;font-weight:800">${E.m(emi)}</div></div>
      <div><small class="muted">Total interest</small><div style="font-size:18px;font-weight:800">${E.m(totalInt)}</div></div>
      <div><small class="muted">Total repayable</small><div style="font-size:18px;font-weight:800">${E.m(amount + totalInt)}</div></div>
      <div><small class="muted">Last due</small><div style="font-size:18px;font-weight:800">${last}</div></div>
    </div>`;
  };

  E.A.slSave = async () => {
    try {
      const empId = E.val('sl_emp');
      const e = emp(empId);
      if (!e) throw new Error('Select employee');
      const amount = E.c(E.val('sl_amt'));
      const rate = parseFloat(E.val('sl_rate')) || 0;
      const n = parseInt(E.val('sl_n')) || 0;
      const first = E.val('sl_first');
      const date = E.val('sl_date');
      const method = E.val('sl_method') || 'reducing';
      const bank = E.val('sl_bank');
      if (!(amount > 0)) throw new Error('Enter amount');
      if (n < 1 || n > 120) throw new Error('Instalments 1-120');
      if (!DT.test(date)) throw new Error('Invalid date');
      if (!DT.test(first)) throw new Error('Invalid first due');
      if (first < date) throw new Error('First due before loan date');
      if (rate < 0 || rate > 100) throw new Error('Rate 0-100');
      if (!bank) throw new Error('Choose account');
      const { emi, rows } = buildSchedule(amount, rate, n, first, method);
      const no = await E.next('SL');
      const je = await E.post({ date, ref: no, narr: 'Staff loan · ' + e.name + (E.val('sl_notes') ? ' · ' + E.val('sl_notes') : ''), source: 'loan', lines: [{ acc: '1250', dr: amount }, { acc: bank, cr: amount }] });
      await E.save('staffLoans', { no, empId, empName: e.name, empCode: e.code || '', principal: amount, rate, method, n, emi, date, firstDue: first, bankAcc: bank, notes: E.val('sl_notes'), rows, jeId: je.id, cancelled: false, settled: null, createdAt: new Date().toISOString(), createdBy: E.user || '' });
      E.closeM(); E.go();
      E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.slView = id => {
    const l = E.D.staffLoans.find(x => x.id === id);
    if (!l) return;
    const e = emp(l.empId) || { name: l.empName };
    const T = loanTotals(l);
    const live = T.status === 'Active';
    const scheduleHTML = l.rows.map((r, i) => {
      const overdue = !r.paid && !r.waived && r.due < E.today() && live;
      return `<tr style="${r.paid ? 'background:#f0fdf4' : r.waived ? 'opacity:.5' : ''}">
        <td>${r.n}</td><td>${r.due}${overdue ? ' <span class="bad">overdue</span>' : ''}</td>
        <td class="r">${E.m(r.opening)}</td><td class="r">${E.m(r.principal)}</td><td class="r">${E.m(r.interest)}</td>
        <td class="r"><b>${E.m(r.emi)}</b></td><td class="r">${E.m(r.closing)}</td>
        <td>${r.paid ? `<span class="tag" style="background:#d1fae5;color:#065f46">Paid ${r.paidDate}</span>${r.runNo ? ' · ' + r.runNo : ''}` : r.waived ? '<span class="tag">Settled</span>' : r.partialPaid ? `<span class="tag" style="background:#fef3c7">Partial ${E.m(r.partialPaid)}</span>` : overdue ? '<span class="bad">Overdue</span>' : '<span class="muted">—</span>'}</td>
        <td class="r">${live && !r.paid && !r.waived ? `<button class="btn sm p" data-a="slPayRow" data-id="${l.id}|${i}">Pay</button>` : ''}</td>
      </tr>`;
    }).join('');
    E.modal(l.no + ' — ' + e.name, `
      <div class="kp">
        ${E.kpi('Principal', E.m(l.principal))}
        ${E.kpi('Rate', l.rate ? l.rate + '% ' + l.method : 'Interest-free')}
        ${E.kpi('Instalment', E.m(l.emi) + ' × ' + l.n)}
        ${E.kpi('Outstanding', E.m(T.principalOut), T.paidCount + '/' + l.n + ' paid')}
      </div>
      <p class="muted" style="margin-bottom:12px"><b>${E.esc(e.name)}</b> (${E.esc(e.code || '')}) · ${l.date} → ${l.firstDue} · <b>${T.status}</b>${l.settled ? ' · Settled ' + l.settled.date : ''}</p>
      <div class="tw"><table><thead><tr><th>#</th><th>Due</th><th class="r">Opening</th><th class="r">Principal</th><th class="r">Interest</th><th class="r">EMI</th><th class="r">Closing</th><th>Status</th><th></th></tr></thead><tbody>${scheduleHTML}</tbody></table></div>
    `, `<button class="btn" data-a="close">Close</button><button class="btn" data-a="slPrint" data-id="${l.id}">🖨 Print</button>${live ? `<button class="btn p" data-a="slSettleEarly" data-id="${l.id}">Settle early</button>` : ''}${T.paidCount === 0 && !l.cancelled && !l.settled ? `<button class="btn d" data-a="slCancel" data-id="${l.id}">Cancel</button>` : ''}`, 1);
  };

  E.A.slPayRow = key => {
    const [id, idxStr] = key.split('|');
    const l = E.D.staffLoans.find(x => x.id === id);
    if (!l) return;
    const idx = +idxStr;
    const r = l.rows[idx];
    if (r.paid) return E.toast('Already paid', 'error');
    const banks = E.rows('coa').filter(a => (a.bank || a.code === '1000') && !a.inactive);
    E.modal('Pay instalment ' + r.n + ' — ' + l.no, `
      <div class="g2">
        <div class="f">Payment date<input id="slpd_d" type="date" value="${E.today()}"></div>
        <div class="f">Paid from *<select id="slpd_b">${banks.map(a => `<option value="${a.code}">${a.code} · ${E.esc(a.name)}</option>`).join('')}</select></div>
        <div class="f">Principal<input readonly value="${E.m(r.principal)}"></div>
        <div class="f">Interest (editable)<input id="slpd_i" type="number" step="0.01" value="${(r.interest / 100).toFixed(2)}"></div>
      </div>
      <div class="tot" style="margin-top:10px"><span><b>Total</b></span><b id="slpd_t">${E.m(r.emi)}</b></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="slPayRowSave" data-id="${key}">Post payment</button>`);
    setTimeout(() => {
      const i = E.$('slpd_i');
      if (i) i.oninput = () => { const int = E.c(i.value); E.$('slpd_t').textContent = E.m(r.principal + int); };
    }, 50);
  };

  E.A.slPayRowSave = async key => {
    try {
      const [id, idxStr] = key.split('|');
      const l = E.D.staffLoans.find(x => x.id === id);
      const r = l.rows[+idxStr];
      const date = E.val('slpd_d'), bank = E.val('slpd_b'), int = E.c(E.val('slpd_i'));
      if (!DT.test(date)) throw new Error('Invalid date');
      if (!bank) throw new Error('Choose account');
      if (int < 0) throw new Error('Interest negative');
      const total = r.principal + int;
      const no = await E.next('SLP');
      const lines = [{ acc: '1250', dr: r.principal }];
      if (int > 0) lines.push({ acc: '6060', dr: int });
      lines.push({ acc: bank, cr: total });
      const je = await E.post({ date, ref: no, narr: 'Loan instalment ' + r.n + '/' + l.n + ' · ' + l.no, source: 'loan', lines });
      const b = JSON.parse(JSON.stringify(l));
      Object.assign(r, { paid: true, paidDate: date, paidPrincipal: r.principal, paidInterest: int, paidEmi: total, manualPayNo: no, runId: je.id, runNo: no });
      await E.save('staffLoans', l, b);
      E.closeM(); E.go(); E.toast('Payment posted ' + no, 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.slPrint = id => {
    const l = E.D.staffLoans.find(x => x.id === id);
    const e = emp(l.empId) || { name: l.empName };
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const T = loanTotals(l);
    w.document.write(`<html><head><title>${l.no}</title><style>body{font:12px Arial;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}</style></head><body><h2>${E.esc(E.factory().name)}</h2><h3>Staff Loan — ${l.no}</h3><p><b>${E.esc(e.name)}</b> (${E.esc(e.code || '')}) · loan ${l.date} · first ${l.firstDue}<br>Principal ${E.m(l.principal)} · ${l.rate ? l.rate + '% ' + l.method : 'Interest-free'} · ${l.n} × ${E.m(l.emi)}<br>Outstanding: <b>${E.m(T.principalOut)}</b></p><table><thead><tr><th>#</th><th>Due</th><th class="r">Opening</th><th class="r">Principal</th><th class="r">Interest</th><th class="r">EMI</th><th class="r">Closing</th><th>Status</th></tr></thead><tbody>${l.rows.map(r => `<tr><td>${r.n}</td><td>${r.due}</td><td class="r">${E.m(r.opening)}</td><td class="r">${E.m(r.principal)}</td><td class="r">${E.m(r.interest)}</td><td class="r">${E.m(r.emi)}</td><td class="r">${E.m(r.closing)}</td><td>${r.paid ? 'Paid ' + r.paidDate : r.waived ? 'Settled' : ''}</td></tr>`).join('')}</tbody></table><p>Printed ${E.today()}</p></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  E.A.slSettleEarly = id => {
    const l = E.D.staffLoans.find(x => x.id === id);
    const T = loanTotals(l);
    const banks = E.rows('coa').filter(a => (a.bank || a.code === '1000') && !a.inactive);
    E.modal('Settle early — ' + l.no, `
      <div class="g2">
        <div class="f">Settlement date<input id="sle_d" type="date" value="${E.today()}"></div>
        <div class="f">Paid from *<select id="sle_b">${banks.map(a => `<option value="${a.code}">${a.code} · ${E.esc(a.name)}</option>`).join('')}</select></div>
        <div class="f">Principal outstanding<input readonly value="${(T.principalOut / 100).toFixed(2)}"></div>
        <div class="f">Interest to date (Rs)<input id="sle_i" type="number" step="0.01" value="0"></div>
        <div class="f">Fee / penalty (Rs)<input id="sle_f" type="number" step="0.01" value="0"></div>
      </div>
      <p class="muted">Remaining ${l.rows.filter(r => !r.paid && !r.waived).length} instalment(s) will be closed.</p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="slSettleEarlySave" data-id="${id}">Post settlement</button>`);
  };

  E.A.slSettleEarlySave = async id => {
    try {
      const l = E.D.staffLoans.find(x => x.id === id);
      const T = loanTotals(l);
      const date = E.val('sle_d'), bank = E.val('sle_b'), int = E.c(E.val('sle_i')), fee = E.c(E.val('sle_f'));
      if (!DT.test(date)) throw new Error('Invalid date');
      if (!bank) throw new Error('Choose account');
      if (int < 0 || fee < 0) throw new Error('Amounts negative');
      const rem = T.principalOut;
      if (rem <= 0) throw new Error('Nothing outstanding');
      const total = rem + int + fee;
      const no = await E.next('SLP');
      const lines = [{ acc: '1250', dr: rem }];
      if (int + fee > 0) lines.push({ acc: '6060', dr: int + fee });
      lines.push({ acc: bank, cr: total });
      const je = await E.post({ date, ref: no, narr: 'Loan settled early · ' + l.no, source: 'loan', lines });
      const b = JSON.parse(JSON.stringify(l));
      l.rows.forEach(r => { if (!r.paid && !r.waived) { r.waived = true; r.runNo = no; r.paidDate = date; } });
      l.settled = { date, principal: rem, interest: int, fee, payNo: no, jeId: je.id, bank };
      await E.save('staffLoans', l, b);
      E.closeM(); E.go(); E.toast('Settled — ' + no, 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.slCancel = async id => {
    try {
      const l = E.D.staffLoans.find(x => x.id === id);
      if (l.rows.some(r => r.paid)) throw new Error('Payments have been made');
      if (!confirm('Cancel ' + l.no + '?')) return;
      await E.reverse(l.jeId);
      const b = JSON.parse(JSON.stringify(l));
      l.cancelled = true;
      await E.save('staffLoans', l, b);
      E.closeM(); E.go(); E.toast('Loan cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);