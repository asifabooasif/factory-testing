/* PART 4 (v4) — Jobs with dual-column cost sheet + freeze on completion.
   Cost sheet shows per-pair primary, per-pack secondary.
   Frozen shadow snapshot on complete.
   Added: Edit Job capability from list and view.
*/
(E => {
  const n = E.N.find(x => x.id === 'jobs'); if (n) n.soon = 0;
  const F = { q: '', st: 'In Progress' }; E.jobId = '';
  const pty = id => E.D.parties.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const itemOf = l => E.D.items.find(x => x.id === l.itemId) || {};
  const lines = id => E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.job === id).map(l => Object.assign({ date: j.date, no: j.no, narr: j.narr }, l)));
  const wip = id => lines(id).filter(l => l.acc === '1310').reduce((s, l) => s + l.dr - l.cr, 0);
  const pairsPerPack = l => { const i = itemOf(l); return i.pack || E.setting('packSize') || 1; };
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const CATS = ['Material', 'Labour', 'Overhead', 'Consumable'];

  function sheet(j) {
    const L = jl(j.id);
    const rel = L.some(l => l.released > 0);
    const q = l => rel ? l.released : l.target;
    const tot = L.reduce((s, l) => s + q(l), 0) || 1;
    const R = L.map(l => ({ l, Material: 0, Labour: 0, Overhead: 0, Consumable: 0, Loss: 0 }));
    const sh = { Material: 0, Labour: 0, Overhead: 0, Consumable: 0, Loss: 0 };
    lines(j.id).filter(x => x.acc === '1310' && (CATS.includes(x.cat) || x.cat === 'Wastage')).forEach(x => {
      const c = x.cat === 'Wastage' ? 'Loss' : x.cat;
      const a = c === 'Loss' ? x.cr : x.dr - x.cr;
      const r = R.find(r => r.l.id === x.art);
      if (r) r[c] += a; else sh[c] += a;
    });
    let last = 0; R.forEach((r, i) => { if (q(r.l) > 0) last = i; });
    ['Material', 'Labour', 'Overhead', 'Consumable', 'Loss'].forEach(c => {
      let left = sh[c];
      R.forEach((r, i) => { const a = i === last ? left : Math.round(sh[c] * q(r.l) / tot); r[c] += a; left -= a; });
    });
    R.forEach(r => {
      r.total = r.Material + r.Labour + r.Overhead + r.Consumable - r.Loss;
      r.qty = q(r.l);
      r.packs = r.l.released;
      r.pairs = r.l.released * pairsPerPack(r.l);
      r.unitPack = r.packs ? Math.round(r.total / r.packs) : 0;
      r.unitPair = r.pairs ? Math.round(r.total / r.pairs) : 0;
    });
    return { R, rel, sh };
  }

  function shadowFor(job) {
    if (job.shadowSnapshot) return job.shadowSnapshot;
    const daily = job.shadowDaily || {};
    const totalFixed = Object.values(daily).reduce((s, v) => s + v, 0);
    return {
      totalFixedAllocated: totalFixed,
      accruedWages: { dailySalaries: 0, weeklyTimeWages: 0, total: 0 },
      perExpenseTotal: {},
      isLive: true
    };
  }

  E.A.jobPrint = id => {
    const j = J(id);
    if (!j) return;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const { R } = sheet(j);
    const shadow = shadowFor(j);
    const posted = R.reduce((s, r) => s + r.total, 0);
    const shadowTotal = (shadow.totalFixedAllocated || 0) + (shadow.accruedWages ? shadow.accruedWages.total : 0);
    const complete = posted + shadowTotal;
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    w.document.write(`<html><head><title>${j.no}</title><style>
      @page{size:A4 landscape;margin:12mm}body{font:12px Arial;color:#111}
      .header{background:#2a1758;color:#fff;padding:12px;margin:-12px -12px 12px -12px;display:flex;justify-content:space-between}
      .internal{background:#fef3c7;color:#92400e;padding:6px 12px;font-size:11px;font-weight:700;text-align:center;margin:-12px -12px 12px -12px;border-bottom:2px solid #d97706}
      table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}
      .posted{background:#f0fdf4}.shadow{background:#eff6ff}.complete{background:#faf5ff;font-weight:bold;font-size:14px}
    </style></head><body>
      <div class="internal">🔒 INTERNAL — MANAGEMENT ONLY · Not for customer distribution</div>
      <div class="header">
        <div><b style="font-size:16px">${E.esc(E.factory().name)}</b><br>Job Cost Sheet</div>
        <div style="text-align:right"><b>${j.no}</b><br>${E.esc((pty(j.partyId) || {}).name || 'Stock production')}<br>Completed: ${j.completedAt || 'In progress'}</div>
      </div>
      <table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Materials</th><th class="r">Labour</th><th class="r">Consumable</th><th class="r">Overhead</th><th class="r">Posted Cost</th></tr></thead>
        <tbody>${R.map(r => `<tr><td><b>${E.esc(r.l.code)}</b> ${E.esc(r.l.name)}</td><td class="r">${r.packs}</td><td class="r">${r.pairs}</td><td class="r">${E.m(r.Material)}</td><td class="r">${E.m(r.Labour)}</td><td class="r">${E.m(r.Consumable)}</td><td class="r">${E.m(r.Overhead)}</td><td class="r">${E.m(r.total)}</td></tr>`).join('')}</tbody>
      </table>
      <table class="posted"><tbody>
        <tr><td><b>POSTED COST (in ledger)</b></td><td class="r"><b>${E.m(posted)}</b></td></tr>
      </tbody></table>
      ${shadowTotal > 0 ? `<table class="shadow"><tbody>
        <tr><td colspan="2"><b>SHADOW ALLOCATION (not in ledger)</b></td></tr>
        ${Object.entries(shadow.perExpenseTotal || {}).map(([code, amt]) => { const a = E.acct(code); return `<tr><td>${code} — ${E.esc(a ? a.name : code)}</td><td class="r">${E.m(amt)}</td></tr>`; }).join('')}
        ${shadow.accruedWages && shadow.accruedWages.total ? `<tr><td>Accrued unpaid wages</td><td class="r">${E.m(shadow.accruedWages.total)}</td></tr>` : ''}
        <tr><td><b>Shadow total</b></td><td class="r"><b>${E.m(shadowTotal)}</b></td></tr>
      </tbody></table>` : ''}
      <table class="complete"><tbody>
        <tr><td><b>COMPLETE COST</b></td><td class="r"><b>${E.m(complete)}</b></td></tr>
        <tr><td>Cost per PAIR (${totalPairs} pairs)</td><td class="r"><b>${E.m(totalPairs ? Math.round(complete / totalPairs) : 0)}</b></td></tr>
        <tr><td>Cost per PACK (${totalPacks} packs)</td><td class="r"><b>${E.m(totalPacks ? Math.round(complete / totalPacks) : 0)}</b></td></tr>
      </tbody></table>
      ${job_footer(j, shadow)}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  function job_footer(j, shadow) {
    return `<p style="margin-top:20px;font-size:10px;color:#666">${j.shadowSnapshot ? 'Frozen at: ' + j.shadowSnapshot.frozenAt : 'Live computation (not frozen)'} · Printed: ${E.today()} · Shadow costs are management view only. Not posted to any ledger.</p>`;
  }

  E.A.jobPrintCustomer = id => {
    const j = J(id);
    if (!j) return;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const { R } = sheet(j);
    const posted = R.reduce((s, r) => s + r.total, 0);
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    w.document.write(`<html><head><title>${j.no}</title><style>
      @page{size:A4;margin:14mm}body{font:12px Arial;color:#111}
      .header{background:#2a1758;color:#fff;padding:12px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}
    </style></head><body>
      <div class="header"><b style="font-size:16px">${E.esc(E.factory().name)}</b> — Production Summary</div>
      <p><b>Job:</b> ${j.no}<br><b>Customer:</b> ${E.esc((pty(j.partyId) || {}).name || 'Stock')}</p>
      <table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th></tr></thead>
        <tbody>${R.map(r => `<tr><td>${E.esc(r.l.code)} ${E.esc(r.l.name)}</td><td class="r">${r.packs}</td><td class="r">${r.pairs}</td></tr>`).join('')}</tbody>
      </table>
      <p><b>Total delivered: ${totalPacks} packs (${totalPairs} pairs)</b></p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  function tbl() {
    const s = F.q.toLowerCase();
    const r = E.rows('jobs').filter(j => (!F.st || j.status === F.st) && (!s || (j.no + (pty(j.partyId) || {}).name + j.notes).toLowerCase().includes(s))).sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="tw"><table>
      <thead><tr><th>Job</th><th>Date</th><th>Customer</th><th>Due</th><th>Priority</th><th class="r">Target</th><th class="r">Produced</th><th class="r">WIP</th><th>Status</th><th></th></tr></thead>
      <tbody>${r.map(j => { const L = jl(j.id); return `<tr>
        <td><b>${j.no}</b></td><td>${j.date}</td>
        <td>${E.esc((pty(j.partyId) || {}).name || 'Stock production')}</td>
        <td>${j.due || '—'}</td><td><span class="tag">${j.priority}</span></td>
        <td class="r">${L.reduce((s, l) => s + l.target, 0)} packs<div class="muted">${L.reduce((s, l) => s + l.target * pairsPerPack(l), 0)} pairs</div></td>
        <td class="r">${L.reduce((s, l) => s + l.released, 0)}</td>
        <td class="r">${E.m(wip(j.id))}</td>
        <td><span class="tag">${j.status}</span></td>
        <td class="r">${j.status === 'In Progress' ? `<button class="btn sm" data-a="editJob" data-id="${j.id}">Edit</button> ` : ''}<button class="btn sm p" data-a="openJob" data-id="${j.id}">Open</button></td>
      </tr>`; }).join('') || '<tr><td colspan="10" class="muted">No jobs</td></tr>'}</tbody>
    </table></div>`;
  }

  E.route('jobs', 'Jobs & Costing', () => `<div class="kp">
    ${E.kpi('In progress', active().length)}
    ${E.kpi('Total WIP', E.m(active().reduce((s, j) => s + wip(j.id), 0)), 'Ledger 1310: ' + E.m(E.bal('1310')))}
  </div>
  <div class="bar">
    <input class="fs" style="max-width:300px" placeholder="Search…" data-f="jb.q" value="${E.esc(F.q)}">
    <select class="fs" data-f="jb.st"><option value="">All</option>${['In Progress', 'Completed'].map(c => `<option ${F.st === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <span class="gap"></span>
    <button class="btn p" data-a="newJob">+ New Job</button>
  </div><div id="tbl">${tbl()}</div>`);

  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f && f.startsWith('jb.')) { F[f.slice(3)] = e.target.value; E.$('tbl').innerHTML = tbl(); } });
  E.A.openJob = id => { E.jobId = id; location.hash = '#/jobview'; };

  const jr = () => `<div class="jl jx" style="grid-template-columns:3fr 1fr 30px"><input list="fg" placeholder="Article"><input type="number" placeholder="Packs"><button class="btn sm d" data-a="rmJx">✕</button></div>`;
  E.A.rmJx = (_, e) => e.target.closest('.jx').remove();
  E.A.addJx = () => E.$('jxr').insertAdjacentHTML('beforeend', jr());

  E.A.newJob = () => {
    const cs = E.rows('parties').filter(p => p.active && p.type !== 'Supplier');
    const fg = i => i.cat === 'Finished Good';
    if (!E.skuList(fg).length) return E.toast('Create Finished Goods first', 'error');
    E.modal('New Job', `
      <div class="g2">
        <div class="f">Customer<select id="j_p"><option value="">— stock —</option>${cs.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
        <div class="f">Priority<select id="j_pr"><option>Normal</option><option>High</option><option>Urgent</option></select></div>
        <div class="f">Job date<input id="j_d" type="date" value="${E.today()}"></div>
        <div class="f">Due date<input id="j_u" type="date"></div>
      </div>
      <div class="f">Notes<input id="j_n"></div>
      <datalist id="fg">${E.skuOpts(fg)}</datalist>
      <div id="jxr">${jr() + jr()}</div>
      <button class="btn sm" data-a="addJx">+ Add line</button>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveJob">Create</button>`, 1);
  };

  E.A.saveJob = async () => {
    try {
      const m = {};
      [...document.querySelectorAll('.jx')].forEach(r => {
        const t = r.children[0].value.trim(), q = parseInt(r.children[1].value) || 0;
        if (!t && !q) return;
        const s = E.skuFind(t, i => i.cat === 'Finished Good');
        if (!s) throw new Error('Invalid: ' + t);
        if (q <= 0) throw new Error('Enter packs for ' + s.code);
        const k = s.itemId + '|' + s.variantId;
        m[k] = m[k] || { s, q: 0 }; m[k].q += q;
      });
      const ks = Object.values(m);
      if (!ks.length) throw new Error('Add at least one line');
      const no = await E.next('JOB');
      const j = await E.save('jobs', { no, date: E.val('j_d'), due: E.val('j_u'), partyId: E.val('j_p'), priority: E.val('j_pr'), notes: E.val('j_n'), status: 'In Progress' });
      for (const { s, q } of ks) await E.save('jobLines', { jobId: j.id, itemId: s.itemId, variantId: s.variantId, code: s.code, name: s.name, target: q, released: 0, fgValue: 0 });
      E.closeM(); E.openJob(j.id); E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.route('jobview', 'Job', () => {
    const j = J(E.jobId);
    if (!j) return '<div class="card">Select a job.</div>';
    E.$('pt').textContent = j.no;
    const L = jl(j.id), { R, rel } = sheet(j);
    const ls = lines(j.id);
    const open = j.status === 'In Progress';
    const shadow = shadowFor(j);
    const postedCost = R.reduce((s, r) => s + r.total, 0);
    const shadowTotal = (shadow.totalFixedAllocated || 0) + (shadow.accruedWages ? shadow.accruedWages.total : 0);
    const completeCost = postedCost + shadowTotal;
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    const costPerPairComplete = totalPairs ? Math.round(completeCost / totalPairs) : 0;
    const costPerPackComplete = totalPacks ? Math.round(completeCost / totalPacks) : 0;
    const costPerPairPosted = totalPairs ? Math.round(postedCost / totalPairs) : 0;
    const frozen = !!j.shadowSnapshot;

    return `<div class="bar">
      <button class="btn" data-nav="jobs">← Jobs</button>
      <b style="font-size:16px">${j.no} · ${E.esc((pty(j.partyId) || {}).name || 'Stock production')}</b>
      <span class="tag">${j.status}</span>
      <span class="muted">Due ${j.due || '—'} · ${j.priority}</span>
      <span class="gap"></span>
      <button class="btn" data-a="jobPrint" data-id="${j.id}">🖨 Internal</button>
      <button class="btn" data-a="jobPrintCustomer" data-id="${j.id}">🖨 Customer</button>
      ${open ? `
        <button class="btn" data-a="editJob" data-id="${j.id}">✏️ Edit Job</button>
        <button class="btn" data-a="issueM" data-id="${j.id}">Materials</button>
        <button class="btn" data-a="addCost" data-id="${j.id}">Labor</button>
        <button class="btn" data-a="relM" data-id="${j.id}">Release</button>
        <button class="btn p" data-a="complete" data-id="${j.id}">Complete</button>
      ` : ''}
    </div>

    <div class="kp">
      ${E.kpi('Posted cost', E.m(postedCost), 'in ledger')}
      ${E.kpi('Shadow', E.m(shadowTotal), frozen ? 'frozen' : 'live')}
      ${E.kpi('COMPLETE', '<b>' + E.m(completeCost) + '</b>', 'for pricing')}
      ${E.kpi('Per pair (complete)', E.m(costPerPairComplete), 'management cost')}
      ${E.kpi('Per pack (complete)', E.m(costPerPackComplete), 'management cost')}
      ${E.kpi('Per pair (posted)', E.m(costPerPairPosted), 'ledger only')}
    </div>

    ${frozen ? `<div class="card" style="background:#d1fae5;border-left:4px solid #059669;padding:12px;margin-bottom:14px">
      <b style="color:#065f46">🔒 Cost sheet frozen at ${j.shadowSnapshot.frozenAt}</b>
      <div class="muted" style="font-size:12px;margin-top:4px">These numbers are permanent. Used for pricing. Not affected by later rent/electricity changes.</div>
    </div>` : ''}

    <div class="card">
      <h3>Cost breakdown</h3>
      <div class="tw"><table>
        <thead><tr><th>Category</th><th class="r">Posted</th><th class="r">Shadow</th><th class="r">Complete</th></tr></thead>
        <tbody>
          <tr><td>Materials</td><td class="r">${E.m(R.reduce((s, r) => s + r.Material, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Material, 0))}</td></tr>
          <tr><td>Labor (piece work)</td><td class="r">${E.m(R.reduce((s, r) => s + r.Labour, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Labour, 0))}</td></tr>
          <tr><td>Direct expenses</td><td class="r">${E.m(R.reduce((s, r) => s + r.Overhead, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Overhead, 0))}</td></tr>
          <tr><td>Consumables</td><td class="r">${E.m(R.reduce((s, r) => s + r.Consumable, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Consumable, 0))}</td></tr>
          <tr style="background:var(--s2)"><td><b>Posted subtotal</b></td><td class="r"><b>${E.m(postedCost)}</b></td><td class="r">—</td><td class="r"><b>${E.m(postedCost)}</b></td></tr>
          ${Object.entries(shadow.perExpenseTotal || {}).map(([code, amt]) => { const a = E.acct(code); return `<tr><td style="padding-left:20px">${code} — ${E.esc(a ? a.name : code)}</td><td class="r">—</td><td class="r">${E.m(amt)}</td><td class="r">${E.m(amt)}</td></tr>`; }).join('')}
          ${shadow.accruedWages && shadow.accruedWages.total ? `<tr><td style="padding-left:20px">Accrued wages</td><td class="r">—</td><td class="r">${E.m(shadow.accruedWages.total)}</td><td class="r">${E.m(shadow.accruedWages.total)}</td></tr>` : ''}
          <tr style="background:var(--s2)"><td><b>Shadow subtotal</b></td><td class="r">—</td><td class="r"><b>${E.m(shadowTotal)}</b></td><td class="r"><b>${E.m(shadowTotal)}</b></td></tr>
          <tr style="background:#faf5ff"><td><b style="font-size:14px">COMPLETE COST</b></td><td class="r">${E.m(postedCost)}</td><td class="r">${E.m(shadowTotal)}</td><td class="r"><b style="font-size:14px">${E.m(completeCost)}</b></td></tr>
        </tbody>
      </table></div>
      <p class="muted" style="margin-top:10px">Posted = in ledger (real). Shadow = daily allocation (management). Complete = for pricing decisions. Shadow never posts.</p>
    </div>

    <div class="card">
      <h3>Per-article cost</h3>
      <div class="tw"><table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Total cost</th><th class="r">Per pair</th><th class="r">Per pack</th></tr></thead>
        <tbody>${R.map(r => `<tr>
          <td><b>${E.esc(r.l.code)}</b> ${E.esc(r.l.name)}</td>
          <td class="r">${r.packs}</td><td class="r">${r.pairs}</td>
          <td class="r">${E.m(r.total)}</td>
          <td class="r"><b>${E.m(r.unitPair)}</b></td>
          <td class="r">${E.m(r.unitPack)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>Transactions</h3>
      <div class="tw"><table>
        <thead><tr><th>Date</th><th>Entry</th><th>Type</th><th>Narr</th><th>Article</th><th class="r">Amount</th></tr></thead>
        <tbody>${ls.filter(x => x.acc === '1310' && !['Release', 'Costing'].includes(x.cat)).sort((a, b) => b.date.localeCompare(a.date)).map(x => `<tr>
          <td>${x.date}</td><td>${x.no}</td><td><span class="tag">${x.cat}</span></td>
          <td>${E.esc(x.narr)}</td>
          <td>${E.esc((L.find(l => l.id === x.art) || {}).code || 'Shared')}</td>
          <td class="r">${E.m(x.cat === 'Wastage' ? -x.cr : x.dr - x.cr)}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">No transactions</td></tr>'}</tbody>
      </table></div>
    </div>`;
  });

  const artSel = id => `<div class="f">Article<select id="x_a"><option value="">Shared</option>${jl(id).map(l => `<option value="${l.id}">${E.esc(l.code)}</option>`).join('')}</select></div>`;

  E.A.issueM = id => E.modal('Issue / return materials', `
    <div class="g2"><div class="f">Action<select id="x_k"><option value="issue">Issue</option><option value="return">Return</option></select></div><div class="f">Date<input id="x_d" type="date" value="${E.today()}"></div></div>
    <div class="f">Material *<input id="x_i" list="sk"></div>
    <datalist id="sk">${E.skuOpts(i => i.cat !== 'Finished Good')}</datalist>
    <div class="g2"><div class="f">Qty *<input id="x_q" type="number" step="0.001"></div>${artSel(id)}</div>
  `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveIssue" data-id="${id}">Post</button>`);

  E.A.saveIssue = async id => {
    try {
      const s = E.skuFind(E.val('x_i'), i => i.cat !== 'Finished Good');
      if (!s) throw new Error('Select material');
      const q = parseFloat(E.val('x_q'));
      if (!(q > 0)) throw new Error('Enter qty');
      const d = E.val('x_d'), art = E.val('x_a'), k = E.val('x_k');
      const no = await E.next('ISS'), j = J(id);
      const mv = E.rows('issues').filter(x => x.jobId === id && x.itemId === s.itemId && x.variantId === s.variantId);
      const nq = mv.reduce((a, x) => a + x.qty, 0), nvl = mv.reduce((a, x) => a + x.value, 0);
      let val;
      if (k === 'issue') {
        val = E.outValue(s.itemId, s.variantId, q);
        await E.post({ date: d, ref: no, narr: 'Issue ' + s.code, source: 'issue', lines: [{ acc: '1310', dr: val, job: id, cat: 'Material', art }, { acc: '1300', cr: val }] });
        await E.stockOut({ date: d, itemId: s.itemId, variantId: s.variantId, qty: q, type: 'issue', ref: no, job: id });
        await E.save('issues', { no, date: d, jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, qty: q, value: val, art });
      } else {
        if (q > nq + 1e-9) throw new Error('Only ' + nq + ' issued');
        val = q >= nq - 1e-9 ? nvl : Math.round(nvl * q / nq);
        await E.post({ date: d, ref: no, narr: 'Return ' + s.code, source: 'issue', lines: [{ acc: '1300', dr: val }, { acc: '1310', cr: val, job: id, cat: 'Material', art }] });
        await E.stockIn({ date: d, itemId: s.itemId, variantId: s.variantId, qty: q, value: val, type: 'return', ref: no, job: id });
        await E.save('issues', { no, date: d, jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, qty: -q, value: -val, art });
      }
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.addCost = id => {
    const js = active();
    if (!js.length) return E.toast('No jobs in progress', 'error');
    E.modal('Add labor / expense', `
      <div class="g2">
        <div class="f">Type<select id="c_t"><option>Labour</option><option>Overhead</option></select></div>
        <div class="f">Date<input id="c_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount<input id="c_a" type="number" step="0.01"></div>
        <div class="f">From/owed<select id="c_s"><option value="">—</option>${E.opts(a => a.bank || ['1010', '2000', '2200'].includes(a.code))}</select></div>
      </div>
      <div class="f">Details<input id="c_n"></div>
      <b>Allocate (% must = 100)</b>
      <div class="tw"><table><thead><tr><th>Job</th><th>Customer</th><th class="r">%</th></tr></thead><tbody>${js.map(j => `<tr><td>${j.no}</td><td>${E.esc((pty(j.partyId) || {}).name || 'Stock')}</td><td><input class="sp" data-id="${j.id}" type="number" step="0.01" value="${j.id === id ? 100 : ''}" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
      <button class="btn sm" data-a="eqSplit">Split equally</button>
      ${id ? artSel(id) : ''}
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveCost">Post</button>`, 1);
  };
  E.A.eqSplit = () => { const a = [...document.querySelectorAll('.sp')]; a.forEach((i, k) => i.value = k === a.length - 1 ? (100 - Math.floor(10000 / a.length) / 100 * (a.length - 1)).toFixed(2) : (Math.floor(10000 / a.length) / 100).toFixed(2)); };
  E.A.saveCost = async () => {
    try {
      const amt = E.c(E.val('c_a')), s = E.val('c_s'), t = E.val('c_t'), d = E.val('c_d');
      if (amt <= 0) throw new Error('Enter amount');
      if (!s) throw new Error('Select account');
      const sp = [...document.querySelectorAll('.sp')].map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
      if (sp.reduce((a, x) => a + x.p, 0) !== 10000) throw new Error('Must total 100%');
      let left = amt;
      const art = sp.length === 1 && E.$('x_a') ? E.val('x_a') : '';
      const ls = sp.map((x, i) => { const a = i === sp.length - 1 ? left : Math.round(amt * x.p / 10000); left -= a; return { acc: '1310', dr: a, job: x.id, cat: t, art }; });
      const no = await E.next('EXP');
      await E.post({ date: d, ref: no, narr: (E.val('c_n') || t) + ' · ' + sp.map(x => J(x.id).no).join(','), source: 'jobcost', lines: ls.concat([{ acc: s, cr: amt }]) });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.relM = id => {
    const L = jl(id);
    E.modal('Release finished goods', `
      <div class="f">Date<input id="r_d" type="date" value="${E.today()}"></div>
      <div class="tw"><table><thead><tr><th>Article</th><th class="r">Target</th><th class="r">Released</th><th class="r">Packs now</th></tr></thead>
      <tbody>${L.map(l => `<tr><td>${E.esc(l.code)}</td><td class="r">${l.target}</td><td class="r">${l.released}</td><td><input class="rq" data-id="${l.id}" type="number" min="0" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveRel" data-id="${id}">Release</button>`);
  };

  E.A.saveRel = async id => {
    try {
      const L = jl(id);
      const rq = [...document.querySelectorAll('.rq')].map(i => ({ l: L.find(x => x.id === i.dataset.id), q: parseInt(i.value) || 0 })).filter(x => x.q > 0);
      if (!rq.length) throw new Error('Enter packs');
      const Q = rq.reduce((s, x) => s + x.q, 0), W = wip(id);
      if (W <= 0) throw new Error('No WIP');
      const rem = Math.max(Q, L.reduce((s, l) => s + l.target - l.released, 0));
      const batch = Math.round(W * Q / rem);
      let left = batch;
      const vals = rq.map((x, i) => { const v = i === rq.length - 1 ? left : Math.round(batch * x.q / Q); left -= v; return v; });
      const no = await E.next('REL'), d = E.val('r_d');
      await E.post({ date: d, ref: no, narr: 'Release ' + Q + ' packs', source: 'release',
        lines: rq.map((x, i) => ({ acc: '1320', dr: vals[i], job: id, cat: 'Release', art: x.l.id })).concat([{ acc: '1310', cr: batch, job: id, cat: 'Release' }]) });
      for (let i = 0; i < rq.length; i++) {
        const { l, q } = rq[i];
        await E.stockIn({ date: d, itemId: l.itemId, variantId: l.variantId, qty: q, value: vals[i], type: 'release', ref: no, job: id });
        const b = JSON.parse(JSON.stringify(l));
        l.released += q; l.fgValue += vals[i];
        await E.save('jobLines', l, b);
      }
      E.closeM(); E.go(); E.toast(no + ': ' + Q + ' packs released', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.complete = async id => {
    try {
      const j = J(id), L = jl(id);
      if (!L.some(l => l.released > 0)) throw new Error('Release goods first');
      /* Freeze shadow snapshot before completing */
      let frozen = null;
      if (E.dailyAllocation && E.dailyAllocation.freezeJobShadow) {
        try { frozen = await E.dailyAllocation.freezeJobShadow(id); }
        catch (e) { console.warn('Freeze failed:', e); }
      }
      const { R } = sheet(j);
      const d = R.map(r => r.total - (r.l.fgValue || 0));
      const sum = d.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - wip(id)) > 1) throw new Error('Cost sheet vs WIP differ by ' + E.m(sum - wip(id)));
      if (!confirm('Complete ' + j.no + '? Remaining WIP ' + E.m(sum) + ' → FG.')) return;
      const no = await E.next('CMP'), ls = [];
      R.forEach((r, i) => {
        if (d[i] > 0) ls.push({ acc: '1320', dr: d[i], job: id, cat: 'Costing', art: r.l.id });
        if (d[i] < 0) ls.push({ acc: '1320', cr: -d[i], job: id, cat: 'Costing', art: r.l.id });
      });
      if (sum > 0) ls.push({ acc: '1310', cr: sum, job: id, cat: 'Costing' });
      if (sum < 0) ls.push({ acc: '1310', dr: -sum, job: id, cat: 'Costing' });
      if (ls.length > 1) await E.post({ date: E.today(), ref: no, narr: 'Final costing', source: 'release', lines: ls });
      for (let i = 0; i < R.length; i++) {
        const r = R[i], l = r.l, b = JSON.parse(JSON.stringify(l));
        if (d[i]) await E.stockIn({ date: E.today(), itemId: l.itemId, variantId: l.variantId, qty: 0, value: d[i], type: 'costing', ref: no, job: id });
        Object.assign(l, { alloc: r.total, unitCost: r.unitPack, unitCostPerPair: r.unitPair, fgValue: r.total });
        await E.save('jobLines', l, b);
        const v = E.D.variants.find(x => x.id === l.variantId), it = E.D.items.find(x => x.id === l.itemId);
        if (v) { v.lastCost = r.unitPack; await E.put('variants', v); }
        if (it) { it.lastCost = r.unitPack; await E.put('items', it); }
      }
      const bj = JSON.parse(JSON.stringify(j));
      j.status = 'Completed';
      j.completedAt = E.today();
      if (frozen) j.shadowSnapshot = frozen;
      await E.save('jobs', j, bj);
      E.go(); E.toast(j.no + ' completed · frozen', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);