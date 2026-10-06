import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../errors';
import { requireAuth } from '../middleware/auth';
import { levelFromXp } from '../services/progression';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

leaderboardRouter.get('/', asyncHandler(async (req, res) => {
  const type = z.enum(['global', 'wins', 'weekly', 'friends']).default('global').parse(req.query.type ?? 'global');
  let rows: any[];
  if (type === 'weekly') {
    rows = (await pool.query(
      `SELECT u.username,u.xp, COUNT(*) FILTER (WHERE g.won)::int AS wins
         FROM game_results g JOIN users u ON u.id=g.user_id
        WHERE g.kind='round' AND g.created_at > now() - interval '7 days'
        GROUP BY u.id ORDER BY wins DESC, u.xp DESC LIMIT 50`,
    )).rows;
  } else if (type === 'friends') {
    rows = (await pool.query(
      `SELECT username,xp,wins FROM users WHERE id=$1 OR id IN (
         SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END FROM friendships
          WHERE status='accepted' AND (user_a=$1 OR user_b=$1))
        ORDER BY xp DESC LIMIT 50`,
      [req.user!.id],
    )).rows;
  } else {
    rows = (await pool.query(`SELECT username,xp,wins FROM users ORDER BY ${type === 'wins' ? 'wins' : 'xp'} DESC, xp DESC LIMIT 50`)).rows;
  }
  res.json({ type, rows: rows.map((r, i) => ({ rank: i + 1, username: r.username, level: levelFromXp(r.xp), xp: r.xp, wins: r.wins })) });
}));
