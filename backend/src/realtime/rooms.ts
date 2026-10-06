import { randomInt, randomUUID } from 'crypto';
import { config } from '../config';
import { ballSlotAfter, generateRound, SLOT_COUNT, Swap } from '../game/tubeEngine';
import { grantMatchBonus, recordRound } from '../services/game';
import { sendTo } from './presence';

type Phase = 'lobby' | 'prepare' | 'observe' | 'shuffle' | 'select' | 'reveal' | 'finished';

interface Member {
  userId: string; username: string; stage: string; look: any;
  spectator: boolean; connected: boolean; score: number; pick: number | null;
}

const T = { prepare: 3000, observe: 1500, select: 8000, reveal: 3500, finish: 8000 };
const MAX_PLAYERS = 4;
const MAX_SPECTATORS = 20;
const DISCONNECT_GRACE_MS = 15_000;
const minPlayers = () => (config.allowSoloRooms ? 1 : 2);

export class TubeRoom {
  readonly members = new Map<string, Member>();
  phase: Phase = 'lobby';
  round = 0;
  readonly totalRounds = config.tubeRounds;
  private ballStart = 0;
  private swaps: Swap[] = [];
  private swapMs = 500;
  private timer: NodeJS.Timeout | null = null;
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private closed = false;

  constructor(readonly id: string, readonly code: string, public hostId: string, readonly isPrivate: boolean, private onClose: (r: TubeRoom) => void) {}

  private players() { return [...this.members.values()].filter((m) => !m.spectator); }
  private connectedPlayers() { return this.players().filter((m) => m.connected); }
  broadcast(t: string, d: unknown = {}) { for (const m of this.members.values()) if (m.connected) sendTo(m.userId, t, d); }

  snapshot() {
    return {
      id: this.id, code: this.code, phase: this.phase, round: this.round, totalRounds: this.totalRounds,
      hostId: this.hostId, isPrivate: this.isPrivate,
      members: [...this.members.values()].map((m) => ({
        userId: m.userId, username: m.username, spectator: m.spectator, score: m.score,
        picked: m.pick !== null, stage: m.stage, look: m.look,
      })),
    };
  }

  private pushState() { this.broadcast('room.update', this.snapshot()); }
  private after(ms: number, fn: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (!this.closed) fn(); }, ms);
  }

  join(user: { userId: string; username: string; stage: string; look: any }, spectate: boolean) {
    const existing = this.members.get(user.userId);
    if (existing) {
      const pending = this.disconnectTimers.get(user.userId);
      if (pending) { clearTimeout(pending); this.disconnectTimers.delete(user.userId); }
      existing.connected = true; this.pushState(); return;
    }
    const asSpectator = spectate || this.phase !== 'lobby';
    if (asSpectator) {
      if ([...this.members.values()].filter((m) => m.spectator).length >= MAX_SPECTATORS) throw new Error('Room is full');
    } else if (this.players().length >= MAX_PLAYERS) throw new Error('Room is full');
    this.members.set(user.userId, { ...user, spectator: asSpectator, connected: true, score: 0, pick: null });
    this.pushState();
  }

  leave(userId: string) {
    const timer = this.disconnectTimers.get(userId);
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(userId); }
    this.members.delete(userId);
    if (this.members.size === 0) return this.close();
    if (this.hostId === userId) this.hostId = (this.connectedPlayers()[0] ?? [...this.members.values()][0]).userId;
    this.afterMembership();
  }

  disconnect(userId: string) {
    const m = this.members.get(userId);
    if (!m) return;
    if (this.phase === 'lobby' || m.spectator) return this.leave(userId);
    m.connected = false;
    this.pushState();
    const old = this.disconnectTimers.get(userId);
    if (old) clearTimeout(old);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(userId);
      const current = this.members.get(userId);
      if (!current || current.connected) return;
      this.members.delete(userId);
      if (this.hostId === userId) this.hostId = (this.connectedPlayers()[0] ?? [...this.members.values()][0])?.userId ?? this.hostId;
      this.afterMembership();
    }, DISCONNECT_GRACE_MS);
    this.disconnectTimers.set(userId, timer);
  }

  reconnect(userId: string) {
    const m = this.members.get(userId);
    if (!m) return;
    const pending = this.disconnectTimers.get(userId);
    if (pending) { clearTimeout(pending); this.disconnectTimers.delete(userId); }
    m.connected = true; this.pushState();
  }

  private afterMembership() {
    if ([...this.members.values()].every((m) => !m.connected)) return this.close();
    if (this.phase !== 'lobby' && this.phase !== 'finished' && this.connectedPlayers().length < minPlayers()) {
      this.broadcast('tube.aborted', { reason: 'Not enough players' });
      this.resetToLobby(); return;
    }
    this.pushState();
  }

  start(userId: string) {
    if (userId !== this.hostId) throw new Error('Only the host can start');
    if (this.phase !== 'lobby') throw new Error('Game already running');
    if (this.connectedPlayers().length < minPlayers()) throw new Error(`Need at least ${minPlayers()} players`);
    this.round = 0;
    for (const m of this.members.values()) m.score = 0;
    this.nextRound();
  }

  private nextRound() {
    this.round += 1;
    const g = generateRound(this.round);
    this.ballStart = g.ballStart; this.swaps = g.swaps; this.swapMs = g.swapMs;
    for (const m of this.members.values()) m.pick = null;
    this.phase = 'prepare'; this.pushState();
    this.broadcast('tube.prepare', { round: this.round, totalRounds: this.totalRounds, ballSlot: this.ballStart, slotCount: SLOT_COUNT, ms: T.prepare });
    this.after(T.prepare, () => {
      this.phase = 'observe'; this.broadcast('tube.observe', { ms: T.observe });
      this.after(T.observe, () => {
        this.phase = 'shuffle'; this.broadcast('tube.shuffle', { swaps: this.swaps, swapMs: this.swapMs });
        this.after(this.swaps.length * this.swapMs + 600, () => {
          this.phase = 'select'; this.pushState(); this.broadcast('tube.select', { ms: T.select });
          this.after(T.select, () => void this.reveal());
        });
      });
    });
  }

  pick(userId: string, slot: number) {
    const m = this.members.get(userId);
    if (!m || m.spectator) throw new Error('Spectators cannot pick');
    if (this.phase !== 'select') throw new Error('Not in selection phase');
    if (m.pick !== null) throw new Error('Already picked');
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw new Error('Bad slot');
    m.pick = slot; this.broadcast('tube.picked', { userId });
    if (this.connectedPlayers().every((p) => p.pick !== null)) {
      if (this.timer) clearTimeout(this.timer);
      void this.reveal();
    }
  }

  private async reveal() {
    if (this.phase !== 'select') return;
    this.phase = 'reveal'; if (this.timer) clearTimeout(this.timer);
    const ballSlot = ballSlotAfter(this.ballStart, this.swaps);
    const results = await Promise.all(this.players().map(async (m) => {
      const won = m.pick === ballSlot;
      let award = { coins: 0, xp: 0, levelUp: false, achievements: [] as string[] };
      try { award = await recordRound(m.userId, this.id, this.round, won); } catch (e) { console.error('[recordRound]', e); }
      if (won) m.score += 1;
      return { userId: m.userId, username: m.username, pick: m.pick, correct: won, ...award };
    }));
    if (this.closed) return;
    this.pushState(); this.broadcast('tube.reveal', { ballSlot, results, ms: T.reveal });
    this.after(T.reveal, () => (this.round >= this.totalRounds ? void this.finish() : this.nextRound()));
  }

  private async finish() {
    this.phase = 'finished';
    const standings = this.players().map((m) => ({ userId: m.userId, username: m.username, score: m.score })).sort((a, b) => b.score - a.score);
    const top = standings[0]?.score ?? 0;
    const bonus: Record<string, { coins: number; xp: number }> = {};
    if ((top > 0 && standings.length >= 2) || (top > 0 && config.allowSoloRooms)) {
      for (const s of standings.filter((x) => x.score === top)) {
        try { bonus[s.userId] = await grantMatchBonus(s.userId, this.id); } catch (e) { console.error('[bonus]', e); }
      }
    }
    if (this.closed) return;
    this.pushState(); this.broadcast('tube.end', { standings, bonus });
    this.after(T.finish, () => this.resetToLobby());
  }

  private resetToLobby() {
    if (this.timer) clearTimeout(this.timer);
    for (const [id, m] of [...this.members]) if (!m.connected) this.members.delete(id);
    if (this.members.size === 0) return this.close();
    if (!this.members.has(this.hostId)) this.hostId = (this.connectedPlayers()[0] ?? [...this.members.values()][0]).userId;
    for (const m of this.members.values()) { m.score = 0; m.pick = null; }
    this.phase = 'lobby'; this.round = 0; this.pushState();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
    this.onClose(this);
  }
}

const rooms = new Map<string, TubeRoom>();
const byCode = new Map<string, TubeRoom>();
const userRoom = new Map<string, TubeRoom>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[randomInt(ALPHABET.length)];
    if (!byCode.has(c)) return c;
  }
}

export const roomOf = (userId: string) => userRoom.get(userId);

export function createRoom(host: { userId: string; username: string; stage: string; look: any }, isPrivate: boolean): TubeRoom {
  leaveCurrent(host.userId);
  const room = new TubeRoom(randomUUID(), newCode(), host.userId, isPrivate, (r) => {
    rooms.delete(r.id); byCode.delete(r.code);
    for (const [uid, rm] of [...userRoom]) if (rm === r) userRoom.delete(uid);
  });
  rooms.set(room.id, room); byCode.set(room.code, room);
  room.join(host, false); userRoom.set(host.userId, room); return room;
}

export function joinRoom(user: { userId: string; username: string; stage: string; look: any }, code: string, spectate: boolean): TubeRoom {
  const room = byCode.get(code.toUpperCase());
  if (!room) throw new Error('Room not found');
  if (userRoom.get(user.userId) !== room) leaveCurrent(user.userId);
  room.join(user, spectate); userRoom.set(user.userId, room); return room;
}

export function leaveCurrent(userId: string) {
  const r = userRoom.get(userId);
  if (!r) return false;
  userRoom.delete(userId); r.leave(userId); return true;
}

export function listPublic() {
  return [...rooms.values()].filter((r) => !r.isPrivate).map((r) => ({
    code: r.code, phase: r.phase,
    players: r.snapshot().members.filter((m) => !m.spectator).length,
    host: r.members.get(r.hostId)?.username ?? ''
  }));
}