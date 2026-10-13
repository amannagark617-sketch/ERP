// ONE date format everywhere people look: DD-MMM-YYYY (e.g. 05-Oct-2026). Inside the app dates stay ISO (yyyy-mm-dd) for easy sorting/maths.
// In the Sheet people may type dates in any common way; reading accepts them all and rewrites them in the standard form.
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
const IST_MIN = 330; // Asia/Kolkata, fixed offset (no daylight saving)

const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const iso = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;
const monthNo = (s: string) => MONTHS.findIndex(m => m.toLowerCase() === s.slice(0, 3).toLowerCase()) + 1;
const year4 = (y: number) => (y < 100 ? 2000 + y : y);

/** Any common way of writing a date → ISO yyyy-mm-dd. Unrecognised text is returned unchanged. Day always comes before month (Indian style). */
export function parseDate(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) return valid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : s;   // 2026-10-05
  if ((m = s.match(/^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/))) {                                                    // 05-Oct-2026, 5 October 2026
    const mo = monthNo(m[2]), y = year4(+m[3]);
    return mo && valid(y, mo, +m[1]) ? iso(y, mo, +m[1]) : s;
  }
  if ((m = s.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})$/))) { const y = year4(+m[3]); return valid(y, +m[2], +m[1]) ? iso(y, +m[2], +m[1]) : s; } // 05-10-2026, 5/10/26
  return s;
}

/** ISO yyyy-mm-dd → DD-MMM-YYYY ('' stays ''; anything else is shown as typed). */
export function showDate(v: unknown): string {
  const s = parseDate(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${MONTHS[+m[2] - 1]}-${m[1]}` : s;
}

/** ISO timestamp (UTC) → "DD-MMM-YYYY HH:mm:ss" in Indian time. */
export function showDateTime(v: unknown): string {
  if (v == null || v === '') return '';
  const t = new Date(String(v));
  if (isNaN(t.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return String(v);
  const l = new Date(t.getTime() + IST_MIN * 60000);
  return `${p2(l.getUTCDate())}-${MONTHS[l.getUTCMonth()]}-${l.getUTCFullYear()} ${p2(l.getUTCHours())}:${p2(l.getUTCMinutes())}:${p2(l.getUTCSeconds())}`;
}

/** "DD-MMM-YYYY HH:mm[:ss]" (Indian time) or an ISO timestamp → ISO timestamp (UTC). Unrecognised text is returned unchanged. */
export function parseDateTime(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  const m = s.match(/^(.+?)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return s;
  const d = parseDate(m[1]).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return s;
  const ms = Date.UTC(+d[1], +d[2] - 1, +d[3], +m[2], +m[3], +(m[4] || 0)) - IST_MIN * 60000;
  return new Date(ms).toISOString();
}
