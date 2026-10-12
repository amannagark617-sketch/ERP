export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);
export const num = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // local date, not UTC
};
export const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const fmtDate = (d?: string) =>
  d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface UploadFile { name: string; mime: string; base64: string }

/** Prepare a chosen file for upload: images are downscaled to a small JPEG, PDFs pass through. */
export function fileToUpload(file: File): Promise<UploadFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (file.type === 'application/pdf') {
        if (file.size > 6 * 1024 * 1024) return reject(new Error('PDF is larger than 6 MB'));
        return resolve({ name: file.name, mime: file.type, base64: dataUrl.split(',')[1] });
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Please choose an image or PDF file'));
      img.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve({ name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', base64: c.toDataURL('image/jpeg', 0.75).split(',')[1] });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
