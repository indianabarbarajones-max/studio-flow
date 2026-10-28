import { useState, type FormEvent } from 'react';
import { Check, CheckCircle2, ClipboardList, Plus, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import type { Task, ViewProps } from '../../shared/types';
import { Modal, Field, EmptyState } from '../components/ui';
import { today, dateLabel } from '../lib';
import './planning.css';

const standardTasks = [
  { title: 'Preparar e revisar o conteúdo do dia', area: 'Comunicação' },
  { title: 'Revisar agenda e inscrições nas aulas', area: 'Operação' },
  { title: 'Acompanhar alunos em aula experimental', area: 'Relacionamento' },
];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.';

export default function Routine({ state, mutate, remove, notify }: ViewProps) {
  const [filter, setFilter] = useState('pending');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const day = today();
  const pending = state.tasks.filter(task => !task.done);
  const tasks = state.tasks.filter(task => filter === 'completed' ? task.done : !task.done && (filter === 'today' ? task.dueDate === day : filter === 'overdue' ? task.dueDate < day : true)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const current = editing && editing !== 'new' ? editing : null;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      await mutate('tasks', { title: String(data.get('title')).trim(), area: data.get('area'), dueDate: data.get('dueDate'), done: current?.done ?? false }, current?.id);
      setEditing(null); notify(current ? 'Tarefa atualizada.' : 'Tarefa adicionada à rotina.');
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function toggle(task: Task) {
    setBusy(true);
    try { await mutate('tasks', { done: !task.done }, task.id); } catch (error) { notify(errorMessage(error)); } finally { setBusy(false); }
  }
  async function prepareRoutine() {
    const missing = standardTasks.filter(task => !state.tasks.some(existing => existing.title === task.title && existing.dueDate === day));
    if (!missing.length) { notify('A rotina padrão de hoje já está na sua lista.'); return; }
    setBusy(true);
    try {
      for (const task of missing) await mutate('tasks', { ...task, dueDate: day, done: false });
      setFilter('today'); notify('Rotina de hoje preparada.');
    } catch (error) { notify(errorMessage(error)); } finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">CONSISTÊNCIA, UM DIA DE CADA VEZ</p><h1 className="page-title">Sua rotina</h1><p className="page-subtitle">Transforme o que precisa ser feito em um processo simples.</p></div><button className="button primary" onClick={() => { setError(''); setEditing('new'); }}><Plus size={17} /> Nova tarefa</button></div>
    <div className="routine-banner"><div className="routine-banner-icon"><ClipboardList size={25} /></div><div><h3>Comece pelo essencial</h3><p>Conteúdo, agenda e relacionamento: uma base diária para cuidar do studio.</p></div><button className="button secondary" disabled={busy} onClick={prepareRoutine}><RotateCcw size={16} /> Preparar rotina de hoje</button></div>
    <div className="toolbar"><div className="segmented" aria-label="Filtrar tarefas">{[['pending', 'Pendentes'], ['today', 'Hoje'], ['overdue', 'Atrasadas'], ['completed', 'Concluídas']].map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><span className="muted">{pending.length} pendentes · {state.tasks.filter(task => task.done).length} concluídas</span></div>
    <div className="card routine-list">{tasks.length ? tasks.map(task => <div className={`routine-item ${task.done ? 'is-done' : ''}`} key={task.id}><button className="task-check" disabled={busy} aria-label={`${task.done ? 'Reabrir' : 'Concluir'}: ${task.title}`} onClick={() => toggle(task)}>{task.done && <Check size={16} />}</button><div className="routine-item-copy"><h3>{task.title}</h3><div className="row"><span className="badge neutral">{task.area}</span><span className={!task.done && task.dueDate < day ? 'overdue-text' : 'muted'}>{dateLabel(task.dueDate)}{!task.done && task.dueDate < day ? ' · atrasada' : ''}</span></div></div><button className="icon-button" aria-label={`Editar ${task.title}`} onClick={() => { setError(''); setEditing(task); }}><Pencil size={16} /></button><button className="icon-button" aria-label={`Excluir ${task.title}`} onClick={() => { setError(''); setDeleting(task); }}><Trash2 size={16} /></button></div>) : <EmptyState title={filter === 'completed' ? 'Sua primeira conquista começa com uma tarefa.' : 'Tudo em dia por aqui.'} description="Use os filtros ou adicione uma tarefa para organizar os próximos passos." />}</div>
    <p className="planning-footnote"><CheckCircle2 size={15} /> A rotina padrão é criada para o dia atual. Você escolhe quando preparar o próximo dia.</p>
    {editing && <Modal title={current ? 'Editar tarefa' : 'Nova tarefa'} onClose={() => !busy && setEditing(null)}><form onSubmit={save} className="stack"><Field label="O que precisa ser feito?"><input name="title" required maxLength={200} defaultValue={current?.title} placeholder="Ex.: preparar os stories da semana" autoFocus /></Field><div className="form-grid"><Field label="Área"><select name="area" defaultValue={current?.area ?? 'Operação'}>{['Operação', 'Financeiro', 'Relacionamento', 'Comunicação', 'Crescimento', ...(current?.area && !['Operação', 'Financeiro', 'Relacionamento', 'Comunicação', 'Crescimento'].includes(current.area) ? [current.area] : [])].map(area => <option key={area}>{area}</option>)}</select></Field><Field label="Prazo"><input name="dueDate" type="date" required defaultValue={current?.dueDate ?? day} /></Field></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar tarefa'}</button></div></form></Modal>}
    {deleting && <Modal title="Excluir tarefa?" onClose={() => !busy && setDeleting(null)}><p>“{deleting.title}” será removida da sua rotina.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={async () => { setBusy(true); try { await remove('tasks', deleting.id); setDeleting(null); notify('Tarefa excluída.'); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } }}>Excluir tarefa</button></div></Modal>}
  </>;
}
