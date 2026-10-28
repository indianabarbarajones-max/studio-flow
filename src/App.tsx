import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bell, CalendarDays, Check, CheckSquare, ChevronDown, Flower2, LayoutDashboard, Menu, MessageSquare, Settings2, Sparkles, Sprout, Users, Wallet, X } from 'lucide-react';
import type { Collection, StudioState, View, ViewProps } from '../shared/types';
import { request, today } from './lib';
import Login from './views/Login';
import Settings from './views/Settings';
import Overview from './views/Overview';
import Students from './views/Students';
import Schedule from './views/Schedule';
import Finance from './views/Finance';
import Routine from './views/Routine';
import Content from './views/Communications';
import Growth from './views/Growth';
import Assistant from './views/Assistant';

const nav = [
  { id:'overview',label:'Visão geral',icon:LayoutDashboard }, { id:'schedule',label:'Agenda e aulas',icon:CalendarDays },
  { id:'routine',label:'Minha rotina',icon:CheckSquare },{ id:'content',label:'Marketing e conteúdo',icon:MessageSquare },
  { id:'students',label:'Alunos',icon:Users },{ id:'finance',label:'Financeiro',icon:Wallet },
  { id:'growth',label:'Crescimento',icon:Sprout },{ id:'assistant',label:'Assistente',icon:Sparkles },{ id:'settings',label:'Configurações',icon:Settings2 }
] as const;
export default function App() {
  const [state,setState] = useState<StudioState>();
  const [error,setError] = useState('');
  const [view,setView] = useState<View>(() => nav.some(n=>n.id===location.hash.slice(1)) ? location.hash.slice(1) as View : 'overview');
  const [mobile,setMobile] = useState(false);
  const [authenticated,setAuthenticated] = useState<boolean | null>(null);
  const [authError,setAuthError] = useState('');
  const [notifications,setNotifications] = useState(false);
  const [toast,setToast] = useState('');
  const notify = useCallback((message:string) => setToast(message), []);
  const refresh = useCallback(async () => { try { const data = await request<StudioState>('/api/state'); setState(data); setError(''); } catch (e) { if ((e as {status?:number}).status === 401) { setAuthenticated(false); setState(undefined); } throw e; } }, []);
  const checkAuth = useCallback(async () => { try { setAuthError(''); const status = await request<{authenticated:boolean}>('/api/auth/status'); setAuthenticated(status.authenticated); } catch { setAuthError('Não foi possível conectar. Verifique sua conexão e tente novamente.'); } }, []);
  useEffect(() => { void checkAuth(); }, [checkAuth]);
  useEffect(() => { if (authenticated) void refresh().catch(e => setError(e.message)); }, [authenticated, refresh]);
  useEffect(() => { if (!toast) return; const timer=setTimeout(()=>setToast(''),5000); return ()=>clearTimeout(timer); },[toast]);
  useEffect(() => { const handler=()=>{ const hash=location.hash.slice(1); if(nav.some(n=>n.id===hash))setView(hash as View); }; window.addEventListener('hashchange',handler); return ()=>window.removeEventListener('hashchange',handler); },[]);
  const navigate = (next:View) => { setView(next); location.hash=next; setMobile(false); setNotifications(false); window.scrollTo({top:0,behavior:'instant'}); };
  const mutate: ViewProps['mutate'] = async (collection:Collection,data,id) => { await request(`/api/${collection}${id?`/${id}`:''}`,{method:id?'PATCH':'POST',body:JSON.stringify(data)}); await refresh(); };
  const remove: ViewProps['remove'] = async (collection,id) => { await request(`/api/${collection}/${id}`,{method:'DELETE'}); await refresh(); notify('Registro excluído.'); };
  const late = state?.transactions.filter(t=>t.status==='pending'&&t.dueDate<today()) || [];
  const upcomingTasks = state?.tasks.filter(t=>!t.done&&t.dueDate<=today()) || [];
  const views = { students:Students,schedule:Schedule,finance:Finance,routine:Routine,content:Content,growth:Growth,assistant:Assistant,settings:Settings };
  const Active = view === 'overview' ? null : views[view];
  if (authenticated === null) return <div className="loading-state"><Flower2 size={38}/><p>{authError || 'Abrindo seu studio…'}</p>{authError && <button className="button primary" onClick={()=>void checkAuth()}>Tentar novamente</button>}</div>;
  if (!authenticated) return <Login onSuccess={()=>{setAuthenticated(true);setError('');}}/>;
  return <div className="app-shell"><a className="skip-link" href="#main">Pular para o conteúdo</a>{mobile && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={()=>setMobile(false)}/>}
    <aside className={`sidebar ${mobile?'mobile-open':''}`}><a className="brand" href="#overview" onClick={()=>navigate('overview')}><span className="brand-symbol"><Flower2 size={31} strokeWidth={1.3}/></span><span>studio<span className="brand-flow">flow</span><small>GESTÃO COM PROPÓSITO</small></span></a><button className="studio-switch" onClick={()=>navigate('settings')}><span className="studio-avatar">{(state?.settings.studioName||'S').slice(0,1)}</span><span><strong>{state?.settings.studioName || 'Seu studio'}</strong><small>Seu espaço de gestão</small></span><ChevronDown size={15}/></button><span className="nav-caption">ESPAÇO DE TRABALHO</span><nav aria-label="Navegação principal">{nav.map(({id,label,icon:Icon})=><button key={id} className={`nav-item ${view===id?'active':''} ${id==='assistant'?'nav-assistant':''}`} aria-current={view===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={19} strokeWidth={1.65}/><span>{label}</span>{id==='assistant' && <span className="nav-new">NOVO</span>}{id==='overview' && view===id && <span className="nav-active-dot"/>}</button>)}</nav><div className="sidebar-bottom">{!state?.storage && <button className="button ghost" onClick={async()=>{try{await request('/api/auth/logout',{method:'POST'});setAuthenticated(false);setState(undefined);}catch(e){notify((e as Error).message);}}}>Sair do studio</button>}<div className="sidebar-note"><Sprout size={24} strokeWidth={1.4}/><strong>Um negócio que floresce</strong><p>Começa com pequenos cuidados, todos os dias.</p></div><button className="profile-button" onClick={()=>navigate('settings')}><span className="profile-avatar">{state?.settings.ownerName.slice(0,1)||'V'}</span><span><strong>{state?.settings.ownerName || 'Equipe'}</strong><small>Gestão do studio</small></span><Settings2 size={17}/></button></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" aria-label="Abrir menu" onClick={()=>setMobile(true)}><Menu size={22}/></button><span className="breadcrumb">Meu studio <span>/</span> <strong>{nav.find(n=>n.id===view)?.label}</strong></span></div><div className="topbar-actions"><span className="today-label"><CalendarDays size={15}/>{new Date(today()+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}</span><span className="topbar-divider"/><div className="notification-wrap"><button className="icon-button notification-button" aria-label="Ver pendências" aria-expanded={notifications} onClick={()=>setNotifications(!notifications)}><Bell size={19}/>{late.length+upcomingTasks.length>0&&<i/>}</button>{notifications&&<div className="notification-panel"><strong>Pontos de atenção</strong><button onClick={()=>navigate('finance')}>{late.length} lançamento(s) em atraso <ArrowRight size={14}/></button><button onClick={()=>navigate('routine')}>{upcomingTasks.length} tarefa(s) para revisar <ArrowRight size={14}/></button></div>}</div><button className="topbar-avatar" aria-label="Personalizar studio" onClick={()=>navigate('settings')}>{state?.settings.ownerName.slice(0,1)||'V'}</button></div></header>
    {state?.demo&&<div className="demo-banner"><span><span className="demo-dot"/> {state.storage === 'memory' ? 'Demonstração temporária · alterações não serão salvas' : state.storage === 'browser' ? 'Versão local · dados neste navegador, sem PIN online' : 'Modo demonstração'} <span className="demo-detail">· Use dados fictícios</span></span><button onClick={()=>navigate('settings')}>Personalizar <ArrowRight size={13}/></button></div>}
    <main id="main" tabIndex={-1}>{error?<div className="error-state"><Flower2 size={38}/><h1>Vamos reconectar seu studio</h1><p>{error}</p><button className="button primary" onClick={()=>void refresh().catch(e=>setError(e.message))}>Tentar novamente</button></div>:state?(Active?<Active state={state} mutate={mutate} remove={remove} notify={notify} refresh={refresh}/>:<Overview state={state} mutate={mutate} remove={remove} notify={notify} refresh={refresh} navigate={navigate}/>):<div className="loading-state"><Flower2 className="loading-flower" size={38}/><p>Preparando seu espaço…</p></div>}</main></div>
    {toast&&<div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="Fechar aviso" onClick={()=>setToast('')}><X size={16}/></button></div>}

  </div>;
}
