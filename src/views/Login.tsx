import { useState } from 'react';
import { Flower2, LockKeyhole, ArrowRight } from 'lucide-react';
import { request } from '../lib';
import './login.css';
export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pin,setPin]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  return <main className="login-screen"><section className="login-card"><span className="login-flower"><Flower2 size={44} strokeWidth={1.2}/></span><p className="eyebrow">STUDIO FLOW</p><h1>Seu studio,<br/>em um só lugar.</h1><p className="login-description">Rotina organizada, comunicação com intenção.<br/>Entre com o PIN da equipe.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await request('/api/auth/login',{method:'POST',body:JSON.stringify({pin})});setPin('');onSuccess();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label className="field"><span><LockKeyhole size={14}/> PIN de acesso</span><input autoFocus name="pin" aria-label="PIN de acesso" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{4,12}" minLength={4} maxLength={12} required value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} placeholder="••••"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Entrando…':'Entrar no studio'}<ArrowRight size={17}/></button></form><small>Acesso compartilhado pela equipe do studio.</small></section></main>;
}
