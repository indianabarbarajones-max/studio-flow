import { useState, type FormEvent } from 'react';
import { Plus, Search, Pencil, Trash2, Users, Mail, Phone } from 'lucide-react';
import type { Student, ViewProps } from '../../shared/types';
import { Modal, Field, EmptyState } from '../components/ui';
import { money, dateLabel, today } from '../lib';
import './operations.css';

type Draft = Omit<Student, 'id'>;
const labels = { active: 'Ativo', trial: 'Experimental', paused: 'Pausado' };
const tones = { active: 'sage', trial: 'amber', paused: 'neutral' };
const fresh = (): Draft => ({ name: '', email: '', phone: '', plan: 'Mensal · 2x por semana', monthlyFee: 250, status: 'active', renewalDate: today() });

export default function Students({ state, mutate, remove, notify }: ViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editor, setEditor] = useState<{ id?: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = state.students.filter(s => (filter === 'all' || s.status === filter) && `${s.name} ${s.email} ${s.phone}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  function open(s?: Student) {
    setError('');
    if (s) { const { id, ...draft } = s; setEditor({ id, draft }); }
    else setEditor({ draft: fresh() });
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setEditor(e => e ? { ...e, draft: { ...e.draft, [key]: value } } : e); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editor) return; setBusy(true); setError('');
    try { await mutate('students', { ...editor.draft }, editor.id); notify(editor.id ? 'Cadastro atualizado.' : 'Aluno cadastrado.'); setEditor(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function destroy() {
    if (!deleting) return; setBusy(true); setError('');
    try { await remove('students', deleting.id); setDeleting(null); notify('Aluno removido.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">RELAÇÕES QUE CRESCEM</p><h1 className="page-title">Seus alunos</h1><p className="page-subtitle">Cada prática começa com uma pessoa. Acompanhe cada jornada.</p></div><button className="button primary" onClick={() => open()}><Plus size={18} /> Novo aluno</button></div>
    <div className="stat-grid operations-stats">
      <div className="stat-card"><span className="stat-label">Alunos ativos</span><strong className="stat-value">{state.students.filter(s => s.status === 'active').length}</strong><span className="muted">Praticando com você</span></div>
      <div className="stat-card"><span className="stat-label">Em experiência</span><strong className="stat-value">{state.students.filter(s => s.status === 'trial').length}</strong><span className="muted">Oportunidade de acolher</span></div>
      <div className="stat-card"><span className="stat-label">Mensalidades contratadas</span><strong className="stat-value">{money(state.students.filter(s => s.status === 'active').reduce((sum, s) => sum + s.monthlyFee, 0))}</strong><span className="muted">Soma dos planos ativos, sem cobrança automática</span></div>
    </div>
    <section className="card"><div className="toolbar"><label className="search-box"><Search size={18} /><input aria-label="Buscar aluno" placeholder="Buscar por nome, telefone ou e-mail" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="Filtrar alunos por situação" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos os alunos</option><option value="active">Ativos</option><option value="trial">Experimentais</option><option value="paused">Pausados</option></select></div>
      {list.length === 0 ? <EmptyState title="Nenhum aluno encontrado" description="Ajuste a busca ou cadastre o primeiro aluno para começar." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Aluno</th><th>Plano</th><th>Mensalidade</th><th>Renovação</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{list.map(s => <tr key={s.id}><td><div className="student-identity"><span className="student-avatar">{s.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('')}</span><div><strong>{s.name}</strong>{s.email ? <span className="muted student-contact"><Mail size={12} />{s.email}</span> : s.phone ? <span className="muted student-contact"><Phone size={12} />{s.phone}</span> : <span className="muted student-contact">Sem contato cadastrado</span>}</div></div></td><td>{s.plan}</td><td>{money(s.monthlyFee)}</td><td>{dateLabel(s.renewalDate)}</td><td><span className={`badge ${tones[s.status]}`}>{labels[s.status]}</span></td><td><div className="row actions"><button className="icon-button" aria-label={`Editar ${s.name}`} onClick={() => open(s)}><Pencil size={16} /></button><button className="icon-button delete-action" aria-label={`Excluir ${s.name}`} onClick={() => { setError(''); setDeleting(s); }}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>}
      <div className="table-footer"><Users size={15} />{list.length} {list.length === 1 ? 'aluno encontrado' : 'alunos encontrados'}</div>
    </section>
    {editor && <Modal title={editor.id ? 'Editar aluno' : 'Acolher um novo aluno'} onClose={() => !busy && setEditor(null)}><form onSubmit={save} className="stack"><div className="form-grid"><Field label="Nome completo"><input autoFocus required maxLength={120} value={editor.draft.name} onChange={e => update('name', e.target.value)} /></Field><Field label="E-mail"><input type="email" maxLength={180} value={editor.draft.email} onChange={e => update('email', e.target.value)} /></Field><Field label="Telefone / WhatsApp"><input type="tel" maxLength={30} placeholder="(11) 99999-9999" value={editor.draft.phone} onChange={e => update('phone', e.target.value)} /></Field><Field label="Plano"><input required maxLength={120} value={editor.draft.plan} onChange={e => update('plan', e.target.value)} /></Field><Field label="Mensalidade (R$)"><input type="number" required min="0" max="1000000" step="0.01" value={editor.draft.monthlyFee} onChange={e => update('monthlyFee', e.target.valueAsNumber)} /></Field><Field label="Próxima renovação"><input type="date" required value={editor.draft.renewalDate} onChange={e => update('renewalDate', e.target.value)} /></Field><Field label="Situação"><select value={editor.draft.status} onChange={e => update('status', e.target.value as Student['status'])}><option value="active">Ativo</option><option value="trial">Experimental</option><option value="paused">Pausado</option></select></Field></div><p className="muted form-hint">O cadastro do plano não cria cobranças. Registre os recebimentos no Financeiro.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar aluno'}</button></div></form></Modal>}
    {deleting && <Modal title="Excluir aluno?" onClose={() => !busy && setDeleting(null)}><p>O cadastro de <strong>{deleting.name}</strong> e suas inscrições nas aulas serão removidos. Os lançamentos financeiros serão preservados sem vínculo com o aluno.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Manter aluno</button><button className="button danger" disabled={busy} onClick={destroy}>{busy ? 'Excluindo…' : 'Excluir aluno'}</button></div></Modal>}
  </>;
}
