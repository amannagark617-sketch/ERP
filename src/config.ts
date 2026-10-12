import { Approver } from './types';

/** Runtime settings, loaded from the Settings and Roles tabs. */
export const cfg = {
  company: 'Little Nap Recliners',
  msmeMaxDays: 45,
  taxRates: [0, 5, 18] as number[],
  tolerance: 1,
  approvers: [] as Approver[],
};

export function applyConfig(settings: Record<string, string>, approvers: Approver[]) {
  cfg.company = settings.CompanyName || cfg.company;
  cfg.msmeMaxDays = Number(settings.MsmeMaxDays) || 45;
  const rates = String(settings.TaxRates || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0);
  cfg.taxRates = rates.length ? rates : [0, 5, 18];
  cfg.tolerance = settings.InvoiceTolerance !== undefined && settings.InvoiceTolerance !== '' ? Number(settings.InvoiceTolerance) : 1;
  cfg.approvers = approvers;
}
