import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { isOnline } from '../realtime/presence';
import { levelFromXp } from '../services/progression';
import { cleanText, orderedPair } from '../util';

export const socialRouter = Router();
socialRouter.use(requireAuth);

async function findUser(username: string) {
  const r = await pool.query('SELECT id,username FROM users WHERE lower(username)=lower($1)', [username]);
  if (!r.rows[0]) throw new HttpError(404, 'Player not found');
  return r.rows[0] as { id: string; username: string };
}
const nameBody = z.object({ username: z.string().min(1).max(20) });

socialRouter.get('/friends', asyncHandler(async (req, res) => {
  const me = req.user!.id;
  const r = await pool.query(
    `SELECT f.status,f.requested_by,u.id,u.username,u.xp FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a=$1 THEN f.user_b ELSE f.user_a END
      WHERE f.user_a=$1 OR f.user_b=$1 ORDER BY u.username`,
    [me],
  );
  res.json({
    friends: r.rows.map((x) => ({
      username: x.username, level: levelFromXp(x.xp), online: isOnline(x.id),
      status: x.status === 'accepted' ? 'friend' : x.requested_by === me ? 'outgoing' : 'incoming',
    })),
  });
}));

socialRouter.post('/friends/request', asyncHandler(async (req, res) => {
  const me = req.user!.id;
  const other = await findUser(nameBody.parse(req.body).username);
  if (other.id === me) throw new HttpError(400, 'You cannot add yourself');
  const blocked = await pool.query('SELECT 1 FROM blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)', [me, other.id]);
  if (blocked.rowCount) throw new HttpError(403, 'Not possible with this player');
  const [a, b] = orderedPair(me, other.id);
  const existing = (await pool.query('SELECT status,requested_by FROM friendships WHERE user_a=$1 AND user_b=$2', [a, b])).rows[0];
  if (existing?.status === 'accepted') throw new HttpError(409, 'Already friends');
  if (existing) {
    if (existing.requested_by === me) throw new HttpError(409, 'Request already sent');
    await pool.query(`UPDATE friendships SET status='accepted' WHERE user_a=$1 AND user_b=$2`, [a, b]); // mutual request
  } else {
    await pool.query('INSERT INTO friendships(user_a,user_b,requested_by) VALUES($1,$2,$3)', [a, b, me]);
  }
  res.json({ ok: true });
}));

socialRouter.post('/friends/respond', asyncHandler(async (req, res) => {
  const me = req.user!.id;
  const b = nameBody.extend({ accept: z.boolean() }).parse(req.body);
  const other = await findUser(b.username);
  const [x, y] = orderedPair(me, other.id);
  const row = (await pool.query(`SELECT requested_by FROM friendships WHERE user_a=$1 AND user_b=$2 AND status='pending'`, [x, y])).rows[0];
  if (!row || row.requested_by === me) throw new HttpError(404, 'No pending request');
  if (b.accept) await pool.query(`UPDATE friendships SET status='accepted' WHERE user_a=$1 AND user_b=$2`, [x, y]);
  else await pool.query('DELETE FROM friendships WHERE user_a=$1 AND user_b=$2', [x, y]);
  res.json({ ok: true });
}));

socialRouter.delete('/friends/:username', asyncHandler(async (req, res) => {
  const other = await findUser(req.params.username);
  const [a, b] = orderedPair(req.user!.id, other.id);
  await pool.query('DELETE FROM friendships WHERE user_a=$1 AND user_b=$2', [a, b]);
  res.json({ ok: true });
}));

socialRouter.post('/block', asyncHandler(async (req, res) => {
  const me = req.user!.id;
  const other = await findUser(nameBody.parse(req.body).username);
  if (other.id === me) throw new HttpError(400, 'You cannot block yourself');
  await tx(async (c) => {
    await c.query('INSERT INTO blocks(blocker,blocked) VALUES($1,$2) ON CONFLICT DO NOTHING', [me, other.id]);
    const [a, b] = orderedPair(me, other.id);
    await c.query('DELETE FROM friendships WHERE user_a=$1 AND user_b=$2', [a, b]);
  });
  res.json({ ok: true });
}));

socialRouter.delete('/block/:username', asyncHandler(async (req, res) => {
  const other = await findUser(req.params.username);
  await pool.query('DELETE FROM blocks WHERE blocker=$1 AND blocked=$2', [req.user!.id, other.id]);
  res.json({ ok: true });
}));

socialRouter.post('/report', asyncHandler(async (req, res) => {
  const b = nameBody.extend({ reason: z.string().min(3).max(300), context: z.string().max(1000).optional() }).parse(req.body);
  const other = await findUser(b.username);
  if (other.id === req.user!.id) throw new HttpError(400, 'You cannot report yourself');
  await pool.query('INSERT INTO reports(reporter,reported,reason,context) VALUES($1,$2,$3,$4)', [req.user!.id, other.id, cleanText(b.reason, 300), b.context ? cleanText(b.context, 1000) : null]);
  res.status(201).json({ ok: true });
}));

socialRouter.get('/messages/:username', asyncHandler(async (req, res) => {
  const other = await findUser(req.params.username);
  const r = await pool.query(
    `SELECT s.username AS "from", m.body, m.created_at FROM messages m JOIN users s ON s.id=m.sender
      WHERE (m.sender=$1 AND m.recipient=$2) OR (m.sender=$2 AND m.recipient=$1)
      ORDER BY m.id DESC LIMIT 50`,
    [req.user!.id, other.id],
  );
  res.json({ messages: r.rows.reverse() });
}));
