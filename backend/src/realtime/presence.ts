import type { WebSocket } from 'ws';

export interface Conn {
  ws: WebSocket;
  userId: string;
  username: string;
  stage: string;
  look: any;
  zone: string | null;
  x: number; y: number; z: number; ry: number; anim: string;
  lastMove: number;
  tokens: number;
  tokenTs: number;
  lastChat: number;
  alive: boolean;
}

export const conns = new Map<string, Conn>();

export function send(c: Conn, t: string, d: unknown = {}) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify({ t, d }));
}
export function sendTo(userId: string, t: string, d: unknown = {}) {
  const c = conns.get(userId);
  if (c) send(c, t, d);
}
export const isOnline = (userId: string) => conns.has(userId);
export function kick(userId: string, message: string) {
  const c = conns.get(userId);
  if (!c) return;
  send(c, 'error', { message });
  c.ws.close(4003, message);
}
