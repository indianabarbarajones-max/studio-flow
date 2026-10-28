import { useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, CheckSquare, ChevronRight, Flower2, Leaf, Megaphone, MessageCircle, Settings2, Sparkles, Users, Wallet } from 'lucide-react';
import type { Task, View, ViewProps } from '../../shared/types';
import { dateLabel, money, monthKey, today } from '../lib';
import './overview-v2.css';

const contentLabels = { idea: 'Ideia', draft: 'Rascunho', scheduled: 'Programado', published: 'Publicado' };
function plusDays(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

export default function Overview({ state, mutate, notify, navigate }: ViewProps & { navigate: (view: View) => void }) {
  const [busyTasks, setBusyTasks] = useState<string[]>([]);
  const date = today();
  const lastDay = plusDays(date, 6);
  const dueTasks = state.tasks.filter(task => !task.done && task.dueDate <= date);
  const overdueTasks = dueTasks.filter(task => task.dueDate < date);
  const todayDone = state.tasks.filter(task => task.done && task.dueDate === date).length;
  const openTasks = [...state.tasks].filter(task => !task.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const taskList = openTasks.slice(0, 5);
  const weeklyContent = state.content.filter(item => ['draft', 'scheduled'].includes(item.status) && item.scheduledDate >= date && item.scheduledDate <= lastDay);
  const pendingContent = [...state.content].filter(item => item.status !== 'published').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const overdueContent = pendingContent.filter(item => item.scheduledDate < date);
  const todayClasses = state.classes.filter(item => item.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const trials = state.students.filter(student => student.status === 'trial');
  const hasActivity = state.students.length + state.classes.length + state.tasks.length + state.content.length + state.goals.length + state.transactions.length > 0;
  const owner = state.settings.ownerName.trim().split(/\s+/)[0];
  const monthTransactions = state.transactions.filter(item => item.dueDate.startsWith(monthKey()) && item.status === 'paid');
  const income = monthTransactions.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expenses = monthTransactions.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const nextStep = overdueTasks.length
    ? `${overdueTasks.length} tarefa(s) passaram do prazo. Revise o que ainda faz sentido e escolha a primeira ação de hoje.`
    : overdueContent.length
      ? `${overdueContent.length} conteúdo(s) têm uma data anterior a hoje e ainda não foram marcados como publicados. Revise o status ou ajuste a data.`
      : weeklyContent.length === 0
        ? 'Sua próxima semana ainda não tem rascunhos ou conteúdos programados. Escolha uma ideia e reserve uma data para prepará-la.'
        : trials.length
          ? `${trials.length} aluno(s) estão em fase experimental. Prepare uma mensagem para ouvir como foi a experiência e combinar o próximo passo.`
          : 'Sua comunicação já tem conteúdos planejados para os próximos dias. Revise os textos e confira os compromissos antes de começar.';

  async function finishTask(task: Task) {
    if (busyTasks.includes(task.id)) return;
    setBusyTasks(previous => [...previous, task.id]);
    try { await mutate('tasks', { done: !task.done }, task.id); }
    catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível atualizar a tarefa.'); }
    finally { setBusyTasks(previous => previous.filter(id => id !== task.id)); }
  }

  return <div className="overview-v2">
    <div className="page-heading"><div><p className="eyebrow">ROTINA COM CLAREZA · COMUNICAÇÃO COM INTENÇÃO</p><h1 className="page-title">{owner ? `Olá, ${owner}` : 'Seu dia no studio'} <span className="greeting-leaf" aria-hidden="true">✳</span></h1><p className="page-subtitle">Organize o dia, cuide das conversas e dê espaço às suas ideias.</p></div><button className="button secondary" onClick={() => navigate('schedule')}><CalendarDays size={17} /> Ver minha agenda</button></div>

    <section className="welcome-card"><div className="welcome-copy"><span className="welcome-kicker"><span className="live-dot" /> UM PASSO DE CADA VEZ</span><h2>Uma rotina mais leve.<br /><em>Uma presença mais constante.</em></h2><p>O que fazer hoje e o que comunicar nesta semana, no mesmo lugar.</p><div className="overview-hero-actions"><button className="button light" onClick={() => navigate('routine')}><CheckSquare size={16} /> Organizar meu dia</button><button className="button overview-hero-secondary" onClick={() => navigate('content')}><Megaphone size={16} /> Planejar conteúdo</button></div></div><div className="zen-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sun" /><div className="art-arch"><Flower2 size={122} strokeWidth={0.8} /></div><div className="art-stone stone-one" /><div className="art-stone stone-two" /><div className="art-stone stone-three" /><Leaf className="art-leaf" size={88} strokeWidth={1} /><span className="art-caption">PRESENÇA · CUIDADO · CONSISTÊNCIA</span></div></section>

    {!hasActivity && <section className="overview-getting-started" aria-label="Primeiros passos"><div className="overview-start-intro"><span className="eyebrow">UM ESPAÇO PARA O SEU NEGÓCIO</span><h2>Vamos dar o primeiro passo?</h2><p>Configure os dados reais do studio e monte uma rotina que combine com vocês.</p></div><div className="overview-start-steps"><button onClick={() => navigate('settings')}><Settings2 size={19} /><span><strong>1. Configure seu studio</strong><small>Identidade, contatos e memória da empresa</small></span><ChevronRight size={16} /></button><button onClick={() => navigate('routine')}><CheckSquare size={19} /><span><strong>2. Prepare sua rotina</strong><small>Uma lista clara para orientar o dia</small></span><ChevronRight size={16} /></button><button onClick={() => navigate('content')}><Megaphone size={19} /><span><strong>3. Planeje sua comunicação</strong><small>Mensagens e conteúdos para começar</small></span><ChevronRight size={16} /></button></div></section>}

    <div className="stat-grid overview-stats">
      <Metric icon={<CheckSquare size={19} />} label="Tarefas para revisar" value={String(dueTasks.length).padStart(2, '0')} detail={`${overdueTasks.length} em atraso · ${dueTasks.length - overdueTasks.length} para hoje`} />
      <Metric icon={<Megaphone size={19} />} label="Conteúdos da semana" value={String(weeklyContent.length).padStart(2, '0')} detail="Rascunhos e programados nos próximos 7 dias" tone="peach" />
      <Metric icon={<CalendarDays size={19} />} label="Compromissos de hoje" value={String(todayClasses.length).padStart(2, '0')} detail={`${todayClasses.reduce((sum, item) => sum + item.studentIds.length, 0)} reservas de alunos na agenda`} tone="purple" />
      <Metric icon={<Users size={19} />} label="Alunos em experiência" value={String(trials.length).padStart(2, '0')} detail="Pessoas para acolher e acompanhar" tone="sand" />
    </div>

    <div className="dashboard-columns"><div className="dashboard-main">
      <section className="card overview-routine"><div className="card-header"><div><h2 className="card-title">Sua rotina, um passo por vez</h2><p className="muted small">Comece pelo que tem prazo até hoje</p></div><span className="badge sage">{todayDone} concluída(s) de hoje</span></div>
        <div className="overview-task-list">{taskList.length ? taskList.map(task => <label className="overview-task" key={task.id}><input type="checkbox" checked={task.done} disabled={busyTasks.includes(task.id)} onChange={() => void finishTask(task)} aria-label={`Concluir ${task.title}`} /><span className="overview-task-check" aria-hidden="true">{task.done && <Check size={13} />}</span><span className="overview-task-copy"><strong>{task.title}</strong><small>{task.area}</small></span><span className={`badge ${task.dueDate < date ? 'rose' : task.dueDate === date ? 'sage' : 'neutral'}`}>{task.dueDate < date ? `Em atraso · ${dateLabel(task.dueDate)}` : task.dueDate === date ? 'Hoje' : dateLabel(task.dueDate)}</span></label>) : <div className="overview-empty"><CheckSquare size={28} /><div><strong>{state.tasks.length ? 'As tarefas cadastradas estão concluídas' : 'Sua rotina começa com uma tarefa'}</strong><p>{state.tasks.length ? 'Revise os próximos passos e prepare o que vem a seguir.' : 'Prepare a lista padrão do dia ou adicione o que precisa acontecer.'}</p></div></div>}</div>
        <button className="card-bottom-link" onClick={() => navigate('routine')}>Abrir minha rotina <ArrowRight size={15} /></button>
      </section>

      <section className="card overview-content"><div className="card-header"><div><h2 className="card-title">Sua próxima comunicação</h2><p className="muted small">Da ideia ao conteúdo, com uma direção</p></div><button className="text-button" onClick={() => navigate('content')}>Abrir planejamento <ArrowRight size={15} /></button></div>
        {pendingContent.length ? <div className="overview-content-list">{pendingContent.slice(0, 4).map(item => <button className="overview-content-item" key={item.id} onClick={() => navigate('content')}><span className={`overview-channel ${item.channel === 'WhatsApp' ? 'whatsapp' : ''}`}>{item.channel === 'WhatsApp' ? <MessageCircle size={18} /> : <Megaphone size={18} />}</span><span className="overview-content-copy"><strong>{item.title}</strong><small>{item.channel} · {item.scheduledDate === date ? 'Hoje' : dateLabel(item.scheduledDate)}{item.scheduledDate < date ? ' · Revisar data/status' : ''}</small></span><span className={`badge ${item.status === 'scheduled' ? 'sage' : item.status === 'draft' ? 'amber' : 'neutral'}`}>{contentLabels[item.status]}</span><ChevronRight size={15} /></button>)}</div> : <div className="overview-empty"><Megaphone size={28} /><div><strong>Abra espaço para a sua próxima ideia</strong><p>Prepare uma semana de conteúdos ou registre uma ideia para desenvolver depois.</p><button className="button secondary" onClick={() => navigate('content')}>Começar planejamento <ArrowRight size={14} /></button></div></div>}
        <p className="overview-content-note">O planejamento organiza os próximos passos; publique pelos canais do studio e atualize o status aqui.</p>
      </section>
    </div><div className="dashboard-aside">
      <section className="insight-card"><div className="insight-heading"><span className="assistant-icon"><Sparkles size={19} /></span><div><h2>Onde colocar sua atenção</h2><span>Rotina, conteúdo e relacionamento</span></div></div><p>{nextStep}</p><button className="button insight-button" onClick={() => navigate('assistant')}>Pensar junto com o assistente <ArrowRight size={16} /></button><span className="insight-note">{state.aiConfigured ? 'IA configurada · sugestões para você revisar' : 'Análise local · conexão com IA nas configurações'}</span></section>

      <section className="card overview-agenda"><div className="card-header"><div><h2 className="card-title">Encontros de hoje</h2><p className="muted small">Reserve presença para cada encontro</p></div><span className="badge neutral">{dateLabel(date)}</span></div><div className="today-classes">{todayClasses.length ? todayClasses.slice(0, 3).map((item, index) => <button key={item.id} className="class-row" onClick={() => navigate('schedule')}><span className="class-time">{item.startTime}<small>{item.duration} min</small></span><span className={`class-marker marker-${index % 3}`} /><span className="class-info"><strong>{item.title}</strong><span>{item.instructor}</span></span><ChevronRight size={16} /></button>) : <div className="overview-empty compact"><CalendarDays size={25} /><div><strong>Sem compromissos cadastrados hoje</strong><p>Organize aulas e encontros na agenda.</p></div></div>}</div><button className="card-bottom-link" onClick={() => navigate('schedule')}>Ver agenda completa <ArrowRight size={15} /></button></section>

      <section className="card overview-message-card"><span className="overview-message-icon"><MessageCircle size={23} /></span><h2 className="card-title">Cuide da próxima conversa</h2><p>Use os modelos para acolher interessados, confirmar uma aula ou retomar o contato com cuidado.</p><button className="button secondary" onClick={() => navigate('content')}>Preparar uma mensagem <ArrowRight size={15} /></button></section>
    </div></div>

    <details className="overview-finance"><summary><span><Wallet size={17} /> Resumo financeiro do mês</span><ChevronRight size={16} /></summary><div className="overview-finance-content"><p>Receitas quitadas: <strong>{money(income)}</strong> · Despesas pagas: <strong>{money(expenses)}</strong></p><span>Valores agrupados pelo vencimento dos lançamentos.</span><button className="text-button" onClick={() => navigate('finance')}>Abrir financeiro <ArrowRight size={15} /></button></div></details>
    <footer className="page-footer"><Flower2 size={14} /> Mais presença. Menos improviso.</footer>
  </div>;
}
function Metric({ icon, label, value, detail, tone = 'sage' }: { icon: ReactNode; label: string; value: string; detail: string; tone?: string }) { return <div className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></div>; }
