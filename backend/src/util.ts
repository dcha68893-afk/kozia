import { config } from './config';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function cleanText(s: unknown, max = 200): string {
  if (typeof s !== 'string') return '';
  let t = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  for (const w of config.bannedWords) t = t.replace(new RegExp(esc(w), 'gi'), '*'.repeat(w.length));
  return t;
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
