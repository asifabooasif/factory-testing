/* Multi-factory engine. */
(E => {
  E.fid = localStorage.getItem('erp_f') || '';
  E.factory = () => E.D.factories.find(f => f.id === E.fid);
  E.canSee = E.canSee || (() => true);
  E.visibleFactories = () => E.D.factories.filter(f => E.canSee(f.id)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const SEED = [
    ['1000', 'Cash in Hand', 'asset', 1], ['1010', 'Petty Cash', 'asset', 0],
    ['1100', 'Bank - Main Account', 'asset', 1], ['1110', 'Post-Dated Cheques Received', 'asset', 0],
    ['1200', 'Trade Receivables', 'asset', 0], ['1250', 'Employee Advances', 'asset', 0],
    ['1300', 'Raw Material Stock', 'asset', 0], ['1310', 'Work In Progress', 'asset', 0],
    ['1320', 'Finished Goods Stock', 'asset', 0],
    ['2000', 'Trade Payables', 'liability', 0], ['2100', 'EPF/ETF Payable', 'liability', 0],
    ['2200', 'Wages Payable', 'liability', 0], ['2210', 'Accrued Piece-Rate Wages', 'liability', 0],
    ['2230', 'Staff Deductions Payable', 'liability', 0], ['2300', 'Accrued Expenses', 'liability', 0],
    ['3000', 'Owner Capital', 'equity', 0], ['3100', 'Retained Earnings', 'equity', 0],
    ['3200', 'Opening Balance Equity', 'equity', 0],
    ['4000', 'Sales Revenue', 'income', 0],
    ['5000', 'Direct Material Cost', 'expense', 0, 'dm', 'variable'],
    ['5100', 'Direct Labour', 'expense', 0, 'dl', 'variable'],
    ['5110', 'Piece-Rate Wages', 'expense', 0, 'dl', 'variable'],
    ['5120', 'Daily Wages - Production', 'expense', 0, 'dl', 'variable'],
    ['5130', 'Production Staff Salaries', 'expense', 0, 'dl', 'fixed'],
    ['5140', 'EPF/ETF on Production Labour', 'expense', 0, 'dl', 'variable'],
    ['5200', 'Factory Overheads (general)', 'expense', 0, 'oh', 'variable'],
    ['5210', 'Factory Electricity', 'expense', 0, 'oh', 'semi'],
    ['5220', 'Factory Rent', 'expense', 0, 'oh', 'fixed'],
    ['5230', 'Machine Repairs & Maintenance', 'expense', 0, 'oh', 'semi'],
    ['5240', 'Indirect Materials (glue, thread, consumables)', 'expense', 0, 'oh', 'variable'],
    ['5250', 'Freight Inwards & Handling', 'expense', 0, 'oh', 'variable'],
    ['5260', 'Depreciation - Factory Machinery', 'expense', 0, 'oh', 'fixed'],
    ['5270', 'Supervisors & Indirect Labour', 'expense', 0, 'oh', 'fixed'],
    ['5280', 'Water, Fuel & Gas', 'expense', 0, 'oh', 'semi'],
    ['5290', 'Overhead Absorbed to Jobs (contra)', 'expense', 0, 'contra', 'variable'],
    ['5295', 'Overhead Under / Over Applied', 'expense', 0, 'oh', 'semi'],
    ['5300', 'Factory Loss (Wastage/Damage)', 'expense', 0, 'loss', 'variable'],
    ['5390', 'Closed Job Adjustments', 'expense', 0, 'oh', 'variable'],
    ['5400', 'Cost of Goods Sold', 'expense', 0, 'cogs', 'variable'],
    ['6000', 'Factory Rent', 'expense', 0, 'oh', 'fixed'],
    ['6010', 'Electricity', 'expense', 0, 'oh', 'semi'],
    ['6020', 'Transport', 'expense', 0, 'sel', 'variable'],
    ['6030', 'Tea & Refreshments', 'expense', 0, 'adm', 'variable'],
    ['6040', 'Maintenance & Repairs', 'expense', 0, 'oh', 'semi'],
    ['6050', 'Admin Salaries', 'expense', 0, 'adm', 'fixed'],
    ['6060', 'Finance Charges', 'expense', 0, 'fin', 'variable'],
    ['6070', 'Telephone & Internet', 'expense', 0, 'adm', 'fixed'],
    ['6080', 'Stationery & Printing', 'expense', 0, 'adm', 'variable'],
    ['6090', 'Office Rent', 'expense', 0, 'adm', 'fixed'],
    ['6100', 'Marketing & Advertising', 'expense', 0, 'sel', 'variable'],
    ['6110', 'Delivery & Distribution', 'expense', 0, 'sel', 'variable'],
    ['6120', 'Insurance', 'expense', 0, 'adm', 'fixed'],
    ['6130', 'Professional Fees', 'expense', 0, 'adm', 'semi'],
    ['6140', 'Bank Charges', 'expense', 0, 'fin', 'variable'],
    ['6150', 'Depreciation - Office', 'expense', 0, 'adm', 'fixed'],
    ['6160', 'Sales Commission', 'expense', 0, 'sel', 'variable'],
    ['6170', 'Security', 'expense', 0, 'adm', 'fixed'],
    ['6180', 'Miscellaneous Expenses', 'expense', 0, 'oth', 'variable']
  ];

  E.NATURE = {
    dm: 'Direct material', dl: 'Direct labour', oh: 'Indirect factory overhead',
    adm: 'Administrative', sel: 'Selling & distribution', fin: 'Finance',
    oth: 'Other', contra: 'Overhead absorbed (contra)', loss: 'Factory loss', cogs: 'Cost of goods sold'
  };
  E.natureTreat = n => n === 'dm' || n === 'dl' ? 'job' : n === 'oh' ? 'pool' : 'period';

  E.ensureCoa = async () => {
    if (!E.fid || !E.D.coa) return 0;
    let n = 0;
    for (const [c, nm, t, b, nat, beh] of SEED) {
      const id = E.fid + '-' + c;
      const a = E.D.coa.find(x => x.factoryId === E.fid && x.code === c);
      if (!a) {
        await E.put('coa', { id, factoryId: E.fid, code: c, name: nm, type: t, bank: b, nature: nat || '', beh: beh || '' });
        n++;
      } else if (nat && !a.nature) {
        a.nature = nat; a.beh = a.beh || beh || '';
        await E.put('coa', a); n++;
      }
    }
    return n;
  };

  E.newFactory = async (name, code) => {
    const f = await E.put('factories', { id: E.uid(), name, code, createdBy: E.user || '' });
    E.setF(f.id);
    await E.openFactory(f.id);
    await E.ensureCoa();
    await E.audit('create', 'factories', f.id, null, f);
    return f;
  };

  E.setF = id => { E.fid = id; localStorage.setItem('erp_f', id); };
  E.renderFSel = () => {
    const v = E.visibleFactories();
    const el = E.$('fsel');
    if (!el) return;
    el.innerHTML = v.map(f => `<option value="${f.id}" ${f.id === E.fid ? 'selected' : ''}>${E.esc(f.name)}</option>`).join('');
    el.style.display = v.length > 1 ? '' : 'none';
  };
  E.switchF = async id => {
    if (E.sync && E.sync.switchTo) return E.sync.switchTo(id);
    E.setF(id); await E.openFactory(id); E.go();
  };
  document.addEventListener('change', e => { if (e.target.id === 'fsel') E.switchF(e.target.value); });

  E.firstFactory = () => {
    E.modal('Welcome — create your first factory', `
      <div class="f">Factory name *<input id="fn" placeholder="Lanka Slipper Works"></div>
      <div class="f">Short code *<input id="fc" placeholder="LSW"></div>
      <p class="muted">Each factory is completely separate: its own data, its own database and its own Google Sheet.</p>
    `, `<button class="btn p" data-a="mkFactory">Create</button>`);
    const x = E.$('mw').querySelector('.mh button');
    if (x) x.remove();
  };
  E.A.firstFac = () => E.firstFactory();
  E.A.mkFactory = async () => {
    try {
      const n = E.val('fn'), c = E.val('fc').toUpperCase();
      if (!n || !c) return E.toast('Name and code required', 'error');
      const f = await E.newFactory(n, c);
      E.closeM(); await E.switchF(f.id); E.toast('Factory created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.deleteFactory = async function (id) {
    if (!E.isOwner()) throw new Error('Only an owner can delete factories');
    const f = E.D.factories.find(x => x.id === id);
    if (!f) throw new Error('Factory not found');
    const visible = E.visibleFactories();
    if (visible.length <= 1) throw new Error('Cannot delete the only factory');
    if (id === E.fid) {
      const other = visible.find(x => x.id !== id);
      if (!other) throw new Error('Cannot delete the only factory');
      try { await E.switchF(other.id); } catch (e) { throw new Error('Could not switch: ' + e.message); }
    }
    try { E.closeFactory(); } catch (e) {}
    try {
      await new Promise((res, rej) => {
        const req = indexedDB.deleteDatabase(E.cfg.db + '_f_' + id);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
        req.onblocked = () => rej(new Error('Database open in another tab. Close other tabs.'));
      });
    } catch (e) {}
    if (window.firebase && E.sync && E.sync.granted) {
      try {
        const db = firebase.firestore();
        const dataRef = db.collection('erp_factories/' + id + '/data');
        while (true) {
          const snap = await dataRef.limit(500).get();
          if (snap.empty) break;
          const batch = db.batch();
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const privSnap = await db.collection('erp_factories/' + id + '/private').get();
        if (!privSnap.empty) {
          const batch = db.batch();
          privSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        await db.collection('erp_factories').doc(id).delete();
      } catch (e) {}
    }
    await E.del('factories', id);
    if (E.sync && Array.isArray(E.sync.users)) {
      for (const u of E.sync.users) {
        if (u.access && u.access[id]) {
          try {
            const access = Object.assign({}, u.access);
            delete access[id];
            await E.sync.updateUser(u.id, { access });
          } catch (e) {}
        }
      }
    }
    try {
      localStorage.removeItem('erp_sheet_' + id);
      localStorage.removeItem('erp_sheet_debug_' + id);
      localStorage.removeItem('erp_wiz_' + id);
      localStorage.removeItem('erp_pend_del_' + id);
    } catch (e) {}
    E.renderFSel();
    return true;
  };
})(window.ERP);