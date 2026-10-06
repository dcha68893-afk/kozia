import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db/pool';
import { HttpError } from '../errors';

export interface AuthUser { id: string; username: string; role: string }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

export function signToken(id: string, username: string): string {
  return jwt.sign({ sub: id, u: username }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): { sub: string; u: string } | null {
  try {
    return jwt.verify(token, config.jwtSecret) as any;
  } catch {
    return null;
  }
}

/** Loads the user and rejects banned accounts. Used by REST and WebSocket. */
export async function loadActiveUser(id: string): Promise<AuthUser | null> {
  const r = await pool.query('SELECT id,username,role,banned_until FROM users WHERE id=$1', [id]);
  const u = r.rows[0];
  if (!u) return null;
  if (u.banned_until && new Date(u.banned_until) > new Date()) throw new HttpError(403, 'Account suspended');
  return { id: u.id, username: u.username, role: u.role };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const payload = token ? verifyToken(token) : null;
    if (!payload) throw new HttpError(401, 'Not authenticated');
    const user = await loadActiveUser(payload.sub);
    if (!user) throw new HttpError(401, 'Not authenticated');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireRole(role: string) {
  return (req: Request, _res: Response, next: NextFunction) =>
    req.user?.role === role ? next() : next(new HttpError(403, 'Forbidden'));
}
