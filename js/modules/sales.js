/* PART 5 (v3) — Sales with per-pair pricing.
   Item price stored as cents per pair. Invoice shows rate/pair, computes amount = pairs × rate.
*/
(E => {
  const n = E.N.find(x => x.id === 'sales'); if (n) n.soon = 0;
  const F = { q: '' };
  const cu = id => E.D.parties.find(x => x.id === id), ib = i => i.total - i.paid, fg = i => i.cat === 'Finished Good';
  const cname = id => E.esc((cu(id) || {}).name);
  const dst = d => d.status, ist = i => i.cancelled ? 'Cancelled' : i.paid >= i.total ? 'Paid' : i.paid > 0 ? 'Part paid' : 'Open';
  const pp = (l) => { const it = E.D.items.find(x => x.id === l.itemId); return (it && it.pack) || 1; };

  function tbl() {
    const s = F.q.toLowerCase();
    const ok = (n, p) => !s || (n + (cu(p) || {}).name).toLowerCase().includes(s);
    const D = E.rows('deliveries').filter(d => ok(d.no, d.partyId)).sort((a, b) => b.no.localeCompare(a.no));
    const I = E.rows('invoices').filter(i => ok(i.no, i.partyId)).sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="card"><h3>Delivery notes</h3><div class="tw"><table>
      <thead><tr><th>D/N</th><th>Date</th><th>Customer</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Value</th><th>Status</th><th></th></tr></thead>
      <tbody>${D.map(d => {
        const packs = d.lines.reduce((a, l) => a + l.qty, 0);
        const pairs = d.lines.reduce((a, l) => a + l.qty * pp(l), 0);
        return `<tr style="${d.status === 'Cancelled' ? 'opacity:.5' : ''}">
          <td>${d.no}</td><td>${d.date}</td><td>${cname(d.partyId)}</td>
          <td class="r">${packs}</td><td class="r muted">${pairs}</td>
          <td class="r">${E.m(d.total)}</td>
          <td><span class="tag">${dst(d)}</span></td>
          <td class="r">${d.status === 'Delivered' ? `<button class="btn sm d" data-a="canDN" data-id="${d.id}">Cancel</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">No delivery notes</td></tr>'}</tbody>
    </table></div></div>
    <div class="card"><h3>Invoices</h3><div class="tw"><table>
      <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${I.map(i => `<tr style="${i.cancelled ? 'opacity:.5' : ''}">
        <td>${i.no}</td><td>${i.date}</td><td>${cname(i.partyId)}</td>
        <td class="r">${E.m(i.total)}</td><td class="r">${E.m(i.paid)}</td>
        <td class="r"><b>${i.cancelled ? '—' : E.m(ib(i))}</b></td>
        <td><span class="tag">${ist(i)}</span></td>
        <td class="r">${!i.cancelled && !i.paid ? `<button class="btn sm d" data-a="canInv" data-id="${i.id}">Cancel</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No invoices</td></tr>'}</tbody>
    </table></div></div>`;
  }

  E.route('sales', 'Sales & Receivables', () => {
    const open = E.rows('invoices').filter(i => !i.cancelled).reduce((s, i) => s + ib(i), 0);
    const pend = E.rows('deliveries').filter(d => d.status === 'Delivered');
    return `<div class="kp">
      ${E.kpi('Receivables', E.m(open), open === E.bal('1200') ? '<span class="ok">Agrees 1200</span>' : '<span class="bad">Differs 1200</span>')}
      ${E.kpi('Delivered, uninvoiced', E.m(pend.reduce((s, d) => s + d.total, 0)), pend.length + ' notes')}
      ${E.kpi('FG stock', E.m(E.bal('1320')), 'at cost')}
    </div>
    <div class="bar">
      <input class="fs" style="max-width:300px" placeholder="Search…" data-f="sl.q" value="${E.esc(F.q)}">
      <span class="gap"></span>
      <button class="btn" data-a="recv">Receive Payment</button>
      <button class="btn" data-a="newInv">+ Invoice</button>
      <button class="btn p" data-a="newDN">+ Delivery</button>
    </div><div id="tbl">${tbl()}</div>`;
  });

  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f === 'sl.q') { F.q = e.target.value; E.$('tbl').innerHTML = tbl(); } });

  /* Delivery note — price per pair */
  const dlRow = () => `<div class="jl dl" style="grid-template-columns:2.2fr .7fr 1fr .9fr .8fr 1fr 1fr 30px"><input list="fgs" placeholder="Article"><input type="number" placeholder="Packs"><input readonly placeholder="Pairs"><input readonly placeholder="Cost/pair"><input type="number" step="0.01" placeholder="Margin %"><input type="number" step="0.01" placeholder="Rate/pair"><input readonly placeholder="Amount"><button class="btn sm d" data-a="rmDl">✕</button></div>`;
  const dlRead = () => [...document.querySelectorAll('#dlr .dl')].map(r => { const c = r.children, s = E.skuFind(c[0].value, fg); return { s, q: parseInt(c[1].value) || 0, rate: E.c(c[5].value), c }; });

  function dlTot(t) {
    const r = t.closest('.dl'), c = r.children, s = E.skuFind(c[0].value, fg);
    let pairsPerPack = 1;
    if (s) {
      const it = E.D.items.find(x => x.id === s.itemId);
      pairsPerPack = (it && it.pack) || 1;
      const q = parseInt(c[1].value) || 1;
      let costPerPair = 0;
      try { costPerPair = Math.round(E.outValue(s.itemId, s.variantId, q) / (q * pairsPerPack)); }
      catch (x) { const st = E.stock(s.itemId, s.variantId); costPerPair = st.qty > 0 ? Math.round(st.value / st.qty / pairsPerPack) : 0; }
      r.dataset.costPair = costPerPair;
      c[3].value = costPerPair ? (costPerPair / 100).toFixed(2) : '';
    }
    c[2].value = s ? (parseInt(c[1].value) || 0) * pairsPerPack : '';
    const costPair = +r.dataset.costPair || 0, it = s && E.D.items.find(x => x.id === s.itemId);
    if (t === c[0] && it && it.price) c[5].value = (it.price / 100).toFixed(2);
    if (t === c[4] && costPair && c[4].value !== '') c[5].value = (costPair * (1 + parseFloat(c[4].value) / 100) / 100).toFixed(2);
    else if (costPair && c[5].value && t !== c[4]) c[4].value = ((E.c(c[5].value) / costPair - 1) * 100).toFixed(1);
    let tot = 0, cg = 0;
    dlRead().forEach(l => {
      const itm = E.D.items.find(x => x.id === l.s.itemId);
      const ppp = (itm && itm.pack) || 1;
      const pairs = l.q * ppp;
      const amount = Math.round(pairs * l.rate);
      tot += amount;
      cg += Math.round(+l.c[0].parentElement.dataset.costPair * pairs);
      l.c[6].value = amount ? E.m(amount) : '';
    });
    if (E.$('dl_t')) E.$('dl_t').textContent = E.m(tot);
    if (E.$('dl_p')) { const pr = tot - cg; E.$('dl_p').className = pr < 0 ? 'bad' : 'ok'; E.$('dl_p').textContent = cg ? 'Cost ' + E.m(cg) + ' · Profit ' + E.m(pr) + (tot ? ' (' + (pr / tot * 100).toFixed(1) + '%)' : '') : '—'; }
  }
  E.A.rmDl = (_, e) => { e.target.closest('.dl').remove(); };
  E.A.addDl = () => E.$('dlr').insertAdjacentHTML('beforeend', dlRow());

  E.hooks.push(e => { if (e.target.closest && e.target.closest('.dl')) dlTot(e.target); });

  E.A.newDN = () => {
    const cs = E.rows('parties').filter(p => p.active && p.type !== 'Supplier');
    if (!cs.length) return E.toast('Add customer first', 'error');
    const js = E.rows('jobs');
    E.modal('New Delivery Note', `
      <div class="g2">
        <div class="f">Customer *<select id="d_p">${cs.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
        <div class="f">Date<input id="d_d" type="date" value="${E.today()}"></div>
      </div>
      <div class="f">Job (optional)<select id="d_j"><option value="">—</option>${js.map(j => `<option value="${j.id}">${j.no}</option>`).join('')}</select></div>
      <datalist id="fgs">${E.skuOpts(fg)}</datalist>
      <div id="dlr">${dlRow() + dlRow()}</div>
      <button class="btn sm" data-a="addDl">+ Add line</button>
      <div class="tot"><span>Delivery value</span><span id="dl_t">Rs 0</span></div>
      <div class="tot"><span>Profit</span><span id="dl_p">—</span></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveDN">Post</button>`, 1);
  };

  E.A.saveDN = async () => {
    try {
      const m = {};
      dlRead().filter(l => l.q || l.rate || l.c[0].value).forEach((l, i) => {
        if (!l.s) throw new Error('Line ' + (i + 1) + ' invalid');
        if (l.q <= 0 || l.rate <= 0) throw new Error('Line ' + (i + 1) + ' enter packs + rate/pair');
        const k = l.s.itemId + '|' + l.s.variantId;
        if (m[k]) throw new Error(l.s.code + ' appears twice');
        m[k] = l;
      });
      const L = Object.values(m);
      if (!L.length) throw new Error('Add at least one line');
      const low = L.filter(l => l.rate < (+l.c[0].parentElement.dataset.costPair || 0));
      if (low.length && !confirm('Selling below cost: ' + low.map(l => l.s.code).join(', ') + '. Continue?')) return;
      const d = E.val('d_d'), pid = E.val('d_p'), jb = E.val('d_j'), no = await E.next('DN');
      const lines = L.map(l => {
        const itm = E.D.items.find(x => x.id === l.s.itemId), ppp = (itm && itm.pack) || 1;
        const pairs = l.q * ppp;
        return { itemId: l.s.itemId, variantId: l.s.variantId, code: l.s.code, name: l.s.name, qty: l.q, pairs, rate: l.rate, amount: Math.round(pairs * l.rate), cost: E.outValue(l.s.itemId, l.s.variantId, l.q) };
      });
      const cogs = lines.reduce((s, l) => s + l.cost, 0), total = lines.reduce((s, l) => s + l.amount, 0);
      if (cogs <= 0) throw new Error('These goods have no cost. Complete a job first.');
      const je = await E.post({ date: d, ref: no, narr: 'Delivery ' + no, source: 'sale',
        lines: [{ acc: '5400', dr: cogs, job: jb }, { acc: '1320', cr: cogs, job: jb }] });
      for (const l of lines) await E.stockOut({ date: d, itemId: l.itemId, variantId: l.variantId, qty: l.qty, type: 'sale', ref: no, job: jb });
      await E.save('deliveries', { no, date: d, partyId: pid, jobId: jb, lines, total, cogs, status: 'Delivered', jeId: je.id, invId: '' });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.canDN = async id => {
    try {
      const d = E.D.deliveries.find(x => x.id === id);
      if (d.status !== 'Delivered') throw new Error('Only delivered can be cancelled');
      if (!confirm('Cancel ' + d.no + '?')) return;
      await E.reverse(d.jeId);
      for (const l of d.lines) await E.stockIn({ date: E.today(), itemId: l.itemId, variantId: l.variantId, qty: l.qty, value: l.cost, type: 'cancel', ref: d.no, job: d.jobId });
      const b = JSON.parse(JSON.stringify(d));
      d.status = 'Cancelled';
      await E.save('deliveries', d, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Invoice */
  function dnList() {
    const l = E.rows('deliveries').filter(d => d.status === 'Delivered' && d.partyId === E.val('n_p'));
    E.$('n_l').innerHTML = l.map(d => `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" class="dnk" data-id="${d.id}" checked style="width:auto"> ${d.no} · ${d.date} · ${d.lines.reduce((a, x) => a + x.qty, 0)} packs · ${E.m(d.total)}</label>`).join('');
  }
  function invCalc() {
    const sel = [...document.querySelectorAll('.dnk:checked')].map(i => E.D.deliveries.find(x => x.id === i.dataset.id));
    const g = sel.reduce((s, d) => s + d.total, 0);
    const rs = E.c(E.val('n_rs')), disc = rs || Math.round(g * (parseFloat(E.val('n_pc')) || 0) / 100);
    return { sel, g, disc, total: g - disc };
  }
  function invTot() { if (!E.$('n_t')) return; const c = invCalc(); E.$('n_t').textContent = E.m(c.g) + ' − ' + E.m(c.disc) + ' = ' + E.m(c.total); }
  E.hooks.push(e => { if (e.target.id === 'n_p') dnList(); if (e.target.id === 'n_pc' || e.target.id === 'n_rs' || (e.target.classList && e.target.classList.contains('dnk'))) invTot(); });

  E.A.newInv = () => {
    const ids = [...new Set(E.rows('deliveries').filter(d => d.status === 'Delivered').map(d => d.partyId))];
    if (!ids.length) return E.toast('No delivered notes to invoice', 'error');
    E.modal('New Invoice', `
      <div class="g2">
        <div class="f">Customer<select id="n_p">${ids.map(i => `<option value="${i}">${cname(i)}</option>`).join('')}</select></div>
        <div class="f">Invoice date<input id="n_d" type="date" value="${E.today()}"></div>
      </div>
      <b>Delivery notes</b><div id="n_l"></div>
      <div class="g2"><div class="f">Discount %<input id="n_pc" type="number" step="0.01"></div><div class="f">or discount Rs<input id="n_rs" type="number" step="0.01"></div></div>
      <div class="tot"><span>Gross − discount = total</span><span id="n_t"></span></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveInv">Create</button>`);
    dnList();
  };

  E.A.saveInv = async () => {
    try {
      const { sel, g, disc, total } = invCalc(), pid = E.val('n_p');
      if (!sel.length) throw new Error('Select at least one');
      if (total <= 0) throw new Error('Invalid total');
      if (disc < 0 || disc > g) throw new Error('Invalid discount');
      const p = cu(pid), out = E.rows('invoices').filter(i => i.partyId === pid && !i.cancelled).reduce((s, i) => s + ib(i), 0);
      if (p.limit && out + total > p.limit && !confirm('Exceeds credit limit ' + E.m(p.limit) + '. Continue?')) return;
      const no = await E.next('INV'), d = E.val('n_d');
      const je = await E.post({ date: d, ref: no, narr: 'Invoice ' + no, source: 'sale',
        lines: [{ acc: '1200', dr: total }, { acc: '4000', cr: total }] });
      const inv = await E.save('invoices', { no, date: d, partyId: pid, dnIds: sel.map(x => x.id), gross: g, disc, total, paid: 0, jeId: je.id, cancelled: false });
      for (const x of sel) { const b = JSON.parse(JSON.stringify(x)); x.status = 'Invoiced'; x.invId = inv.id; await E.save('deliveries', x, b); }
      E.closeM(); E.go(); E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.canInv = async id => {
    try {
      const i = E.D.invoices.find(x => x.id === id);
      if (i.paid) throw new Error('Payments exist');
      if (!confirm('Cancel ' + i.no + '?')) return;
      await E.reverse(i.jeId);
      for (const k of i.dnIds) { const x = E.D.deliveries.find(q => q.id === k), b = JSON.parse(JSON.stringify(x)); x.status = 'Delivered'; x.invId = ''; await E.save('deliveries', x, b); }
      const b = JSON.parse(JSON.stringify(i));
      i.cancelled = true;
      await E.save('invoices', i, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Receipt */
  function rBills() {
    const b = E.rows('invoices').filter(i => i.partyId === E.val('k_p') && !i.cancelled && ib(i) > 0).sort((a, b) => a.date.localeCompare(b.date));
    E.$('k_b').innerHTML = b.length ? `<div class="tw"><table><thead><tr><th>Invoice</th><th>Date</th><th class="r">Balance</th><th class="r">Receive</th></tr></thead><tbody>${b.map(i => `<tr><td>${i.no}</td><td>${i.date}</td><td class="r">${E.m(ib(i))}</td><td><input class="kal" type="number" step="0.01" data-id="${i.id}" style="width:100px"></td></tr>`).join('')}</tbody></table></div>` : '';
  }
  function rFifo() {
    let left = E.c(E.val('k_a'));
    document.querySelectorAll('.kal').forEach(i => { const a = Math.min(left, ib(E.D.invoices.find(x => x.id === i.dataset.id))); left -= a; i.value = a ? (a / 100).toFixed(2) : ''; });
  }
  E.hooks.push(e => { if (e.target.id === 'k_p') rBills(); if (e.target.id === 'k_a') rFifo(); });

  E.A.recv = () => {
    const ids = [...new Set(E.rows('invoices').filter(i => !i.cancelled && ib(i) > 0).map(i => i.partyId))];
    if (!ids.length) return E.toast('No unpaid invoices', 'error');
    E.modal('Receive payment', `
      <div class="g2">
        <div class="f">Customer<select id="k_p">${ids.map(i => `<option value="${i}">${cname(i)}</option>`).join('')}</select></div>
        <div class="f">Date<input id="k_d" type="date" value="${E.today()}"></div>
        <div class="f">Received into<select id="k_s"><option value="">—</option>${E.opts(a => a.bank)}</select></div>
        <div class="f">Amount<input id="k_a" type="number" step="0.01"></div>
      </div>
      <div id="k_b"></div>
      <div class="f">Notes<input id="k_n"></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveRecv">Post</button>`, 1);
    rBills();
  };

  E.A.saveRecv = async () => {
    try {
      const amt = E.c(E.val('k_a')), s = E.val('k_s'), pid = E.val('k_p');
      if (amt <= 0) throw new Error('Enter amount');
      if (!s) throw new Error('Select account');
      const al = [...document.querySelectorAll('.kal')].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0);
      if (al.reduce((t, x) => t + x.a, 0) !== amt) throw new Error('Allocations must equal amount');
      const no = await E.next('RCT');
      const je = await E.post({ date: E.val('k_d'), ref: no, narr: (E.val('k_n') || 'Receipt') + ' · ' + cu(pid).name, source: 'receipt',
        lines: [{ acc: s, dr: amt }, { acc: '1200', cr: amt }] });
      for (const x of al) { const i = E.D.invoices.find(q => q.id === x.id), b = JSON.parse(JSON.stringify(i)); i.paid += x.a; await E.save('invoices', i, b); }
      await E.save('receipts', { no, date: E.val('k_d'), partyId: pid, acc: s, amount: amt, allocs: al, jeId: je.id });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);