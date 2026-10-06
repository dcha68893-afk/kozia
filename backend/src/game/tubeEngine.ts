import { randomInt } from 'crypto';

export const SLOT_COUNT = 3;
export type Swap = [number, number];

export function difficulty(round: number) {
  return { swaps: Math.min(6 + round * 2, 20), swapMs: Math.max(260, 600 - round * 50) };
}

/** Server-side secure random round. The client only ever replays this. */
export function generateRound(round: number) {
  const { swaps, swapMs } = difficulty(round);
  const list: Swap[] = [];
  let prev = -1;
  while (list.length < swaps) {
    const a = randomInt(SLOT_COUNT);
    let b = randomInt(SLOT_COUNT);
    while (b === a) b = randomInt(SLOT_COUNT);
    const key = Math.min(a, b) * SLOT_COUNT + Math.max(a, b);
    if (key === prev) continue; // never repeat the exact same swap back-to-back
    prev = key;
    list.push([a, b]);
  }
  return { ballStart: randomInt(SLOT_COUNT), swaps: list, swapMs };
}

export function ballSlotAfter(start: number, swaps: Swap[]): number {
  let s = start;
  for (const [a, b] of swaps) {
    if (s === a) s = b;
    else if (s === b) s = a;
  }
  return s;
}
