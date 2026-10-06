import { PoolClient } from 'pg';
import { pool, tx } from '../db/pool';
import { unlock } from './progression';

const DAY = 86400000;

async function ensure(c: PoolClient) {
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString();
  const daily = `Daily Cup ${iso(dayStart).slice(0, 10)}`;
  const weekStart = dayStart - ((now.getUTCDay() + 6) % 7) * DAY;
  const weekly = `Weekly Championship ${iso(weekStart).slice(0, 10)}`;
  const q = `INSERT INTO tournaments(name,starts_at,ends_at,entry_tickets,prizes) VALUES($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING`;
  await c.query(q, [daily, iso(dayStart), iso(dayStart + DAY), 1, JSON.stringify([1000, 500, 250])]);
  await c.query(q, [weekly, iso(weekStart), iso(weekStart + 7 * DAY), 2, JSON.stringify([5000, 2500, 1000, 500, 250])]);
}

async function finalize(c: PoolClient) {
  const due = await c.query(
    `SELECT id, prizes FROM tournaments WHERE status='active' AND ends_at <= now() FOR UPDATE SKIP LOCKED`,
  );
  for (const t of due.rows) {
    const prizes: number[] = t.prizes;
    const entries = await c.query(
      `SELECT user_id FROM tournament_entries WHERE tournament_id=$1 AND score>0
        ORDER BY score DESC, games ASC LIMIT $2`,
      [t.id, prizes.length],
    );
    for (let i = 0; i < entries.rows.length; i++) {
      await c.query('UPDATE users SET coins = coins + $2 WHERE id=$1', [entries.rows[i].user_id, prizes[i]]);
      if (i === 0) await unlock(c, entries.rows[i].user_id, 'tournament_champion', 500);
    }
    await c.query(`UPDATE tournaments SET status='finished' WHERE id=$1`, [t.id]);
  }
}

export async function tournamentTick(): Promise<void> {
  await tx(async (c) => {
    const lock = await c.query('SELECT pg_try_advisory_xact_lock(7340211) AS ok');
    if (!lock.rows[0].ok) return; // another instance is doing it
    await ensure(c);
    await finalize(c);
  });
}

export function startTournamentScheduler(): NodeJS.Timeout {
  const run = () => tournamentTick().catch((e) => console.error('[tournaments]', e));
  run();
  return setInterval(run, 60_000);
}

export { pool };
