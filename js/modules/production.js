/* PART 14 (v5) — Daily Production: unified daily sheet.

   ┌──────────────────────────────────────────────────────────────────┐
   │  DAILY SHEET (primary)                                          │
   │  ─ Workers & operations with rate auto-fill + pair/pack/piece    │
   │  ─ Materials used (BOM auto-estimate + actual entry)             │
   │  ─ Finished goods released                                       │
   │  ─ Post all in one action                                        │
   │                                                                  │
   │  REMINDERS                                                       │
   │  ─ On load, check last 7 days for worker ops with no materials   │
   │  ─ Sundays auto-holiday (never nagged)                          │
   │  ─ Custom holidays (mark any day)                               │
   │  ─ Skip a day (permanent, no future reminder)                    │
   │                                                                  │
   │  OTHER TABS                                                      │
   │  ─ Production Log, Batches, Job Progress, Operations,            │
   │    Consumables, Summary                                          │
   └──────────────────────────────────────────────────────────────────┘
*/
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

  /* ── Holiday helpers ── */
  const isSunday = d => new Date(d + 'T00:00:00').getDay() === 0;
  const isCustomHoliday = d => (E.setting('holidays') || []).includes(d);
  const isHoliday = d => isSunday(d) || isCustomHoliday(d);

  function getMissingDays() {
    const today = E.today();
    const out = [];
    const completed = new Set(E.rows('dailyProduction').filter(r => ['posted', 'skipped', 'holiday'].includes(r.status)).map(r => r.date));
    const logsByDate = {};
    live().forEach(l => { logsByDate[l.date] = (logsByDate[l.date] || 0) + 1; });
    for (let i = 1; i <= 7; i++) {
      const d = new Date(Date.parse(today + 'T00:00:00') - i * 864e5).toISOString().slice(0, 10);
      if (isHoliday(d)) continue;
      if (completed.has(d)) continue;
      /* Only nag about days with actual work logged OR completely blank */
      out.push({ date: d, hasWorkers: !!logsByDate[d], hasMaterials: E.rows('issues').some(x => x.date === d) || E.rows('consumables').some(x => x.date === d) });
    }
    return out;
  }

  /* ── Rate helpers ── */
  E.opRateInfo = (opId, itemId, date) => {
    const i = it(itemId);
    const cards = E.rows('rateCards').filter(c => c.opId === opId && (!date || (c.from || '') <= date));
    const best = (sc, ref) => cards.filter(c => c.scope === sc && c.ref === ref).sort((a, b) => (b.from || '').localeCompare(a.from || ''))[0];
    const a = i && best('article', i.id);
    const c = i && best('category', i.sub || '');
    const o = op(opId);
    const rCard = a || c;
    return {
      rate: (a && a.rate) || (c && c.rate) || (o && o.rate) || 0,
      rateUnit: (rCard && rCard.rateUnit) || (o && o.rateUnit) || 'pair',
      piecesPerPair: (rCard && rCard.piecesPerPair) || (o && o.piecesPerPair) || 1
    };
  };
  E.opRate = (opId, itemId, date) => E.opRateInfo(opId, itemId, date).rate;

  function convertQty(packs, pairsPerPack, rateUnit, piecesPerPair) {
    if (rateUnit === 'pair') return r3(packs * pairsPerPack);
    if (rateUnit === 'piece') return r3(packs * pairsPerPack * (piecesPerPair || 1));
    return packs;
  }

  E.empOpts = () => E.rows('employees').filter(e => e.active).sort((a, b) => a.code.localeCompare(b.code)).map(e => `<option value="${E.esc(elabel(e))}" data-k="${E.esc(e.name + ' ' + e.code + ' ' + (e.nic || ''))}">`).join('');
  const empFind = t => {
    t = (t || '').trim().toLowerCase();
    return E.rows('employees').find(e => elabel(e).toLowerCase() === t || e.code.toLowerCase() === t);
  };

  /* ═══════════════════════════════════════════════════════════════
     MAIN PAGE
     ═══════════════════════════════════════════════════════════════ */
  E.route('production', 'Daily Production', () => {
    const missing = getMissingDays();
    const TABS = [
      ['sheet', '📅 Daily Sheet'],
      ['log', '📝 Production Log'],
      ['batch', '📦 Batches'],
      ['prog', '🧭 Job Progress'],
      ['ops', '⚙️ Operations & rates'],
      ['cons', '🧪 Consumables'],
      ['sum', '📊 Summary']
    ];
    const reminderBanner = missing.length ? `
      <div class="card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:4px solid #d97706;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
          <div>
            <b style="font-size:15px;color:#92400e;">⚠ ${missing.length} unrecorded working day${missing.length > 1 ? 's' : ''}</b>
            <div style="font-size:12px;color:#78350f;margin-top:4px;">${missing.map(m => m.date + (m.hasWorkers ? ' (workers logged, materials missing)' : '')).join(' · ')}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${missing.slice(0, 3).map(m => `<button class="btn sm p" data-a="dsOpenDate" data-id="${m.date}">${m.date}</button>`).join('')}
          </div>
        </div>
      </div>` : '';

    return `<div class="kp">
      ${E.kpi('Packs today', live().filter(l => l.date === E.today()).reduce((s, l) => s + l.qty, 0), 'across all operations')}
      ${E.kpi('Labor today', E.m(live().filter(l => l.date === E.today()).reduce((s, l) => s + l.amount, 0)), 'piece wages')}
      ${E.kpi('Materials today', E.m(E.rows('issues').filter(i => i.date === E.today()).reduce((s, i) => s + i.value, 0)), 'from BOM + manual')}
      ${E.kpi('Released today', E.m(E.rows('stockMoves').filter(m => m.type === 'release' && m.date === E.today()).reduce((s, m) => s + m.value, 0)), 'to FG stock')}
    </div>
    ${reminderBanner}
    <div class="bar">
      ${TABS.map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="prTab" data-id="${k}">${l}</button>`).join('')}
    </div>
    <div id="prb">${body()}</div>`;
  });
  E.A.prTab = t => { F.tab = t; E.go(); };
  E.A.dsOpenDate = d => { F.tab = 'sheet'; F.date = d; E.go(); };

  const body = () => F.tab === 'sheet' ? dailySheet() : F.tab === 'log' ? logTab() : F.tab === 'batch' ? matTab() : F.tab === 'prog' ? progTab() : F.tab === 'ops' ? opsTab() : F.tab === 'cons' ? consTab() : sumTab();

  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f === 'ds.date') { F.date = t.value; E.go(); return; }
    if (f && f.startsWith('pr.')) { F[f.slice(3)] = t.value; E.$('prb').innerHTML = body(); return; }
    /* Rate + amount live compute in daily sheet */
    const r = t.closest && t.closest('.ds-w');
    if (r) {
      const c = r.children;
      if (t === c[1]) { /* job changed → update article list */
        const j = t.value;
        c[2].innerHTML = '<option value="">— article —</option>' + (j ? jl(j).map(l => `<option value="${l.id}">${E.esc(l.code)} · target ${l.target}</option>`).join('') : '');
      }
      if (t === c[1] || t === c[2] || t === c[3]) {
        const line = E.D.jobLines.find(x => x.id === c[2].value);
        if (line && c[3].value && !c[5].dataset.man) {
          const info = E.opRateInfo(c[3].value, line.itemId, E.val('ds_date'));
          c[5].value = (info.rate / 100) || '';
        }
      }
      if (t === c[5]) c[5].dataset.man = '1';
      const q = parseFloat(c[4].value) || 0, rt = E.c(c[5].value);
      const line = E.D.jobLines.find(x => x.id === c[2].value);
      if (line && c[3].value) {
        const info = E.opRateInfo(c[3].value, line.itemId, E.val('ds_date'));
        const item = it(line.itemId);
        const pp = (item && item.pack) || 1;
        const conv = convertQty(q, pp, info.rateUnit, info.piecesPerPair);
        c[6].value = q && rt ? E.m(Math.round(conv * rt)) : '';
        c[6].title = q && rt ? `${q} packs × ${pp} pairs = ${conv} ${info.rateUnit} × ${E.m(rt)}` : '';
      } else c[6].value = '';
      dsTotals();
    }
    /* Material row change */
    const mr = t.closest && t.closest('.ds-m');
    if (mr) dsTotals();
    /* Release row change */
    const rr = t.closest && t.closest('.ds-r');
    if (rr) dsTotals();
  });

  /* ═══════════════════════════════════════════════════════════════
     DAILY SHEET
     ═══════════════════════════════════════════════════════════════ */
  function dailySheet() {
    const d = F.date || E.today();
    const dp = E.rows('dailyProduction').find(r => r.date === d);
    const locked = dp && dp.status === 'posted';
    const holiday = isHoliday(d);
    const status = dp ? dp.status : (holiday ? 'auto-holiday' : 'draft');

    const existing = dp || {};
    const workers = existing.workers || [];
    const materials = existing.materials || [];
    const releases = existing.releases || [];
    const notes = existing.notes || '';

    const statusBadge = {
      posted: '<span class="tag" style="background:#d1fae5;color:#065f46">✓ POSTED</span>',
      draft: '<span class="tag" style="background:#fef3c7;color:#92400e">📝 DRAFT</span>',
      skipped: '<span class="tag" style="background:#e0e7ff;color:#3730a3">⏭ SKIPPED</span>',
      holiday: '<span class="tag" style="background:#ede9fe;color:#5b21b6">🏖 HOLIDAY</span>',
      'auto-holiday': '<span class="tag" style="background:#ede9fe;color:#5b21b6">🏖 SUNDAY (auto)</span>'
    }[status] || '';

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <h3 style="margin:0">📅 Daily Production Sheet ${statusBadge}</h3>
          <p class="muted" style="margin:6px 0 0;font-size:12px">Fill in workers + materials + releases → post everything in one go.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="date" class="fs" data-f="ds.date" value="${d}" ${locked ? 'disabled' : ''}>
          ${!locked && status !== 'holiday' && status !== 'skipped' && status !== 'auto-holiday' ? `
            <button class="btn sm" data-a="dsMarkHoliday">🏖 Holiday</button>
            <button class="btn sm" data-a="dsSkip">⏭ Skip</button>
          ` : ''}
          ${status === 'skipped' || status === 'holiday' || status === 'auto-holiday' ? `
            <button class="btn sm" data-a="dsUnskip">↩ Undo Skip</button>
          ` : ''}
        </div>
      </div>

      ${locked ? '<p class="ok" style="margin-bottom:12px"><b>✓ This day is posted and locked.</b> To change, cancel the daily production below first.</p>' : ''}

      <!-- ═══════════════════════════════════════════════════════
           SECTION 1 — WORKERS & OPERATIONS
           ═══════════════════════════════════════════════════════ -->
      <div style="border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <b style="font-size:15px">👷 Workers & Operations</b>
          <span class="muted" style="font-size:12px">Rate auto-fills from rate card · amount converts to pairs/pieces</span>
        </div>
        <datalist id="pe">${E.empOpts()}</datalist>
        <div id="ds_w_list">
          ${(workers.length ? workers : [null, null]).map((w, i) => workerRow(w, i, locked)).join('')}
        </div>
        ${!locked ? `<button class="btn sm" data-a="dsAddWorker" style="margin-top:8px">+ Add worker row</button>` : ''}
        <div class="tot" style="margin-top:10px"><span>Worker labor total</span><b id="ds_w_tot">${E.m(S(workers, w => w.amount || 0))}</b></div>
      </div>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2 — MATERIALS USED
           ═══════════════════════════════════════════════════════ -->
      <div style="border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <b style="font-size:15px">📦 Materials Used</b>
          ${!locked ? `<button class="btn sm" data-a="dsSuggestBom">🤖 Auto-fill from BOM × packs</button>` : ''}
        </div>
        <p class="muted" style="font-size:12px;margin-bottom:10px">Add materials actually used today. Auto-fill estimates from BOM × packs above; edit as needed for accuracy.</p>
        <div id="ds_m_list">
          ${(materials.length ? materials : []).map((m, i) => materialRow(m, i, locked)).join('') || '<p class="muted" style="padding:12px;text-align:center;font-size:12px">No materials added. Add manually or auto-fill from BOM.</p>'}
        </div>
        ${!locked ? `<button class="btn sm" data-a="dsAddMaterial" style="margin-top:8px">+ Add material manually</button>` : ''}
        <div class="tot" style="margin-top:10px"><span>Material cost total</span><b id="ds_m_tot">${E.m(S(materials, m => m.value || 0))}</b></div>
      </div>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3 — FINISHED GOODS RELEASED
           ═══════════════════════════════════════════════════════ -->
      <div style="border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <b style="font-size:15px">✅ Finished Goods Released (optional)</b>
          <span class="muted" style="font-size:12px">Moves WIP → Finished Goods stock</span>
        </div>
        <div id="ds_r_list">
          ${(releases.length ? releases : []).map((r, i) => releaseRow(r, i, locked)).join('') || '<p class="muted" style="padding:12px;text-align:center;font-size:12px">No releases today. Add if you finished any packs.</p>'}
        </div>
        ${!locked ? `<button class="btn sm" data-a="dsAddRelease" style="margin-top:8px">+ Add release</button>` : ''}
        <div class="tot" style="margin-top:10px"><span>Released value</span><b id="ds_r_tot">${E.m(S(releases, r => r.value || 0))}</b></div>
      </div>

      <!-- ═══════════════════════════════════════════════════════
           NOTES
           ═══════════════════════════════════════════════════════ -->
      <div class="f">Notes for the day
        <input id="ds_notes" value="${E.esc(notes)}" placeholder="Optional remarks" ${locked ? 'disabled' : ''}>
      </div>

      <!-- ═══════════════════════════════════════════════════════
           TOTALS + ACTIONS
           ═══════════════════════════════════════════════════════ -->
      <div class="card" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;padding:20px;margin-top:14px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          <div><small style="opacity:.85">Labor</small><div style="font-size:20px;font-weight:800" id="ds_sum_labor">${E.m(S(workers, w => w.amount || 0))}</div></div>
          <div><small style="opacity:.85">Materials</small><div style="font-size:20px;font-weight:800" id="ds_sum_mat">${E.m(S(materials, m => m.value || 0))}</div></div>
          <div><small style="opacity:.85">Released</small><div style="font-size:20px;font-weight:800" id="ds_sum_rel">${E.m(S(releases, r => r.value || 0))}</div></div>
          <div><small style="opacity:.85">Total cost</small><div style="font-size:24px;font-weight:900" id="ds_sum_tot">${E.m(S(workers, w => w.amount || 0) + S(materials, m => m.value || 0))}</div></div>
        </div>
      </div>

      ${!locked ? `
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button class="btn" data-a="dsSaveDraft">💾 Save Draft</button>
          ${dp && dp.status === 'posted' ? '' : ''}
          <button class="btn p" data-a="dsPostAll" style="padding:12px 24px;font-weight:800">✔ Post Everything</button>
        </div>
      ` : `
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button class="btn d" data-a="dsUnpost">↩ Cancel Posting</button>
        </div>
      `}
    </div>`;
  }

  /* ── Worker row ── */
  function workerRow(w, i, locked) {
    w = w || {};
    return `<div class="jl ds-w" style="grid-template-columns:1.6fr 1.2fr 1.6fr 1.4fr .7fr .8fr 1fr 30px">
      <input list="pe" placeholder="Worker" value="${E.esc(w.empName || '')}" ${locked ? 'disabled' : ''}>
      <select ${locked ? 'disabled' : ''}>
        <option value="">— job —</option>
        ${active().map(j => `<option value="${j.id}" ${w.jobId === j.id ? 'selected' : ''}>${E.esc(j.no)}</option>`).join('')}
      </select>
      <select ${locked ? 'disabled' : ''}>
        <option value="">— article —</option>
        ${w.jobId ? jl(w.jobId).map(l => `<option value="${l.id}" ${w.lineId === l.id ? 'selected' : ''}>${E.esc(l.code)}</option>`).join('') : ''}
      </select>
      <select ${locked ? 'disabled' : ''}>
        <option value="">— op —</option>
        ${ops().map(o => `<option value="${o.id}" ${w.opId === o.id ? 'selected' : ''}>${E.esc(o.name)}</option>`).join('')}
      </select>
      <input type="number" step="1" min="0" placeholder="Packs" value="${w.qty || ''}" ${locked ? 'disabled' : ''}>
      <input type="number" step="0.01" placeholder="Rate" value="${w.rate ? (w.rate / 100).toFixed(2) : ''}" ${locked ? 'disabled' : ''}>
      <input readonly placeholder="Amount" value="${w.amount ? E.m(w.amount) : ''}">
      ${!locked ? '<button class="btn sm d" data-a="dsRmWorker" data-id="' + i + '">✕</button>' : '<span></span>'}
    </div>`;
  }

  /* ── Material row ── */
  function materialRow(m, i, locked) {
    m = m || {};
    return `<div class="jl ds-m" style="grid-template-columns:2fr 1fr .7fr .9fr .9fr 30px">
      <input placeholder="Material code / name" value="${E.esc(m.name || m.code || '')}" ${locked ? 'disabled' : ''}>
      <input placeholder="Job (optional)" value="${E.esc(m.jobNo || '')}" ${locked ? 'disabled' : ''}>
      <input type="number" step="0.001" placeholder="Qty" value="${m.qty || ''}" ${locked ? 'disabled' : ''}>
      <input readonly placeholder="Avg cost" value="${m.avgCost ? E.m(m.avgCost) : ''}">
      <input readonly placeholder="Value" value="${m.value ? E.m(m.value) : ''}">
      ${!locked ? '<button class="btn sm d" data-a="dsRmMaterial" data-id="' + i + '">✕</button>' : '<span></span>'}
    </div>`;
  }

  /* ── Release row ── */
  function releaseRow(r, i, locked) {
    r = r || {};
    return `<div class="jl ds-r" style="grid-template-columns:1.5fr 1.8fr .7fr 1fr 30px">
      <select ${locked ? 'disabled' : ''}>
        <option value="">— job —</option>
        ${active().map(j => `<option value="${j.id}" ${r.jobId === j.id ? 'selected' : ''}>${E.esc(j.no)}</option>`).join('')}
      </select>
      <select ${locked ? 'disabled' : ''}>
        <option value="">— article —</option>
        ${r.jobId ? jl(r.jobId).filter(l => l.released < l.target).map(l => `<option value="${l.id}" ${r.lineId === l.id ? 'selected' : ''}>${E.esc(l.code)} · ${l.released}/${l.target}</option>`).join('') : ''}
      </select>
      <input type="number" step="1" min="0" placeholder="Packs" value="${r.qty || ''}" ${locked ? 'disabled' : ''}>
      <input readonly placeholder="Value" value="${r.value ? E.m(r.value) : ''}">
      ${!locked ? '<button class="btn sm d" data-a="dsRmRelease" data-id="' + i + '">✕</button>' : '<span></span>'}
    </div>`;
  }

  /* ── Live totals ── */
  function dsTotals() {
    let labor = 0, mat = 0, rel = 0;
    document.querySelectorAll('.ds-w').forEach(r => { const v = r.children[6].value || ''; labor += E.c(v.replace(/[^0-9.]/g, '')); });
    document.querySelectorAll('.ds-m').forEach(r => { const v = r.children[4].value || ''; mat += E.c(v.replace(/[^0-9.]/g, '')); });
    document.querySelectorAll('.ds-r').forEach(r => { const v = r.children[3].value || ''; rel += E.c(v.replace(/[^0-9.]/g, '')); });
    if (E.$('ds_w_tot')) E.$('ds_w_tot').textContent = E.m(labor);
    if (E.$('ds_m_tot')) E.$('ds_m_tot').textContent = E.m(mat);
    if (E.$('ds_r_tot')) E.$('ds_r_tot').textContent = E.m(rel);
    if (E.$('ds_sum_labor')) E.$('ds_sum_labor').textContent = E.m(labor);
    if (E.$('ds_sum_mat')) E.$('ds_sum_mat').textContent = E.m(mat);
    if (E.$('ds_sum_rel')) E.$('ds_sum_rel').textContent = E.m(rel);
    if (E.$('ds_sum_tot')) E.$('ds_sum_tot').textContent = E.m(labor + mat);
  }

  /* ── Read current DOM state into objects ── */
  function readWorkers() {
    const out = [];
    document.querySelectorAll('.ds-w').forEach(r => {
      const c = r.children;
      const empName = (c[0].value || '').trim();
      const e = empFind(empName);
      const jobId = c[1].value;
      const lineId = c[2].value;
      const opId = c[3].value;
      const qty = parseInt(c[4].value) || 0;
      const rate = E.c(c[5].value);
      if (!e && !jobId && !lineId && !opId && !qty) return;
      const line = E.D.jobLines.find(x => x.id === lineId);
      const operation = op(opId);
      const item = line && it(line.itemId);
      const info = (line && operation) ? E.opRateInfo(opId, line.itemId, F.date) : { rateUnit: 'pair', piecesPerPair: 1 };
      const pp = (item && item.pack) || 1;
      const convertedQty = (line && operation) ? convertQty(qty, pp, info.rateUnit, info.piecesPerPair) : 0;
      const amount = Math.round(convertedQty * rate);
      out.push({
        empId: e ? e.id : '', empName: e ? e.name : empName,
        jobId, jobNo: J(jobId) ? J(jobId).no : '',
        lineId, code: line ? line.code : '',
        itemId: line ? line.itemId : '', variantId: line ? line.variantId : '',
        opId, opName: operation ? operation.name : '',
        qty, rate, rateUnit: info.rateUnit, piecesPerPair: info.piecesPerPair,
        pairsPerPack: pp, convertedQty, amount
      });
    });
    return out;
  }

  function readMaterials() {
    const out = [];
    document.querySelectorAll('.ds-m').forEach(r => {
      const c = r.children;
      const nameOrCode = (c[0].value || '').trim();
      const jobNo = (c[1].value || '').trim();
      const qty = parseFloat(c[2].value) || 0;
      if (!nameOrCode && !qty) return;
      const item = E.D.items.find(x => x.art === nameOrCode.toUpperCase() || x.name.toLowerCase() === nameOrCode.toLowerCase());
      const job = jobNo ? E.rows('jobs').find(j => j.no === jobNo) : null;
      const stock = item ? E.stock(item.id, '') : { qty: 0, value: 0 };
      const avgCost = stock.qty > 0 ? Math.round(stock.value / stock.qty) : (item ? (item.buyPrice || 0) : 0);
      out.push({
        itemId: item ? item.id : '', code: item ? item.art : nameOrCode, name: item ? item.name : nameOrCode,
        variantId: '', qty, avgCost, value: Math.round(qty * avgCost),
        jobId: job ? job.id : '', jobNo: job ? job.no : jobNo
      });
    });
    return out;
  }

  function readReleases() {
    const out = [];
    document.querySelectorAll('.ds-r').forEach(r => {
      const c = r.children;
      const jobId = c[0].value;
      const lineId = c[1].value;
      const qty = parseInt(c[2].value) || 0;
      if (!jobId && !lineId && !qty) return;
      const line = E.D.jobLines.find(x => x.id === lineId);
      const item = line && it(line.itemId);
      out.push({
        jobId, jobNo: J(jobId) ? J(jobId).no : '',
        lineId, code: line ? line.code : '',
        itemId: line ? line.itemId : '', variantId: line ? line.variantId : '',
        qty, value: 0 /* computed at post time */,
        pairsPerPack: (item && item.pack) || 1
      });
    });
    return out;
  }

  /* ── Add / remove row actions ── */
  E.A.dsAddWorker = () => { E.$('ds_w_list').insertAdjacentHTML('beforeend', workerRow(null, Date.now(), false)); };
  E.A.dsAddMaterial = () => { E.$('ds_m_list').insertAdjacentHTML('beforeend', materialRow(null, Date.now(), false)); dsTotals(); };
  E.A.dsAddRelease = () => { E.$('ds_r_list').insertAdjacentHTML('beforeend', releaseRow(null, Date.now(), false)); dsTotals(); };
  E.A.dsRmWorker = (_, e) => { e.target.closest('.ds-w').remove(); dsTotals(); };
  E.A.dsRmMaterial = (_, e) => { e.target.closest('.ds-m').remove(); dsTotals(); };
  E.A.dsRmRelease = (_, e) => { e.target.closest('.ds-r').remove(); dsTotals(); };

  /* ── Auto-fill materials from BOM ── */
  E.A.dsSuggestBom = () => {
    const workers = readWorkers();
    if (!workers.length) return E.toast('Add worker rows first so I can estimate materials', 'error');

    /* Aggregate packs per SKU (taking max, since operations on same packs shouldn't double count) */
    const packsBySku = {};
    workers.forEach(w => {
      if (!w.itemId || !w.qty) return;
      const k = w.itemId + '|' + (w.variantId || '');
      if (!packsBySku[k] || w.qty > packsBySku[k]) packsBySku[k] = w.qty;
    });

    /* Compute material totals from BOM */
    const mats = {};
    for (const k in packsBySku) {
      const [itemId, variantId] = k.split('|');
      const item = it(itemId);
      if (!item || !item.bom) continue;
      const packs = packsBySku[k];
      item.bom.forEach(b => {
        const matItem = it(b.itemId);
        if (matItem && matItem.consumable && matItem.consumableMode !== 'bom') return; /* weight/bottle handled separately */
        const bk = b.itemId + '|' + (b.variantId || '');
        if (!mats[bk]) {
          const sku = E.skuList().find(s => s.itemId === b.itemId && s.variantId === (b.variantId || ''));
          mats[bk] = { itemId: b.itemId, variantId: b.variantId || '', code: sku ? sku.code : '?', name: sku ? sku.name : '', qty: 0 };
        }
        mats[bk].qty = r3(mats[bk].qty + b.qty * packs);
      });
    }

    /* Append to material list (or replace if empty) */
    const list = E.$('ds_m_list');
    const emptyMsg = list.querySelector('p.muted');
    if (emptyMsg) list.innerHTML = '';

    for (const bk in mats) {
      const m = mats[bk];
      const stock = E.stock(m.itemId, m.variantId);
      const avgCost = stock.qty > 0 ? Math.round(stock.value / stock.qty) : (it(m.itemId)?.buyPrice || 0);
      const value = Math.round(m.qty * avgCost);
      list.insertAdjacentHTML('beforeend', `<div class="jl ds-m" style="grid-template-columns:2fr 1fr .7fr .9fr .9fr 30px">
        <input placeholder="Material" value="${E.esc(m.code)}" data-id="${m.itemId}">
        <input placeholder="Job" value="">
        <input type="number" step="0.001" value="${m.qty}">
        <input readonly value="${E.m(avgCost)}">
        <input readonly value="${E.m(value)}">
        <button class="btn sm d" data-a="dsRmMaterial" data-id="auto">✕</button>
      </div>`);
    }
    dsTotals();
    E.toast(Object.keys(mats).length + ' materials estimated from BOM × packs', 'success');
  };

  /* ── Save draft ── */
  E.A.dsSaveDraft = async () => {
    try {
      const workers = readWorkers();
      const materials = readMaterials();
      const releases = readReleases();
      const notes = E.val('ds_notes');
      const existing = E.rows('dailyProduction').find(r => r.date === F.date);
      if (existing && existing.status === 'posted') throw new Error('Day already posted');
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      const rec = {
        date: F.date, status: 'draft',
        workers, materials, releases, notes,
        updatedAt: new Date().toISOString(), updatedBy: E.user || ''
      };
      if (existing) {
        Object.assign(existing, rec);
        await E.save('dailyProduction', existing, b);
      } else {
        await E.save('dailyProduction', rec);
      }
      E.go(); E.toast('Draft saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── POST EVERYTHING ── */
  E.A.dsPostAll = async () => {
    try {
      const workers = readWorkers();
      const materials = readMaterials();
      const releases = readReleases();
      const notes = E.val('ds_notes');
      const d = F.date;

      /* Validations */
      workers.forEach((w, i) => {
        const n = 'Worker row ' + (i + 1) + ': ';
        if (!w.empId) throw new Error(n + 'choose a worker');
        if (!w.jobId) throw new Error(n + 'choose a job');
        if (!w.lineId) throw new Error(n + 'choose an article');
        if (!w.opId) throw new Error(n + 'choose an operation');
        if (!(w.qty > 0)) throw new Error(n + 'enter packs');
        if (!(w.rate > 0)) throw new Error(n + 'rate not set for ' + w.opName);
      });
      materials.forEach((m, i) => {
        if (!m.itemId) throw new Error('Material row ' + (i + 1) + ': unknown material "' + m.code + '"');
        if (!(m.qty > 0)) throw new Error('Material row ' + (i + 1) + ': enter qty');
        if (E.stock(m.itemId, m.variantId).qty + 1e-9 < m.qty) {
          throw new Error('Material row ' + (i + 1) + ': not enough stock (' + E.stock(m.itemId, m.variantId).qty + ')');
        }
      });
      releases.forEach((r, i) => {
        if (!r.jobId || !r.lineId || !(r.qty > 0)) throw new Error('Release row ' + (i + 1) + ': fill all fields');
        const line = E.D.jobLines.find(x => x.id === r.lineId);
        const remaining = line.target - line.released;
        if (r.qty > remaining) throw new Error('Release row ' + (i + 1) + ': max ' + remaining + ' packs (target ' + line.target + ', released ' + line.released + ')');
      });
      if (!workers.length && !materials.length && !releases.length) throw new Error('Nothing to post — add at least one row');

      const totalLabor = workers.reduce((s, w) => s + w.amount, 0);
      const totalMaterial = materials.reduce((s, m) => s + m.value, 0);
      const batchNo = await E.next('DAY');
      const posted = { workers: 0, materials: 0, releases: 0 };

      /* ── Post WORKERS ── */
      if (workers.length) {
        const lines = [];
        workers.forEach(w => lines.push({ acc: '1310', dr: w.amount, job: w.jobId, cat: 'Labour', art: w.lineId, head: '5110' }));
        lines.push({ acc: '2210', cr: totalLabor });
        const je = await E.post({ date: d, ref: batchNo + '-W', narr: 'Daily labor · ' + d, source: 'production', lines });
        let k = 0;
        for (const w of workers) {
          await E.save('prodLogs', {
            no: batchNo + '-W-' + (++k), batch: batchNo, date: d,
            empId: w.empId, jobId: w.jobId, lineId: w.lineId,
            itemId: w.itemId, variantId: w.variantId, code: w.code,
            opId: w.opId, opName: w.opName,
            qty: w.qty, pairsPerPack: w.pairsPerPack,
            rateUnit: w.rateUnit, piecesPerPair: w.piecesPerPair,
            convertedQty: w.convertedQty, rate: w.rate, amount: w.amount,
            status: 'accrued', jeId: je.id, jeNo: je.no, runId: '', runNo: ''
          });
          posted.workers++;
        }
      }

      /* ── Post MATERIALS ── */
      if (materials.length) {
        const lines = [];
        for (const m of materials) {
          /* Attribute to job if given, else factory overhead */
          if (m.jobId) {
            lines.push({ acc: '1310', dr: m.value, job: m.jobId, cat: 'Material', head: '5000' });
          } else {
            lines.push({ acc: '5270', dr: m.value }); /* factory overhead pool */
          }
          await E.stockOut({ date: d, itemId: m.itemId, variantId: m.variantId, qty: m.qty, type: 'issue', ref: batchNo + '-M', job: m.jobId });
          await E.save('issues', {
            no: batchNo + '-M', date: d, jobId: m.jobId || '',
            itemId: m.itemId, variantId: m.variantId, code: m.code,
            qty: m.qty, value: m.value, art: '', batch: true
          });
          posted.materials++;
        }
        lines.push({ acc: '1300', cr: totalMaterial });
        await E.post({ date: d, ref: batchNo + '-M', narr: 'Daily materials · ' + d, source: 'issue', lines });
      }

      /* ── Post RELEASES ── */
      if (releases.length) {
        /* Compute release values proportionally from job WIP */
        const byJob = {};
        releases.forEach(r => { byJob[r.jobId] = (byJob[r.jobId] || 0) + r.qty; });
        const lines = [];
        let totalReleaseVal = 0;
        for (const jobId in byJob) {
          const job = J(jobId);
          const wip = live().filter(l => l.jobId === jobId && l.opId).reduce((s, l) => 0, 0); /* placeholder */
          /* Get actual WIP from journal */
          const wipBal = E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.job === jobId && l.acc === '1310')).reduce((s, l) => s + l.dr - l.cr, 0);
          const jobLines = jl(jobId);
          const totalTarget = jobLines.reduce((s, l) => s + (l.target - l.released), 0) || 1;
          const jobQty = byJob[jobId];
          const batchVal = Math.round(wipBal * jobQty / totalTarget);
          const jobReleases = releases.filter(r => r.jobId === jobId);
          let left = batchVal;
          jobReleases.forEach((r, i) => {
            const v = i === jobReleases.length - 1 ? left : Math.round(batchVal * r.qty / jobQty);
            left -= v;
            r.value = v;
            totalReleaseVal += v;
            lines.push({ acc: '1320', dr: v, job: jobId, cat: 'Release', art: r.lineId });
            /* Update jobLine */
            const line = E.D.jobLines.find(x => x.id === r.lineId);
            if (line) {
              const b = JSON.parse(JSON.stringify(line));
              line.released = (line.released || 0) + r.qty;
              line.fgValue = (line.fgValue || 0) + v;
              E.save('jobLines', line, b);
            }
            E.stockIn({ date: d, itemId: r.itemId, variantId: r.variantId, qty: r.qty, value: v, type: 'release', ref: batchNo + '-R', job: jobId });
            posted.releases++;
          });
        }
        lines.push({ acc: '1310', cr: totalReleaseVal });
        await E.post({ date: d, ref: batchNo + '-R', narr: 'Daily FG release · ' + d, source: 'release', lines });
      }

      /* ── Save daily production record ── */
      const existing = E.rows('dailyProduction').find(r => r.date === d);
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      const rec = {
        date: d, status: 'posted',
        batchNo, workers, materials, releases, notes,
        postedAt: new Date().toISOString(), postedBy: E.user || '',
        totals: { labor: totalLabor, materials: totalMaterial }
      };
      if (existing) { Object.assign(existing, rec); await E.save('dailyProduction', existing, b); }
      else await E.save('dailyProduction', rec);

      E.go();
      E.toast(`✓ Posted ${posted.workers} worker(s), ${posted.materials} material(s), ${posted.releases} release(s)`, 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── Mark holiday / skip / undo ── */
  E.A.dsMarkHoliday = async () => {
    try {
      const d = F.date;
      const existing = E.rows('dailyProduction').find(r => r.date === d);
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      if (existing) { existing.status = 'holiday'; await E.save('dailyProduction', existing, b); }
      else await E.save('dailyProduction', { date: d, status: 'holiday', workers: [], materials: [], releases: [], notes: 'Marked as holiday' });
      /* Also add to custom holidays list */
      const holidays = E.setting('holidays') || [];
      if (!holidays.includes(d)) {
        holidays.push(d);
        await E.setSetting({ holidays });
      }
      E.go(); E.toast('Marked as holiday', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.dsSkip = async () => {
    try {
      const d = F.date;
      const existing = E.rows('dailyProduction').find(r => r.date === d);
      const b = existing ? JSON.parse(JSON.stringify(existing)) : null;
      if (existing) { existing.status = 'skipped'; await E.save('dailyProduction', existing, b); }
      else await E.save('dailyProduction', { date: d, status: 'skipped', workers: [], materials: [], releases: [], notes: 'Skipped' });
      E.go(); E.toast('Day skipped', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.dsUnskip = async () => {
    try {
      const d = F.date;
      const existing = E.rows('dailyProduction').find(r => r.date === d);
      if (existing && existing.status !== 'posted') {
        await E.del('dailyProduction', existing.id);
      }
      const holidays = (E.setting('holidays') || []).filter(x => x !== d);
      await E.setSetting({ holidays });
      E.go(); E.toast('Unskipped', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.dsUnpost = async () => {
    try {
      if (!confirm('Cancel the posting for ' + F.date + '? This will reverse all journal entries created that day.')) return;
      const dp = E.rows('dailyProduction').find(r => r.date === F.date);
      if (!dp || dp.status !== 'posted') throw new Error('Day is not posted');
      /* Reverse all JEs with matching batch prefix */
      const batchNo = dp.batchNo;
      const allJE = E.rows('journalEntries').filter(j => j.ref && j.ref.startsWith(batchNo));
      for (const je of allJE) {
        if (!je.reversedBy) await E.reverse(je.id);
      }
      /* Reverse prodLogs */
      for (const l of logs().filter(x => x.date === F.date && x.batch === batchNo && x.status === 'accrued')) {
        const b = JSON.parse(JSON.stringify(l));
        l.status = 'cancelled';
        await E.save('prodLogs', l, b);
      }
      /* Reverse stock moves */
      for (const m of E.rows('stockMoves').filter(x => x.date === F.date && x.ref && x.ref.startsWith(batchNo))) {
        await E.put('stockMoves', Object.assign({}, m, { id: E.uid(), qty: -m.qty, value: -m.value, type: 'reverse' }));
      }
      /* Reset day to draft */
      const b = JSON.parse(JSON.stringify(dp));
      dp.status = 'draft';
      await E.save('dailyProduction', dp, b);
      E.go(); E.toast('Posting reversed — day is back to draft', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ═══════════════════════════════════════════════════════════════
     TAB 2 — PRODUCTION LOG (existing view)
     ═══════════════════════════════════════════════════════════════ */
  function logTab() {
    const rows = live().concat(logs().filter(l => l.status === 'cancelled'))
      .filter(l => l.date === F.date && (!F.job || l.jobId === F.job) && (!F.emp || l.empId === F.emp))
      .sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="bar">
      <span class="muted">Showing</span>
      <input type="date" class="fs" data-f="pr.date" value="${F.date}">
      <select class="fs" data-f="pr.job"><option value="">All jobs</option>${E.rows('jobs').map(j => `<option value="${j.id}" ${F.job === j.id ? 'selected' : ''}>${j.no}</option>`).join('')}</select>
      <select class="fs" data-f="pr.emp"><option value="">All workers</option>${E.rows('employees').map(e => `<option value="${e.id}" ${F.emp === e.id ? 'selected' : ''}>${E.esc(e.name)}</option>`).join('')}</select>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Worker</th><th>Job</th><th>Article</th><th>Operation</th><th class="r">Packs</th><th class="r">Converted</th><th class="r">Rate</th><th class="r">Amount</th><th>Status</th></tr></thead>
      <tbody>${rows.map(l => `<tr style="${l.status === 'cancelled' ? 'opacity:.45' : ''}">
        <td>${l.no}</td>
        <td>${E.esc((emp(l.empId) || {}).name)}</td>
        <td>${E.esc((J(l.jobId) || {}).no)}</td>
        <td><b>${E.esc(l.code)}</b></td>
        <td>${E.esc(l.opName)}</td>
        <td class="r">${l.qty}</td>
        <td class="r muted">${l.convertedQty != null ? l.convertedQty : l.qty} ${l.rateUnit || 'pack'}</td>
        <td class="r">${E.m(l.rate)}</td>
        <td class="r"><b>${E.m(l.amount)}</b></td>
        <td><span class="tag">${l.status}</span></td>
      </tr>`).join('') || '<tr><td colspan="10" class="muted">No production for this selection</td></tr>'}</tbody>
    </table></div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     TAB 3-7 (existing tabs kept as-is)
     ═══════════════════════════════════════════════════════════════ */
  function matTab() {
    const jobs = active();
    if (!jobs.length) return '<div class="card muted">No job in progress.</div>';
    const batchIssues = E.rows('issues').filter(i => i.batch === true);
    const batchNos = [...new Set(batchIssues.map(b => b.no))].sort((a, b) => b.localeCompare(a));
    return `<div class="card">
      <h3>📦 Start Material Batch</h3>
      <p class="muted" style="margin-bottom:12px">Deducts all BOM materials for the packs you're starting. Live preview checks stock.</p>
      <div class="g2">
        <div class="f">Job *<select id="mb_job" onchange="E.A.mbJobChange()"><option value="">— select job —</option>${jobs.map(j => `<option value="${j.id}">${E.esc(j.no)}</option>`).join('')}</select></div>
        <div class="f">Article *<select id="mb_art" onchange="E.A.mbPreview()"><option value="">— select job first —</option></select></div>
      </div>
      <div class="g2">
        <div class="f">Packs *<input id="mb_qty" type="number" min="1" value="1" oninput="E.A.mbPreview()"></div>
        <div class="f">Date<input id="mb_date" type="date" value="${E.today()}"></div>
      </div>
      <div id="mb_preview"><p class="muted">Select job and article.</p></div>
      <button class="btn p" data-a="mbPost" id="mb_postBtn" style="margin-top:12px" disabled>📦 Deduct Materials</button>
    </div>`;
  }
  E.A.mbJobChange = () => {
    const jobId = E.val('mb_job');
    const lines = E.rows('jobLines').filter(l => l.jobId === jobId);
    const sel = E.$('mb_art');
    if (!sel) return;
    sel.innerHTML = '<option value="">— article —</option>' + (lines.length ? lines.map(l => `<option value="${l.id}">${E.esc(l.code)}</option>`).join('') : '');
    E.A.mbPreview();
  };
  E.A.mbPreview = () => {
    const qty = parseFloat(E.val('mb_qty')) || 0, lineId = E.val('mb_art');
    const box = E.$('mb_preview'), btn = E.$('mb_postBtn');
    if (!box) return;
    if (!lineId || qty <= 0) { box.innerHTML = '<p class="muted">Select article.</p>'; if (btn) btn.disabled = true; return; }
    const line = E.D.jobLines.find(l => l.id === lineId);
    const item = line && it(line.itemId);
    if (!item || !(item.bom || []).length) { box.innerHTML = '<p class="bad">Article has no BOM.</p>'; if (btn) btn.disabled = true; return; }
    const rows = item.bom.map(b => {
      const sku = E.skuList().find(s => s.itemId === b.itemId && s.variantId === (b.variantId || ''));
      const need = r3(b.qty * qty), st = E.stock(b.itemId, b.variantId);
      const avgCost = st.qty > 0 ? Math.round(st.value / st.qty) : 0;
      return { sku, need, stock: st.qty, avgCost, short: st.qty < need, value: Math.round(avgCost * need) };
    });
    const anyShort = rows.some(r => r.short);
    box.innerHTML = `<div class="tw"><table><thead><tr><th>Material</th><th class="r">Need</th><th class="r">Stock</th><th class="r">Value</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${E.esc(r.sku ? r.sku.code : '?')}</td><td class="r">${r.need}</td><td class="r">${r.stock}</td><td class="r">${E.m(r.value)}</td><td>${r.short ? '<span class="bad">Short</span>' : '<span class="ok">OK</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    if (btn) btn.disabled = anyShort;
  };
  E.A.mbPost = async () => {
    try {
      const jobId = E.val('mb_job'), lineId = E.val('mb_art'), qty = parseFloat(E.val('mb_qty')) || 0, date = E.val('mb_date');
      const line = E.D.jobLines.find(l => l.id === lineId);
      const item = line && it(line.itemId);
      if (!item || !item.bom) throw new Error('No BOM');
      const no = await E.next('BAT');
      let tot = 0;
      for (const b of item.bom) {
        const need = r3(b.qty * qty), st = E.stock(b.itemId, b.variantId);
        if (st.qty < need) throw new Error('Insufficient stock');
        const val = E.outValue(b.itemId, b.variantId, need);
        await E.stockOut({ date, itemId: b.itemId, variantId: b.variantId, qty: need, type: 'issue', ref: no, job: jobId });
        await E.save('issues', { no, date, jobId, itemId: b.itemId, variantId: b.variantId, qty: need, value: val, batch: true });
        tot += val;
      }
      await E.post({ date, ref: no, narr: 'Batch issue ' + line.code + ' ×' + qty, source: 'issue', lines: [{ acc: '1310', dr: tot, job: jobId, cat: 'Material', art: lineId, head: '5000' }, { acc: '1300', cr: tot }] });
      const bl = JSON.parse(JSON.stringify(line));
      line.started = (line.started || 0) + qty;
      await E.save('jobLines', line, bl);
      E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  function progTab() {
    const op2 = ops();
    return active().map(j => `<div class="card"><h3>${E.esc(j.no)} · ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock' }).name)}</h3><div class="tw"><table><thead><tr><th>Article</th><th class="r">Target</th>${op2.map(o => `<th class="r">${E.esc(o.name)}</th>`).join('')}<th class="r">Released</th></tr></thead><tbody>${jl(j.id).map(l => `<tr><td><b>${E.esc(l.code)}</b></td><td class="r">${l.target}</td>${op2.map(o => { const dn = live().filter(x => x.lineId === l.id && x.opId === o.id).reduce((s, x) => s + x.qty, 0), p = l.target ? Math.min(100, Math.round(dn * 100 / l.target)) : 0; return `<td class="r"><b>${dn}</b><div style="height:4px;background:var(--s2);border-radius:3px;margin-top:3px"><div style="height:4px;width:${p}%;background:${p >= 100 ? '#16a34a' : 'var(--ac)'};border-radius:3px"></div></div></td>`; }).join('')}<td class="r">${l.released}</td></tr>`).join('')}</tbody></table></div></div>`).join('') || '<div class="card muted">No jobs in progress.</div>';
  }

  function opsTab() {
    const STD = [['Cutting / Sole cutting'], ['Top (upper) making'], ['Sole preparation'], ['Sole fixing / pressing'], ['Buckle / strap fitting'], ['Finishing & cleaning'], ['Quality check'], ['Packing']];
    const cards = E.rows('rateCards').sort((a, b) => (b.from || '').localeCompare(a.from || ''));
    const RATE_UNIT_LABEL = { pair: 'per pair', pack: 'per pack', piece: 'per piece' };
    return `<div class="bar">
      <span class="muted">Each operation pays per pair (typical) or per pack/piece.</span>
      <span class="gap"></span>
      ${ops().length ? '' : '<button class="btn" data-a="opStd">Add standard operations</button>'}
      <button class="btn" data-a="rcNew">+ Rate override</button>
      <button class="btn p" data-a="opNew">+ Operation</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>#</th><th>Operation</th><th class="r">Rate</th><th>Unit</th><th>Status</th><th></th></tr></thead>
      <tbody>${E.rows('operations').sort((a, b) => (a.order || 0) - (b.order || 0)).map(o => `<tr style="${o.active === false ? 'opacity:.5' : ''}">
        <td>${o.order || ''}</td><td><b>${E.esc(o.name)}</b></td>
        <td class="r">${o.rate ? E.m(o.rate) : '<span class="bad">not set</span>'}</td>
        <td><span class="tag">${RATE_UNIT_LABEL[o.rateUnit || 'pair']}</span></td>
        <td>${o.active === false ? 'Inactive' : 'Active'}</td>
        <td class="r"><button class="btn sm" data-a="opEdit" data-id="${o.id}">Edit</button> <button class="btn sm" data-a="opTog" data-id="${o.id}">${o.active === false ? 'Activate' : 'Deactivate'}</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">None</td></tr>'}</tbody>
    </table></div>
    <div class="card"><h3>Rate overrides</h3><div class="tw"><table>
      <thead><tr><th>Operation</th><th>Applies to</th><th>From</th><th class="r">Rate</th><th></th></tr></thead>
      <tbody>${cards.map(c => `<tr><td>${E.esc((op(c.opId) || {}).name)}</td><td>${c.scope === 'article' ? 'Article <b>' + E.esc(((it(c.ref) || {}).art) || '?') + '</b>' : 'Category <b>' + E.esc(c.ref) + '</b>'}</td><td>${c.from || ''}</td><td class="r"><b>${E.m(c.rate)}</b></td><td class="r"><button class="btn sm d" data-a="rcDel" data-id="${c.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No overrides</td></tr>'}</tbody>
    </table></div></div>`;
  }

  E.A.opStd = async () => {
    let i = E.rows('operations').length;
    for (const [n] of STD) await E.save('operations', { code: 'OP' + String(++i).padStart(2, '0'), name: n, order: i, rate: 0, rateUnit: 'pair', piecesPerPair: 1, active: true });
    E.go(); E.toast('Added', 'success');
  };
  const opForm = id => {
    const o = id ? op(id) : null, ru = (o && o.rateUnit) || 'pair', pp = (o && o.piecesPerPair) || 1;
    E.modal(o ? 'Edit operation' : 'New operation', `
      <div class="g2">
        <div class="f">Operation name *<input id="o_n" value="${E.esc(o && o.name)}"></div>
        <div class="f">Order<input id="o_o" type="number" value="${(o && o.order) || ops().length + 1}"></div>
        <div class="f">Rate (Rs) *<input id="o_r" type="number" step="0.01" value="${o && o.rate ? o.rate / 100 : ''}"></div>
        <div class="f">Rate unit<select id="o_u"><option value="pair" ${ru === 'pair' ? 'selected' : ''}>Per PAIR</option><option value="pack" ${ru === 'pack' ? 'selected' : ''}>Per PACK</option><option value="piece" ${ru === 'piece' ? 'selected' : ''}>Per PIECE</option></select></div>
        <div class="f" id="o_pp_grp" style="${ru === 'piece' ? '' : 'display:none'}">Pieces per pair<input id="o_pp" type="number" min="1" value="${pp}"></div>
      </div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opSave" data-id="${id || ''}">Save</button>`);
    setTimeout(() => { const el = E.$('o_u'); if (el) el.onchange = () => { const g = E.$('o_pp_grp'); if (g) g.style.display = el.value === 'piece' ? '' : 'none'; }; }, 50);
  };
  E.A.opNew = () => opForm(); E.A.opEdit = id => opForm(id);
  E.A.opSave = async id => {
    const n = E.val('o_n'); if (!n) return E.toast('Name required', 'error');
    const o = id ? op(id) : { active: true, code: 'OP' + String(E.rows('operations').length + 1).padStart(2, '0') };
    const b = id ? JSON.parse(JSON.stringify(o)) : null;
    const ru = E.val('o_u') || 'pair';
    Object.assign(o, { name: n, order: parseInt(E.val('o_o')) || 0, rate: E.c(E.val('o_r')), rateUnit: ru, piecesPerPair: ru === 'piece' ? (parseInt(E.val('o_pp')) || 1) : 1 });
    await E.save('operations', o, b); E.closeM(); E.go();
  };
  E.A.opTog = async id => { const o = op(id), b = JSON.parse(JSON.stringify(o)); o.active = o.active === false; await E.save('operations', o, b); E.go(); };
  E.A.rcNew = () => {
    if (!ops().length) return E.toast('Add operations first', 'error');
    const subs = [...new Set(E.rows('items').filter(i => i.cat === 'Finished Good').map(i => i.sub).filter(Boolean))];
    E.modal('Rate override', `
      <div class="g2">
        <div class="f">Operation *<select id="rc_o">${ops().map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join('')}</select></div>
        <div class="f">Applies to *<select id="rc_s"><option value="category">Category</option><option value="article">Article</option></select></div>
        <div class="f">Category<select id="rc_c">${subs.map(s => `<option>${E.esc(s)}</option>`).join('')}</select></div>
        <div class="f">Or article<select id="rc_a">${E.rows('items').filter(i => i.cat === 'Finished Good').map(i => `<option value="${i.id}">${E.esc(i.art)}</option>`).join('')}</select></div>
        <div class="f">Rate (Rs) *<input id="rc_r" type="number" step="0.01"></div>
        <div class="f">Rate unit<select id="rc_u"><option value="">Inherit</option><option value="pair">Per pair</option><option value="pack">Per pack</option><option value="piece">Per piece</option></select></div>
        <div class="f">From date<input id="rc_f" type="date" value="${E.today()}"></div>
      </div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="rcSave">Save</button>`);
  };
  E.A.rcSave = async () => {
    const sc = E.val('rc_s'), r = E.c(E.val('rc_r'));
    if (r <= 0) return E.toast('Enter rate', 'error');
    await E.save('rateCards', { opId: E.val('rc_o'), scope: sc, ref: sc === 'article' ? E.val('rc_a') : E.val('rc_c'), rate: r, rateUnit: E.val('rc_u') || '', piecesPerPair: 1, from: E.val('rc_f') });
    E.closeM(); E.go();
  };
  E.A.rcDel = async id => { if (confirm('Remove?')) { await E.del('rateCards', id); E.go(); } };

  function consTab() {
    const items = E.rows('items').filter(i => i.consumable && i.active);
    if (!items.length) return `<div class="card"><h3>🧪 Consumables</h3><p class="muted">Mark glue/thread etc as consumable in Items to track here.</p></div>`;
    const sm = E.stockMap();
    return `<div class="card"><h3>🧪 Consumables</h3><div class="tw"><table><thead><tr><th>Item</th><th>Mode</th><th class="r">Stock</th><th class="r">Value</th><th></th></tr></thead><tbody>${items.map(it => {
      const st = sm[it.id + '|'] || { qty: 0, value: 0 };
      const mode = it.consumableMode || 'bom';
      return `<tr><td><b>${E.esc(it.art)}</b> ${E.esc(it.name)}</td><td><span class="tag">${mode}</span></td><td class="r">${r3(st.qty)} ${E.esc(it.unit || '')}</td><td class="r">${E.m(st.value)}</td><td class="r"><button class="btn sm p" data-a="consAdjust" data-id="${it.id}">Adjust</button></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  }
  E.A.consAdjust = itemId => {
    const i = it(itemId); if (!i) return;
    const st = E.stock(itemId, '');
    E.modal('Adjust — ' + i.name, `
      <div class="g2"><div class="f">Date<input id="ca_d" type="date" value="${E.today()}"></div><div class="f">Physical count<input id="ca_q" type="number" step="0.001" value="${r3(st.qty)}"></div></div>
      <div class="f">Job (optional)<select id="ca_j"><option value="">— Factory overhead —</option>${active().map(j => `<option value="${j.id}">${j.no}</option>`).join('')}</select></div>
      <div class="f">Notes<input id="ca_n"></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="consAdjustSave" data-id="${itemId}">Post</button>`);
  };
  E.A.consAdjustSave = async itemId => {
    try {
      const i = it(itemId), entered = parseFloat(E.val('ca_q')), d = E.val('ca_d');
      const st = E.stock(itemId, '');
      const variance = entered - st.qty;
      if (Math.abs(variance) < 0.001) { E.closeM(); return E.toast('No variance', 'success'); }
      const avgCost = st.qty > 0 ? Math.round(st.value / st.qty) : (i.buyPrice || 0);
      const val = Math.round(Math.abs(variance) * avgCost);
      const no = await E.next('CA');
      const job = E.val('ca_j');
      const lines = variance > 0
        ? [job ? { acc: '1310', dr: val, job, cat: 'Consumable', head: itemId } : { acc: '5270', dr: val }, { acc: '1300', cr: val }]
        : [{ acc: '1300', dr: val }].concat([job ? { acc: '1310', cr: val, job, cat: 'Consumable', head: itemId } : { acc: '5270', cr: val }]);
      await E.post({ date: d, ref: no, narr: 'Consumable adjust · ' + i.name, source: 'adjust', lines });
      if (variance > 0) await E.stockIn({ date: d, itemId, variantId: '', qty: variance, value: val, type: 'gain', ref: no });
      else await E.stockOut({ date: d, itemId, variantId: '', qty: -variance, type: 'consume', ref: no });
      E.closeM(); E.go(); E.toast('Posted ' + E.m(val), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  function sumTab() {
    const R = live().filter(l => l.date >= F.from && l.date <= F.to);
    const T = R.reduce((s, l) => s + l.amount, 0);
    return `<div class="bar"><span class="muted">From</span><input type="date" class="fs" data-f="pr.from" value="${F.from}"><span class="muted">to</span><input type="date" class="fs" data-f="pr.to" value="${F.to}"></div>
    <div class="card"><h3>Production summary</h3><p><b>Total piece wages:</b> ${E.m(T)} across ${R.length} entries</p></div>`;
  }

  /* Auto-reminder toast on app open */
  setTimeout(() => {
    if (E.role === 'owner' || E.role === 'accountant') {
      const missing = getMissingDays();
      if (missing.length && !localStorage.getItem('erp_ds_reminded_' + E.today())) {
        localStorage.setItem('erp_ds_reminded_' + E.today(), '1');
        E.toast('⚠ ' + missing.length + ' day(s) missing production — open Daily Production', 'warning');
      }
    }
  }, 3000);

  E.maybeSetup = E.maybeSetup || (() => {});
})(window.ERP);