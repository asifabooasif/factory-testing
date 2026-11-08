/* PART 2 (v5) — Items strictly PER PAIR.
   ─ price stored as cents PER PAIR
   ─ BOM qty is strictly PER PAIR (fractional if needed for boxes/ropes)
   ─ Bulk copy BOM included
*/
(E => {
  const n = E.N.find(x => x.id === 'items'); if (n) n.soon = 0;
  const CATS = ['Finished Good', 'Raw Material', 'Accessory', 'Packing'];
  const UNITS = ['Pair', 'Pcs', 'Kg', 'Meter', 'Sheet', 'Roll', 'Litre', 'Box', 'Pack', 'g', 'ml'];
  const F = { q: '', g: '', act: '1' };
  const vs = id => E.rows('variants').filter(v => v.itemId === id);
  const ean = async () => {
    const k = +(await E.next('BC')).slice(3), b = '890' + String(k).padStart(9, '0');
    let s = 0; for (let i = 0; i < 12; i++) s += +b[i] * (i % 2 ? 3 : 1);
    return b + ((10 - s % 10) % 10);
  };
  const used = id => E.D.stockMoves.some(m => m.itemId === id) || E.D.jobLines.some(l => l.itemId === id) || E.D.issues.some(l => l.itemId === id);
  const list = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const title = c => c.replace(/\s+/g, ' ').trim().replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const grpOf = i => i.cat === 'Finished Good' ? 'FG:' + (i.sub || 'Other') : i.cat;

  async function genPacks(it, colours) {
    let made = 0;
    const ex = vs(it.id);
    for (const raw of colours) {
      const c = title(raw);
      if (ex.some(v => (v.color || '').toLowerCase() === c.toLowerCase() && !v.size)) continue;
      let sku = it.art + '-' + c.toUpperCase().replace(/\s+/g, ''), k = 2;
      while (E.rows('variants').some(v => v.sku === sku)) sku = sku.split('#')[0] + '#' + k++;
      const v = await E.save('variants', { itemId: it.id, color: c, size: '', sku, barcode: await ean(), active: true });
      ex.push(v); made++;
    }
    return made;
  }
  async function gen(it, sizes, cols) {
    let made = 0;
    const ex = vs(it.id);
    for (const c of cols.length ? cols : ['']) for (const s of sizes.length ? sizes : ['']) {
      if (ex.some(v => (v.color || '').toLowerCase() === c.toLowerCase() && (v.size || '').toLowerCase() === s.toLowerCase())) continue;
      let sku = [it.art, c.slice(0, 3).toUpperCase(), s].filter(Boolean).join('-'), k = 2;
      while (E.rows('variants').some(v => v.sku === sku)) sku = sku.split('#')[0] + '#' + k++;
      const v = await E.save('variants', { itemId: it.id, color: c, size: s, sku, barcode: await ean(), active: true });
      ex.push(v); made++;
    }
    return made;
  }
  E.genPacks = genPacks; E.genVars = gen;

  function chips() {
    const rows = E.rows('items').filter(i => F.act === '' || i.active === (F.act === '1'));
    const cnt = k => rows.filter(i => k === 'FG:*' ? i.cat === 'Finished Good' : grpOf(i) === k).length;
    const subs = [...new Set([...E.fgCats(), ...rows.filter(i => i.cat === 'Finished Good').map(i => i.sub || 'Other')])];
    const b = (k, l, c) => `<button class="chip ${F.g === k ? 'on' : ''}" data-a="itGrp" data-id="${k}">${l} <small>${c}</small></button>`;
    return `<div class="chips">${b('', 'All', rows.length)}${b('FG:*', 'Finished goods', cnt('FG:*'))}${subs.map(s => b('FG:' + s, '↳ ' + E.esc(s), cnt('FG:' + s))).join('')}${['Raw Material', 'Accessory', 'Packing'].map(c => b(c, c, cnt(c))).join('')}</div>`;
  }

  function tbl() {
    const s = F.q.toLowerCase();
    const rows = E.rows('items')
      .filter(i => (!F.g || (F.g === 'FG:*' ? i.cat === 'Finished Good' : grpOf(i) === F.g)) && (F.act === '' || i.active === (F.act === '1')) && (!s || (i.art + ' ' + i.name + ' ' + (i.sub || '') + ' ' + (i.sizeRun || '') + ' ' + vs(i.id).map(v => v.sku + ' ' + v.barcode + ' ' + v.color).join(' ')).toLowerCase().includes(s)))
      .sort((a, b) => grpOf(a).localeCompare(grpOf(b)) || a.art.localeCompare(b.art));
    return `<div class="tw"><table>
      <thead><tr><th>Article No</th><th>Name</th><th>Category</th><th>Size run (pairs/pack)</th><th>Colours</th><th class="r">Price/pair</th><th>🧪</th><th></th></tr></thead>
      <tbody>${rows.map(i => {
        const fgI = i.cat === 'Finished Good', v = vs(i.id).filter(x => x.active);
        const hasBom = i.bom && i.bom.length > 0;
        return `<tr style="${i.active ? '' : 'opacity:.5'}">
          <td><b style="font-size:15px">${E.esc(i.art)}</b></td>
          <td>${E.esc(i.name)}</td>
          <td><span class="tag">${fgI ? E.esc(i.sub || 'Finished Good') : i.cat}</span></td>
          <td>${fgI ? (i.sizeRun ? `<b>${E.esc(i.sizeRun.split(',').map(x => x.trim()).join(' · '))}</b><div class="muted">${i.pack} pairs/pack</div>` : '<span class="muted">not set</span>') : `${i.unit}`}</td>
          <td><button class="btn sm" data-a="vars" data-id="${i.id}">${fgI ? v.length + ' colour' + (v.length === 1 ? '' : 's') : v.length + ' SKUs'}</button> ${fgI ? v.slice(0, 4).map(x => E.esc(x.color || '')).filter(Boolean).join(', ') : ''}</td>
          <td class="r">${fgI ? (i.price ? E.m(i.price) + '<div class="muted">per pair</div>' : '—') : (i.buyPrice ? E.m(i.buyPrice) + '<div class="muted">per ' + E.esc(i.unit) + '</div>' : '<span class="bad">no buy price</span>')}</td>
          <td>${i.consumable ? '<span title="Consumable" style="font-size:16px">🧪</span>' : ''}</td>
          <td class="r">${fgI ? `<button class="btn sm ${hasBom ? '' : 'p'}" data-a="bomM" data-id="${i.id}">${hasBom ? 'BOM ✓' : 'Add BOM'}</button> ` : ''}<button class="btn sm" data-a="editItem" data-id="${i.id}">Edit</button> <button class="btn sm d" data-a="delItem" data-id="${i.id}">${used(i.id) ? (i.active ? 'Deactivate' : 'Activate') : 'Delete'}</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">No items</td></tr>'}</tbody>
    </table></div>`;
  }

  E.route('items', 'Items', () => `<style>.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.chip{border:1px solid var(--bd);background:var(--s);color:var(--t2);border-radius:99px;padding:6px 14px;font-size:12.5px;cursor:pointer}.chip small{opacity:.7;margin-left:3px}.chip.on{background:var(--ac);border-color:var(--ac);color:#fff}</style>
    <div class="bar">
      <input style="max-width:340px" class="fs" placeholder="🔍 Search article, colour, barcode…" data-f="it.q" value="${E.esc(F.q)}">
      <select class="fs" data-f="it.act"><option value="1" ${F.act === '1' ? 'selected' : ''}>Active</option><option value="0" ${F.act === '0' ? 'selected' : ''}>Inactive</option><option value="" ${F.act === '' ? 'selected' : ''}>All</option></select>
      <span class="gap"></span><button class="btn p" data-a="newItem">+ New Item</button>
    </div><div id="chp">${chips()}</div><div id="tbl">${tbl()}</div>`);

  E.A.itGrp = k => { F.g = k; E.$('chp').innerHTML = chips(); E.$('tbl').innerHTML = tbl(); };
  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f && f.startsWith('it.')) { F[f.slice(3)] = t.value; E.$('tbl').innerHTML = tbl(); if (f === 'it.act') E.$('chp').innerHTML = chips(); }
    if (t.id === 'i_cat') { fgToggle(); consToggle(); }
    if (t.id === 'i_run') { const c = E.expandSizes(t.value).length; if (c && E.$('i_pack')) E.$('i_pack').value = c; }
    if (t.id === 'i_cons_m') consModeToggle();
  });

  function fgToggle() {
    const fgI = E.val('i_cat') === 'Finished Good';
    document.querySelectorAll('.i-fg').forEach(x => x.style.display = fgI ? '' : 'none');
    document.querySelectorAll('.i-nf').forEach(x => x.style.display = fgI ? 'none' : '');
    if (fgI && E.$('i_unit')) E.$('i_unit').value = 'Pack';
  }
  function consToggle() { const fgI = E.val('i_cat') === 'Finished Good', g = E.$('i_cons_grp'); if (g) g.style.display = fgI ? 'none' : ''; }
  function consModeToggle() { const m = E.val('i_cons_m'), g = E.$('i_bottle_grp'); if (!g) return; g.style.display = (m === 'bottle') ? '' : 'none'; }

  const form = id => {
    const it = id ? E.D.items.find(x => x.id === id) : null, fgI = !it || it.cat === 'Finished Good';
    const cons = it && it.consumable, consMode = (it && it.consumableMode) || 'bom';
    const curPrice = it && it.price ? (it.price / 100) : '';
    E.modal(it ? 'Edit Item' : 'New Item', `
      <div class="g2">
        <div class="f">Article No *<input id="i_art" value="${E.esc(it && it.art)}" ${it ? 'disabled' : ''} placeholder="F001"></div>
        <div class="f">Category *<select id="i_cat" ${it && used(it.id) ? 'disabled' : ''}>${CATS.map(c => `<option ${(it ? it.cat : 'Finished Good') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="g2 i-fg" style="${fgI ? '' : 'display:none'}">
        <div class="f">Category *<select id="i_sub">${E.fgCats().concat(it && it.sub && !E.fgCats().includes(it.sub) ? [it.sub] : []).map(c => `<option ${it && it.sub === c ? 'selected' : ''}>${E.esc(c)}</option>`).join('')}</select></div>
        <div class="f">Size run (pairs in ONE pack) *<input id="i_run" value="${E.esc(it && it.sizeRun)}" placeholder="36-41"><small class="muted">Try 36-41 → 6 pairs, or 6,7,7,8,8,9</small></div>
      </div>
      <div class="f">Item Name *<input id="i_name" value="${E.esc(it && it.name)}"></div>
      <div class="g2">
        <div class="f">Unit<select id="i_unit">${UNITS.map(u => `<option ${((it ? it.unit : 'Pack') === u) ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="f"><span class="i-fg" style="${fgI ? '' : 'display:none'}">Pairs in one pack</span><span class="i-nf" style="${fgI ? 'display:none' : ''}">Pairs/units per pack (optional)</span><input id="i_pack" type="number" value="${it ? it.pack : E.setting('packSize')}"></div>
      </div>
      <div class="f i-fg" style="${fgI ? '' : 'display:none'}">Selling price PER PAIR (Rs)<input id="i_price" type="number" step="0.01" value="${curPrice}"><small class="muted">Cost per pack = price/pair × pairs/pack</small></div>
      <div class="f i-nf" style="${fgI ? 'display:none' : ''}">Purchase price per unit (Rs) *<input id="i_buy" type="number" step="0.01" value="${it && (it.buyPrice || it.price) ? ((it.buyPrice || it.price) / 100).toFixed(2) : ''}"></div>
      <div class="f">Reorder level<input id="i_min" type="number" value="${it ? (it.min || '') : ''}"></div>
      <div class="g2 i-nf" style="${fgI ? 'display:none' : ''}">
        <div class="f">Preferred supplier<select id="i_sup"><option value="">— none —</option>${E.rows('parties').filter(p => p.active && p.type !== 'Customer').map(p => `<option value="${p.id}" ${it && it.supId === p.id ? 'selected' : ''}>${E.esc(p.name)}</option>`).join('')}</select></div>
        <div class="f">Spec / notes<input id="i_spec" value="${E.esc(it && it.spec)}"></div>
      </div>
      <div class="i-nf" style="${fgI ? 'display:none' : ''}">
        <div class="card" style="background:var(--acs);border:1px solid var(--bd);margin:12px 0;padding:14px">
          <label style="display:flex;gap:10px;align-items:center;cursor:pointer;font-weight:600">
            <input type="checkbox" id="i_cons" style="width:auto" ${cons ? 'checked' : ''}> 🧪 Track as consumable (glue, thread…)
          </label>
          <div id="i_cons_grp" style="${cons ? '' : 'display:none'};margin-top:10px">
            <div class="f">Mode<select id="i_cons_m">
              <option value="bom" ${consMode === 'bom' ? 'selected' : ''}>BOM only</option>
              <option value="weight" ${consMode === 'weight' ? 'selected' : ''}>Weight check → variance</option>
              <option value="bottle" ${consMode === 'bottle' ? 'selected' : ''}>Bottle log → variance</option>
              <option value="manual" ${consMode === 'manual' ? 'selected' : ''}>Manual</option>
            </select></div>
            <div id="i_bottle_grp" style="${consMode === 'bottle' ? '' : 'display:none'}">
              <div class="g2">
                <div class="f">Bottle size<input id="i_bsize" type="number" step="0.01" value="${it && it.bottleSize ? it.bottleSize : ''}"></div>
                <div class="f">Unit<select id="i_bunit">${['g', 'ml', 'Kg', 'L', 'units'].map(u => `<option ${((it && it.bottleUnit) || 'g') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${it ? '<p class="muted">Add colours from the Colours button on the list.</p>' : `
        <div class="f i-fg" style="${fgI ? '' : 'display:none'}">Colours (comma separated) — one barcode each<input id="i_cols" placeholder="Black, Brown, Navy"></div>
        <div class="g2 i-nf" style="${fgI ? 'display:none' : ''}"><div class="f">Sizes<input id="i_sizes" placeholder="6,7,8,9"></div><div class="f">Colours<input id="i_cols2" placeholder="Black,Brown"></div></div>
      `}
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveItem" data-id="${id || ''}">Save</button>`, 1);
    setTimeout(() => { const c = E.$('i_cons'); if (c) c.onchange = () => { const g = E.$('i_cons_grp'); if (g) g.style.display = c.checked ? '' : 'none'; }; }, 50);
  };
  E.A.newItem = () => form();
  E.A.editItem = id => form(id);

  E.A.saveItem = async id => {
    const art = E.val('i_art').toUpperCase(), name = E.val('i_name');
    const cat = E.val('i_cat') || (id && E.D.items.find(x => x.id === id).cat);
    const fgI = cat === 'Finished Good';
    if (!id && !art) return E.toast('Article No required', 'error');
    if (!name) return E.toast('Name required', 'error');
    if (!id && E.rows('items').some(i => i.art === art)) return E.toast('Article No exists', 'error');
    const run = fgI ? E.expandSizes(E.val('i_run')) : [];
    if (fgI && !run.length) return E.toast('Enter size run (e.g., 36-41)', 'error');
    if (!fgI && !(E.c(E.val('i_buy')) > 0)) return E.toast('Enter purchase price', 'error');
    const it = id ? E.D.items.find(x => x.id === id) : { art, active: true };
    const b = id ? JSON.parse(JSON.stringify(it)) : null;
    const cons = !fgI && E.$('i_cons') && E.$('i_cons').checked;
    Object.assign(it, {
      name, cat, unit: fgI ? 'Pack' : E.val('i_unit'),
      pack: fgI ? run.length : Math.max(0, parseInt(E.val('i_pack')) || 0),
      sizeRun: fgI ? run.join(',') : '', sub: fgI ? E.val('i_sub') : '',
      price: fgI ? E.c(E.val('i_price')) : 0,
      buyPrice: fgI ? (it.buyPrice || 0) : E.c(E.val('i_buy')),
      supId: fgI ? '' : E.val('i_sup'), spec: fgI ? '' : E.val('i_spec'),
      min: parseFloat(E.val('i_min')) || 0,
      consumable: cons, consumableMode: cons ? (E.val('i_cons_m') || 'bom') : '',
      bottleSize: cons && E.val('i_cons_m') === 'bottle' ? (parseFloat(E.val('i_bsize')) || 0) : 0,
      bottleUnit: cons && E.val('i_cons_m') === 'bottle' ? (E.val('i_bunit') || 'g') : ''
    });
    await E.save('items', it, b);
    if (!id) {
      const made = fgI ? await genPacks(it, list(E.val('i_cols'))) : await gen(it, list(E.val('i_sizes')), list(E.val('i_cols2')));
      E.toast('Item saved' + (made ? ' · ' + made + ' pack(s)' : ''), 'success');
    } else E.toast('Item updated', 'success');
    E.closeM(); E.go();
  };
  E.A.delItem = async id => {
    const it = E.D.items.find(x => x.id === id);
    if (used(id)) { const b = JSON.parse(JSON.stringify(it)); it.active = !it.active; await E.save('items', it, b); }
    else if (confirm('Delete ' + it.art + '?')) { for (const v of vs(id)) { await E.del('variants', v.id); } await E.del('items', id); }
    E.go();
  };

  /* ═══════════════════════════════════════════════════════════
     BOM MANAGEMENT — STRICTLY PER PAIR
     ═══════════════════════════════════════════════════════════ */
  E.A.bomM = id => {
    const it = E.D.items.find(x => x.id === id);
    if (!it) return;
    const bom = it.bom || [];
    const materials = E.rows('items').filter(i => i.cat !== 'Finished Good').sort((a, b) => a.art.localeCompare(b.art));

    E.modal('BOM — ' + it.art + ' ' + it.name, `
      <p class="muted" style="margin-bottom:14px"><b style="color:var(--ac)">STRICTLY PER PAIR.</b> Define exactly how much material goes into ONE PAIR. (e.g., if a Box holds 6 pairs, enter 0.1667). This BOM is shared across all colours.</p>
      
      <div class="tw"><table>
        <thead><tr><th>Material</th><th class="r">Qty (per Pair)</th><th></th></tr></thead>
        <tbody id="bom_body">
          ${bom.length ? bom.map((b, i) => {
            const mat = E.D.items.find(x => x.id === b.itemId);
            return `<tr data-bom="${i}">
              <td><select class="bom-mat" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:8px">
                <option value="">— select material —</option>
                ${materials.map(m => `<option value="${m.id}" ${b.itemId === m.id ? 'selected' : ''}>${E.esc(m.art)} — ${E.esc(m.name)}</option>`).join('')}
              </select></td>
              <td class="r"><input class="bom-qty" type="number" step="0.0001" value="${b.qty || ''}" style="width:100px;padding:6px;text-align:right;border:1px solid var(--bd);border-radius:8px"></td>
              <td><button class="btn sm d" data-a="bomRm" data-id="${i}">✕</button></td>
            </tr>`;
          }).join('') : '<tr><td colspan="3" class="muted" style="padding:14px;text-align:center">No materials yet. Click + Add below.</td></tr>'}
        </tbody>
      </table></div>
      
      <button class="btn sm" data-a="bomAdd" style="margin-top:10px">+ Add material</button>
      
      <div style="background:#e0f2fe;padding:14px;border-radius:10px;border-left:4px solid #0891b2;margin-top:16px">
        <b style="font-size:13px">💡 Copy this BOM to save time</b>
        <p class="muted" style="margin:6px 0 10px;font-size:12px">If other articles use the exact same materials, copy this BOM to them instantly.</p>
        <button class="btn" data-a="bomCopy" data-id="${it.id}">📋 Copy this BOM to other articles</button>
      </div>
    `, `
      <button class="btn" data-a="close">Cancel</button>
      <button class="btn p" data-a="bomSave" data-id="${it.id}">Save BOM</button>
    `, 1);
  };

  E.A.bomAdd = () => {
    const tb = E.$('bom_body');
    if (tb.innerHTML.includes('No materials yet')) tb.innerHTML = '';
    const idx = Date.now();
    const materials = E.rows('items').filter(i => i.cat !== 'Finished Good').sort((a, b) => a.art.localeCompare(b.art));
    tb.insertAdjacentHTML('beforeend', `<tr data-bom="${idx}">
      <td><select class="bom-mat" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:8px">
        <option value="">— select material —</option>
        ${materials.map(m => `<option value="${m.id}">${E.esc(m.art)} — ${E.esc(m.name)}</option>`).join('')}
      </select></td>
      <td class="r"><input class="bom-qty" type="number" step="0.0001" style="width:100px;padding:6px;text-align:right;border:1px solid var(--bd);border-radius:8px"></td>
      <td><button class="btn sm d" data-a="bomRm" data-id="${idx}">✕</button></td>
    </tr>`);
  };
  E.A.bomRm = (_, e) => { e.target.closest('tr').remove(); };

  E.A.bomSave = async id => {
    try {
      const it = E.D.items.find(x => x.id === id);
      const b = JSON.parse(JSON.stringify(it));
      const rows = [];
      document.querySelectorAll('#bom_body tr[data-bom]').forEach(tr => {
        const matId = tr.querySelector('.bom-mat').value;
        const qty = parseFloat(tr.querySelector('.bom-qty').value) || 0;
        if (matId && qty > 0) rows.push({ itemId: matId, variantId: '', qty: qty }); /* perUnit is now removed/implicitly 'pair' */
      });
      it.bom = rows;
      await E.save('items', it, b);
      E.closeM(); E.go();
      E.toast('BOM saved · ' + rows.length + ' material(s) per pair', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.bomCopy = id => {
    const it = E.D.items.find(x => x.id === id);
    if (!it || !it.bom || !it.bom.length) return E.toast('Add materials to this BOM first', 'error');
    
    const others = E.rows('items').filter(i => i.cat === 'Finished Good' && i.id !== id && i.active).sort((a, b) => a.art.localeCompare(b.art));
    if (!others.length) return E.toast('No other finished goods to copy to', 'error');

    E.modal('Copy BOM to other articles', `
      <p class="muted" style="margin-bottom:14px">Select the articles that use the <b>exact same materials</b> as <b>${E.esc(it.art)}</b>.</p>
      
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn sm" data-a="bomCopyAll">✓ Select all</button>
        <button class="btn sm" data-a="bomCopyNone">✕ Clear all</button>
      </div>

      <div style="max-height:340px;overflow-y:auto;border:1px solid var(--bd);border-radius:8px;padding:10px;background:var(--s2)">
        ${others.map(o => `<label style="display:flex;align-items:center;gap:10px;padding:6px 4px;cursor:pointer;border-radius:6px">
          <input type="checkbox" class="bom-copy-cb" data-id="${o.id}" style="width:auto">
          <span style="flex:1"><b>${E.esc(o.art)}</b> — ${E.esc(o.name)} <span class="muted">(${o.pack} pairs/pack)</span></span>
        </label>`).join('')}
      </div>

      <p class="muted" style="margin-top:10px;font-size:12px">⚠️ This will <b>overwrite</b> any existing BOM on the selected articles.</p>
    `, `
      <button class="btn" data-a="close">Cancel</button>
      <button class="btn p" data-a="bomCopySave" data-id="${id}">Copy to selected</button>
    `);
  };

  E.A.bomCopyAll = () => document.querySelectorAll('.bom-copy-cb').forEach(cb => cb.checked = true);
  E.A.bomCopyNone = () => document.querySelectorAll('.bom-copy-cb').forEach(cb => cb.checked = false);

  E.A.bomCopySave = async fromId => {
    try {
      const from = E.D.items.find(x => x.id === fromId);
      if (!from) throw new Error('Source article not found');
      
      const selected = [...document.querySelectorAll('.bom-copy-cb:checked')].map(cb => cb.dataset.id);
      if (!selected.length) throw new Error('Select at least one article');

      let copied = 0;
      for (const targetId of selected) {
        const target = E.D.items.find(x => x.id === targetId);
        if (!target) continue;
        const b = JSON.parse(JSON.stringify(target));
        target.bom = JSON.parse(JSON.stringify(from.bom || []));
        await E.save('items', target, b);
        copied++;
      }

      E.closeM(); E.go();
      E.toast('BOM copied to ' + copied + ' article(s)', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.vars = id => {
    const it = E.D.items.find(x => x.id === id), fgI = it.cat === 'Finished Good';
    E.modal(it.art + (fgI ? ' · Colour packs' : ' · SKUs'), `
      ${fgI ? `<p class="muted" style="margin-bottom:10px"><b>${it.pack}</b> pairs per pack · size run <b>${E.esc((it.sizeRun || '').split(',').join(' · '))}</b></p>` : ''}
      <div class="tw"><table>
        <thead><tr><th>${fgI ? 'Colour' : 'SKU'}</th><th>Barcode</th><th></th></tr></thead>
        <tbody>${vs(id).map(v => `<tr style="${v.active ? '' : 'opacity:.5'}">
          <td><b>${E.esc(v.color || v.sku)}</b><div class="muted">${E.esc(v.sku)}</div></td>
          <td>${v.barcode}</td>
          <td class="r"><button class="btn sm" data-a="lblOne" data-id="${v.id}">🏷</button> <button class="btn sm" data-a="vToggle" data-id="${v.id}">${v.active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>`).join('') || '<tr><td colspan="3" class="muted">None yet</td></tr>'}</tbody>
      </table></div>
      <div class="f" style="margin-top:12px">Add colours (comma separated)<input id="v_c" placeholder="Navy, Pink"></div>
    `, `<button class="btn" data-a="close">Close</button><button class="btn p" data-a="addVars" data-id="${id}">Generate</button>`, 1);
  };
  E.A.addVars = async id => {
    const it = E.D.items.find(x => x.id === id);
    const made = it.cat === 'Finished Good' ? await genPacks(it, list(E.val('v_c'))) : await gen(it, list(E.val('v_s')), list(E.val('v_c')));
    E.toast(made + ' new SKU(s)', made ? 'success' : '');
    E.A.vars(id); E.go();
  };
  E.A.vToggle = async id => {
    const v = E.D.variants.find(x => x.id === id), b = JSON.parse(JSON.stringify(v));
    v.active = !v.active; await E.save('variants', v, b); E.A.vars(v.itemId); E.go();
  };
  E.A.lblOne = id => {
    const v = E.D.variants.find(x => x.id === id);
    const k = E.skuList(() => true).find(s => s.variantId === id);
    if (k) E.printLabels([k], parseInt(prompt('How many labels?', '1')) || 1);
  };
})(window.ERP);