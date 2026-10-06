import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth, signToken } from '../middleware/auth';
import { DEFAULT_APPEARANCE, getSelf } from '../services/users';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/, '3-20 letters, numbers or _'),
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
});

authRouter.post('/register', asyncHandler(async (req, res) => {
  const b = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(b.password, 12);
  let id: string;
  try {
    id = await tx(async (c) => {
      const r = await c.query(
        `INSERT INTO users(username,email,password_hash,appearance) VALUES($1,$2,$3,$4) RETURNING id`,
        [b.username, b.email, hash, JSON.stringify(DEFAULT_APPEARANCE)],
      );
      await c.query(
        `INSERT INTO inventory(user_id,item_id,equipped)
         SELECT $1, id, (category <> 'emote') FROM items
          WHERE price_coins=0 AND price_gems=0 AND min_level=1 AND active`,
        [r.rows[0].id],
      );
      return r.rows[0].id as string;
    });
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'Username or email already taken');
    throw e;
  }
  res.status(201).json({ token: signToken(id, b.username), user: await getSelf(id) });
}));

const loginSchema = z.object({ login: z.string().min(1).max(255), password: z.string().min(1).max(72) });

authRouter.post('/login', asyncHandler(async (req, res) => {
  const b = loginSchema.parse(req.body);
  const r = await pool.query(
    'SELECT id,username,password_hash,banned_until FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1) LIMIT 1',
    [b.login],
  );
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(b.password, u.password_hash))) throw new HttpError(401, 'Wrong username or password');
  if (u.banned_until && new Date(u.banned_until) > new Date()) throw new HttpError(403, 'Account suspended');
  res.json({ token: signToken(u.id, u.username), user: await getSelf(u.id) });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: await getSelf(req.user!.id) });
}));
