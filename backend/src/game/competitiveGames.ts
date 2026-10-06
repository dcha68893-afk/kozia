import crypto from 'crypto';
import { config } from '../config';

export type CompetitiveKind='trivers'|'crossword'|'chess'|'racing'|'team-strategy';
export interface PlayerGameState { score:number; done:boolean; strikes:number; lastActionAt:number; seq:number; data:any; }
export interface EngineState { kind:CompetitiveKind; seed:string; turn:number; round:number; players:Record<string,PlayerGameState>; data:any; }

const WORDS=['NECPRA','HOTEL','WORLD','PLAYER','GAMES','TUBE','WATER','PUZZLE','CHESS','RACING','CLUB','FRIEND'];
const rand=(seed:string)=>{let h=crypto.createHash('sha256').update(seed).digest();let n=0;for(let i=0;i<4;i++)n=n*256+h[i];return()=>{n=(n*1664525+1013904223)>>>0;return n/0x100000000;};};

export function createCompetitiveState(kind:CompetitiveKind,ids:string[],seed=crypto.randomUUID()):EngineState{
 const r=rand(seed),players:Record<string,PlayerGameState>={}; for(const id of ids)players[id]={score:0,done:false,strikes:0,lastActionAt:0,seq:0,data:{}};
 if(kind==='trivers')return{kind,seed,turn:0,round:1,players,data:{numbers:ids.map((_,i)=>[i+1,Math.floor(r()*20)+1,Math.floor(r()*20)+1]),target:Math.floor(r()*50)+20}};
 if(kind==='crossword'){const word=WORDS[Math.floor(r()*WORDS.length)];return{kind,seed,turn:0,round:1,players,data:{word,letters:Array(word.length).fill(null),winner:null}};}
 if(kind==='chess')return{kind,seed,turn:0,round:1,players,data:{board:chessBoard(),turnIndex:0,moves:0,winner:null}};
 if(kind==='racing')return{kind,seed,turn:0,round:1,players,data:{positions:Object.fromEntries(ids.map(id=>[id,0])),laps:Object.fromEntries(ids.map(id=>[id,0])),lastTick:Date.now(),finish:[]}};
 return{kind,seed,turn:0,round:1,players,data:{territory:Object.fromEntries(ids.map(id=>[id,3])),resources:Object.fromEntries(ids.map(id=>[id,100])),roundEndsAt:Date.now()+180000}};
}
function chessBoard(){const b=Array.from({length:8},()=>Array(8).fill(null));const back=['r','n','b','q','k','b','n','r'];for(let x=0;x<8;x++){b[x][0]='w'+back[x];b[x][1]='wp';b[x][6]='bp';b[x][7]='b'+back[x];}return b;}
function inside(x:number,y:number){return x>=0&&x<8&&y>=0&&y<8;}
function chessLegal(b:any[][],from:[number,number],to:[number,number],white:boolean){
 const[x,y]=from,[tx,ty]=to,p=b[x]?.[y];if(!p||p[0]!== (white?'w':'b')||!inside(tx,ty))return false;const q=b[tx][ty];if(q&&q[0]===p[0])return false;const dx=tx-x,dy=ty-y,t=p[1];
 if(t==='p'){const d=white?1:-1;if(dx===0&&dy===d&&!q)return true;if(dx===0&&dy===2*d&&y===(white?1:6)&&!q&&!b[x][y+d])return true;return Math.abs(dx)===1&&dy===d&&!!q;}
 if(t==='n')return(Math.abs(dx)===1&&Math.abs(dy)===2)||(Math.abs(dx)===2&&Math.abs(dy)===1);
 if(t==='k')return Math.max(Math.abs(dx),Math.abs(dy))===1;
 if(t==='b'||t==='r'||t==='q'){if(t==='b'&&Math.abs(dx)!==Math.abs(dy))return false;if(t==='r'&&dx!==0&&dy!==0)return false;const sx=Math.sign(dx),sy=Math.sign(dy);let cx=x+sx,cy=y+sy;while(cx!==tx||cy!==ty){if(b[cx][cy])return false;cx+=sx;cy+=sy;}return true;} return false;
}
export function applyCompetitiveAction(s:EngineState,userId:string,action:string,payload:any){
 const p=s.players[userId];if(!p)throw new Error('Not in game');const now=Date.now();if(now-p.lastActionAt<config.antiCheatWindowMs)throw new Error('Actions too fast');p.lastActionAt=now;p.seq++;
 if(action==='trivers.answer'){if(s.kind!=='trivers')throw new Error('Wrong game');const n=Number(payload?.answer);if(!Number.isInteger(n))throw new Error('Invalid answer');const correct=n===s.data.target;if(correct){p.score+=100;p.done=true;}else{p.strikes++;p.score=Math.max(0,p.score-20);}s.round++;return{correct,score:p.score};}
 if(action==='crossword.letter'){if(s.kind!=='crossword')throw new Error('Wrong game');const i=Number(payload?.index),letter=String(payload?.letter||'').toUpperCase();if(!Number.isInteger(i)||i<0||i>=s.data.word.length||letter.length!==1)throw new Error('Invalid letter');if(letter===s.data.word[i]){s.data.letters[i]=letter;p.score+=20;}else{p.strikes++;p.score=Math.max(0,p.score-5);}if(s.data.letters.every((x:string)=>x))p.done=true;return{score:p.score,complete:p.done};}
 if(action==='chess.move'){if(s.kind!=='chess')throw new Error('Wrong game');const ids=Object.keys(s.players),idx=ids.indexOf(userId);if(idx<0||idx!==s.data.turnIndex%ids.length)throw new Error('Not your turn');const f:[number,number]=[Number(payload?.fx),Number(payload?.fy)],t:[number,number]=[Number(payload?.tx),Number(payload?.ty)];if(!f.every(Number.isInteger)||!t.every(Number.isInteger))throw new Error('Invalid move');if(!chessLegal(s.data.board,f,t,idx===0))throw new Error('Illegal move');const captured=s.data.board[t[0]][t[1]];s.data.board[t[0]][t[1]]=s.data.board[f[0]][f[1]];s.data.board[f[0]][f[1]]=null;s.data.moves++;s.data.turnIndex++;p.score+=captured?.[1]==='k'?1000:10;if(captured?.[1]==='k'){p.done=true;s.data.winner=userId;}return{score:p.score,winner:s.data.winner};}
 if(action==='racing.tick'){if(s.kind!=='racing')throw new Error('Wrong game');const throttle=Math.max(0,Math.min(1,Number(payload?.throttle)));const dt=Math.min(.2,Math.max(.01,(now-s.data.lastTick)/1000));s.data.lastTick=now;const pos=Math.min(1,s.data.positions[userId]+(2.5+throttle*5)*dt/30);s.data.positions[userId]=pos;p.score=Math.floor(pos*1000);if(pos>=1&&!p.done){p.done=true;s.data.finish.push(userId);}return{position:pos,score:p.score};}
 if(action==='team-strategy.order'){if(s.kind!=='team-strategy')throw new Error('Wrong game');const amount=Math.max(0,Math.min(25,Number(payload?.amount)));const r=s.data.resources[userId];if(r<amount)throw new Error('Not enough resources');s.data.resources[userId]-=amount;s.data.territory[userId]+=Math.floor(amount/10);p.score+=amount;return{resources:s.data.resources[userId],territory:s.data.territory[userId],score:p.score};}
 throw new Error('Action not supported');
}
