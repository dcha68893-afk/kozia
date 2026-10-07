import { pool } from '../db/pool';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

export const gamesRouter = Router();

const catalog = [
  { id:'tube', name:'Tube Challenge', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'water-sort', name:'Water Sort', players:'2-4', competitive:true, serverAuthoritative:true },
  { id:'block-puzzle', name:'Block Puzzle', players:'2-4', competitive:true, serverAuthoritative:true },
  { id:'trivers', name:'Trivers', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'crossword', name:'Crossword', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'chess', name:'Chess', players:'2', competitive:true, serverAuthoritative:true },
  { id:'reaction', name:'Reaction', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'memory', name:'Memory', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'racing', name:'Reaction Racing', players:'2-8', competitive:true, serverAuthoritative:true },
  { id:'team-strategy', name:'Team Strategy', players:'2-8', competitive:true, serverAuthoritative:true }
] as const;

gamesRouter.get('/catalog', (_req,res)=>res.json({ games: catalog }));

const actionSchema=z.object({
  gameId:z.string().min(1).max(32),
  action:z.string().min(1).max(32),
  payload:z.record(z.unknown()).default({})
});

gamesRouter.get('/history', requireAuth, async (req,res,next)=>{
  try {
    const mine=await pool.query(`SELECT room_id,kind,won,coins,xp,rank,score,created_at FROM game_results WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[req.user!.id]);
    const ids=mine.rows.map((r:any)=>r.room_id);
    const others=ids.length?await pool.query(`SELECT g.room_id,u.username,g.rank,g.score FROM game_results g JOIN users u ON u.id=g.user_id WHERE g.room_id=ANY($1) ORDER BY g.rank NULLS LAST`,[ids]):{rows:[]};
    const by:Record<string,any[]>={};for(const o of others.rows)(by[o.room_id]??=[]).push({username:o.username,rank:o.rank,score:o.score});
    res.json({history:mine.rows.map((r:any)=>({matchId:r.room_id,game:r.kind,won:r.won,rank:r.rank,score:r.score,coins:r.coins,xp:r.xp,playedAt:r.created_at,players:by[r.room_id]??[]}))});
  } catch(e){ next(e); }
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
