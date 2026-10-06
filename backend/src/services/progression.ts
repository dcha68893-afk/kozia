import { PoolClient } from 'pg';

export function levelFromXp(xp: number): number {
  return Math.min(100, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function stageForLevel(l: number): string {
  if (l >= 100) return 'legendary';
  if (l >= 50) return 'elite';
  if (l >= 30) return 'advanced';
  if (l >= 15) return 'character';
  if (l >= 5) return 'basic';
  return 'skeleton';
}

const DEFS: { key: string; test: (u: any) => boolean; reward: number }[] = [
  { key: 'first_win', test: (u) => u.wins >= 1, reward: 50 },
  { key: 'streak_10', test: (u) => u.best_streak >= 10, reward: 300 },
  { key: 'games_100', test: (u) => u.games >= 100, reward: 200 },
  { key: 'level_50', test: (u) => levelFromXp(u.xp) >= 50, reward: 1000 },
];

export async function unlock(c: PoolClient, userId: string, key: string, reward: number): Promise<boolean> {
  const r = await c.query(
    'INSERT INTO achievements(user_id,key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key',
    [userId, key],
  );
  if (r.rowCount) {
    await c.query('UPDATE users SET coins = coins + $2 WHERE id=$1', [userId, reward]);
    return true;
  }
  return false;
}

export async function checkAchievements(c: PoolClient, userId: string): Promise<string[]> {
  const u = (await c.query('SELECT xp,wins,games,best_streak FROM users WHERE id=$1', [userId])).rows[0];
  const got: string[] = [];
  for (const d of DEFS) if (d.test(u) && (await unlock(c, userId, d.key, d.reward))) got.push(d.key);
  return got;
}
