import { TableKey } from './schema';

type Rows = Partial<Record<TableKey, any[]>>;

const caps = (...on: string[]) => Object.fromEntries(['cPo', 'cAdvance', 'cReceive', 'cIssue', 'cAdjust', 'cPay', 'cMaster', 'cUsers'].map(k => [k, on.includes(k)]));

/** Written on first setup: the process policy only - no business data. */
export function configSeed(): Rows {
  return {
    roles: [
      { role: 'Admin', level: 5, approvesAbove: '', ...caps('cPo', 'cAdvance', 'cReceive', 'cIssue', 'cAdjust', 'cPay', 'cMaster', 'cUsers') },
      { role: 'CA', level: 4, approvesAbove: '1000000', ...caps() },
      { role: 'HO', level: 4, approvesAbove: '', ...caps('cMaster', 'cAdjust') },
      { role: 'Factory Head', level: 3, approvesAbove: '0', ...caps() },
      { role: 'Purchase', level: 2, approvesAbove: '', ...caps('cPo') },
      { role: 'Accounts', level: 2, approvesAbove: '', ...caps('cAdvance', 'cPay') },
      { role: 'Inventory', level: 1, approvesAbove: '', ...caps('cReceive', 'cIssue') },
    ],
    // One starter login with NO password: the admin types one into the Users tab before first use.
    users: [{ loginId: 'admin', password: '', name: 'Administrator', role: 'Admin', department: 'Management', level: 5, reportsTo: '', active: true }],
    settings: [
      { key: 'CompanyName', value: 'Little Nap Recliners', description: 'Shown in the app header' },
      { key: 'MsmeMaxDays', value: '45', description: 'Maximum payment days for MSME vendors' },
      { key: 'TaxRates', value: '0,5,18', description: 'Tax rates offered at goods receipt (%)' },
      { key: 'InvoiceTolerance', value: '1', description: 'Allowed difference (Rs) between system total and invoice total' },
      { key: 'RecentMonths', value: '6', description: 'The app loads settled POs/stock from the last N months (open items always load). "Load full history" in the app shows everything' },
      { key: 'DriveFolderId', value: '', description: 'Drive folder for uploads (filled in automatically)' },
    ],
  };
}
