import fs from 'fs';
import path from 'path';
import { pool } from './pool';

interface Seed { id: string; name: string; category: string; coins: number; gems: number; level: number; data: object }

// Exactly one free (0/0, level 1) item per category = the starter outfit.
const SEEDS: Seed[] = [
  { id: 'top_tee_white', name: 'White Tee', category: 'top', coins: 0, gems: 0, level: 1, data: { color: '#f2f2f2' } },
  { id: 'top_hoodie_blue', name: 'Blue Hoodie', category: 'top', coins: 150, gems: 0, level: 1, data: { color: '#2f6fdb' } },
  { id: 'top_jacket_black', name: 'Black Jacket', category: 'top', coins: 400, gems: 0, level: 5, data: { color: '#1b1b1f' } },
  { id: 'top_suit_navy', name: 'Navy Suit Jacket', category: 'top', coins: 1200, gems: 0, level: 15, data: { color: '#18284a' } },
  { id: 'top_neon', name: 'Neon Future Jacket', category: 'top', coins: 0, gems: 60, level: 10, data: { color: '#19f0c8' } },
  { id: 'pants_jeans', name: 'Jeans', category: 'bottom', coins: 0, gems: 0, level: 1, data: { color: '#3a4f7a' } },
  { id: 'pants_chino', name: 'Chinos', category: 'bottom', coins: 200, gems: 0, level: 1, data: { color: '#b89f74' } },
  { id: 'pants_suit', name: 'Suit Trousers', category: 'bottom', coins: 900, gems: 0, level: 15, data: { color: '#18284a' } },
  { id: 'shoes_sneaker_white', name: 'White Sneakers', category: 'shoes', coins: 0, gems: 0, level: 1, data: { color: '#ffffff' } },
  { id: 'shoes_boots', name: 'Leather Boots', category: 'shoes', coins: 300, gems: 0, level: 5, data: { color: '#4a2e1b' } },
  { id: 'shoes_gold', name: 'Gold Sneakers', category: 'shoes', coins: 0, gems: 40, level: 1, data: { color: '#d4af37' } },
  { id: 'acc_sunglasses', name: 'Sunglasses', category: 'accessory', coins: 250, gems: 0, level: 1, data: {} },
  { id: 'acc_headset', name: 'Headset', category: 'accessory', coins: 180, gems: 0, level: 1, data: {} },
  { id: 'acc_crown', name: 'Crown', category: 'accessory', coins: 0, gems: 100, level: 30, data: {} },
  { id: 'emote_wave', name: 'Wave', category: 'emote', coins: 0, gems: 0, level: 1, data: {} },
  { id: 'emote_cheer', name: 'Cheer', category: 'emote', coins: 200, gems: 0, level: 1, data: {} },
  { id: 'emote_laugh', name: 'Laugh', category: 'emote', coins: 150, gems: 0, level: 1, data: {} },
  { id: 'emote_dance', name: 'Dance', category: 'emote', coins: 300, gems: 0, level: 1, data: {} },
];

export async function migrate(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject TEXT UNIQUE');
  await pool.query('ALTER TABLE game_results ADD COLUMN IF NOT EXISTS rank INT');
  await pool.query('ALTER TABLE game_results ADD COLUMN IF NOT EXISTS score INT');
  for (const s of SEEDS) {
    await pool.query(
      `INSERT INTO items(id,name,category,price_coins,price_gems,min_level,data)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
         price_coins=EXCLUDED.price_coins, price_gems=EXCLUDED.price_gems,
         min_level=EXCLUDED.min_level, data=EXCLUDED.data`,
      [s.id, s.name, s.category, s.coins, s.gems, s.level, JSON.stringify(s.data)],
    );
  }
}

if (require.main === module) {
  migrate()
    .then(() => { console.log('Migration complete'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
