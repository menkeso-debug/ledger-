export function money(n: number, dp = 0): string {
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return (n < 0 ? '-$' : '$') + s;
}

export function pts(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  const today = new Date();
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (d.toDateString() === today.toDateString()) return `Today · ${fmt}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday · ${fmt}`;
  return fmt;
}

export function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return 'This month';
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function monthName(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
}
