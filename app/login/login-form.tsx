'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button,Input} from '@/design-system';
import {authClient} from '@/lib/auth-client';
import {useT} from '../i18n';

export default function LoginForm(){
  const {t}=useT();
  const router=useRouter();
  const [signUp,setSignUp]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const email=String(form.get('email')||''),password=String(form.get('password')||'');
    setBusy(true);setError('');
    const result=signUp
      ?await authClient.signUp.email({name:String(form.get('name')||''),email,password})
      :await authClient.signIn.email({email,password});
    setBusy(false);
    if(result.error){setError(result.error.message||t('Sign-in failed.'));return;}
    router.replace('/');router.refresh();
  }
  return <form className="login-card" onSubmit={submit}>
    <h1>Threadroom</h1>
    <p>{signUp?t('Create an account to open the studio.'):t('Sign in to open the studio.')}</p>
    {signUp&&<label>{t('Name')}<Input name="name" autoComplete="name" required/></label>}
    <label>{t('Email')}<Input name="email" type="email" autoComplete="email" required/></label>
    <label>{t('Password')}<Input name="password" type="password" autoComplete={signUp?'new-password':'current-password'} minLength={8} required/></label>
    {error&&<p className="login-error" role="alert">{error}</p>}
    <Button variant="primary" size="lg" type="submit" loading={busy}>{signUp?t('Create account'):t('Sign in')}</Button>
    <Button variant="link" onClick={()=>{setSignUp(v=>!v);setError('');}}>{signUp?t('Already have an account? Sign in'):t('No account yet? Create one')}</Button>
  </form>;
}
