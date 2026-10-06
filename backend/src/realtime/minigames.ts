import { randomUUID } from 'crypto';
import { GAME_RULES, GameId, validGame } from '../game/minigames';
import { sendTo } from './presence';

export interface MatchPlayer { userId:string; username:string; connected:boolean; score:number; ready:boolean; }
export interface MatchState { id:string; code:string; gameId:GameId; hostId:string; status:'lobby'|'playing'|'finished'; sequence:number; players:MatchPlayer[]; startedAt:number|null; finishedAt:number|null; }

class Match {
  readonly state:MatchState;
  constructor(readonly onClose:(m:Match)=>void, gameId:GameId, host:{userId:string;username:string}) {
    this.state={id:randomUUID(),code:code(),gameId,hostId:host.userId,status:'lobby',sequence:0,players:[{userId:host.userId,username:host.username,connected:true,score:0,ready:false}],startedAt:null,finishedAt:null};
  }
  broadcast(t:string,d:unknown={}){for(const p of this.state.players)if(p.connected)sendTo(p.userId,t,d);}
  snapshot(){return this.state;}
  join(p:{userId:string;username:string}){if(this.state.status!=='lobby')throw new Error('Match already started');if(this.state.players.some(x=>x.userId===p.userId))return;if(this.state.players.length>=GAME_RULES[this.state.gameId].maxPlayers)throw new Error('Match is full');this.state.players.push({userId:p.userId,username:p.username,connected:true,score:0,ready:false});this.broadcast('game.match.update',this.snapshot());}
  start(userId:string){if(userId!==this.state.hostId)throw new Error('Only the host can start');if(this.state.players.length<2)throw new Error('Need at least 2 players');if(!this.state.players.every(p=>p.ready||p.userId===this.state.hostId))throw new Error('Players are not ready');this.state.status='playing';this.state.startedAt=Date.now();this.state.sequence=0;this.broadcast('game.match.started',{match:this.snapshot()});}
  ready(userId:string){const p=this.state.players.find(x=>x.userId===userId);if(!p)throw new Error('Not in match');p.ready=true;this.broadcast('game.match.update',this.snapshot());}
  action(userId:string,action:string,payload:unknown){if(this.state.status!=='playing')throw new Error('Match is not playing');if(!this.state.players.some(x=>x.userId===userId))throw new Error('Not in match');if(!/^[a-z][a-z0-9_.-]{1,31}$/.test(action))throw new Error('Invalid action');this.state.sequence++;this.broadcast('game.match.action',{matchId:this.state.id,seq:this.state.sequence,userId,action,payload});}
  finish(userId:string,score:number){if(userId!==this.state.hostId)throw new Error('Only the host can finish the match');if(this.state.status!=='playing')throw new Error('Match is not playing');if(!Number.isFinite(score)||score<0||score>1000000)throw new Error('Invalid score');this.state.status='finished';this.state.finishedAt=Date.now();this.broadcast('game.match.finished',{match:this.snapshot(),result:{hostScore:Math.floor(score)}});setTimeout(()=>this.onClose(this),60_000);}
}
const matches=new Map<string,Match>(), byCode=new Map<string,Match>(), userMatch=new Map<string,Match>();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(){let c='';do{c='';for(let i=0;i<6;i++)c+=alphabet[Math.floor(Math.random()*alphabet.length)];}while(byCode.has(c));return c;}
function remove(m:Match){matches.delete(m.state.id);byCode.delete(m.state.code);for(const [u,x] of userMatch)if(x===m)userMatch.delete(u);}
export const matchOf=(u:string)=>userMatch.get(u);
export function createMatch(host:{userId:string;username:string},id:string){if(!validGame(id))throw new Error('Unknown game');if(userMatch.has(host.userId))throw new Error('Already in a match');const m=new Match(remove,id as GameId,host);matches.set(m.state.id,m);byCode.set(m.state.code,m);userMatch.set(host.userId,m);return m;}
export function joinMatch(p:{userId:string;username:string},codeValue:string){if(userMatch.has(p.userId))throw new Error('Already in a match');const m=byCode.get(codeValue.toUpperCase());if(!m)throw new Error('Match not found');m.join(p);userMatch.set(p.userId,m);return m;}
export function leaveMatch(u:string){const m=userMatch.get(u);if(!m)return;userMatch.delete(u);const p=m.state.players.find(x=>x.userId===u);if(p)p.connected=false;if(m.state.hostId===u){const n=m.state.players.find(x=>x.connected);if(n)m.state.hostId=n.userId;}m.broadcast('game.match.update',m.snapshot());}
