import { AppState, PurchaseOrder } from '../types';
import { cfg } from '../config';
import { fetchHistory } from '../store';
import { itemOf, vendorOf } from '../domain';
import type { PdfAssets, PoDoc } from './poPdf';

let assets: Promise<PdfAssets> | null = null;

async function bytes(path: string): Promise<Uint8Array> {
  const res = await fetch(new URL(path, document.baseURI).toString());
  if (!res.ok) throw new Error(`Could not load ${path} (needed to draw the PDF)`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Fonts and logo are fetched once, only when a PDF is first requested. */
function loadAssets(): Promise<PdfAssets> {
  if (!assets) {
    assets = Promise.all([bytes('./fonts/Inter-Regular.ttf'), bytes('./fonts/Inter-SemiBold.ttf'), bytes('./logo.png')])
      .then(([regular, semibold, logo]) => {
        const dv = new DataView(logo.buffer, logo.byteOffset);
        return { regular, semibold, logo, logoRatio: dv.getUint32(20) / dv.getUint32(16) }; // PNG header: width @16, height @20
      })
      .catch(e => { assets = null; throw e; });
  }
  return assets;
}

const split = (s: string | undefined) => String(s ?? '').split('|').map(x => x.trim()).filter(Boolean);

/** Build the PO as a PDF (logo, vendor, items, terms, approvals) from what is on screen + the Settings tab. */
export async function makePoPdf(s: AppState, po: PurchaseOrder): Promise<{ data: Uint8Array; filename: string }> {
  const [{ buildPoPdf }, a, history] = await Promise.all([import('./poPdf'), loadAssets(), fetchHistory(po.id).catch(() => [])]);
  const v = vendorOf(s, po.vendorId);
  const st = cfg.settings;
  const approvals = history.filter(h => /^approved/i.test(h.text) && h.by && h.by !== 'System').sort((x, y) => x.time.localeCompare(y.time))
    .map(h => ({ by: h.by, date: h.time.slice(0, 10) }));
  const issued = po.status === 'Approved' || po.status === 'Sent to Vendor';
  const doc: PoDoc = {
    company: { brandName: cfg.company, signatory: st.PoSignatory || 'Authorised Signatory' },
    po: {
      poNo: po.poNo, date: po.date, expectedDate: po.expectedDate, terms: po.terms, advanceRequired: po.advanceRequired, advanceAmount: po.advanceAmount,
      paymentTerms: v ? `${v.paymentTermsDays} days from invoice date` : '—', preparedBy: po.createdBy, department: po.department,
    },
    vendor: {
      name: v?.name ?? '(vendor)', contact: v?.contact ?? '', email: v?.email ?? '', phone: v?.whatsapp ?? '',
      address: [v?.address, v?.city, v?.state].filter(Boolean).join(', '), gstin: v?.gstin ?? '', pan: v?.pan ?? '', msme: !!v?.msme, msmeType: v?.msmeType ?? '', udyamNo: v?.udyamNo ?? '',
    },
    lines: po.lines.map(l => ({ name: itemOf(s, l.itemId)?.name ?? l.itemId, brand: l.brand ?? '', unit: itemOf(s, l.itemId)?.unit ?? '', qty: l.qty, price: l.price })),
    approvals,
    standardTerms: split(st.PoTerms),
    draft: !issued,
  };
  return { data: buildPoPdf(doc, a), filename: `${po.poNo || 'PO'}${issued ? '' : '-DRAFT'} - ${(v?.name ?? 'vendor').replace(/[^\w ]+/g, '').trim()}.pdf` };
}

export function downloadPdf(data: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open in a new tab instead of downloading (handy for a quick look). */
export function openPdf(data: Uint8Array) {
  window.open(URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' })), '_blank');
}
