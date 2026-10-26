const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const inr = (v) => inrFmt.format(Number(v ?? 0));
export const inrShort = (v) => inrWhole.format(Number(v ?? 0));
export const num = (v) => new Intl.NumberFormat('en-IN').format(Number(v ?? 0));

// "2026-10-25" and "2026-10-25T14:03:11" are both local times with no zone
// The API sends dates as ISO strings ('2026-10-26T00:00:00.000Z'); keep the calendar day, ignore the zone.
const parse = (s) => (s ? new Date(/Z$|\.\d{3}/.test(s) ? `${s.slice(0, 10)}T00:00:00` : s.length === 10 ? `${s}T00:00:00` : s) : null);
export const fmtDate = (s) => (s ? parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (s) => (s ? parse(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
export const fmtDateTime = (s) => (s ? `${fmtDate(s)}, ${fmtTime(s)}` : '—');

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
export const groupAcc = (n) => String(n).replace(/(\d{4})(?=\d)/g, '$1 ');
export const titleCase = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const initials = (n) => String(n ?? '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
