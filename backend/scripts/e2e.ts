import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const WS = BASE.replace(/^http/, 'ws');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const must = (c: any, m: string) => {
  if (!c) { console.error('FAIL:', m); process.exit(1); }
  console.log('ok  -', m);
};

async function api(path: string, body?: any, token?: string) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json() };
}

class Client {
  ws!: WebSocket;
  log: any[] = [];
  constructor(public token: string, public name: string) {}
  connect() {
    return new Promise<void>((res) => {
      this.ws = new WebSocket(WS + '/ws?token=' + this.token);
      this.ws.on('message', (d) => this.log.push(JSON.parse(d.toString())));
      this.ws.on('open', () => res());
    });
  }
  send(t: string, d: any = {}) { this.ws.send(JSON.stringify({ t, d })); }
  last(t: string) { return [...this.log].reverse().find((m) => m.t === t); }
  async wait(t: string, ms = 4000) {
    const s = Date.now();
    while (Date.now() - s < ms) { const m = this.last(t); if (m) return m; await sleep(50); }
    return null;
  }
  clear() { this.log = []; }
}

(async () => {
  const tag = Math.random().toString(36).slice(2, 8);
  const reg = async (n: string) => {
    const r = await api('/api/auth/register', { username: n + '_' + tag, email: n + tag + '@x.com', password: 'password123' });
    return new Client(r.json.token, n + '_' + tag);
  };
  const a = await reg('alice'), b = await reg('bob');
  await a.connect(); await b.connect(); await sleep(300);

  a.send('game.match.create', { gameId: 'memory' });
  const j = await a.wait('game.match.joined');
  must(j, 'alice created a memory match');
  b.send('game.match.join', { code: j.d.code });
  must(await b.wait('game.match.joined'), 'bob joined by code');
  b.send('game.match.ready'); await sleep(200);
  a.send('game.match.start');
  must(await a.wait('game.match.started'), 'match started');

  // Reconnect after refresh: bob drops and returns inside the grace period
  b.ws.close(); await sleep(500);
  const bc = new Client(b.token, b.name); await bc.connect();
  const hello = await bc.wait('hello');
  must(hello && hello.d.inMatch === true, 'hello reports inMatch after refresh');
  must(await bc.wait('game.match.joined'), 'bob got the match snapshot again');
  must(await bc.wait('game.match.state'), 'bob got live state again');

  // Opponent actions are visible
  bc.clear();
  a.send('game.match.action', { action: 'memory.flip', payload: { index: 0 } });
  must(await bc.wait('game.match.action'), "bob sees alice's action live");

  // Alice goes offline for good: server must settle after the grace period
  a.ws.close();
  const fin = await bc.wait('game.match.finished', 15000);
  must(fin, 'server settled the match after alice stayed offline');
  const res = fin.d.results;
  console.log('results', JSON.stringify(res));
  must(res.every((r: any) => Number.isInteger(r.rank)), 'every player has a rank');
  const top = res.find((r: any) => r.rank === 1);
  must(top.won ? top.coins === 100 : top.coins === 25, 'rank-1 reward is correct (100 if won, else participation)');

  // History
  const login = await api('/api/auth/login', { login: bc.name, password: 'password123' });
  const h = await api('/api/games/history', undefined, login.json.token);
  must(h.status === 200 && h.json.history.length === 1 && h.json.history[0].players.length === 2, 'history lists the match with both players');

  // Play Again
  const a2 = new Client(a.token, a.name); await a2.connect(); await sleep(300);
  bc.clear();
  bc.send('game.match.rematch');
  const nj = await bc.wait('game.match.joined');
  must(nj && nj.d.status === 'lobby', 'Play Again opened a fresh lobby for bob');
  const inv = await a2.wait('game.match.rematch');
  must(inv && inv.d.code, 'alice received the rematch invite');
  a2.send('game.match.join', { code: inv.d.code });
  must(await a2.wait('game.match.joined'), 'alice joined the rematch');

  console.log('ALL E2E CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
