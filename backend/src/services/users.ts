import { pool } from '../db/pool';
import { levelFromXp, stageForLevel } from './progression';

export const DEFAULT_APPEARANCE = { height: 1, build: 1, skin: '#e0b08c', hairStyle: 1, hairColor: '#2b1d14', eyes: '#3b2a1a' };

export const USER_COLS =
  'id,username,email,coins,gems,tickets,xp,reputation,wins,games,streak,best_streak,appearance,last_daily,role,created_at';

export function publicDto(r: any) {
  const level = levelFromXp(r.xp);
  return {
    id: r.id,
    username: r.username,
    xp: r.xp,
    level,
    stage: stageForLevel(level),
    reputation: r.reputation,
    wins: r.wins,
    games: r.games,
    streak: r.streak,
    bestStreak: r.best_streak,
    appearance: { ...DEFAULT_APPEARANCE, ...(r.appearance ?? {}) },
    role: r.role,
  };
}

export function selfDto(r: any) {
  const next = r.last_daily ? new Date(new Date(r.last_daily).getTime() + 20 * 3600 * 1000) : null;
  return {
    ...publicDto(r),
    email: r.email,
    coins: r.coins,
    gems: r.gems,
    tickets: r.tickets,
    nextDailyAt: next && next.getTime() > Date.now() ? next.toISOString() : null,
  };
}

export async function equippedItems(userId: string) {
  const r = await pool.query(
    `SELECT i.id, i.category, i.data->>'color' AS color
       FROM inventory inv JOIN items i ON i.id = inv.item_id
      WHERE inv.user_id=$1 AND inv.equipped`,
    [userId],
  );
  return r.rows as { id: string; category: string; color: string | null }[];
}

export async function getLook(userId: string) {
  const u = (await pool.query('SELECT appearance FROM users WHERE id=$1', [userId])).rows[0];
  return { appearance: { ...DEFAULT_APPEARANCE, ...(u?.appearance ?? {}) }, equipped: await equippedItems(userId) };
}

export async function getSelf(userId: string) {
  const r = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id=$1`, [userId]);
  if (!r.rows[0]) return null;
  return { ...selfDto(r.rows[0]), equipped: await equippedItems(userId) };
}
