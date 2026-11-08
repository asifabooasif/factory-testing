/* PART 17 (v6) — Setup Wizard with FULL creation logic. */
(E => {
  const ni = E.N.findIndex(n => n.id === 'opening');
  E.N.splice(ni < 0 ? E.N.length : ni, 0, { g: 'System', id: 'setup', ico: '🧭', label: 'Setup Wizard' });
  const STEPS = [
    { id: 'biz', l: '1 · Factory', help: 'Basic factory information' },
    { id: 'bank', l: '2 · Banks', help: 'Bank and cash accounts with opening balances' },
    { id: 'cust', l: '3 · Customers', help: 'Customers and amounts they owe you' },
    { id: 'supp', l: '4 · Suppliers', help: 'Suppliers and amounts you owe them' },
    { id: 'art', l: '5 · Articles', help: 'Finished goods with colours and opening stock' },
    { id: 'mat', l: '6 · Materials', help: 'Raw materials, accessories, packing items' },
    { id: 'ops', l: '7 · Operations', help: 'Production steps and piece rates per PAIR' },
    { id: 'emp', l: '8 · Employees', help: 'Staff with pay type and opening advances' },
    { id: 'bom', l: '9 · BOMs', help: 'Material requirements PER PAIR', optional: true },
    { id: 'rev', l: '10 · Review', help: 'Confirm everything before posting' }
  ];
  const KEY = () => 'erp_wiz_' + E.fid;
  let W = null;
  function draft() {
    if (W && W.fid === E.fid && W.version === 6) return W;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) {}
    if (d && d.version === 6) { W = d; return W; }
    W = { fid: E.fid, version: 6, step: 'biz', biz: { cats: 'Flat, PU', pack: '6' }, bank: [], cust: [], supp: [], art: [], mat: [], ops: [], emp: [], bom: [] };
    return W;
  }
  const save = () => localStorage.setItem(KEY(), JSON.stringify(W));
  const cats = () => draft().biz.cats.split(',').map(x => x.trim()).filter(Boolean);
  const COLS = {
    bank: () => [{ k: 'name', l: 'Account name *', w: 160, ph: 'Commercial Bank - Current' }, { k: 'kind', l: 'Type *', t: 'sel', o: ['Bank', 'Cash'] }, { k: 'bankName', l: 'Bank / institution', w: 120 }, { k: 'acctNo', l: 'Account no', w: 110 }, { k: 'opening', l: 'Opening balance (Rs)', t: 'n' }],
    cust: () => [{ k: 'name', l: 'Customer name *', w: 160 }, { k: 'phone', l: 'Phone', w: 110 }, { k: 'days', l: 'Credit days', t: 'n' }, { k: 'limit', l: 'Credit limit (Rs)', t: 'n' }, { k: 'opening', l: 'Amount they owe you (Rs)', t: 'n' }],
    supp: () => [{ k: 'name', l: 'Supplier name *', w: 160 }, { k: 'phone', l: 'Phone', w: 110 }, { k: 'days', l: 'Credit days', t: 'n' }, { k: 'opening', l: 'Amount you owe them (Rs)', t: 'n' }],
    art: () => [{ k: 'art', l: 'Article No *', w: 80, ph: 'F001' }, { k: 'name', l: 'Name *', w: 150, ph: 'Ladies Flat Slipper' }, { k: 'cat', l: 'Category *', t: 'sel', o: cats() }, { k: 'run', l: 'Size run in ONE pack *', w: 160, ph: '36-41' }, { k: 'cols', l: 'Colours *', w: 150, ph: 'Black, Brown, Navy' }, { k: 'price', l: 'Selling price PER PAIR', t: 'n' }, { k: 'opening', l: 'Opening packs per colour', t: 'n' }, { k: 'cost', l: 'Cost per PAIR (Rs)', t: 'n' }],
    mat: () => [{ k: 'code', l: 'Code *', w: 80, ph: 'EVA-01' }, { k: 'name', l: 'Name *', w: 150 }, { k: 'type', l: 'Type *', t: 'sel', o: ['Raw Material', 'Accessory', 'Packing'] }, { k: 'unit', l: 'Unit *', t: 'sel', o: ['Kg', 'Meter', 'Sheet', 'Roll', 'Pcs', 'Pair', 'Litre', 'Box', 'Pack'] }, { k: 'buy', l: 'Purchase price per unit *', t: 'n' }, { k: 'sup', l: 'Supplier', w: 120 }, { k: 'min', l: 'Reorder level', t: 'n' }, { k: 'opening', l: 'Opening qty', t: 'n' }],
    ops: () => [{ k: 'name', l: 'Operation *', w: 180, ph: 'Top making' }, { k: 'rate', l: 'Rate per PAIR (Rs) *', t: 'n' }],
    emp: () => [{ k: 'name', l: 'Full name *', w: 150 }, { k: 'nic', l: 'NIC', w: 100 }, { k: 'phone', l: 'Phone', w: 100 }, { k: 'type', l: 'Pay type *', t: 'sel', o: ['Wage', 'Daily Salaried', 'Monthly Salaried'] }, { k: 'rate', l: 'Daily rate / monthly salary *', t: 'n' }, { k: 'allow', l: 'Monthly allowances', t: 'n' }, { k: 'piece', l: 'Piece work?', t: 'sel', o: ['No', 'Yes'] }, { k: 'epf', l: 'EPF member?', t: 'sel', o: ['Yes', 'No'] }, { k: 'advance', l: 'Advance already owed (Rs)', t: 'n' }],
    bom: () => [{ k: 'art', l: 'Article *', t: 'sel', o: ['(select article)'] }, { k: 'material', l: 'Material *', w: 180, ph: 'Search material code' }, { k: 'qty', l: 'Qty (per PAIR) *', t: 'n' }]
  };
  const HELP = {
    biz: 'Basic info. All calculations are based on PAIRS.',
    bank: 'Add every bank account and cash box you use.',
    cust: 'Add customers. If they owe you money, enter it.',
    supp: 'Add suppliers. If you owe them money, enter it.',
    art: 'One row per article. Size run = pairs in one pack. Selling price is PER PAIR.',
    mat: 'Every material you buy. Purchase price = what you pay the supplier.',
    ops: 'Each production step a worker is paid for. Rate is PER PAIR.',
    emp: 'Wage = paid by days/pieces. Daily Salaried = fixed daily. Monthly Salaried = fixed monthly.',
    bom: 'How much material goes into ONE PAIR. If a Box holds 6 pairs, enter 0.1667.'
  };
  const blank = s => Object.fromEntries(COLS[s]().map(c => [c.k, c.t === 'sel' ? c.o[0] : '']));
  E.route('setup', 'Setup Wizard', () => {
    const d = draft();
    return `<div class="bar" style="flex-wrap:wrap">
      ${STEPS.map(st => `<button class="btn ${d.step === st.id ? 'p' : ''}" data-a="wzGo" data-id="${st.id}">${st.l}${!['biz', 'rev'].includes(st.id) && Array.isArray(d[st.id]) ? ' <small>(' + d[st.id].filter(r => Object.values(r).some(v => String(v).trim())).length + ')</small>' : ''}</button>`).join('')}
    </div>
    <div id="wzb">${d.step === 'biz' ? stepBiz() : d.step === 'rev' ? stepRev() : d.step === 'bom' ? stepBom() : stepGrid(d.step)}</div>`;
  });
  E.A.wzGo = k => { draft().step = k; save(); E.go(); };
  function stepBiz() { const d = draft(); return `<div class="card"><h3>Welcome</h3><div class="g2"><div class="f">Categories<input data-w="biz|cats" value="${E.esc(d.biz.cats)}"></div><div class="f">Default pairs per pack<input data-w="biz|pack" type="number" value="${E.esc(d.biz.pack)}"></div></div>${nav(d.step)}</div>`; }
  function stepGrid(s) { const d = draft(); const C = COLS[s](); const rows = d[s]; if (!rows.length) for (let i = 0; i < 5; i++) rows.push(blank(s)); return `<div class="card"><h3>${STEPS.find(x => x.id === s).l.slice(3)}</h3><p class="muted">${HELP[s] || ''}</p><div class="tw"><table><thead><tr><th>#</th>${C.map(c => `<th>${E.esc(c.l)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td>${C.map(c => `<td>${c.t === 'sel' ? `<select data-w="${s}|${i}|${c.k}">${(c.o || ['']).map(o => `<option ${r[c.k] === o ? 'selected' : ''}>${E.esc(o)}</option>`).join('')}</select>` : `<input data-w="${s}|${i}|${c.k}" ${c.t === 'n' ? 'type="number" step="0.01"' : ''} value="${E.esc(r[c.k] || '')}" style="width:${c.w || 90}px">`}</td>`).join('')}<td><button class="btn sm d" data-a="wzRm" data-id="${s}|${i}">✕</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" data-a="wzAdd" data-id="${s}">+ 5 rows</button>${nav(s)}</div>`; }
  function stepBom() { const d = draft(); return `<div class="card"><h3>BOMs (Per Pair)</h3><p class="muted">Define qty per PAIR. If a Box holds 6 pairs, enter 0.1667.</p><button class="btn" data-a="wzGo" data-id="rev">⏭ Skip</button><div class="tw"><table><thead><tr><th>Article</th><th>Material</th><th class="r">Qty (per Pair)</th><th></th></tr></thead><tbody id="bomBody">${(d.bom || []).map((b, i) => bomRow(b, i)).join('')}${bomRow({}, (d.bom || []).length)}</tbody></table></div><button class="btn sm" data-a="wzAddBom">+ Add BOM line</button>${nav('bom')}</div>`; }
  function bomRow(b, i) { const d = draft(); const arts = d.art.filter(a => a.art && a.name); return `<tr data-bom-i="${i}"><td><select data-bom="${i}|art"><option value="">— article —</option>${arts.map(a => `<option value="${E.esc(a.art)}" ${b.art === a.art ? 'selected' : ''}>${E.esc(a.art)} ${E.esc(a.name || '')}</option>`).join('')}</select></td><td><input data-bom="${i}|material" value="${E.esc(b.material || '')}" list="wzMatList"><datalist id="wzMatList">${d.mat.filter(m => m.code).map(m => `<option value="${E.esc(m.code)}">${E.esc(m.name || '')}</option>`).join('')}</datalist></td><td class="r"><input data-bom="${i}|qty" type="number" step="0.0001" value="${E.esc(b.qty || '')}" style="width:100px"></td><td><button class="btn sm d" data-a="wzRmBom" data-id="${i}">✕</button></td></tr>`; }
  function stepRev() { const c = check(); const row = (l, v) => `<tr><td>${l}</td><td class="r"><b>${v}</b></td></tr>`; return `<div class="card"><h3>Review</h3><div class="tw"><table><tbody>${row('Articles', c.artCount)}${row('Materials', c.matCount)}${row('Operations', c.opsCount)}${row('Employees', c.empCount)}${row('BOMs', c.bomCount)}</tbody></table></div><label style="display:flex;gap:8px;margin-top:16px"><input type="checkbox" id="wz_ok"> <span>I confirm these details.</span></label></div><div class="bar"><button class="btn" data-a="wzGo" data-id="bom">← Back</button><button class="btn p" data-a="wzDo">✔ Confirm & create</button></div>`; }
  const nav = s => { const i = STEPS.findIndex(x => x.id === s); const prev = STEPS[Math.max(0, i - 1)].id; const next = STEPS[Math.min(STEPS.length - 1, i + 1)].id; return `<div class="bar"><button class="btn" data-a="wzGo" data-id="${prev}">← Back</button><button class="btn p" data-a="wzGo" data-id="${next}">Next →</button></div>`; };
  E.hooks.push(e => {
    const t = e.target; const w = t.dataset && t.dataset.w;
    if (w) { const parts = w.split('|'); const d = draft(); if (parts[0] === 'biz') d.biz[parts[1]] = t.value; else { const [s, i, k] = parts; while (d[s].length <= +i) d[s].push(blank(s)); d[s][+i][k] = t.value; } save(); return; }
    const b = t.dataset && t.dataset.bom;
    if (b) { const [i, k] = b.split('|'); const d = draft(); while (d.bom.length <= +i) d.bom.push({ art: '', material: '', qty: '' }); d.bom[+i][k] = t.value; save(); }
  });
  E.A.wzAdd = s => { const d = draft(); for (let i = 0; i < 5; i++) d[s].push(blank(s)); save(); E.go(); };
  E.A.wzRm = id => { const [s, i] = id.split('|'); draft()[s].splice(+i, 1); save(); E.go(); };
  E.A.wzAddBom = () => { draft().bom.push({ art: '', material: '', qty: '' }); save(); E.go(); };
  E.A.wzRmBom = i => { draft().bom.splice(+i, 1); save(); E.go(); };
  function check() { const d = draft(); return { err: [], artCount: d.art.length, matCount: d.mat.length, opsCount: d.ops.length, empCount: d.emp.length, bomCount: d.bom.length }; }

  /* ── FULL CREATION ────────────────────────────────────────────── */
  E.A.wzDo = async () => {
    try {
      if (!E.$('wz_ok').checked) throw new Error('Tick the confirmation box');
      const d = draft();
      const packSize = parseInt(d.biz.pack) || 6;
      const today = E.today();
      await E.setSetting({ fgCats: cats(), packSize });

      /* 1. BANKS + CASH */
      for (const b of d.bank) {
        if (!b.name || !b.name.trim()) continue;
        const isCash = b.kind === 'Cash';
        let code = '';
        for (let n = isCash ? 1001 : 1101; n <= (isCash ? 1099 : 1199); n++) {
          if (!E.acct(String(n))) { code = String(n); break; }
        }
        if (!code) throw new Error('No free account code for ' + b.name);
        await E.save('coa', {
          id: E.fid + '-' + code, code, name: b.name.trim(),
          type: 'asset', bank: 1, kind: isCash ? 'cash' : 'bank',
          bankName: b.bankName || '', acctNo: b.acctNo || '', branch: '',
          custom: true
        });
        const op = E.c(b.opening);
        if (op > 0) {
          await E.post({
            date: today, ref: 'OPEN', narr: 'Opening · ' + b.name, source: 'opening',
            lines: [{ acc: code, dr: op }, { acc: '3000', cr: op }]
          });
        }
      }

      /* 2. CUSTOMERS */
      for (const c of d.cust) {
        if (!c.name || !c.name.trim()) continue;
        const code = await E.next('PTY');
        const p = await E.save('parties', {
          code, name: c.name.trim(), type: 'Customer',
          phone: c.phone || '', addr: '', days: parseInt(c.days) || 0,
          limit: E.c(c.limit), active: true
        });
        const op = E.c(c.opening);
        if (op > 0) {
          const no = await E.next('INV');
          await E.post({
            date: today, ref: no, narr: 'Opening · ' + c.name, source: 'opening',
            lines: [{ acc: '1200', dr: op }, { acc: '3000', cr: op }]
          });
          await E.save('invoices', {
            no, date: today, partyId: p.id, dnIds: [], gross: op, disc: 0,
            total: op, paid: 0, cancelled: false, opening: true, ref: 'Opening'
          });
        }
      }

      /* 3. SUPPLIERS */
      for (const s of d.supp) {
        if (!s.name || !s.name.trim()) continue;
        const code = await E.next('PTY');
        const p = await E.save('parties', {
          code, name: s.name.trim(), type: 'Supplier',
          phone: s.phone || '', addr: '', days: parseInt(s.days) || 0,
          limit: 0, active: true
        });
        const op = E.c(s.opening);
        if (op > 0) {
          const no = await E.next('PUR');
          await E.post({
            date: today, ref: no, narr: 'Opening · ' + s.name, source: 'opening',
            lines: [{ acc: '3000', dr: op }, { acc: '2000', cr: op }]
          });
          await E.save('purchases', {
            no, date: today, partyId: p.id, invNo: 'Opening', lines: [],
            total: op, paid: 0, cancelled: false, opening: true
          });
        }
      }

      /* 4. ARTICLES + OPENING STOCK */
      const artMap = {};
      for (const a of d.art) {
        if (!a.art || !a.art.trim()) continue;
        const art = a.art.trim().toUpperCase();
        if (E.rows('items').some(i => i.art === art)) { artMap[art] = E.rows('items').find(i => i.art === art); continue; }
        const run = E.expandSizes(a.run || '');
        if (!run.length) throw new Error('Article ' + art + ': enter size run (e.g. 36-41)');
        const it = await E.save('items', {
          art, name: (a.name || art).trim(), cat: 'Finished Good',
          sub: a.cat || cats()[0], sizeRun: run.join(','), unit: 'Pack',
          pack: run.length, price: E.c(a.price), min: 0, active: true
        });
        const colours = (a.cols || '').split(',').map(x => x.trim()).filter(Boolean);
        if (colours.length) await E.genPacks(it, colours);
        artMap[art] = it;

        const openingPacks = parseFloat(a.opening) || 0;
        const costPerPair = E.c(a.cost);
        if (openingPacks > 0 && costPerPair > 0) {
          const variants = E.rows('variants').filter(v => v.itemId === it.id);
          const valPerPack = costPerPair * run.length;
          for (const v of variants) {
            const val = Math.round(openingPacks * valPerPack);
            const no = await E.next('ADJ');
            await E.post({
              date: today, ref: no, narr: 'Opening stock · ' + art + ' ' + (v.color || ''), source: 'opening',
              lines: [{ acc: '1320', dr: val }, { acc: '3200', cr: val }]
            });
            await E.stockIn({ date: today, itemId: it.id, variantId: v.id, qty: openingPacks, value: val, type: 'opening', ref: no });
          }
        }
      }

      /* 5. MATERIALS + OPENING STOCK */
      const matMap = {};
      for (const m of d.mat) {
        if (!m.code || !m.code.trim()) continue;
        const code = m.code.trim().toUpperCase();
        if (E.rows('items').some(i => i.art === code)) { matMap[code] = E.rows('items').find(i => i.art === code); continue; }
        let supId = '';
        if (m.sup) {
          const sp = E.rows('parties').find(p => p.type !== 'Customer' && p.name.toLowerCase() === m.sup.trim().toLowerCase());
          if (sp) supId = sp.id;
        }
        const it = await E.save('items', {
          art: code, name: (m.name || code).trim(), cat: m.type || 'Raw Material',
          sub: '', sizeRun: '', unit: m.unit || 'Pcs', pack: 0, price: 0,
          buyPrice: E.c(m.buy), min: parseFloat(m.min) || 0,
          supId, spec: '', active: true
        });
        matMap[code] = it;

        const openingQty = parseFloat(m.opening) || 0;
        if (openingQty > 0 && E.c(m.buy) > 0) {
          const val = Math.round(openingQty * E.c(m.buy));
          const no = await E.next('ADJ');
          await E.post({
            date: today, ref: no, narr: 'Opening stock · ' + code, source: 'opening',
            lines: [{ acc: '1300', dr: val }, { acc: '3200', cr: val }]
          });
          await E.stockIn({ date: today, itemId: it.id, variantId: '', qty: openingQty, value: val, type: 'opening', ref: no });
        }
      }

      /* 6. OPERATIONS */
      let opOrder = 0;
      for (const o of d.ops) {
        if (!o.name || !o.name.trim()) continue;
        await E.save('operations', {
          name: o.name.trim(), order: opOrder++,
          rate: E.c(o.rate), rateUnit: 'pair', piecesPerPair: 1, active: true
        });
      }

      /* 7. EMPLOYEES + OPENING ADVANCES */
      for (const e of d.emp) {
        if (!e.name || !e.name.trim()) continue;
        const payType = e.type === 'Monthly Salaried' ? 'MonthlySalaried'
                      : e.type === 'Daily Salaried' ? 'DailySalaried' : 'Wage';
        const code = await E.next('EMP');
        const emp = await E.save('employees', {
          code, name: e.name.trim(), nic: e.nic || '', phone: e.phone || '',
          payType, amount: E.c(e.rate),
          allow: payType === 'MonthlySalaried' ? E.c(e.allow) : 0,
          piece: e.piece === 'Yes', target: 'OH',
          advInstall: 0, epf: e.epf !== 'No', join: today, active: true
        });
        const adv = E.c(e.advance);
        if (adv > 0) {
          const no = await E.next('ADV');
          await E.post({
            date: today, ref: no, narr: 'Opening advance · ' + e.name, source: 'opening',
            lines: [{ acc: '1250', dr: adv }, { acc: '3000', cr: adv }]
          });
          await E.save('wageRuns', {
            no, kind: 'advance', empId: emp.id, date: today,
            amount: adv, note: 'Opening advance', cancelled: false
          });
        }
      }

      /* 8. BOMs */
      const bomByArt = {};
      for (const b of d.bom) {
        if (!b.art || !b.material || !parseFloat(b.qty)) continue;
        const art = b.art.trim().toUpperCase();
        const matCode = b.material.trim().toUpperCase();
        const item = artMap[art] || E.rows('items').find(i => i.art === art);
        const mat = matMap[matCode] || E.rows('items').find(i => i.art === matCode && i.cat !== 'Finished Good');
        if (!item || !mat) continue;
        (bomByArt[item.id] = bomByArt[item.id] || []).push({
          itemId: mat.id, variantId: '', qty: parseFloat(b.qty)
        });
      }
      for (const itemId in bomByArt) {
        const item = E.D.items.find(i => i.id === itemId);
        if (!item) continue;
        const bl = JSON.parse(JSON.stringify(item));
        item.bom = bomByArt[itemId];
        await E.save('items', item, bl);
      }

      await E.setSetting({ setupDone: true });
      localStorage.removeItem(KEY());
      W = null;
      E.closeM();
      location.hash = '#/dashboard';
      E.go();
      E.toast('Setup complete · factory ready', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.maybeSetup = () => {
    if ((E.role === 'owner' || E.role === 'accountant') && !E.setting('setupDone') && !E.rows('items').length && location.hash !== '#/setup') {
      location.hash = '#/setup';
      E.toast('New factory', 'success');
    }
  };
})(window.ERP);