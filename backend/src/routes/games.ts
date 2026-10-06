import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

export const gamesRouter = Router();

const catalog = [
  { id:'tube', name:'Tube Challenge', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'water-sort', name:'Water Sort', players:'1-4', competitive:true, serverAuthoritative:true },
  { id:'block-puzzle', name:'Block Puzzle', players:'1-4', competitive:true, serverAuthoritative:true },
  { id:'trivers', name:'Trivers', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'crossword', name:'Crossword', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'chess', name:'Chess', players:'2', competitive:true, serverAuthoritative:true },
  { id:'reaction', name:'Reaction', players:'1-8', competitive:true, serverAuthoritative:true },
  { id:'memory', name:'Memory', players:'1-8', competitive:true, serverAuthoritative:true },
  { id:'racing', name:'Reaction Racing', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'team-strategy', name:'Team Strategy', players:'2-8', competitive:true, serverAuthoritative:true }
] as const;

gamesRouter.get('/catalog', (_req,res)=>res.json({ games: catalog }));

const actionSchema=z.object({
  gameId:z.string().min(1).max(32),
  action:z.string().min(1).max(32),
  payload:z.record(z.unknown()).default({})
});

gamesRouter.post('/validate-action', requireAuth, async (req,res,next)=>{
  try {
    const input=actionSchema.parse(req.body);
    const allowed=catalog.some(g=>g.id===input.gameId);
    if(!allowed) return res.status(404).json({error:'Unknown game'});
    // The action gateway deliberately validates shape before room/game-specific settlement.
    // Room state remains authoritative; clients cannot award coins or XP directly.
    res.json({ok:true,userId:req.user!.id,gameId:input.gameId,action:input.action,acceptedAt:new Date().toISOString()});
  } catch(e){ next(e); }
});
