/* PART 11 (v2) — Sales returns, purchase returns, job editing and job cancelling. */
(E => {
  const ai = E.N.map(n => n.g).lastIndexOf('Accounting') + 1;
  E.N.splice(ai, 0, { g: 'Accounting', id: 'returns', ico: '↩️', label: 'Returns' });
  
  const ib = x => x.total - x.paid, cu = id => E.D.parties.find(x => x.id === id), fg = i => i.cat === 'Finished Good';
  
  /* ═══════════════════════════════════════════════════════════
     JOB EDITING & CANCELLING (Moved here from jobs.js)
     ═══════════════════════════════════════════════════════════ */
  const Jb = id => E.D.jobs.find(x => x.id === id), JL = id => E.rows('jobLines').filter(l => l.jobId === id);
  
  const nr = () => `<div class="jl ne" style="grid-template-columns:3fr 1fr 30px;margin-bottom:8px"><input list="fg2" placeholder="Click to search article / colour"><input type="number" min="1" placeholder="Packs"><button class="btn sm d" data-a="rmNe">✕</button></div>`;
  
  E.A.rmNe = (_, e) => e.target.closest('.ne').remove();
  E.A.addNe = () => E.$('ner').insertAdjacentHTML('beforeend', nr());

  E.A.editJob = id => {
    const j = Jb(id);
    if (!j) return;
    
    const existingLines = JL(id).map(l => `
      <div class="g2" style="margin:6px 0;align-items:center;background:var(--s2);padding:8px;border-radius:8px">
        <span><b>${E.esc(l.code)}</b> <span class="muted">(${l.released} released)</span></span>
        <input class="jt" data-id="${l.id}" type="number" min="${l.released}" value="${l.target}" style="padding:7px;border:1px solid var(--bd);border-radius:8px" placeholder="Target Packs">
      </div>`).join('');

    E.modal('Edit Job — ' + j.no, `
      <div class="card" style="background:var(--s);border:1px solid var(--bd);padding:14px;margin-bottom:14px">
        <h4 style="margin:0 0 10px;font-size:14px">Job Details</h4>
        <div class="g2">
          <div class="f">Due date<input id="ej_u" type="date" value="${j.due || ''}"></div>
          <div class="f">Priority<select id="ej_p">${['Normal','High','Urgent'].map(x => `<option ${j.priority === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        </div>
        <div class="f" style="margin-bottom:0">Notes<input id="ej_n" value="${E.esc(j.notes || '')}"></div>
      </div>

      <div class="card" style="background:var(--s);border:1px solid var(--bd);padding:14px;margin-bottom:14px">
        <h4 style="margin:0 0 10px;font-size:14px">Current Articles & Targets</h4>
        ${existingLines || '<p class="muted">No articles in this job yet.</p>'}
        <p class="muted" style="font-size:11px;margin-top:8px">Note: You cannot set the target lower than the packs already released to production.</p>
      </div>

      <div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;padding:14px">
        <h4 style="margin:0 0 10px;font-size:14px;color:#166534">➕ Add New Articles</h4>
        <datalist id="fg2">${E.skuOpts(fg)}</datalist>
        <div id="ner">${nr()}</div>
        <button class="btn sm" data-a="addNe" style="margin-top:8px">+ Add another row</button>
      </div>
    `, `
      <button class="btn" data-a="close">Cancel</button>
      <button class="btn p" data-a="saveEJ" data-id="${id}">Save Changes</button>
    `, 1);
  };

  E.A.saveEJ = async id => {
    try {
      const j = Jb(id), b = JSON.parse(JSON.stringify(j)), L = JL(id);
      
      // 1. Update existing targets
      for (const i of document.querySelectorAll('.jt')) {
        const l = L.find(x => x.id === i.dataset.id), v = parseInt(i.value) || 0;
        if (v <= 0 || v < l.released) throw new Error(l.code + ': target cannot be below packs already released (' + l.released + ')');
      }
      
      // 2. Gather new lines
      const add = [];
      document.querySelectorAll('.ne').forEach(r => {
        const t = r.children[0].value.trim(), q = parseInt(r.children[1].value) || 0;
        if (!t && !q) return;
        const s = E.skuFind(t, fg);
        if (!s) throw new Error('Select a valid finished good article: ' + t);
        if (q <= 0) throw new Error('Enter packs for ' + s.code);
        add.push({ s, q });
      });

      // 3. Save Job Header
      Object.assign(j, { due: E.val('ej_u'), priority: E.val('ej_p'), notes: E.val('ej_n') });
      await E.save('jobs', j, b);

      // 4. Save Existing Lines
      for (const i of document.querySelectorAll('.jt')) {
        const l = L.find(x => x.id === i.dataset.id), v = parseInt(i.value);
        if (v !== l.target) {
          const bl = JSON.parse(JSON.stringify(l));
          l.target = v;
          await E.save('jobLines', l, bl);
        }
      }

      // 5. Save New Lines
      for (const { s, q } of add) {
        const ex = JL(id).find(l => l.itemId === s.itemId && l.variantId === s.variantId);
        if (ex) {
          const bl = JSON.parse(JSON.stringify(ex));
          ex.target += q;
          await E.save('jobLines', ex, bl);
        } else {
          await E.save('jobLines', { jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, name: s.name, target: q, released: 0, fgValue: 0 });
        }
      }

      E.closeM();
      E.go(); // Refreshes the Job View screen to show the new articles
      E.toast('Job updated successfully', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.cancelJob = async id => {
    const j = Jb(id);
    if (E.rows('journalEntries').some(x => x.lines.some(l => l.job === id))) return E.toast('Costs are already posted to this job. Return materials / complete it instead.', 'error');
    if (!confirm('Cancel ' + j.no + '? Nothing has been posted to it.')) return;
    const b = JSON.parse(JSON.stringify(j));
    j.status = 'Cancelled';
    await E.save('jobs', j, b);
    location.hash = '#/jobs';
    E.toast('Job cancelled', 'success');
  };

  /* ═══════════════════════════════════════════════════════════
     RETURNS (Credit / Debit Notes)
     ═══════════════════════════════════════════════════════════ */
  const cr = () => E.rows('receipts').filter(r => r.kind === 'credit'), dn = () => E.rows('payments').filter(r => r.kind === 'debit');
  
  E.route('returns', 'Returns', () => `<div class="bar"><span class="gap"></span><button class="btn" data-a="newPR">+ Purchase return (debit note)</button><button class="btn p" data-a="newSR">+ Sales return (credit note)</button></div>
  <div class="card"><h3>Sales returns / credit notes</h3><div class="tw"><table><thead><tr><th>No</th><th>Date</th><th>Customer</th><th>Invoice</th><th class="r">Credit value</th><th class="r">Cost back to stock</th></tr></thead><tbody>${cr().sort((a, b) => b.no.localeCompare(a.no)).map(r => `<tr><td>${r.no}</td><td>${r.date}</td><td>${E.esc(cu(r.partyId)?.name)}</td><td>${E.esc(E.D.invoices.find(i => i.id === r.invId)?.no)}</td><td class="r">${E.m(r.amount)}</td><td class="r">${E.m(r.cost)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">None</td></tr>'}</tbody></table></div></div>
  <div class="card"><h3>Purchase returns / debit notes</h3><div class="tw"><table><thead><tr><th>No</th><th>Date</th><th>Supplier</th><th>Bill</th><th class="r">Value</th></tr></thead><tbody>${dn().sort((a, b) => b.no.localeCompare(a.no)).map(r => `<tr><td>${r.no}</td><td>${r.date}</td><td>${E.esc(cu(r.partyId)?.name)}</td><td>${E.esc(E.D.purchases.find(i => i.id === r.billId)?.no)}</td><td class="r">${E.m(r.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">None</td></tr>'}</tbody></table></div></div>`);

  const agg = (arr, f) => { const m = {}; arr.forEach(l => { const k = l.itemId + '|' + l.variantId, x = m[k] || (m[k] = { itemId: l.itemId, variantId: l.variantId, code: l.code, qty: 0, amt: 0 }); x.qty += l.qty; x.amt += f(l); }); return m; };
  
  function srAvail(inv) {
    const del = agg(inv.dnIds.flatMap(k => E.D.deliveries.find(x => x.id === k).lines), l => l.cost), rate = {};
    inv.dnIds.flatMap(k => E.D.deliveries.find(x => x.id === k).lines).forEach(l => rate[l.itemId + '|' + l.variantId] = l.rate);
    cr().filter(r => r.invId === inv.id).forEach(r => r.lines.forEach(l => { const k = l.itemId + '|' + l.variantId; if (del[k]) del[k].qty -= l.qty; }));
    for (const k in del) del[k].rate = rate[k]; return del;
  }
  
  function pAvail(b) {
    const m = agg(b.lines, l => l.amount);
    dn().filter(r => r.billId === b.id).forEach(r => r.lines.forEach(l => { const k = l.itemId + '|' + l.variantId; if (m[k]) m[k].qty -= l.qty; }));
    return m;
  }
  
  function rtLines(kind) {
    const sel = E.$('rt_i');
    if (!sel || !sel.value) { E.$('rt_l').innerHTML = ''; return; }
    if (kind === 's') {
      const inv = E.D.invoices.find(x => x.id === sel.value), a = srAvail(inv);
      E.$('rt_l').innerHTML = `<div class="tw"><table><thead><tr><th>Article</th><th class="r">Can return</th><th class="r">Price</th><th class="r">Return packs</th></tr></thead><tbody>${Object.entries(a).map(([k, x]) => `<tr><td>${E.esc(x.code)}</td><td class="r">${x.qty}</td><td class="r">${E.m(x.rate)}</td><td><input class="rtq" data-k="${k}" type="number" min="0" max="${x.qty}" style="width:90px;padding:6px;border:1px solid var(--bd);border-radius:8px"></td></tr>`).join('')}</tbody></table></div><p class="muted">Invoice balance available to credit: ${E.m(ib(inv))}</p>`;
    } else {
      const b = E.D.purchases.find(x => x.id === sel.value), a = pAvail(b);
      E.$('rt_l').innerHTML = `<div class="tw"><table><thead><tr><th>Material</th><th class="r">Can return</th><th class="r">Unit cost</th><th class="r">Return qty</th></tr></thead><tbody>${Object.entries(a).map(([k, x]) => `<tr><td>${E.esc(x.code)}</td><td class="r">${x.qty}</td><td class="r">${x.qty + 0 ? E.m(Math.round(x.amt / Math.max(x.qty, 1e-9))) : ''}</td><td><input class="rtq" data-k="${k}" type="number" step="0.001" min="0" style="width:90px;padding:6px;border:1px solid var(--bd);border-radius:8px"></td></tr>`).join('')}</tbody></table></div><p class="muted">Bill balance available to debit: ${E.m(ib(b))}</p>`;
    }
  }
  
  function rtInv(kind) {
    const p = E.val('rt_p'), l = kind === 's' ? E.rows('invoices').filter(i => i.partyId === p && !i.cancelled && i.dnIds.length) : E.rows('purchases').filter(i => i.partyId === p && !i.cancelled && i.lines.length);
    E.$('rt_i').innerHTML = l.map(i => `<option value="${i.id}">${i.no} · ${i.date} · balance ${E.m(ib(i))}</option>`).join(''); rtLines(kind);
  }
  
  E.hooks.push(e => { if (e.target.id === 'rt_p') rtInv(e.target.dataset.k); if (e.target.id === 'rt_i') rtLines(E.$('rt_p').dataset.k); });
  
  const rtM = k => {
    const src = k === 's' ? E.rows('invoices').filter(i => !i.cancelled && i.dnIds.length) : E.rows('purchases').filter(i => !i.cancelled && i.lines.length), ps = [...new Set(src.map(i => i.partyId))];
    if (!ps.length) return E.toast('No open ' + (k === 's' ? 'invoices' : 'bills') + ' with returnable lines', 'error');
    E.modal(k === 's' ? 'Sales return (credit note)' : 'Purchase return (debit note)', `<div class="g2"><div class="f">${k === 's' ? 'Customer' : 'Supplier'}<select id="rt_p" data-k="${k}">${ps.map(p => `<option value="${p}">${E.esc(cu(p)?.name)}</option>`).join('')}</select></div><div class="f">${k === 's' ? 'Invoice' : 'Bill'}<select id="rt_i"></select></div></div><div class="f">Date<input id="rt_d" type="date" value="${E.today()}"></div><div id="rt_l"></div><div class="f">Refund account (leave empty to just reduce the amount owed; required if the invoice/bill is already paid)<select id="rt_s"><option value="">— reduce amount owed —</option>${E.opts(a => a.bank)}</select></div><p class="muted">${k === 's' ? 'Posts Dr Sales / Cr Receivables, and returns the goods to stock at their original cost (Dr Finished Goods / Cr Cost of Goods Sold).' : 'Posts Dr Payables / Cr Raw Material Stock at the purchase cost. Stock must still be on hand.'}</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="${k === 's' ? 'saveSR' : 'savePR'}">Post</button>`, 1);
    rtInv(k);
  };
  
  E.A.newSR = () => rtM('s'); E.A.newPR = () => rtM('p');
  const rd = () => [...document.querySelectorAll('.rtq')].map(i => ({ k: i.dataset.k, q: parseFloat(i.value) || 0 })).filter(x => x.q > 0);
  
  E.A.saveSR = async () => {
    try {
      const inv = E.D.invoices.find(x => x.id === E.val('rt_i')), a = srAvail(inv), R = rd();
      if (!R.length) throw new Error('Enter packs to return');
      let tot = 0, cost = 0;
      const L = R.map(x => { const v = a[x.k]; if (x.q > v.qty) throw new Error(v.code + ': only ' + v.qty + ' can be returned'); const val = Math.round(x.q * v.rate * (inv.gross - inv.disc) / inv.gross); return { v, x, val }; });
      const del = agg(inv.dnIds.flatMap(k => E.D.deliveries.find(q => q.id === k).lines), l => l.cost), dq = agg(inv.dnIds.flatMap(k => E.D.deliveries.find(q => q.id === k).lines), l => l.qty);
      const lines = L.map(({ v, x, val }) => { const k = x.k, cst = Math.round(del[k].amt * x.q / dq[k].amt); tot += val; cost += cst; return { itemId: v.itemId, variantId: v.variantId, code: v.code, qty: x.q, rate: v.rate, value: val, cost: cst }; });
      const rf = E.val('rt_s');
      if (!rf && tot > ib(inv)) throw new Error('This credit (' + E.m(tot) + ') is more than the invoice balance (' + E.m(ib(inv)) + '). Choose the account the refund is paid from.');
      const no = await E.next('CN'), d = E.val('rt_d'), ls = [{ acc: '4000', dr: tot }, { acc: rf || '1200', cr: tot }];
      if (cost > 0) { ls.push({ acc: '1320', dr: cost }, { acc: '5400', cr: cost }); }
      await E.post({ date: d, ref: no, narr: 'Sales return ' + no + ' · ' + inv.no, source: 'sale', lines: ls });
      for (const l of lines) await E.stockIn({ date: d, itemId: l.itemId, variantId: l.variantId, qty: l.qty, value: l.cost, type: 'sreturn', ref: no });
      if (!rf) { const b = JSON.parse(JSON.stringify(inv)); inv.paid += tot; await E.save('invoices', inv, b); }
      await E.save('receipts', { no, kind: 'credit', date: d, partyId: inv.partyId, invId: inv.id, amount: tot, cost, lines, refund: rf });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  
  E.A.savePR = async () => {
    try {
      const bl = E.D.purchases.find(x => x.id === E.val('rt_i')), a = pAvail(bl), R = rd();
      if (!R.length) throw new Error('Enter a quantity to return');
      let tot = 0;
      const lines = R.map(x => { const v = a[x.k]; if (x.q > v.qty + 1e-9) throw new Error(v.code + ': only ' + v.qty + ' can be returned'); if (E.stock(v.itemId, v.variantId).qty < x.q - 1e-9) throw new Error(v.code + ': not enough stock on hand to return'); const orig = bl.lines.filter(l => l.itemId === v.itemId && l.variantId === v.variantId), oq = orig.reduce((s, l) => s + l.qty, 0), val = Math.round(x.q * orig.reduce((s, l) => s + l.amount, 0) / oq); tot += val; return { itemId: v.itemId, variantId: v.variantId, code: v.code, qty: x.q, value: val }; });
      const rf = E.val('rt_s');
      if (!rf && tot > ib(bl)) throw new Error('This return (' + E.m(tot) + ') is more than the bill balance (' + E.m(ib(bl)) + '). Choose the account the supplier refunds into.');
      const no = await E.next('DBN'), d = E.val('rt_d');
      await E.post({ date: d, ref: no, narr: 'Purchase return ' + no + ' · ' + bl.no, source: 'purchase', lines: [{ acc: rf || '2000', dr: tot }, { acc: '1300', cr: tot }] });
      for (const l of lines) await E.stockIn({ date: d, itemId: l.itemId, variantId: l.variantId, qty: -l.qty, value: -l.value, type: 'preturn', ref: no });
      if (!rf) { const b = JSON.parse(JSON.stringify(bl)); bl.paid += tot; await E.save('purchases', bl, b); }
      await E.save('payments', { no, kind: 'debit', date: d, partyId: bl.partyId, billId: bl.id, amount: tot, lines, refund: rf });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);