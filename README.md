# Little Nap ERP – Purchase-to-Inventory

Implements the *Purchase-to-Inventory System* process design: Vendor master → PO → approval
(Factory Head, plus CA above Rs 10 Lac) → advance payment → send to vendor → pending/delay tracking →
goods receipt with invoice & tax → invoice acceptance → payment, with three-way match and a per-PO
payment tracker.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Works as-is in Google AI Studio (Vite + React + TypeScript). No API key is needed.

## How it works

- Use **Acting as** (top bar) to switch between Purchase, Factory Head, CA, HO, Accounts and Inventory.
- Data is stored in the browser (`localStorage`). **Reset demo data** restores the seed.
- Price is read-only everywhere except HO (Vendors & Prices). Inventory can only edit PO *quantity*, and only when
  flagging an invoice mismatch; price differences are referred to HO.
- Grand total must match the invoice (±Rs 1) before a receipt is saved; advance paid is deducted automatically.
- MSME vendors are listed separately for Accounts (45-day cap) along with old pending balances.

## Code map

| Path | Purpose |
|---|---|
| `src/types.ts` | Data model |
| `src/domain.ts` | Business rules/calculations (approval limit, pending, outstanding, due dates) |
| `src/store.ts` | State + all workflow actions (swap this layer for a real backend later) |
| `src/seed.ts` | Demo data |
| `src/pages/*` | Screens |

## Next phase (from the process doc)

Requisition slip → PO link, Inventory out (issue to production), BOM & customization.
