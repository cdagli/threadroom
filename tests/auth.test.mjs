import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {betterAuth} from 'better-auth';
import {memoryAdapter} from 'better-auth/adapters/memory';
import {hashPassword} from 'better-auth/crypto';

test('Registration is rejected by the server while existing members can sign in',async()=>{
  const password='existing-member-test-password',now=new Date();
  const database={user:[{id:'existing',name:'Existing member',email:'existing@example.test',emailVerified:false,createdAt:now,updatedAt:now}],account:[{id:'credential',accountId:'existing',userId:'existing',providerId:'credential',password:await hashPassword(password),createdAt:now,updatedAt:now}],session:[],verification:[]};
  const source=readFileSync(new URL('../lib/auth.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  const require=id=>{
    if(id==='better-auth')return {betterAuth:options=>betterAuth({...options,baseURL:'http://localhost:3000',secret:'test-only-secret-at-least-thirty-two-characters',rateLimit:{enabled:false}})};
    if(id==='better-auth/next-js')return {nextCookies:()=>({id:'test-cookies'})};
    if(id==='./db')return {pool:memoryAdapter(database)};
    throw new Error(`Unexpected auth dependency: ${id}`);
  };
  new Function('module','exports','require',code)(module,module.exports,require);
  const {auth}=module.exports;
  const signup=await auth.handler(new Request('http://localhost:3000/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'New account',email:'new@example.test',password})}));
  assert.equal(signup.status,400);
  assert.equal((await signup.json()).code,'EMAIL_PASSWORD_SIGN_UP_DISABLED');
  assert.equal(database.user.length,1);
  assert.equal(database.account.length,1);
  const signin=await auth.api.signInEmail({body:{email:'existing@example.test',password}});
  assert.equal(signin.user.id,'existing');
  assert.ok(signin.token);
});
