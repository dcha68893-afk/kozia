/* End-to-end smoke test: two real accounts, REST + WebSocket, full tube match.
   Usage: BASE_URL=http://localhost:3000 npm run smoke */
import WebSocket from 'ws';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const log = (...a: unknown[]) => console.log('[smoke]', ...a);
const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

async function api(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
}

class Client {
  ws!: WebSocket; handlers = new Map<string, ((d: any) => void)[]>(); events: string[] = [];
  constructor(public name: string, public token: string) {}
  connect() {
    return new Promise<void>((res, rej) => {
      this.ws = new WebSocket(`${WS}?token=${this.token}`);
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        this.events.push(m.t);
        (this.handlers.get(m.t) ?? []).forEach((h) => h(m.d));
      });
    });
  }
  on(t: string, h: (d: any) => void) { this.handlers.set(t, [...(this.handlers.get(t) ?? []), h]); }
  once(t: string, ms = 20000) {
    return new Promise<any>((res, rej) => {
      const to = setTimeout(() => rej(new Error(`${this.name}: timeout waiting for ${t}`)), ms);
      const h = (d: any) => { clearTimeout(to); this.handlers.set(t, (this.handlers.get(t) ?? []).filter((x) => x !== h)); res(d); };
      this.on(t, h);
    });
  }
  send(t: string, d?: unknown) { this.ws.send(JSON.stringify({ t, d })); }
}

(async () => {
  const sfx = Math.random().toString(36).slice(2, 8);
  const mk = async (n: string) => {
    const r = await api('POST', '/api/auth/register', undefined, { username: `${n}_${sfx}`, email: `${n}_${sfx}@test.dev`, password: 'password123' });
    assert(r.status === 201, `register ${n}: ${JSON.stringify(r.json)}`);
    return r.json as { token: string; user: any };
  };
  const a = await mk('alice'), b = await mk('bob');
  log('registered', a.user.username, b.user.username, 'coins', a.user.coins);

  assert((await api('POST', '/api/auth/register', undefined, { username: a.user.username, email: 'x@y.dev', password: 'password123' })).status === 409, 'duplicate rejected');
  assert((await api('POST', '/api/auth/login', undefined, { login: a.user.username, password: 'wrongpass1' })).status === 401, 'bad login rejected');
  assert((await api('GET', '/api/auth/me')).status === 401, 'unauthenticated rejected');

  const shop = await api('GET', '/api/shop/items', a.token);
  assert(shop.json.items.length > 10, 'shop items');
  assert((await api('POST', '/api/shop/buy', a.token, { itemId: 'top_hoodie_blue' })).status === 200, 'buy hoodie');
  assert((await api('POST', '/api/shop/buy', a.token, { itemId: 'top_hoodie_blue' })).status === 409, 'double buy blocked');
  assert((await api('POST', '/api/shop/buy', a.token, { itemId: 'top_suit_navy' })).status === 403, 'level gate');
  assert((await api('POST', '/api/shop/equip', a.token, { itemId: 'top_hoodie_blue', equipped: true })).status === 200, 'equip');
  assert((await api('POST', '/api/economy/daily', a.token)).status === 200, 'daily');
  assert((await api('POST', '/api/economy/daily', a.token)).status === 429, 'daily cooldown');
  assert((await api('PATCH', '/api/profile/appearance', a.token, { height: 1.05, build: 1, skin: '#c68642', hairStyle: 2, hairColor: '#000000', eyes: '#223344' })).status === 200, 'appearance');

  assert((await api('POST', '/api/social/friends/request', a.token, { username: b.user.username })).status === 200, 'friend request');
  assert((await api('POST', '/api/social/friends/respond', b.token, { username: a.user.username, accept: true })).status === 200, 'friend accept');
  const fl = await api('GET', '/api/social/friends', a.token);
  assert(fl.json.friends[0].status === 'friend', 'friends listed');

  const tl = await api('GET', '/api/tournaments', a.token);
  assert(tl.json.tournaments.length >= 1, 'tournaments auto-created');
  const daily = tl.json.tournaments.find((t: any) => t.name.startsWith('Daily'));
  assert((await api('POST', `/api/tournaments/${daily.id}/join`, a.token)).status === 200, 'join tournament');
  assert((await api('POST', `/api/tournaments/${daily.id}/join`, a.token)).status === 409, 'double join blocked');

  const ca = new Client('alice', a.token), cb = new Client('bob', b.token);
  await Promise.all([ca.connect(), cb.connect()]);
  await Promise.all([ca.once('hello'), cb.once('hello')]);
  ca.send('world.join', { zone: 'lobby' }); cb.send('world.join', { zone: 'lobby' });
  const joined = await cb.once('world.joined');
  assert(joined.players.length === 1, 'bob sees alice in lobby');
  ca.send('chat.zone', { text: 'hello lobby' });
  const chat = await cb.once('chat.zone');
  assert(chat.text === 'hello lobby', 'zone chat');
  await new Promise((r) => setTimeout(r, 800)); // chat rate limit is 1 msg / 700ms
  ca.send('chat.private', { to: b.user.username, text: 'hi bob' });
  assert((await cb.once('chat.private')).text === 'hi bob', 'private chat');
  ca.send('world.move', { x: 500, y: 0, z: 500, ry: 0, a: 'walk' });
  await ca.once('world.correct'); log('teleport hack corrected');
  ca.send('world.emote', { e: 'dance' });
  await ca.once('error'); log('unowned emote rejected');

  // full match
  ca.send('room.create', { private: false });
  const rj = await ca.once('room.joined');
  cb.send('room.join', { code: rj.code });
  await cb.once('room.joined');
  const results: Record<string, number> = { alice: 0, bob: 0 };
  for (const c of [ca, cb]) {
    c.on('tube.select', () => c.send('room.pick', { slot: Math.floor(Math.random() * 3) }));
    c.on('tube.reveal', (d) => { if (c === ca) log('round result', d.ballSlot, d.results.map((r: any) => `${r.username}:${r.correct ? 'WIN' : 'lose'}(+${r.coins}c)`).join(' ')); });
  }
  ca.send('room.start');
  const end = await ca.once('tube.end', 180000);
  log('standings', JSON.stringify(end.standings));
  assert(end.standings.length === 2, 'standings');
  const after = await api('GET', '/api/auth/me', a.token);
  assert(after.json.user.games >= 1, 'games recorded server-side');
  log('alice now: xp', after.json.user.xp, 'coins', after.json.user.coins, 'level', after.json.user.level, 'games', after.json.user.games);
  const lb = await api('GET', '/api/leaderboard?type=weekly', a.token);
  assert(lb.json.rows.length >= 1, 'weekly leaderboard');
  ca.ws.close(); cb.ws.close();
  void results;
  log('ALL CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
