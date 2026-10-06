import { Router } from 'express';
import { pool, tx } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { levelFromXp } from '../services/progression';
import { getSelf } from '../services/users';

export const tournamentRouter = Router();
tournamentRouter.use(requireAuth);

tournamentRouter.get('/', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT t.id,t.name,t.starts_at,t.ends_at,t.entry_tickets,t.prizes,t.status,
            (e.user_id IS NOT NULL) AS joined, COALESCE(e.score,0) AS my_score,
            (SELECT COUNT(*) FROM tournament_entries x WHERE x.tournament_id=t.id)::int AS players
       FROM tournaments t LEFT JOIN tournament_entries e ON e.tournament_id=t.id AND e.user_id=$1
      WHERE t.status='active' ORDER BY t.ends_at LIMIT 20`,
    [req.user!.id],
  );
  res.json({
    tournaments: r.rows.map((t) => ({
      id: t.id, name: t.name, endsAt: t.ends_at, entryTickets: t.entry_tickets, prizes: t.prizes,
      joined: t.joined, myScore: t.my_score, players: t.players,
    })),
  });
}));

tournamentRouter.post('/:id/join', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Bad id');
  await tx(async (c) => {
    const t = (await c.query(`SELECT * FROM tournaments WHERE id=$1 AND status='active' AND now() BETWEEN starts_at AND ends_at`, [id])).rows[0];
    if (!t) throw new HttpError(404, 'Tournament not active');
    const ins = await c.query(
      'INSERT INTO tournament_entries(tournament_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
      [id, req.user!.id],
    );
    if (!ins.rowCount) throw new HttpError(409, 'Already joined');
    const paid = await c.query('UPDATE users SET tickets=tickets-$2 WHERE id=$1 AND tickets>=$2 RETURNING id', [req.user!.id, t.entry_tickets]);
    if (!paid.rowCount) throw new HttpError(402, 'Not enough tickets');
  });
  res.json({ user: await getSelf(req.user!.id) });
}));

tournamentRouter.get('/:id/leaderboard', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Bad id');
  const r = await pool.query(
    `SELECT u.username,u.xp,e.score,e.games FROM tournament_entries e JOIN users u ON u.id=e.user_id
      WHERE e.tournament_id=$1 ORDER BY e.score DESC, e.games ASC LIMIT 50`,
    [id],
  );
  res.json({ rows: r.rows.map((x, i) => ({ rank: i + 1, username: x.username, level: levelFromXp(x.xp), score: x.score, games: x.games })) });
}));
