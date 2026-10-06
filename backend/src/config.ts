import 'dotenv/config';

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required environment variable ${k}`);
  return v;
}
const num = (k: string, d: number) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const bool = (k: string, d = false) => (process.env[k] !== undefined ? process.env[k] === 'true' : d);

const env = process.env.NODE_ENV ?? 'development';

export const config = {
  env,
  isProd: env === 'production',
  port: num('PORT', 3000),
  databaseUrl: need('DATABASE_URL'),
  databaseSsl: bool('DATABASE_SSL'),
  jwtSecret: need('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean),
  bannedWords: (process.env.BANNED_WORDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  allowSoloRooms: bool('ALLOW_SOLO_ROOMS'),
  dailyCoinCap: num('DAILY_COIN_CAP', 3000),
  tubeRounds: num('TUBE_ROUNDS', 5),
  winCoins: 50,
  winXp: 25,
  playXp: 8,
  matchBonusCoins: 100,
  matchBonusXp: 50,
};

if (config.isProd) {
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  if (config.corsOrigins.includes('*')) console.warn('[warn] CORS_ORIGINS=* in production. Restrict it to your frontend origin.');
  if (config.allowSoloRooms) console.warn('[warn] ALLOW_SOLO_ROOMS=true in production allows solo coin farming.');
}
