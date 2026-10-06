import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { levelFromXp } from '../services/progression';
import { getSelf } from '../services/users';

export const shopRouter = Router();
shopRouter.use(requireAuth);

shopRouter.get('/items', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT i.id,i.name,i.category,i.price_coins,i.price_gems,i.min_level,i.data->>'color' AS color,
            (inv.user_id IS NOT NULL) AS owned, COALESCE(inv.equipped,false) AS equipped
       FROM items i LEFT JOIN inventory inv ON inv.item_id=i.id AND inv.user_id=$1
      WHERE i.active ORDER BY i.category, i.price_coins, i.price_gems`,
    [req.user!.id],
  );
  res.json({
    items: r.rows.map((x) => ({
      id: x.id, name: x.name, category: x.category, priceCoins: x.price_coins, priceGems: x.price_gems,
      minLevel: x.min_level, color: x.color, owned: x.owned, equipped: x.equipped,
    })),
  });
}));

const idSchema = z.object({ itemId: z.string().min(1).max(64) });

shopRouter.post('/buy', asyncHandler(async (req, res) => {
  const { itemId } = idSchema.parse(req.body);
  await tx(async (c) => {
    const u = (await c.query('SELECT coins,gems,xp FROM users WHERE id=$1 FOR UPDATE', [req.user!.id])).rows[0];
    const item = (await c.query('SELECT * FROM items WHERE id=$1 AND active', [itemId])).rows[0];
    if (!item) throw new HttpError(404, 'Item not found');
    if (levelFromXp(u.xp) < item.min_level) throw new HttpError(403, `Requires level ${item.min_level}`);
    if (u.coins < item.price_coins) throw new HttpError(402, 'Not enough coins');
    if (u.gems < item.price_gems) throw new HttpError(402, 'Not enough gems');
    const ins = await c.query(
      'INSERT INTO inventory(user_id,item_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING item_id',
      [req.user!.id, itemId],
    );
    if (!ins.rowCount) throw new HttpError(409, 'Already owned');
    await c.query('UPDATE users SET coins=coins-$2, gems=gems-$3 WHERE id=$1', [req.user!.id, item.price_coins, item.price_gems]);
  });
  res.json({ user: await getSelf(req.user!.id) });
}));

shopRouter.post('/equip', asyncHandler(async (req, res) => {
  const b = idSchema.extend({ equipped: z.boolean() }).parse(req.body);
  await tx(async (c) => {
    const row = (await c.query(
      'SELECT i.category FROM inventory inv JOIN items i ON i.id=inv.item_id WHERE inv.user_id=$1 AND inv.item_id=$2',
      [req.user!.id, b.itemId],
    )).rows[0];
    if (!row) throw new HttpError(403, 'You do not own this item');
    if (row.category === 'emote') return; // emotes are usable when owned
    if (b.equipped) {
      await c.query(
        `UPDATE inventory SET equipped=false WHERE user_id=$1
           AND item_id IN (SELECT id FROM items WHERE category=$2)`,
        [req.user!.id, row.category],
      );
    }
    await c.query('UPDATE inventory SET equipped=$3 WHERE user_id=$1 AND item_id=$2', [req.user!.id, b.itemId, b.equipped]);
  });
  res.json({ user: await getSelf(req.user!.id) });
}));
