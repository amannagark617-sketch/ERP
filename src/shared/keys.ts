// Row keys that include the BRAND. A blank brand keeps the old key (vendor:item), so existing sheets stay valid.

/** Clean a typed brand: no key separators, single spaces. Case is kept for display. */
export const normBrand = (b?: string): string => String(b ?? '').replace(/[:|]/g, ' ').replace(/\s+/g, ' ').trim();

/** Key of a price / PO / receipt line: `parent:item` or `parent:item:brand` (brand lower-cased so Kurlon = kurlon). */
export const lineKey = (parent: string, itemId: string, brand?: string): string => {
  const b = normBrand(brand).toLowerCase();
  return parent + ':' + itemId + (b ? ':' + b : '');
};

/** Key of one stock position: an item in one brand. */
export const stockKey = (itemId: string, brand?: string): string => itemId + '|' + normBrand(brand).toLowerCase();

export const sameBrand = (a?: string, b?: string): boolean => normBrand(a).toLowerCase() === normBrand(b).toLowerCase();
export const brandLabel = (b?: string): string => normBrand(b) || '(no brand)';
