'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button,Input} from '@/design-system';
import {authClient} from '@/lib/auth-client';
import {useT} from '../i18n';

export default function LoginForm(){
  const {t}=useT();
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const email=String(form.get('email')||''),password=String(form.get('password')||'');
    setBusy(true);setError('');
    const result=await authClient.signIn.email({email,password});
    setBusy(false);
    if(result.error){setError(result.error.message||t('Sign-in failed.'));return;}
    router.replace('/');router.refresh();
  }
  return <form className="login-card" onSubmit={submit}>
    <h1>Threadroom</h1>
    <p>{t('Sign in to open the studio.')}</p>
    <label>{t('Email')}<Input name="email" type="email" autoComplete="email" required/></label>
    <label>{t('Password')}<Input name="password" type="password" autoComplete="current-password" minLength={8} required/></label>
    {error&&<p className="login-error" role="alert">{error}</p>}
    <Button variant="primary" size="lg" type="submit" loading={busy}>{t('Sign in')}</Button>
  </form>;
}
