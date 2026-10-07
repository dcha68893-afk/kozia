export type GameId =
  | 'water-sort' | 'block-puzzle' | 'reaction' | 'memory'
  | 'tube' | 'trivers' | 'crossword' | 'chess' | 'racing' | 'team-strategy';

export const GAME_RULES: Record<GameId, { maxPlayers:number; ranked:boolean; serverAuthoritative:boolean }> = {
  'water-sort': {maxPlayers:4,ranked:true,serverAuthoritative:true},
  'block-puzzle': {maxPlayers:4,ranked:true,serverAuthoritative:true},
  reaction: {maxPlayers:8,ranked:true,serverAuthoritative:true},
  memory: {maxPlayers:8,ranked:true,serverAuthoritative:true},
  tube: {maxPlayers:8,ranked:true,serverAuthoritative:true},
  trivers: {maxPlayers:8,ranked:true,serverAuthoritative:true},
  crossword: {maxPlayers:8,ranked:true,serverAuthoritative:true},
  chess: {maxPlayers:2,ranked:true,serverAuthoritative:true},
  racing: {maxPlayers:8,ranked:true,serverAuthoritative:true},
  'team-strategy': {maxPlayers:8,ranked:true,serverAuthoritative:true}
};

export function validGame(id:string): id is GameId {
  return Object.prototype.hasOwnProperty.call(GAME_RULES,id);
}

/** Reward by final placement (1st..3rd get more; everyone else gets a participation reward). */
export function rewardFor(rank:number,won:boolean):{coins:number;xp:number}{
  if(rank===1&&won) return {coins:100,xp:50};
  if(rank===2) return {coins:60,xp:30};
  if(rank===3) return {coins:40,xp:20};
  return {coins:25,xp:15};
}
const QUICK_MS=180_000, LONG_MS=2*60*60*1000;
/** Fast games end after 3 minutes; long competitive games get up to 2 hours. */
export function matchLimitMs(id:GameId):number{
  return ['trivers','crossword','chess','team-strategy'].includes(id)?LONG_MS:QUICK_MS;
}
