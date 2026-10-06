import Redis from 'ioredis';
import { config } from '../config';
let client:Redis|null=null,pub:Redis|null=null,sub:Redis|null=null;
export function redisEnabled(){return !!config.redisUrl;}
export function redisClient(){if(!config.redisUrl)return null;if(!client)client=new Redis(config.redisUrl,{maxRetriesPerRequest:3,enableReadyCheck:true});return client;}
export function redisPublisher(){if(!config.redisUrl)return null;if(!pub)pub=new Redis(config.redisUrl,{maxRetriesPerRequest:3});return pub;}
export function redisSubscriber(){if(!config.redisUrl)return null;if(!sub)sub=new Redis(config.redisUrl,{maxRetriesPerRequest:3});return sub;}
export async function saveMatchState(id:string,state:unknown,ttl=900){const r=redisClient();if(r)await r.set('match:'+id,JSON.stringify(state),'EX',ttl);}
export async function loadMatchState<T=any>(id:string):Promise<T|null>{const r=redisClient();if(!r)return null;const v=await r.get('match:'+id);return v?JSON.parse(v):null;}
export async function setUserMatch(userId:string,matchId:string,ttl=900){const r=redisClient();if(r)await r.set('user-match:'+userId,matchId,'EX',ttl);}
export async function getUserMatch(userId:string){const r=redisClient();return r?await r.get('user-match:'+userId):null;}
export async function clearUserMatch(userId:string){const r=redisClient();if(r)await r.del('user-match:'+userId);}
export async function publishMatch(matchId:string,event:unknown){const r=redisPublisher();if(r)await r.publish('match-events:'+matchId,JSON.stringify(event));}
