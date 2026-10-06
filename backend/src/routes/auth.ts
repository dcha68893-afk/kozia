import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../db/pool';
import { asyncHandler, HttpError } from '../errors';
import { requireAuth, signToken } from '../middleware/auth';
import { DEFAULT_APPEARANCE, getSelf } from '../services/users';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/, '3-20 letters, numbers or _'),
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
});

async function createUser(username:string,email:string,passwordHash:string,googleSubject?:string) {
  try {
    return await tx(async (c) => {
      const r = await c.query(
        `INSERT INTO users(username,email,password_hash,google_subject,appearance) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [username,email,passwordHash,googleSubject ?? null,JSON.stringify(DEFAULT_APPEARANCE)],
      );
      await c.query(`INSERT INTO inventory(user_id,item_id,equipped)
        SELECT $1, id, (category <> 'emote') FROM items
        WHERE price_coins=0 AND price_gems=0 AND min_level=1 AND active`, [r.rows[0].id]);
      return r.rows[0].id as string;
    });
  } catch (e:any) {
    if (e.code === '23505') throw new HttpError(409, 'Username or email already taken');
    throw e;
  }
}

authRouter.post('/register', asyncHandler(async (req,res) => {
  const b=registerSchema.parse(req.body);
  const id=await createUser(b.username,b.email,await bcrypt.hash(b.password,12));
  res.status(201).json({token:signToken(id,b.username),user:await getSelf(id)});
}));

const loginSchema=z.object({login:z.string().min(1).max(255),password:z.string().min(1).max(72)});
authRouter.post('/login', asyncHandler(async (req,res) => {
  const b=loginSchema.parse(req.body);
  const r=await pool.query('SELECT id,username,password_hash,banned_until FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1) LIMIT 1',[b.login]);
  const u=r.rows[0];
  if(!u || !(await bcrypt.compare(b.password,u.password_hash))) throw new HttpError(401,'Wrong username or password');
  if(u.banned_until && new Date(u.banned_until)>new Date()) throw new HttpError(403,'Account suspended');
  res.json({token:signToken(u.id,u.username),user:await getSelf(u.id)});
}));

const googleSchema=z.object({credential:z.string().min(20).max(10000)});
authRouter.post('/google', asyncHandler(async(req,res)=>{
  const {credential}=googleSchema.parse(req.body);
  const clientId=process.env.GOOGLE_CLIENT_ID;
  if(!clientId) throw new HttpError(503,'Google sign-in is not configured on the server');
  let info:any;
  try {
    const r=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential));
    if(!r.ok) throw new Error('rejected');
    info=await r.json();
  } catch { throw new HttpError(401,'Google sign-in could not be verified'); }
  const issuer=String(info.iss||'');
  if(String(info.aud)!==clientId || (issuer!=='accounts.google.com' && issuer!=='https://accounts.google.com') || String(info.email_verified)!=='true') {
    throw new HttpError(401,'Google account verification failed');
  }
  const subject=String(info.sub), email=String(info.email).toLowerCase();
  let r=await pool.query('SELECT id,username,banned_until,google_subject FROM users WHERE google_subject=$1 OR lower(email)=lower($2) LIMIT 1',[subject,email]);
  let u=r.rows[0];
  if(u?.banned_until && new Date(u.banned_until)>new Date()) throw new HttpError(403,'Account suspended');
  if(!u){
    const base=(String(info.name||email.split('@')[0]||'Player').replace(/[^A-Za-z0-9_]/g,'').slice(0,16)||'Player');
    let username=base,n=0;
    while((await pool.query('SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1',[username])).rowCount){n++;username=(base.slice(0,Math.max(1,16-String(n).length))+n).slice(0,20);}
    const id=await createUser(username,email,await bcrypt.hash(randomSecret(),12),subject);
    return res.status(201).json({token:signToken(id,username),user:await getSelf(id)});
  }
  if(!u.google_subject) await pool.query('UPDATE users SET google_subject=$1 WHERE id=$2',[subject,u.id]);
  res.json({token:signToken(u.id,u.username),user:await getSelf(u.id)});
}));
function randomSecret(){return crypto.randomUUID()+crypto.randomUUID()+crypto.randomUUID();}

authRouter.get('/me',requireAuth,asyncHandler(async(req,res)=>res.json({user:await getSelf(req.user!.id)})));
