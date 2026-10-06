import type { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from '../config';
import { pool } from '../db/pool';
import { HttpError } from '../errors';
import { loadActiveUser, verifyToken } from '../middleware/auth';
import { getLook, getSelf } from '../services/users';
import { levelFromXp, stageForLevel } from '../services/progression';
import { cleanText } from '../util';
import { Conn, conns, send, sendTo } from './presence';
import { createRoom, joinRoom, leaveCurrent, listPublic, roomOf } from './rooms';
import { createMatch, joinMatch, leaveMatch, matchOf } from './minigames';
import { setUserMatch, clearUserMatch } from './redisState';

export const ZONES: Record<string, { cx: number; cz: number; r: number }> = {
  lobby: { cx: 0, cz: 0, r: 24 },
  restaurant: { cx: 60, cz: 0, r: 24 },
  gamehall: { cx: 120, cz: 0, r: 24 },
};
const MAX_SPEED = 14; // m/s, generous vs client speed of 5
const TICK_MS = 100;

const members = (zone: string) => [...conns.values()].filter((c) => c.zone === zone);
const entry = (c: Conn) => ({ id: c.userId, u: c.username, stage: c.stage, look: c.look, x: c.x, y: c.y, z: c.z, ry: c.ry });

function leaveZone(c: Conn) {
  if (!c.zone) return;
  const z = c.zone;
  c.zone = null;
  for (const o of members(z)) send(o, 'world.leave', { id: c.userId });
}

function joinZone(c: Conn, name: string) {
  const zone = ZONES[name];
  if (!zone) throw new Error('Unknown zone');
  leaveZone(c);
  c.zone = name;
  c.x = zone.cx + (Math.random() - 0.5) * 6; c.y = 0; c.z = zone.cz + (Math.random() - 0.5) * 6; c.ry = 0;
  c.lastMove = Date.now();
  const others = members(name).filter((o) => o !== c);
  send(c, 'world.joined', { zone: name, x: c.x, y: c.y, z: c.z, players: others.map(entry) });
  for (const o of others) send(o, 'world.enter', entry(c));
}

const isBlocked = async (a: string, b: string) =>
  ((await pool.query('SELECT 1 FROM blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1) LIMIT 1', [a, b])).rowCount ?? 0) > 0;

function chatAllowed(c: Conn): boolean {
  const now = Date.now();
  if (now - c.lastChat < 700) return false;
  c.lastChat = now;
  return true;
}

const num = (v: unknown, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Bad number');
  return Math.min(max, Math.max(min, v));
};

async function handle(c: Conn, t: string, d: any) {
  switch (t) {
    case 'ping': return send(c, 'pong');

    case 'world.join': {
      if (roomOf(c.userId)) throw new Error('Leave your room first');
      return joinZone(c, String(d?.zone));
    }
    case 'world.move': {
      if (!c.zone) return;
      const z = ZONES[c.zone];
      const x = num(d?.x, -1e4, 1e4), y = num(d?.y, -5, 50), zz = num(d?.z, -1e4, 1e4);
      const now = Date.now();
      const dt = Math.max(0.05, (now - c.lastMove) / 1000);
      const speed = Math.hypot(x - c.x, zz - c.z) / dt;
      if (speed > MAX_SPEED || Math.hypot(x - z.cx, zz - z.cz) > z.r + 2) {
        return send(c, 'world.correct', { x: c.x, y: c.y, z: c.z });
      }
      c.x = x; c.y = y; c.z = zz; c.ry = num(d?.ry, -720, 720); c.anim = d?.a === 'walk' ? 'walk' : 'idle'; c.lastMove = now;
      return;
    }
    case 'world.emote': {
      if (!c.zone && !roomOf(c.userId)) return;
      const e = String(d?.e ?? '');
      if (!/^[a-z]{3,12}$/.test(e)) throw new Error('Bad emote');
      const owns = await pool.query('SELECT 1 FROM inventory WHERE user_id=$1 AND item_id=$2', [c.userId, `emote_${e}`]);
      if (!owns.rowCount) throw new Error('You do not own this emote');
      const targets = c.zone ? members(c.zone) : (roomOf(c.userId) ? [...roomOf(c.userId)!.members.keys()].map((id) => conns.get(id)).filter(Boolean) as Conn[] : []);
      for (const o of targets) send(o, 'world.emote', { id: c.userId, e });
      return;
    }

    case 'chat.zone': {
      if (!c.zone) return;
      const text = cleanText(d?.text);
      if (!text || !chatAllowed(c)) return;
      const blockers = new Set((await pool.query('SELECT blocker FROM blocks WHERE blocked=$1', [c.userId])).rows.map((r) => r.blocker));
      for (const o of members(c.zone)) if (!blockers.has(o.userId)) send(o, 'chat.zone', { from: c.username, text });
      return;
    }
    case 'chat.room': {
      const room = roomOf(c.userId);
      const text = cleanText(d?.text);
      if (!room || !text || !chatAllowed(c)) return;
      room.broadcast('chat.room', { from: c.username, text });
      return;
    }
    case 'chat.private': {
      const text = cleanText(d?.text);
      if (!text || !chatAllowed(c)) return;
      const u = (await pool.query('SELECT id,username FROM users WHERE lower(username)=lower($1)', [String(d?.to ?? '')])).rows[0];
      if (!u) throw new Error('Player not found');
      if (await isBlocked(c.userId, u.id)) throw new Error('Message not delivered');
      await pool.query('INSERT INTO messages(sender,recipient,body) VALUES($1,$2,$3)', [c.userId, u.id, text]);
      const payload = { from: c.username, to: u.username, text };
      sendTo(u.id, 'chat.private', payload);
      return send(c, 'chat.private', payload);
    }

    case 'room.list': return send(c, 'room.list', { rooms: listPublic() });
    case 'room.create': {
      leaveZone(c);
      const r = createRoom({ userId: c.userId, username: c.username, stage: c.stage, look: c.look }, !!d?.private);
      return send(c, 'room.joined', { code: r.code });
    }
    case 'room.join': {
      leaveZone(c);
      const r = joinRoom({ userId: c.userId, username: c.username, stage: c.stage, look: c.look }, String(d?.code ?? ''), !!d?.spectate);
      return send(c, 'room.joined', { code: r.code });
    }
    case 'room.leave': {
      leaveCurrent(c.userId);
      return send(c, 'room.left');
    }
    case 'room.start': {
      const r = roomOf(c.userId);
      if (!r) throw new Error('Not in a room');
      return r.start(c.userId);
    }
    case 'room.pick': {
      const r = roomOf(c.userId);
      if (!r) throw new Error('Not in a room');
      return r.pick(c.userId, Number(d?.slot));
    }
    case 'game.match.create': {
      leaveCurrent(c.userId); const m=createMatch({userId:c.userId,username:c.username},String(d?.gameId ?? ''));
      await setUserMatch(c.userId,m.state.id);
      return send(c,'game.match.joined',m.snapshot());
    }
    case 'game.match.join': {
      leaveCurrent(c.userId); const m=joinMatch({userId:c.userId,username:c.username},String(d?.code ?? ''));
      await setUserMatch(c.userId,m.state.id);
      return send(c,'game.match.joined',m.snapshot());
    }
    case 'game.match.ready': { const m=matchOf(c.userId); if(!m) throw new Error('Not in a match'); return m.ready(c.userId); }
    case 'game.match.start': { const m=matchOf(c.userId); if(!m) throw new Error('Not in a match'); return m.start(c.userId); }
    case 'game.match.action': { const m=matchOf(c.userId); if(!m) throw new Error('Not in a match'); return m.action(c.userId,String(d?.action ?? ''),d?.payload ?? {}); }
    case 'game.match.finish': { throw new Error('Match results are settled by the server'); }
    case 'game.match.leave': { leaveMatch(c.userId); await clearUserMatch(c.userId); return send(c,'game.match.left'); }
    case 'room.invite': {
      const r = roomOf(c.userId);
      if (!r) throw new Error('Not in a room');
      const u = (await pool.query('SELECT id FROM users WHERE lower(username)=lower($1)', [String(d?.to ?? '')])).rows[0];
      if (!u || (await isBlocked(c.userId, u.id))) throw new Error('Cannot invite this player');
      sendTo(u.id, 'room.invited', { from: c.username, code: r.code });
      return;
    }
    default:
      throw new Error('Unknown message');
  }
}

async function onConnection(ws: WebSocket, token: string | null) {
  const payload = token ? verifyToken(token) : null;
  if (!payload) return ws.close(4001, 'Unauthorized');
  let user;
  try { user = await loadActiveUser(payload.sub); } catch (e) { return ws.close(4003, (e as HttpError).message); }
  if (!user) return ws.close(4001, 'Unauthorized');

  const old = conns.get(user.id);
  if (old) { send(old, 'error', { message: 'Signed in elsewhere' }); old.ws.close(4000, 'Replaced'); }

  const self = await getSelf(user.id);
  const c: Conn = {
    ws, userId: user.id, username: user.username,
    stage: stageForLevel(levelFromXp(self!.xp)), look: await getLook(user.id),
    zone: null, x: 0, y: 0, z: 0, ry: 0, anim: 'idle', lastMove: Date.now(),
    tokens: 60, tokenTs: Date.now(), lastChat: 0, alive: true,
  };
  conns.set(user.id, c);

  const room = roomOf(user.id);
  if (room) room.reconnect(user.id);
  send(c, 'hello', { user: self, inRoom: !!room });

  ws.on('pong', () => { c.alive = true; });
  ws.on('message', async (raw) => {
    const now = Date.now();
    c.tokens = Math.min(60, c.tokens + ((now - c.tokenTs) / 1000) * 40);
    c.tokenTs = now;
    if (--c.tokens < 0) return; // flood protection: drop
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (typeof msg?.t !== 'string') return;
    try {
      await handle(c, msg.t, msg.d);
    } catch (e: any) {
      send(c, 'error', { message: e?.message ?? 'Error' });
    }
  });
  ws.on('close', () => {
    if (conns.get(user!.id) !== c) return; // replaced by a newer connection
    leaveZone(c);
    conns.delete(user!.id);
    roomOf(user!.id)?.disconnect(user!.id);
    matchOf(user!.id)?.disconnect(user!.id);
    void clearUserMatch(user!.id);
  });
  ws.on('error', () => ws.terminate());
}

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    const originOk = !origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin);
    if (url.pathname !== '/ws' || !originOk) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => void onConnection(ws, url.searchParams.get('token')));
  });

  // world snapshots (compact positions only)
  setInterval(() => {
    for (const name of Object.keys(ZONES)) {
      const list = members(name);
      if (list.length === 0) continue;
      const p = list.map((c) => ({ id: c.userId, x: c.x, y: c.y, z: c.z, ry: c.ry, a: c.anim }));
      for (const c of list) send(c, 'world.state', { p });
    }
  }, TICK_MS);

  // heartbeat
  setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);
}
