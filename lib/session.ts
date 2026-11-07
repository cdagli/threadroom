import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {auth} from './auth';

export async function currentUser(){
  const session=await auth.api.getSession({headers:await headers()});
  return session?{id:session.user.id,name:session.user.name||session.user.email}:null;
}
// Pages redirect to sign-in; route handlers answer 401 instead.
export async function requirePageUser(){
  const user=await currentUser();
  if(!user)redirect('/login');
  return user;
}
export const unauthorized=()=>Response.json({error:'unauthorized'},{status:401});
export const notFound=()=>Response.json({error:'not-found'},{status:404});
export const badRequest=(error='invalid')=>Response.json({error},{status:400});
// Vercel rejects function bodies over 4.5 MB; refuse earlier with a clear code.
const maxBodyBytes=4_000_000;
export async function readJSON(request:Request):Promise<unknown>{
  const text=await request.text();
  if(text.length>maxBodyBytes)throw new BodyTooLarge();
  try{return JSON.parse(text);}catch{return null;}
}
export class BodyTooLarge extends Error {}
export const tooLarge=()=>Response.json({error:'too-large'},{status:413});
export const versionNumber=(value:string)=>/^\d{1,9}$/.test(value)?Number(value):null;
