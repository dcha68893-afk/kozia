import { Router } from 'express';
import { tx } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { getSelf } from '../services/users';

export const economyRouter = Router();
economyRouter.use(requireAuth);

economyRouter.post('/daily', asyncHandler(async (req, res) => {
  await tx(async (c) => {
    const u = (await c.query('SELECT last_daily FROM users WHERE id=$1 FOR UPDATE', [req.user!.id])).rows[0];
    if (u.last_daily && Date.now() - new Date(u.last_daily).getTime() < 20 * 3600 * 1000) {
      throw new HttpError(429, 'Daily reward not ready yet');
    }
    await c.query('UPDATE users SET coins=coins+200, tickets=tickets+1, last_daily=now() WHERE id=$1', [req.user!.id]);
  });
  res.json({ user: await getSelf(req.user!.id), reward: { coins: 200, tickets: 1 } });
}));
