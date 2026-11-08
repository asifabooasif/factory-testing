/* Global namespace + config. */
window.ERP = {
  cfg: {
    db: 'lanka_erp_v2',
    dbVersion: 16,
    version: '1.0.0',
    cols: [
      'factories', 'coa', 'journalEntries', 'auditLog', 'sequences', 'settings',
      'items', 'variants', 'parties', 'employees', 'jobs', 'jobLines',
      'stockMoves', 'purchases', 'issues', 'expenses', 'wageRuns', 'invoices',
      'receipts', 'cheques', 'payments', 'deliveries', 'recon', 'assets',
      'attendance', 'qc', 'quotes', 'budgets', 'vouchers', 'cashCounts',
      'operations', 'rateCards', 'prodLogs', 'costRuns', 'purchaseOrders',
      'stockTakes', 'loans', 'consumables', 'dailyProduction', 'staffLoans',
      'workingDays', 'fixedExpenses', 'salaryHistory', 'dailyAllocations',
      'closedJobVariances', 'recurring'
    ]
  },
  D: {}, R: {}, N: [], A: {}, hooks: []
};