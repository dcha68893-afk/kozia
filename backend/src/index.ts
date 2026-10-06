import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import http from 'http';
import { config } from './config';
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { errorMiddleware } from './errors';
import { attachWebSocket } from './realtime/ws';
import { authRouter } from './routes/auth';
import { economyRouter } from './routes/economy';
import { leaderboardRouter } from './routes/leaderboard';
import { modRouter } from './routes/mod';
import { profileRouter } from './routes/profile';
import { shopRouter } from './routes/shop';
import { socialRouter } from './routes/social';
import { tournamentRouter } from './routes/tournaments';
import { startTournamentScheduler } from './services/tournaments';

async function main() {
  await migrate();

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: '20kb' }));

  const startedAt = Date.now();
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, service: 'necpra-world', version: '1.0.0', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
    } catch {
      res.status(503).json({ ok: false, service: 'necpra-world' });
    }
  });

  app.get('/ready', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ready: true }); }
    catch { res.status(503).json({ ready: false }); }
  });

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/shop', shopRouter);
  app.use('/api/economy', economyRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/tournaments', tournamentRouter);
  app.use('/api/social', socialRouter);
  app.use('/api/mod', modRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorMiddleware);

  const server = http.createServer(app);
  attachWebSocket(server);
  const sched = startTournamentScheduler();

  server.listen(config.port, () => console.log(`Necpra backend listening on :${config.port} (${config.env})`));

  const shutdown = () => {
    clearInterval(sched);
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
