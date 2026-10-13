// Which menu screens a role sees. Edited in the Roles tab ("Screens this role sees"); these are the starting values.
export const ALL_SCREENS = ['Dashboard', 'Purchase Orders', 'Goods Receipt', 'Stock', 'Accounts', 'Vendors', 'Items & Prices', 'Users & Access'];

export const DEFAULT_SCREENS: Record<string, string[]> = {
  Admin: ALL_SCREENS,
  'Factory Head': ['Dashboard', 'Purchase Orders', 'Stock'],
  Purchase: ['Dashboard', 'Purchase Orders', 'Stock', 'Vendors', 'Items & Prices'],
  Accounts: ['Dashboard', 'Purchase Orders', 'Accounts', 'Vendors'],
  Inventory: ['Dashboard', 'Purchase Orders', 'Goods Receipt', 'Stock'],
};
/** A role nobody configured gets the bare minimum. */
export const FALLBACK_SCREENS = ['Dashboard', 'Purchase Orders'];

/** Parse the Roles-tab cell ("Dashboard, Stock" / "All") into valid screen names (tolerant of case and spacing). */
export function parseScreens(cell: string | undefined, roleName: string, level: number, adminLevel: number): string[] {
  if (level >= adminLevel) return ALL_SCREENS;
  const text = String(cell ?? '').trim();
  if (!text) return DEFAULT_SCREENS[roleName] ?? FALLBACK_SCREENS;
  if (/^all$/i.test(text)) return ALL_SCREENS;
  const wanted = text.split(/[,;|]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const out = ALL_SCREENS.filter(s => wanted.includes(s.toLowerCase()));
  return out.includes('Dashboard') ? out : ['Dashboard', ...out];
}
