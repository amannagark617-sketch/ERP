const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const below1000 = (n: number) => (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + below100(n % 100) : '') : below100(n));

/** Whole number in the Indian system (thousand, lakh, crore). */
export function indianWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000); n %= 10_000_000;
  const lakh = Math.floor(n / 100_000); n %= 100_000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(indianWords(crore) + ' Crore');
  if (lakh) parts.push(below100(lakh) + ' Lakh');
  if (thousand) parts.push(below100(thousand) + ' Thousand');
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

/** 480000 -> "Rupees Four Lakh Eighty Thousand Only"; 1250.5 -> "... and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  const total = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Rupees ${indianWords(rupees)}${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}
