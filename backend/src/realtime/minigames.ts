import { randomUUID, createHash } from 'crypto';
import { config } from '../config';
import { GAME_RULES, GameId, validGame } from '../game/minigames';
import { pool } from '../db/pool';
import { checkAchievements } from '../services/progression';
import { sendTo } from './presence';
import { applyCompetitiveAction, createCompetitiveState, CompetitiveKind, EngineState } from '../game/competitiveGames';
import { saveMatchState } from './redisState';

export interface MatchPlayer { userId:string; username:string; connected:boolean; score:number; ready:boolean; done:boolean; actionSeq:number; lastActionAt:number; strikes:number; }
export interface MatchState { id:string; code:string; gameId:GameId; hostId:string; status:'lobby'|'playing'|'finished'; sequence:number; players:MatchPlayer[]; startedAt:number|null; finishedAt:number|null; game:any; }
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes=new Set<string>();
const makeCode=()=>{let c='';do{c='';for(let i=0;i<6;i++)c+=alphabet[Math.floor(Math.random()*alphabet.length)];}while(codes.has(c));codes.add(c);return c;};
const shuffle=<T,>(a:T[])=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function piece(n:number){if(n===0)return[[0,0],[1,0],[0,1],[1,1]];if(n===1)return[[0,0],[1,0],[2,0]];if(n===2)return[[0,0],[0,1],[1,1]];if(n===3)return[[0,0],[1,0],[2,0],[1,1]];return[[0,0],[0,1],[0,2]];}
function gameFor(id:GameId):any{
 if(id==='water-sort'){const p:number[]=[];for(let c=0;c<4;c++)for(let i=0;i<4;i++)p.push(c);shuffle(p);const tubes:number[][]=Array.from({length:6},()=>[]);for(let i=0;i<p.length;i++)tubes[Math.floor(i/4)].push(p[i]);return{kind:id,tubes,capacity:4};}
 if(id==='block-puzzle')return{kind:id,board:Array.from({length:8},()=>Array(8).fill(false)),piece:piece(Math.floor(Math.random()*5)),placements:0};
 if(id==='memory'){const cards:number[]=[];for(let i=0;i<8;i++)cards.push(i,i);shuffle(cards);return{kind:id,cards,revealed:[],first:null,matched:[],hideUntil:0};}
 if(id==='reaction')return{kind:id,targetAt:0,targetDelayMs:0};
 return createCompetitiveState(id as CompetitiveKind,[]);
}
function publicGame(g:any){if(g?.kind==='memory'){const visible=new Array(16).fill(null);for(const i of g.revealed)visible[i]=g.cards[i];for(const i of g.matched)visible[i]=g.cards[i];if(g.first!==null)visible[g.first]=g.cards[g.first];return{kind:g.kind,visible,matched:g.matched,first:g.first,hideUntil:g.hideUntil};}return g;}
function canPlace(board:boolean[][],p:number[][]){for(let x=0;x<8;x++)for(let y=0;y<8;y++)if(p.every(([dx,dy])=>x+dx<8&&y+dy<8&&!board[x+dx][y+dy]))return true;return false;}

class Match{
 readonly state:MatchState; private timer:any=null; private privateGames=new Map<string,any>(); private competitive:EngineState|null=null;
 constructor(readonly onClose:(m:Match)=>void,gameId:GameId,host:{userId:string;username:string}){
  this.state={id:randomUUID(),code:makeCode(),gameId,hostId:host.userId,status:'lobby',sequence:0,players:[this.player(host.userId,host.username)],startedAt:null,finishedAt:null,game:gameFor(gameId)};
 }
 private player(userId:string,username:string):MatchPlayer{return{userId,username,connected:true,score:0,ready:false,done:false,actionSeq:0,lastActionAt:0,strikes:0};}
 private game(userId:string){return this.privateGames.get(userId)||this.state.game;}
 public snapshot(userId?:string){return{...this.state,game:userId?publicGame(this.game(userId)):publicGame(this.state.game)};}
 private broadcast(t:string,d:any={}){for(const p of this.state.players)if(p.connected)sendTo(p.userId,t,d);}
 private sync(){for(const p of this.state.players)if(p.connected)this.sendState(p.userId);}
 private sendState(userId:string){sendTo(userId,'game.match.state',{matchId:this.state.id,seq:this.state.sequence,score:this.state.players.find(p=>p.userId===userId)?.score??0,done:this.state.players.find(p=>p.userId===userId)?.done??false,game:publicGame(this.game(userId)),serverNow:Date.now()});}
 join(p:{userId:string;username:string}){if(this.state.status!=='lobby')throw new Error('Match already started');if(this.state.players.some(x=>x.userId===p.userId))return;if(this.state.players.length>=GAME_RULES[this.state.gameId].maxPlayers)throw new Error('Match is full');this.state.players.push(this.player(p.userId,p.username));this.broadcast('game.match.update',this.snapshot());}
 ready(u:string){const p=this.playerOf(u);p.ready=true;this.broadcast('game.match.update',this.snapshot());}
 start(u:string){if(u!==this.state.hostId)throw new Error('Only host');if(this.state.players.length<2)throw new Error('Need at least 2 players');if(!this.state.players.every(p=>p.ready||p.userId===u))throw new Error('Players are not ready');this.state.status='playing';this.state.startedAt=Date.now();this.state.sequence=0;
  for(const p of this.state.players)this.privateGames.set(p.userId,gameFor(this.state.gameId));
  if(this.state.gameId==='reaction'){const g=this.state.game;g.targetDelayMs=1200+Math.floor(Math.random()*2300);g.targetAt=Date.now()+g.targetDelayMs;}
  if(['trivers','crossword','chess','racing','team-strategy'].includes(this.state.gameId))this.competitive=createCompetitiveState(this.state.gameId as CompetitiveKind,this.state.players.map(p=>p.userId));
  this.broadcast('game.match.started',{match:this.snapshot(),serverNow:Date.now()});this.sync();this.persist();this.timer=setTimeout(()=>void this.finishInternal('timeout'),180000);}
 private playerOf(u:string){const p=this.state.players.find(x=>x.userId===u);if(!p)throw new Error('Not in match');return p;}
 private guard(p:MatchPlayer){
 const now=Date.now();
 if(now-p.lastActionAt<config.antiCheatWindowMs){p.strikes++;void this.audit(p,'rate-limit',false,'Actions too fast');if(p.strikes>=5)void this.audit(p,'repeated-rate-limit',false,'Repeated impossible action rate');throw new Error('Actions too fast');}
 p.lastActionAt=now;p.actionSeq++;this.state.sequence++;
}
private audit(p:MatchPlayer,reason:string,accepted:boolean,detail:string){
 const hash=createHash('sha256').update(JSON.stringify({room:this.state.id,user:p.userId,seq:p.actionSeq,reason,detail})).digest('hex');
 void pool.query('INSERT INTO game_action_events(room_id,user_id,seq,action,payload_hash,accepted,reason) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(room_id,user_id,seq) DO NOTHING',[this.state.id,p.userId,p.actionSeq,reason,hash,accepted,detail]).catch(()=>{});
 if(!accepted)void pool.query('INSERT INTO suspicious_game_actions(room_id,user_id,reason,strikes,metadata) VALUES($1,$2,$3,$4,$5)',[this.state.id,p.userId,reason,p.strikes,{detail,seq:p.actionSeq}]).catch(()=>{});
}
 private result(p:MatchPlayer,action:string,payload:any){this.broadcast('game.match.action',{matchId:this.state.id,seq:this.state.sequence,userId:p.userId,action,score:p.score,done:p.done,payload,serverNow:Date.now()});this.sync();this.persist();}
 action(u:string,a:string,payload:any){if(this.state.status!=='playing')throw new Error('Match is not playing');const p=this.playerOf(u);if(p.done)throw new Error('Player already finished');if(!/^[a-z][a-z0-9_.-]{1,31}$/.test(a))throw new Error('Invalid action');this.guard(p);
  if(['trivers','crossword','chess','racing','team-strategy'].includes(this.state.gameId)){const out=applyCompetitiveAction(this.competitive!,u,a,payload);p.score=this.competitive!.players[u].score;p.done=this.competitive!.players[u].done;p.strikes=this.competitive!.players[u].strikes;this.audit(p,a,true,JSON.stringify(payload??{}));this.result(p,a,out);if(this.competitive!.players[u].done)this.maybeFinish('completed');return;}
  if(a==='water.move')return this.water(p,payload);if(a==='block.place')return this.block(p,payload);if(a==='memory.flip')return this.memory(p,payload);if(a==='reaction.click')return this.reaction(p);if(a==='reaction.early')return this.early(p);throw new Error('Action not valid for this game');
 }
 private water(p:MatchPlayer,a:any){if(this.state.gameId!=='water-sort')throw new Error('Wrong game');const g=this.game(p.userId),from=Number(a?.from),to=Number(a?.to);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>=g.tubes.length||from===to)throw new Error('Invalid move');const src=g.tubes[from],dst=g.tubes[to];if(!src.length||dst.length>=4)throw new Error('Invalid move');const color=src[src.length-1];if(dst.length&&dst[dst.length-1]!==color)throw new Error('Colours do not match');let run=1;for(let i=src.length-2;i>=0&&src[i]===color;i--)run++;const amount=Math.min(run,4-dst.length);if(Number(a?.amount)!==amount)throw new Error('Invalid amount');for(let i=0;i<amount;i++){const v=src.pop();if(v===undefined)throw new Error('Invalid state');dst.push(v);}p.score+=amount*10;const solved=g.tubes.every((t:number[])=>!t.length||(t.length===4&&t.every(v=>v===t[0])));if(solved)p.done=true;this.audit(p,'water.move',true,JSON.stringify({from,to,amount}));this.result(p,'water.move',{from,to,amount,solved});if(solved)this.maybeFinish('completed');}
 private block(p:MatchPlayer,a:any){if(this.state.gameId!=='block-puzzle')throw new Error('Wrong game');const g=this.game(p.userId),x=Number(a?.x),y=Number(a?.y),size=Number(a?.size);if(!Number.isInteger(x)||!Number.isInteger(y)||size!==g.piece.length)throw new Error('Invalid placement');for(const[dx,dy]of g.piece)if(x+dx<0||x+dx>=8||y+dy<0||y+dy>=8||g.board[x+dx][y+dy])throw new Error('Shape does not fit');for(const[dx,dy]of g.piece)g.board[x+dx][y+dy]=true;let cleared=0;for(let yy=0;yy<8;yy++)if(g.board.every((r:boolean[])=>r[yy])){for(let xx=0;xx<8;xx++)g.board[xx][yy]=false;cleared++;}for(let xx=0;xx<8;xx++)if(g.board[xx].every(Boolean)){for(let yy=0;yy<8;yy++)g.board[xx][yy]=false;cleared++;}g.placements++;p.score+=size*5+cleared*100;g.piece=piece(Math.floor(Math.random()*5));this.audit(p,'block.place',true,JSON.stringify({x,y,size,cleared}));this.result(p,'block.place',{x,y,size,cleared});if(g.placements>=60||!canPlace(g.board,g.piece)){p.done=true;this.maybeFinish('completed');}}
 private memory(p:MatchPlayer,a:any){if(this.state.gameId!=='memory')throw new Error('Wrong game');const g=this.game(p.userId),i=Number(a?.index);if(!Number.isInteger(i)||i<0||i>=16||g.matched.includes(i)||g.revealed.includes(i)||g.first===i)throw new Error('Invalid card');if(g.hideUntil&&Date.now()>=g.hideUntil){g.revealed=[];g.first=null;g.hideUntil=0;}g.revealed.push(i);let delta=0;if(g.first===null)g.first=i;else{const f=g.first;if(g.cards[f]===g.cards[i]){g.matched.push(f,i);g.revealed=[];g.first=null;delta=100;}else{delta=5;g.hideUntil=Date.now()+700;}}p.score+=delta;this.audit(p,'memory.flip',true,JSON.stringify({index:i}));this.result(p,'memory.flip',{index:i});if(g.matched.length===16){p.done=true;this.maybeFinish('completed');}if(g.hideUntil)setTimeout(()=>{if(this.state.status==='playing'&&g.hideUntil&&Date.now()>=g.hideUntil){g.revealed=[];g.first=null;g.hideUntil=0;this.state.sequence++;this.sendState(p.userId);}},720);}
 private reaction(p:MatchPlayer){if(this.state.gameId!=='reaction')throw new Error('Wrong game');const now=Date.now();if(now<this.state.game.targetAt)throw new Error('Too early');const ms=now-this.state.game.targetAt;p.score+=Math.max(1,1000-ms);p.done=true;this.audit(p,'reaction.click',true,JSON.stringify({reactionMs:ms}));this.result(p,'reaction.click',{reactionMs:ms});this.maybeFinish('completed');}
 private early(p:MatchPlayer){if(this.state.gameId!=='reaction')throw new Error('Wrong game');if(Date.now()>=this.state.game.targetAt)throw new Error('Use reaction.click');p.done=true;p.score=0;this.audit(p,'reaction.early',true,'early');this.result(p,'reaction.early',{});this.maybeFinish('completed');}
 private maybeFinish(reason:string){if(this.state.players.filter(p=>p.connected).length<2)return;if(this.state.players.filter(p=>p.connected).every(p=>p.done))void this.finishInternal(reason);}
 async finishInternal(reason:string){if(this.state.status!=='playing')return;this.state.status='finished';this.state.finishedAt=Date.now();if(this.timer)clearTimeout(this.timer);const ranked=[...this.state.players].sort((a,b)=>b.score-a.score),c=await pool.connect();try{await c.query('BEGIN');for(let i=0;i<ranked.length;i++){const p=ranked[i],won=i===0&&p.score>0,coins=won?100:25,xp=won?50:15;await c.query('INSERT INTO game_results(room_id,user_id,round_no,kind,won,coins,xp) VALUES($1,$2,1,$3,$4,$5,$6) ON CONFLICT(room_id,user_id,round_no,kind) DO NOTHING',[this.state.id,p.userId,this.state.gameId,won,coins,xp]);await c.query('UPDATE users SET coins=coins+$2,xp=xp+$3,games=games+1,wins=wins+$4,streak=CASE WHEN $4=1 THEN streak+1 ELSE 0 END,best_streak=GREATEST(best_streak,CASE WHEN $4=1 THEN streak+1 ELSE 0 END) WHERE id=$1',[p.userId,coins,xp,won?1:0]);await checkAchievements(c,p.userId);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e}finally{c.release();}this.broadcast('game.match.finished',{match:this.snapshot(),reason,results:ranked.map((p,i)=>({userId:p.userId,username:p.username,rank:i+1,score:p.score,won:i===0&&p.score>0,coins:i===0&&p.score>0?100:25,xp:i===0&&p.score>0?50:15}))});this.persist();setTimeout(()=>this.onClose(this),60000);}
 disconnect(u:string){const p=this.state.players.find(x=>x.userId===u);if(p)p.connected=false;if(this.state.status==='lobby'&&this.state.hostId===u){const n=this.state.players.find(x=>x.connected);if(n)this.state.hostId=n.userId;}this.broadcast('game.match.update',this.snapshot());if(this.state.status==='playing'&&this.state.players.filter(x=>x.connected).length<2)void this.finishInternal('disconnect');}
 private persist(){void saveMatchState(this.state.id,this.state);}
}
const matches=new Map<string,Match>(),byCode=new Map<string,Match>(),userMatch=new Map<string,Match>();
function remove(m:Match){matches.delete(m.state.id);byCode.delete(m.state.code);codes.delete(m.state.code);for(const[u,x]of userMatch)if(x===m)userMatch.delete(u);}
export const matchOf=(u:string)=>userMatch.get(u);
export function createMatch(host:{userId:string;username:string},id:string){if(!validGame(id)||id==='tube')throw new Error('Game is not available in the competitive match engine');if(userMatch.has(host.userId))throw new Error('Already in a match');const m=new Match(remove,id as GameId,host);matches.set(m.state.id,m);byCode.set(m.state.code,m);userMatch.set(host.userId,m);return m;}
export function joinMatch(p:{userId:string;username:string},codeValue:string){if(userMatch.has(p.userId))throw new Error('Already in a match');const m=byCode.get(codeValue.toUpperCase());if(!m)throw new Error('Match not found');m.join(p);userMatch.set(p.userId,m);return m;}
export function leaveMatch(u:string){const m=userMatch.get(u);if(!m)return;userMatch.delete(u);m.disconnect(u);}
