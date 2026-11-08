/* Lanka Slipper ERP — Service Worker (v50) */
const V = 'lanka-erp-v51';
const CORE = [
  "./", "index.html", "manifest.json", "icons/icon.svg", "css/theme.css", "js/app.js",
  "js/core/audit.js", "js/core/config.js", "js/core/db.js", "js/core/factory.js", "js/core/ledger.js", "js/core/money.js", "js/core/picker.js", "js/core/router.js", "js/core/sequence.js", "js/core/settings.js", "js/core/stock.js", "js/core/sync.js", "js/core/utils.js",
  "js/modules/access.js", "js/modules/assets.js", "js/modules/attendance.js", "js/modules/quality.js", "js/modules/datatools.js", "js/modules/datareset.js", "js/modules/advreg.js", "js/modules/txn.js", "js/modules/summary.js", "js/modules/po.js", "js/modules/stocktake.js", "js/modules/loans.js", "js/modules/mrp.js", "js/modules/accounts.js", "js/modules/cashflow.js", "js/modules/profit.js", "js/modules/quotes.js", "js/modules/budget.js", "js/modules/banking.js", "js/modules/cloud.js", "js/modules/dashboard.js", "js/modules/employees.js", "js/modules/extras.js", "js/modules/inventory.js", "js/modules/items.js", "js/modules/jobs.js", "js/modules/journal.js", "js/modules/parties.js", "js/modules/payroll.js", "js/modules/petty.js", "js/modules/purchases.js", "js/modules/reports.js", "js/modules/returns.js", "js/modules/sales.js", "js/modules/settings.js", "js/modules/production.js", "js/modules/expenses.js", "js/modules/matstock.js", "js/modules/setup.js", "js/modules/closing.js", "js/modules/guide.js", "js/modules/staffloans.js", "js/modules/workingdays.js", "js/modules/fixedexpenses.js", "js/modules/dailyallocation.js", "js/modules/reconciliation.js", "js/modules/daily-hub.js", "js/modules/ai-assistant.js"
];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin !== location.origin && !(u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'))) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});