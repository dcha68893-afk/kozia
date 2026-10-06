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
