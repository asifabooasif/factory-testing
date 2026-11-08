/* PART 16 — Material planning (MRP). */
(E => {
  const ai = E.N.findIndex(n => n.id === 'qc');
  E.N.splice(ai + 1, 0, { g: 'Factory', id: 'mrp', ico: '🧵', label: 'Material Planning' });
  const it = id => E.D.items.find(x => x.id === id), r3 = n => Math.round(n * 1000) / 1000, key = (i, v) => i + '|' + (v || '');
  const unit = (i, v) => { const s = E.stock(i, v); if (s.qty > 0) return s.value / s.qty; let r = 0; E.rows('purchases').filter(p => !p.cancelled).sort((a, b) => a.date.localeCompare(b.date)).forEach(p => (p.lines || []).forEach(l => { if (l.itemId === i && (l.variantId || '') === (v || '')) r = l.rate })); return r };
  const lastSup = (i, v) => { let s = ''; E.rows('purchases').filter(p => !p.cancelled).sort((a, b) => a.date.localeCompare(b.date)).forEach(p => (p.lines || []).forEach(l => { if (l.itemId === i && (l.variantId || '') === (v || '')) s = p.partyId })); const p = E.D.parties.find(x => x.id === s); return p ? p.name : '' };

  function plan() {
    const jobs = E.rows('jobs').filter(j => j.status === 'In Progress'), need = {}, noBom = [];
    jobs.forEach(j => {
      const req = {};
      E.rows('jobLines').filter(l => l.jobId === j.id).forEach(l => {
        const i = it(l.itemId);
        if (!i || !(i.bom || []).length) { noBom.push({ j, l }); return }
        i.bom.forEach(m => { const k = key(m.itemId, m.variantId); req[k] = (req[k] || 0) + m.qty * l.target });
      });
      const iss = {};
      E.rows('stockMoves').filter(x => x.job === j.id).forEach(x => {
        const i = it(x.itemId); if (!i || i.cat === 'Finished Good') return;
        const k = key(x.itemId, x.variantId); iss[k] = (iss[k] || 0) - x.qty;
      });
      for (const k in req) {
        const rem = r3(req[k] - (iss[k] || 0)); if (rem <= 0) continue;
        const a = need[k] || (need[k] = { need: 0, jobs: [] });
        a.need = r3(a.need + rem); a.jobs.push(j.no);
      }
    });
    const sku = E.skuList();
    const rows = Object.keys(need).map(k => {
      const [i, v] = k.split('|');
      const s = sku.find(x => key(x.itemId, x.variantId) === k) || { code: '?', label: 'Unknown', unit: '' };
      const st = E.stock(i, v).qty, sh = r3(Math.max(0, need[k].need - st)), u = unit(i, v);
      return { k, code: s.code, name: s.label.split(' — ')[1] || s.label, unit: s.unit, need: need[k].need, stock: st, short: sh, rate: u, cost: Math.round(sh * u), jobs: need[k].jobs, sup: lastSup(i, v) };
    }).sort((a, b) => (b.short > 0) - (a.short > 0) || a.code.localeCompare(b.code));

    /* Pairs possible — stock / per-pair BOM qty (min across materials) */
    const prod = E.rows('items').filter(i => i.active && i.cat === 'Finished Good' && (i.bom || []).length).map(i => ({
      i,
      pairs: Math.floor(Math.min(...i.bom.map(m => m.qty > 0 ? E.stock(m.itemId, m.variantId).qty / m.qty : Infinity)) + 1e-9),
      packs: 0
    }));
    /* Also compute packs possible = pairs / pairs-per-pack */
    prod.forEach(p => { p.packs = Math.floor(p.pairs / ((p.i.pack) || 1)); });
    return { jobs, rows, noBom, prod };
  }

  E.route('mrp', 'Material Planning', () => {
    const P = plan(), sh = P.rows.filter(r => r.short > 0), tot = sh.reduce((s, r) => s + r.cost, 0);
    return `<div class="kp">${E.kpi('Jobs planned', P.jobs.length, 'In progress')}${E.kpi('Materials needed', P.rows.length, 'Still to be issued')}${E.kpi('Materials short', sh.length, sh.length ? '<span class="bad">Need to buy</span>' : '<span class="ok">All covered</span>')}${E.kpi('Estimated purchase', E.m(tot), 'At average / last rate')}</div>
    <div class="bar"><span class="gap"></span><button class="btn" data-a="mrpCsv">Download shortage list (CSV)</button><button class="btn" data-a="mrpPrint">Print</button></div>
    <div class="tw" id="mrpt"><table><thead><tr><th>Material</th><th>Name</th><th class="r">Still needed</th><th class="r">In stock</th><th class="r">Shortage</th><th class="r">Est. cost</th><th>Last supplier</th><th>Jobs</th></tr></thead><tbody>${P.rows.map(r => `<tr><td><b>${E.esc(r.code)}</b></td><td>${E.esc(r.name)}</td><td class="r">${r.need}</td><td class="r">${r.stock}</td><td class="r ${r.short ? 'bad' : 'ok'}"><b>${r.short || 'OK'}</b></td><td class="r">${r.short ? E.m(r.cost) : ''}</td><td>${E.esc(r.sup)}</td><td class="muted">${E.esc(r.jobs.join(', '))}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nothing to plan. Create jobs and add a Bill of Materials to the finished-good items.</td></tr>'}</tbody></table></div>
    ${P.noBom.length ? `<div class="card"><h3 class="bad">Not included: no Bill of Materials</h3><p class="muted">These job lines were left out because their item has no BOM, so the plan is incomplete until you add one (Items - BOM).</p><p>${P.noBom.map(x => E.esc(x.j.no + ' / ' + x.l.code)).join(', ')}</p></div>` : ''}
    <div class="card"><h3>Production capacity from current stock</h3>
      <p class="muted" style="margin-bottom:10px">How many pairs and packs you can make with the materials on hand right now (based on the BOM per pair).</p>
      <div class="tw"><table><thead><tr><th>Article</th><th>Name</th><th class="r">Pairs possible</th><th class="r">Packs possible</th></tr></thead><tbody>${P.prod.map(x => `<tr><td>${E.esc(x.i.art)}</td><td>${E.esc(x.i.name)}</td><td class="r"><b>${x.pairs}</b></td><td class="r">${x.packs}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No article has a BOM yet</td></tr>'}</tbody></table></div>
    </div>
    <p class="muted">Needed = BOM quantity (per pair) × job target packs × pairs per pack, minus material already issued to that job. Shortage = total needed across all jobs minus stock on hand. Stock reserved by one job is counted once.</p>`;
  });

  E.A.mrpCsv = () => { const P = plan().rows.filter(r => r.short > 0), h = 'Material,Name,Needed,In stock,Shortage,Unit,Est cost (Rs),Last supplier'; E.download('material-shortage-' + E.today() + '.csv', [h].concat(P.map(r => [r.code, r.name, r.need, r.stock, r.short, r.unit, (r.cost / 100).toFixed(2), r.sup].map(E.csvCell).join(','))).join('\n'), 'text/csv') };
  E.A.mrpPrint = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write('<html><head><style>body{font:13px Arial;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ccc;text-align:left}.r{text-align:right}</style></head><body><h2>' + E.esc(E.factory().name) + '</h2><h3>Material requirements ' + E.today() + '</h3>' + E.$('mrpt').innerHTML + '</body></html>'); w.document.close(); w.print() };
})(window.ERP);