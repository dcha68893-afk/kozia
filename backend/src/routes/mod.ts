import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { kick } from '../realtime/presence';

export const modRouter = Router();
modRouter.use(requireAuth, requireRole('moderator'));

modRouter.get('/reports', asyncHandler(async (_req, res) => {
  const r = await pool.query(
    `SELECT r.id,a.username AS reporter,b.username AS reported,r.reason,r.context,r.created_at
       FROM reports r JOIN users a ON a.id=r.reporter JOIN users b ON b.id=r.reported
      WHERE r.status='open' ORDER BY r.id LIMIT 100`,
  );
  res.json({ reports: r.rows });
}));

modRouter.post('/reports/:id/resolve', asyncHandler(async (req, res) => {
  await pool.query(`UPDATE reports SET status='resolved' WHERE id=$1`, [Number(req.params.id)]);
  res.json({ ok: true });
}));

modRouter.post('/ban', asyncHandler(async (req, res) => {
  const b = z.object({ username: z.string(), hours: z.number().min(1).max(24 * 365), reason: z.string().max(300).default('') }).parse(req.body);
  const r = await pool.query(
    `UPDATE users SET banned_until = now() + ($2 || ' hours')::interval, ban_reason=$3
      WHERE lower(username)=lower($1) AND role <> 'moderator' RETURNING id`,
    [b.username, String(b.hours), b.reason],
  );
  if (!r.rowCount) throw new HttpError(404, 'Player not found');
  kick(r.rows[0].id, 'Account suspended');
  res.json({ ok: true });
}));
