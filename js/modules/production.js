/* PART 14 (v8) — Production strictly PER PAIR. All 4 tabs implemented. */
(E => {
  const ni = E.N.findIndex(n => n.id === 'jobs');
  E.N.splice(ni + 1, 0, { g: 'Factory', id: 'production', ico: '🧵', label: 'Daily Production' });
  const F = { tab: 'sheet', date: E.today(), from: E.today().slice(0, 8) + '01', to: E.today(), job: '', emp: '' };
  const emp = id => E.D.employees.find(x => x.id === id);
  const op = id => E.D.operations.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const it = id => E.D.items.find(x => x.id === id);
  const logs = () => E.rows('prodLogs');
  const live = () => logs().filter(l => l.status !== 'cancelled');
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const ops = () => E.rows('operations').filter(o => o.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const elabel = e => e.code + ' — ' + e.name;
  const r3 = n => Math.round(n * 1000) / 1000;
  const S = (a, f) => a.reduce((s, x) => s + f(x), 0);

  E.opRateInfo = (opId, itemId, date) => {
    const i = it(itemId);
    const cards = E.rows('rateCards').filter(c => c.opId === opId && (!date || (c.from || '') <= date));
    const best = (sc, ref) => cards.filter(c => c.scope === sc && c.ref === ref).sort((a, b) => (b.from || '').localeCompare(a.from || ''))[0];
    const a = i && best('article', i.id);
    const c = i && best('category', i.sub || '');
    const o = op(opId);
    const rCard = a || c;
    return { rate: (a && a.rate) || (c && c.rate) || (o && o.rate) || 0, rateUnit: (rCard && rCard.rateUnit) || (o && o.rateUnit) || 'pair', piecesPerPair: (rCard && rCard.piecesPerPair) || (o && o.piecesPerPair) || 1 };
  };
  E.opRate = (opId, itemId, date) => E.opRateInfo(opId, itemId, date).rate;

  function convertQty(packs, pairsPerPack, rateUnit, piecesPerPair) {
    if (rateUnit === 'pair') return r3(packs * pairsPerPack);
    if (rateUnit === 'piece') return r3(packs * pairsPerPack * (piecesPerPair || 1));
    return packs;
  }

  E.empOpts = () => E.rows('employees').filter(e => e.active).sort((a, b) => a.code.localeCompare(b.code)).map(e => `<option value="${E.esc(elabel(e))}" data-k="${E.esc(e.name + ' ' + e.code + ' ' + (e.nic || ''))}">`).join('');
  const empFind = t => { t = (t || '').trim().toLowerCase(); return E.rows('employees').find(e => elabel(e).toLowerCase() === t || e.code.toLowerCase() === t); };
  const done = (lineId, opId) => live().filter(l => l.lineId === lineId && l.opId === opId).reduce((s, l) => s + l.qty, 0);

  E.route('production', 'Daily Production', () => {
    const TABS = [['log', '📝 Daily log'], ['batch', '📦 Material Batches'], ['sum', '📊 Summary'], ['prog', '🧭 Job progress'], ['ops', '⚙️ Operations & rates'], ['cons', '🧪 Consumables']];
    return `<div class="kp">
      ${E.kpi('Packs today', live().filter(l => l.date === E.today()).reduce((s, l) => s + l.qty, 0), 'packs made')}
      ${E.kpi('Pairs today', live().filter(l => l.date === E.today()).reduce((s, l) => s + (l.convertedQty || l.qty), 0), 'pairs (converted)')}
      ${E.kpi('Wages today', E.m(live().filter(l => l.date === E.today()).reduce((s, l) => s + l.amount, 0)), 'piece work')}
      ${E.kpi('Accrued', E.m(E.bal('2210')), 'unpaid')}
    </div>
    <div class="bar">${TABS.map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="prTab" data-id="${k}">${l}</button>`).join('')}</div>
    <div id="prb">${body()}</div>`;
  });

  E.A.prTab = t => { F.tab = t; E.go(); };
  const body = () => F.tab === 'log' ? logTab() : F.tab === 'batch' ? matTab() : F.tab === 'sum' ? sumTab() : F.tab === 'prog' ? progTab() : F.tab === 'ops' ? opsTab() : consTab();

  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f && f.startsWith('pr.')) { F[f.slice(3)] = t.value; E.$('prb').innerHTML = body(); return; }
    const r = t.closest && t.closest('.pr');
    if (!r) return;
    const c = r.children;
    if (t === c[1]) { const j = t.value; c[2].innerHTML = '<option value="">— article —</option>' + (j ? jl(j).map(l => `<option value="${l.id}">${E.esc(l.code)} · target ${l.target}</option>`).join('') : ''); }
    if (t === c[1] || t === c[2] || t === c[3]) {
      const l = E.D.jobLines.find(x => x.id === c[2].value);
      if (l && c[3].value && !c[5].dataset.man) {
        const info = E.opRateInfo(c[3].value, l.itemId, E.val('pr_d'));
        c[5].value = (info.rate / 100) || '';
        c[5].dataset.unit = info.rateUnit;
      }
    }
    if (t === c[5]) c[5].dataset.man = '1';
    const q = parseFloat(c[4].value) || 0, rt = E.c(c[5].value);
    const line = E.D.jobLines.find(x => x.id === c[2].value);
    if (line && c[3].value) {
      const info = E.opRateInfo(c[3].value, line.itemId, E.val('pr_d'));
      const item = it(line.itemId);
      const pp = (item && item.pack) || 1;
      const conv = convertQty(q, pp, info.rateUnit, info.piecesPerPair);
      c[6].value = q && rt ? E.m(Math.round(conv * rt)) : '';
      c[6].title = q && rt ? `${q} packs × ${pp} pairs = ${conv} ${info.rateUnit} × ${E.m(rt)}` : '';
    } else c[6].value = '';
    tot();
  });

  const row = () => `<div class="jl pr" style="grid-template-columns:1.5fr 1.2fr 1.6fr 1.2fr .7fr .8fr .9fr 28px"><input list="pe" placeholder="Worker"><select><option value="">— job —</option>${active().map(j => `<option value="${j.id}">${j.no}</option>`).join('')}</select><select><option value="">— article —</option></select><select><option value="">— operation —</option>${ops().map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join('')}</select><input type="number" step="1" min="0" placeholder="Packs"><input type="number" step="0.01" placeholder="Rate"><input readonly placeholder="Amount"><button class="btn sm d" data-a="rmPr">✕</button></div>`;
  E.A.rmPr = (_, e) => { e.target.closest('.pr').remove(); tot(); };
  E.A.addPr = () => E.$('prr').insertAdjacentHTML('beforeend', row());
  function tot() {
    let q = 0, a = 0;
    document.querySelectorAll('#prr .pr').forEach(r => { const c = r.children, n = parseFloat(c[4].value) || 0; q += n; a += E.c((c[6].value || '').replace(/[^0-9.]/g, '')); });
    if (E.$('pr_t')) E.$('pr_t').textContent = q + ' packs · ' + E.m(a);
  }

  function logTab() {
    const rows = live().concat(logs().filter(l => l.status === 'cancelled'))
      .filter(l => l.date === F.date && (!F.job || l.jobId === F.job) && (!F.emp || l.empId === F.emp))
      .sort((a, b) => b.no.localeCompare(a.no));
    const can = E.role === 'owner' || E.role === 'accountant';
    return `<div class="card">
      <h3>Record today's work</h3>
      ${!can ? '<p class="muted">View-only.</p>' : !ops().length ? '<p class="bad">Add operations first — go to Operations & rates tab</p>' : !active().length ? '<p class="bad">No job in progress</p>' : `
        <div class="g2">
          <div class="f">Date<input id="pr_d" type="date" value="${F.date}" data-f="pr.date"></div>
          <div class="f"><br><span class="muted">Rate auto-fills. Amount = pairs × rate.</span></div>
        </div>
        <datalist id="pe">${E.empOpts()}</datalist>
        <div id="prr">${row() + row() + row()}</div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
          <button class="btn sm" data-a="addPr">+ Add row</button><span class="gap"></span>
          <b id="pr_t">0 packs · Rs 0.00</b>
          <button class="btn p" data-a="prSave">Save</button>
        </div>`}
    </div>
    <div class="bar">
      <span class="muted">Showing</span>
      <input type="date" class="fs" data-f="pr.date" value="${F.date}">
      <select class="fs" data-f="pr.job"><option value="">All jobs</option>${E.rows('jobs').map(j => `<option value="${j.id}" ${F.job === j.id ? 'selected' : ''}>${j.no}</option>`).join('')}</select>
      <select class="fs" data-f="pr.emp"><option value="">All workers</option>${E.rows('employees').map(e => `<option value="${e.id}" ${F.emp === e.id ? 'selected' : ''}>${E.esc(e.name)}</option>`).join('')}</select>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Worker</th><th>Job</th><th>Article</th><th>Operation</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Rate</th><th class="r">Earned</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(l => {
        const unit = l.rateUnit || 'pair';
        const conv = l.convertedQty != null ? l.convertedQty : (l.qty * (l.pairsPerPack || 1));
        return `<tr style="${l.status === 'cancelled' ? 'opacity:.45' : ''}">
          <td>${l.no}</td><td>${E.esc((emp(l.empId) || {}).name)}</td>
          <td>${E.esc((J(l.jobId) || {}).no)}</td><td><b>${E.esc(l.code)}</b></td>
          <td>${E.esc(l.opName)}</td>
          <td class="r">${l.qty}</td><td class="r muted">${conv}</td>
          <td class="r">${E.m(l.rate)}<div class="muted" style="font-size:10px">/${unit}</div></td>
          <td class="r"><b>${E.m(l.amount)}</b></td>
          <td><span class="tag">${l.status === 'paid' ? 'Paid ' + (l.runNo || '') : l.status}</span></td>
          <td class="r">${l.status === 'accrued' && can ? `<button class="btn sm d" data-a="prCancel" data-id="${l.id}">Cancel</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="11" class="muted">No entries</td></tr>'}</tbody>
    </table></div>`;
  }

  E.A.prSave = async () => {
    try {
      const L = [];
      document.querySelectorAll('#prr .pr').forEach((r, i) => {
        const c = r.children;
        if (!c[0].value && !c[4].value && !c[1].value) return;
        const e = empFind(c[0].value), j = J(c[1].value), l = E.D.jobLines.find(x => x.id === c[2].value), o = op(c[3].value);
        const q = parseFloat(c[4].value) || 0, rt = E.c(c[5].value);
        const n = 'Row ' + (i + 1) + ': ';
        if (!e) throw new Error(n + 'worker missing');
        if (!j || j.status !== 'In Progress') throw new Error(n + 'invalid job');
        if (!l) throw new Error(n + 'article missing');
        if (!o) throw new Error(n + 'operation missing');
        if (!(q > 0) || q !== Math.floor(q)) throw new Error(n + 'enter whole packs');
        if (!(rt > 0)) throw new Error(n + 'rate not set');
        const info = E.opRateInfo(o.id, l.itemId, E.val('pr_d'));
        const item = it(l.itemId);
        const pp = (item && item.pack) || 1;
        const conv = convertQty(q, pp, info.rateUnit, info.piecesPerPair);
        const amount = Math.round(conv * rt);
        L.push({ e, j, l, o, q, rt, amount, pairsPerPack: pp, info, convertedQty: conv });
      });
      if (!L.length) throw new Error('Nothing to save');
      const d = E.val('pr_d');
      if (!d) throw new Error('Choose date');
      const no = await E.next('PL');
      const tot = L.reduce((s, x) => s + x.amount, 0);
      const je = await E.post({
        date: d, ref: no, narr: 'Production ' + d + ' · ' + L.length + ' entries', source: 'production',
        lines: L.map(x => ({ acc: '1310', dr: x.amount, job: x.j.id, cat: 'Labour', art: x.l.id, head: '5110' })).concat([{ acc: '2210', cr: tot }])
      });
      let k = 0;
      for (const x of L) {
        await E.save('prodLogs', {
          no: no + '-' + (++k), batch: no, date: d,
          empId: x.e.id, jobId: x.j.id, lineId: x.l.id, itemId: x.l.itemId, variantId: x.l.variantId,
          code: x.l.code, opId: x.o.id, opName: x.o.name,
          qty: x.q, pairsPerPack: x.pairsPerPack, rateUnit: x.info.rateUnit, piecesPerPair: x.info.piecesPerPair,
          convertedQty: x.convertedQty, rate: x.rt, amount: x.amount,
          status: 'accrued', jeId: je.id, jeNo: je.no, runId: '', runNo: ''
        });
      }
      F.date = d; E.go();
      E.toast(L.length + ' entries · ' + E.m(tot), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.prCancel = async id => {
    try {
      const l = E.D.prodLogs.find(x => x.id === id);
      if (l.status !== 'accrued') throw new Error('Not cancellable');
      if (!confirm('Cancel ' + l.no + '?')) return;
      await E.post({ date: E.today(), ref: l.no, narr: 'Cancel ' + l.no, source: 'production',
        lines: [{ acc: '2210', dr: l.amount }, { acc: '1310', cr: l.amount, job: l.jobId, cat: 'Labour', art: l.lineId, head: '5110' }] });
      const b = JSON.parse(JSON.stringify(l));
      l.status = 'cancelled';
      await E.save('prodLogs', l, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  function matTab() {
    const jobs = active();
    if (!jobs.length) return '<div class="card muted">No job in progress.</div>';
    const bi = E.rows('issues').filter(i => i.batch === true);
    const bno = [...new Set(bi.map(b => b.no))].sort((a, b) => b.localeCompare(a));
    return `<div class="card">
      <h3>📦 Material Batch</h3>
      <div class="g2">
        <div class="f">Job *<select id="mb_job" onchange="E.A.mbJobChange()"><option value="">—</option>${jobs.map(j => `<option value="${j.id}">${E.esc(j.no)}</option>`).join('')}</select></div>
        <div class="f">Article *<select id="mb_art" onchange="E.A.mbPreview()"><option value="">—</option></select></div>
      </div>
      <div class="g2">
        <div class="f">Packs *<input id="mb_qty" type="number" min="1" value="1" oninput="E.A.mbPreview()"></div>
        <div class="f">Date<input id="mb_date" type="date" value="${E.today()}"></div>
      </div>
      <div id="mb_preview"><p class="muted">Select job and article.</p></div>
      <button class="btn p" data-a="mbPost" id="mb_postBtn" style="margin-top:12px" disabled>📦 Deduct</button>
    </div>
    ${bno.length ? `<div class="card"><h3>Recent Batches</h3><div class="tw"><table><thead><tr><th>Batch</th><th>Date</th><th>Job</th><th>Materials</th><th class="r">Value</th></tr></thead><tbody>${bno.slice(0, 20).map(no => { const items = bi.filter(b => b.no === no); const first = items[0]; return `<tr><td>${no}</td><td>${first.date}</td><td>${(J(first.jobId) || {}).no || '?'}</td><td>${items.map(i => E.esc(i.code)).join(', ')}</td><td class="r">${E.m(items.reduce((s, i) => s + i.value, 0))}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}`;
  }
  E.A.mbJobChange = () => {
    const jobId = E.val('mb_job');
    const lines = E.rows('jobLines').filter(l => l.jobId === jobId);
    const sel = E.$('mb_art');
    if (!sel) return;
    sel.innerHTML = '<option value="">— article —</option>' + lines.map(l => `<option value="${l.id}">${E.esc(l.code)} · target ${l.target}</option>`).join('');
    E.A.mbPreview();
  };
  E.A.mbPreview = () => {
    const qty = parseFloat(E.val('mb_qty')) || 0, lineId = E.val('mb_art');
    const box = E.$('mb_preview'), btn = E.$('mb_postBtn');
    if (!box) return;
    if (!lineId || qty <= 0) { box.innerHTML = '<p class="muted">Select article & packs.</p>'; if (btn) btn.disabled = true; return; }
    const line = E.D.jobLines.find(l => l.id === lineId);
    const item = line && it(line.itemId);
    if (!item || !(item.bom || []).length) { box.innerHTML = '<p class="bad">No BOM on this article. Add it on the Items page first.</p>'; if (btn) btn.disabled = true; return; }
    const pairsPerPack = item.pack || 1;
    const rows = item.bom.map(b => {
      const need = r3(b.qty * qty * pairsPerPack);
      const sku = E.skuList().find(s => s.itemId === b.itemId && s.variantId === (b.variantId || ''));
      const st = E.stock(b.itemId, b.variantId);
      const avgCost = st.qty > 0 ? Math.round(st.value / st.qty) : 0;
      return { sku, need, stock: st.qty, short: st.qty + 1e-9 < need, value: Math.round(need * avgCost) };
    });
    const anyShort = rows.some(r => r.short);
    box.innerHTML = `<div class="tw"><table><thead><tr><th>Material</th><th class="r">Need (for ${qty * pairsPerPack} pairs)</th><th class="r">Stock</th><th class="r">Value</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${E.esc(r.sku ? r.sku.code : '?')}</td><td class="r">${r.need}</td><td class="r">${r.stock}</td><td class="r">${E.m(r.value)}</td><td>${r.short ? '<span class="bad">Short</span>' : '<span class="ok">OK</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    if (btn) btn.disabled = anyShort;
  };
  E.A.mbPost = async () => {
    try {
      const jobId = E.val('mb_job'), lineId = E.val('mb_art'), qty = parseFloat(E.val('mb_qty')) || 0, date = E.val('mb_date');
      const line = E.D.jobLines.find(l => l.id === lineId);
      const item = line && it(line.itemId);
      if (!item || !item.bom) throw new Error('No BOM');
      const pairsPerPack = item.pack || 1;
      const no = await E.next('BAT');
      let total = 0;
      for (const b of item.bom) {
        const need = r3(b.qty * qty * pairsPerPack);
        const st = E.stock(b.itemId, b.variantId);
        if (st.qty + 1e-9 < need) throw new Error('Insufficient stock');
        const val = E.outValue(b.itemId, b.variantId, need);
        await E.stockOut({ date, itemId: b.itemId, variantId: b.variantId, qty: need, type: 'issue', ref: no, job: jobId });
        await E.save('issues', { no, date, jobId, itemId: b.itemId, variantId: b.variantId, qty: need, value: val, batch: true });
        total += val;
      }
      await E.post({ date, ref: no, narr: 'Batch · ' + qty + ' packs', source: 'issue',
        lines: [{ acc: '1310', dr: total, job: jobId, cat: 'Material', art: lineId, head: '5000' }, { acc: '1300', cr: total }] });
      const bl = JSON.parse(JSON.stringify(line));
      line.started = (line.started || 0) + qty;
      await E.save('jobLines', line, bl);
      E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ─── TAB 3: SUMMARY ─────────────────────────────────── */
  function sumTab() {
    const d = F.date;
    const L = live().filter(l => l.date === d);
    const byWorker = {}, byOp = {}, byJob = {};
    L.forEach(l => {
      (byWorker[l.empId] = byWorker[l.empId] || { qty: 0, amount: 0, pairs: 0 });
      byWorker[l.empId].qty += l.qty; byWorker[l.empId].pairs += (l.convertedQty || l.qty); byWorker[l.empId].amount += l.amount;
      (byOp[l.opId] = byOp[l.opId] || { qty: 0, amount: 0, pairs: 0 });
      byOp[l.opId].qty += l.qty; byOp[l.opId].pairs += (l.convertedQty || l.qty); byOp[l.opId].amount += l.amount;
      (byJob[l.jobId] = byJob[l.jobId] || { qty: 0, amount: 0, pairs: 0 });
      byJob[l.jobId].qty += l.qty; byJob[l.jobId].pairs += (l.convertedQty || l.qty); byJob[l.jobId].amount += l.amount;
    });
    const tot = L.reduce((s, l) => s + l.amount, 0);
    const mk = (title, M, labFn) => `<div class="card"><h3>${title}</h3><div class="tw"><table><thead><tr><th>Item</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Wages</th></tr></thead><tbody>${Object.entries(M).map(([k, v]) => `<tr><td>${labFn(k)}</td><td class="r">${v.qty}</td><td class="r">${v.pairs}</td><td class="r">${E.m(v.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries</td></tr>'}<tr style="background:var(--s2)"><td><b>Total</b></td><td class="r"><b>${Object.values(M).reduce((s, v) => s + v.qty, 0)}</b></td><td class="r"><b>${Object.values(M).reduce((s, v) => s + v.pairs, 0)}</b></td><td class="r"><b>${E.m(tot)}</b></td></tr></tbody></table></div></div>`;
    return `<div class="bar"><span class="muted">Date</span><input type="date" class="fs" data-f="pr.date" value="${d}"><span class="gap"></span><button class="btn" data-a="prSumCsv">⬇ CSV</button></div>${mk('By Worker', byWorker, id => E.esc((emp(id) || {}).name || '?'))}${mk('By Operation', byOp, id => E.esc((op(id) || {}).name || '?'))}${mk('By Job', byJob, id => E.esc((J(id) || {}).no || '?'))}`;
  }
  E.A.prSumCsv = () => {
    const d = F.date;
    const L = live().filter(l => l.date === d);
    const rows = [['No', 'Worker', 'Job', 'Article', 'Operation', 'Packs', 'Pairs', 'Rate', 'Amount'].join(',')];
    L.forEach(l => {
      rows.push([
        l.no, (emp(l.empId) || {}).name || '', (J(l.jobId) || {}).no || '', l.code, l.opName,
        l.qty, l.convertedQty || l.qty, (l.rate / 100).toFixed(2), (l.amount / 100).toFixed(2)
      ].map(E.csvCell).join(','));
    });
    E.download('production-' + d + '.csv', rows.join('\n'), 'text/csv');
  };

  /* ─── TAB 4: JOB PROGRESS ──────────────────────────── */
  function progTab() {
    const jobs = active();
    if (!jobs.length) return '<div class="card muted">No jobs in progress.</div>';
    return jobs.map(j => {
      const lines = E.rows('jobLines').filter(l => l.jobId === j.id);
      const allOps = E.rows('operations').filter(o => o.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
      const rows = lines.map(l => {
        const target = l.target;
        const cells = allOps.map(o => {
          const dn = live().filter(x => x.lineId === l.id && x.opId === o.id).reduce((s, x) => s + x.qty, 0);
          const pct = target ? Math.round(dn / target * 100) : 0;
          return `<td class="r"><div style="background:#eee;border-radius:4px;height:16px;position:relative"><div style="background:${pct >= 100 ? '#059669' : pct > 0 ? '#d97706' : '#e5e7eb'};height:100%;width:${Math.min(pct, 100)}%;border-radius:4px"></div><span style="position:absolute;left:50%;top:0;transform:translateX(-50%);font-size:10px;line-height:16px;font-weight:600">${dn}/${target}</span></div></td>`;
        }).join('');
        return `<tr><td><b>${E.esc(l.code)}</b></td>${cells}</tr>`;
      }).join('');
      return `<div class="card"><h3>${E.esc(j.no)} · ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock' }).name)}</h3><div class="tw"><table><thead><tr><th>Article</th>${allOps.map(o => `<th class="r">${E.esc(o.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join('');
  }

  /* ─── TAB 5: OPERATIONS & RATES ──────────────────────── */
  function opsTab() {
    const O = E.rows('operations').sort((a, b) => (a.order || 0) - (b.order || 0));
    const rc = E.rows('rateCards');
    const can = E.role === 'owner' || E.role === 'accountant';
    return `<div class="card"><div class="bar"><span class="gap"></span>${can ? '<button class="btn sm" data-a="opStd">+ Add standard operations</button><button class="btn p" data-a="opNew">+ Operation</button><button class="btn" data-a="rcNew">+ Rate override</button>' : ''}</div>
      <div class="tw"><table><thead><tr><th>Order</th><th>Operation</th><th class="r">Rate/pair</th><th class="r">Pieces/pair</th><th>Active</th>${can ? '<th></th>' : ''}</tr></thead><tbody>${O.map(o => `<tr><td>${o.order || 0}</td><td><b>${E.esc(o.name)}</b></td><td class="r">${E.m(o.rate || 0)}</td><td class="r">${o.piecesPerPair || 1}</td><td>${o.active === false ? 'No' : 'Yes'}</td>${can ? `<td class="r"><button class="btn sm" data-a="opEdit" data-id="${o.id}">Edit</button> <button class="btn sm d" data-a="opDel" data-id="${o.id}">${o.active === false ? 'Activate' : 'Deactivate'}</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="muted">No operations yet. Click "Add standard operations".</td></tr>'}</tbody></table></div>
      ${rc.length ? '<h4 style="margin:14px 0 6px">Rate overrides</h4><div class="tw"><table><thead><tr><th>Operation</th><th>Scope</th><th>Item/Category</th><th class="r">Rate</th><th>From</th></tr></thead><tbody>' + rc.map(c => { const o = op(c.opId); const item = c.scope === 'article' ? E.D.items.find(x => x.id === c.ref) : null; return `<tr><td>${E.esc(o ? o.name : '?')}</td><td>${c.scope}</td><td>${E.esc(c.scope === 'article' ? (item ? item.art + ' ' + item.name : '') : c.ref)}</td><td class="r">${E.m(c.rate || 0)}</td><td>${c.from || ''}</td></tr>`; }).join('') + '</tbody></table></div>' : ''}
    </div>`;
  }
  E.A.opNew = () => E.modal('New operation', `<div class="g2"><div class="f">Name *<input id="op_n"></div><div class="f">Order<input id="op_o" type="number" value="0"></div><div class="f">Rate per PAIR (Rs) *<input id="op_r" type="number" step="0.01"></div><div class="f">Pieces per pair<input id="op_p" type="number" step="0.01" value="1"></div></div>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opSave">Save</button>`);
  E.A.opSave = async () => {
    try {
      const name = E.val('op_n'), rate = E.c(E.val('op_r'));
      if (!name) throw new Error('Enter name');
      if (!(rate > 0)) throw new Error('Enter rate');
      await E.save('operations', { name, order: parseInt(E.val('op_o')) || 0, rate, rateUnit: 'pair', piecesPerPair: parseFloat(E.val('op_p')) || 1, active: true });
      E.closeM(); E.go(); E.toast('Operation saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.opEdit = id => { const o = op(id); if (!o) return; E.modal('Edit ' + o.name, `<div class="g2"><div class="f">Name *<input id="op_n" value="${E.esc(o.name)}"></div><div class="f">Order<input id="op_o" type="number" value="${o.order || 0}"></div><div class="f">Rate per PAIR (Rs) *<input id="op_r" type="number" step="0.01" value="${(o.rate / 100).toFixed(2)}"></div><div class="f">Pieces per pair<input id="op_p" type="number" step="0.01" value="${o.piecesPerPair || 1}"></div></div>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opSaveEdit" data-id="${id}">Save</button>`); };
  E.A.opSaveEdit = async id => {
    try {
      const o = op(id); if (!o) throw new Error('Not found');
      const b = JSON.parse(JSON.stringify(o));
      o.name = E.val('op_n'); o.order = parseInt(E.val('op_o')) || 0;
      o.rate = E.c(E.val('op_r')); o.piecesPerPair = parseFloat(E.val('op_p')) || 1;
      await E.save('operations', o, b);
      E.closeM(); E.go(); E.toast('Operation updated', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.opDel = async id => { const o = op(id); if (!o) return; const b = JSON.parse(JSON.stringify(o)); o.active = o.active === false; await E.save('operations', o, b); E.go(); };
  E.A.opStd = async () => {
    const STD = ['Top making', 'Upper making', 'Sole fixing', 'Buckle fitting', 'Finishing', 'Packing'];
    let n = 0;
    for (let i = 0; i < STD.length; i++) {
      if (E.rows('operations').some(x => x.name === STD[i])) continue;
      await E.save('operations', { name: STD[i], order: i, rate: 0, rateUnit: 'pair', piecesPerPair: 1, active: true });
      n++;
    }
    E.go(); E.toast(n + ' standard operations added — now set the rates', 'success');
  };
  E.A.rcNew = () => {
    const ops_ = E.rows('operations').filter(o => o.active !== false);
    if (!ops_.length) return E.toast('Add operations first', 'error');
    const cats = E.fgCats();
    const items = E.rows('items').filter(i => i.cat === 'Finished Good' && i.active);
    E.modal('New rate override', `<div class="g2"><div class="f">Operation *<select id="rc_o">${ops_.map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join('')}</select></div><div class="f">Scope *<select id="rc_s" onchange="E.A.rcScope()"><option value="category">Category (all articles)</option><option value="article">Specific article</option></select></div><div class="f" id="rc_c_grp">Category<select id="rc_c">${cats.map(c => `<option>${E.esc(c)}</option>`).join('')}</select></div><div class="f" id="rc_i_grp" style="display:none">Article<select id="rc_i">${items.map(i => `<option value="${i.id}">${E.esc(i.art)} ${E.esc(i.name)}</option>`).join('')}</select></div><div class="f">Rate per PAIR (Rs) *<input id="rc_r" type="number" step="0.01"></div><div class="f">From date<input id="rc_f" type="date" value="${E.today()}"></div></div>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="rcSave">Save</button>`);
  };
  E.A.rcScope = () => { const s = E.val('rc_s'); E.$('rc_c_grp').style.display = s === 'category' ? '' : 'none'; E.$('rc_i_grp').style.display = s === 'article' ? '' : 'none'; };
  E.A.rcSave = async () => {
    try {
      const o = E.val('rc_o'), s = E.val('rc_s'), ref = s === 'category' ? E.val('rc_c') : E.val('rc_i'), r = E.c(E.val('rc_r')), f = E.val('rc_f');
      if (!(r > 0)) throw new Error('Enter rate');
      await E.save('rateCards', { opId: o, scope: s, ref, rate: r, rateUnit: 'pair', piecesPerPair: 1, from: f });
      E.closeM(); E.go(); E.toast('Rate override saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ─── TAB 6: CONSUMABLES ────────────────────────────── */
  function consTab() {
    const cons = E.rows('items').filter(i => i.consumable);
    if (!cons.length) return '<div class="card"><h3>Consumables</h3><p class="muted">No consumable materials (glue, thread, etc.) configured. Mark them on the Items page.</p></div>';
    const startDate = F.from || E.today().slice(0, 8) + '01';
    const endDate = F.to || E.today();
    const rows = cons.map(item => {
      const use = E.rows('stockMoves').filter(m => m.itemId === item.id && m.type === 'issue' && m.date >= startDate && m.date <= endDate);
      const usedQty = use.reduce((s, m) => s + Math.abs(m.qty), 0);
      const usedVal = use.reduce((s, m) => s + Math.abs(m.value), 0);
      return `<tr><td><b>${E.esc(item.art)}</b> ${E.esc(item.name)}</td><td>${E.esc(item.consumableMode || 'bom')}</td><td class="r">${usedQty.toFixed(3)} ${E.esc(item.unit || '')}</td><td class="r">${E.m(usedVal)}</td><td class="r">${E.m(E.stock(item.id, '').value)}</td></tr>`;
    }).join('');
    return `<div class="bar"><span class="muted">From</span><input type="date" class="fs" data-f="pr.from" value="${startDate}"><span class="muted">to</span><input type="date" class="fs" data-f="pr.to" value="${endDate}"></div><div class="card"><h3>Consumables usage</h3><div class="tw"><table><thead><tr><th>Item</th><th>Mode</th><th class="r">Used</th><th class="r">Value</th><th class="r">On hand</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">Consumables tracked through material batches (BOM mode) or manual inventory adjustments.</p></div>`;
  }
})(window.ERP);