/** Tax % of an item: its own "Tax %" cell in the Items tab, or the standard rate (18 if offered, else the first of Settings → TaxRates). */
export function parseRates(setting: string | undefined): number[] {
  const r = String(setting || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0);
  return r.length ? r : [0, 5, 18];
}
export function standardTax(rates: number[]): number { return rates.indexOf(18) >= 0 ? 18 : rates[0]; }
export function itemTaxRate(cell: unknown, rates: number[]): number {
  const t = String(cell ?? '').trim().replace('%', '');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) && n >= 0 ? n : standardTax(rates);
}
