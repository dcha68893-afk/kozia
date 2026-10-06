import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { DEFAULT_APPEARANCE, equippedItems, getSelf, publicDto } from '../services/users';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const appearanceSchema = z.object({
  height: z.number().min(0.85).max(1.15),
  build: z.number().min(0.8).max(1.25),
  skin: hex,
  hairStyle: z.number().int().min(0).max(5),
  hairColor: hex,
  eyes: hex,
});

profileRouter.patch('/appearance', asyncHandler(async (req, res) => {
  const a = appearanceSchema.parse(req.body);
  await pool.query('UPDATE users SET appearance=$2 WHERE id=$1', [req.user!.id, JSON.stringify({ ...DEFAULT_APPEARANCE, ...a })]);
  res.json({ user: await getSelf(req.user!.id) });
}));

profileRouter.get('/:username', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT id,username,xp,reputation,wins,games,streak,best_streak,appearance,role FROM users WHERE lower(username)=lower($1)`,
    [req.params.username],
  );
  if (!r.rows[0]) throw new HttpError(404, 'Player not found');
  const ach = await pool.query('SELECT key FROM achievements WHERE user_id=$1 ORDER BY unlocked_at', [r.rows[0].id]);
  res.json({
    user: { ...publicDto(r.rows[0]), equipped: await equippedItems(r.rows[0].id), achievements: ach.rows.map((x) => x.key) },
  });
}));
