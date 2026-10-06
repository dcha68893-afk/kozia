import { config } from '../config';
import { tx } from '../db/pool';
import { checkAchievements, levelFromXp } from './progression';

const TODAY = `(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

async function earnedToday(c: any, userId: string): Promise<number> {
  const r = await c.query(
    `SELECT COALESCE(SUM(coins),0)::int AS s FROM game_results WHERE user_id=$1 AND created_at >= ${TODAY}`,
    [userId],
  );
  return r.rows[0].s;
}

export interface RoundAward { coins: number; xp: number; levelUp: boolean; achievements: string[] }

/** Server-side settlement of one tube round for one player. */
export async function recordRound(userId: string, roomId: string, roundNo: number, won: boolean): Promise<RoundAward> {
  return tx(async (c) => {
    const before = (await c.query('SELECT xp FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    const cap = Math.max(0, config.dailyCoinCap - (await earnedToday(c, userId)));
    const coins = won ? Math.min(config.winCoins, cap) : 0;
    const xp = won ? config.winXp : config.playXp;
    await c.query(
      `UPDATE users SET coins = coins + $2, xp = xp + $3, games = games + 1,
         wins = wins + (CASE WHEN $4::boolean THEN 1 ELSE 0 END),
         streak = CASE WHEN $4::boolean THEN streak + 1 ELSE 0 END,
         best_streak = CASE WHEN $4::boolean THEN GREATEST(best_streak, streak + 1) ELSE best_streak END
       WHERE id = $1`,
      [userId, coins, xp, won],
    );
    await c.query(
      'INSERT INTO game_results(room_id,user_id,round_no,kind,won,coins,xp) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [roomId, userId, roundNo, 'round', won, coins, xp],
    );
    await c.query(
      `UPDATE tournament_entries te SET score = score + $2, games = games + 1
         FROM tournaments t
        WHERE te.tournament_id = t.id AND te.user_id = $1 AND t.status = 'active'
          AND now() BETWEEN t.starts_at AND t.ends_at`,
      [userId, won ? 10 : 2],
    );
    const achievements = await checkAchievements(c, userId);
    return { coins, xp, levelUp: levelFromXp(before.xp + xp) > levelFromXp(before.xp), achievements };
  });
}

export async function grantMatchBonus(userId: string, roomId: string): Promise<{ coins: number; xp: number }> {
  return tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const cap = Math.max(0, config.dailyCoinCap - (await earnedToday(c, userId)));
    const coins = Math.min(config.matchBonusCoins, cap);
    const xp = config.matchBonusXp;
    await c.query('UPDATE users SET coins = coins + $2, xp = xp + $3 WHERE id=$1', [userId, coins, xp]);
    await c.query(
      `INSERT INTO game_results(room_id,user_id,round_no,kind,won,coins,xp) VALUES($1,$2,0,'bonus',false,$3,$4)`,
      [roomId, userId, coins, xp],
    );
    return { coins, xp };
  });
}
