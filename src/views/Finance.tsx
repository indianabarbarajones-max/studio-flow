import { useState, type FormEvent } from 'react';
import { Plus, Download, Pencil, Trash2, Check, ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';
import type { Transaction, ViewProps } from '../../shared/types';
import { Modal, Field, EmptyState } from '../components/ui';
import { money, dateLabel, today, monthKey } from '../lib';
import './operations.css';

type Draft = Omit<Transaction, 'id'>;
const fresh = (): Draft => ({ description: '', category: 'Mensalidades', type: 'income', amount: 250, dueDate: today(), status: 'pending', studentId: '' });
function csvCell(value: string | number) { const str = String(value); const safe = /^[\s]*[=+@-]/.test(str) ? `'${str}` : str; return `"${safe.replaceAll('"', '""')}"`; }

export default function Finance({ state, mutate, remove, notify }: ViewProps) {
  const [month, setMonth] = useState(monthKey());
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ id?: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const period = state.transactions.filter(t => t.dueDate.startsWith(month));
  const received = period.filter(t => t.type === 'income' && t.status === 'paid').reduce((sum, t) => sum + t.amount, 0);
  const spent = period.filter(t => t.type === 'expense' && t.status === 'paid').reduce((sum, t) => sum + t.amount, 0);
  const pending = period.filter(t => t.type === 'income' && t.status === 'pending').reduce((sum, t) => sum + t.amount, 0);
  const list = period.filter(t => (type === 'all' || t.type === type) && (status === 'all' || t.status === status) && `${t.description} ${t.category}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  function open(t?: Transaction) { setError(''); if (t) { const { id, ...draft } = t; setEditor({ id, draft: { ...draft, studentId: draft.studentId || '' } }); } else setEditor({ draft: fresh() }); }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setEditor(e => e ? { ...e, draft: { ...e.draft, [key]: value } } : e); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editor) return; setBusy(true); setError('');
    try { await mutate('transactions', { ...editor.draft }, editor.id); notify(editor.id ? 'Lançamento atualizado.' : 'Lançamento registrado.'); setMonth(editor.draft.dueDate.slice(0, 7)); setEditor(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  async function destroy() { if (!deleting) return; setBusy(true); setError(''); try { await remove('transactions', deleting.id); setDeleting(null); notify('Lançamento excluído.'); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir.'); } finally { setBusy(false); } }
  async function markPaid(t: Transaction) { setPaying(t.id); try { await mutate('transactions', { status: 'paid' }, t.id); notify(t.type === 'income' ? 'Recebimento confirmado.' : 'Pagamento confirmado.'); } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível confirmar.'); } finally { setPaying(null); } }
  function exportCsv() {
    const rows = [['Descrição', 'Categoria', 'Tipo', 'Valor (R$)', 'Vencimento', 'Situação'], ...list.map(t => [t.description, t.category, t.type === 'income' ? 'Receita' : 'Despesa', t.amount.toFixed(2).replace('.', ','), t.dueDate, t.status === 'paid' ? (t.type === 'income' ? 'Recebido' : 'Pago') : 'Pendente'])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `financeiro-${month}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify(`${list.length} lançamentos exportados.`);
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">CLAREZA PARA DECIDIR</p><h1 className="page-title">Financeiro</h1><p className="page-subtitle">Saiba o que entrou, o que saiu e o que precisa de atenção.</p></div><button className="button primary" onClick={() => open()}><Plus size={18} /> Novo lançamento</button></div>
    <div className="toolbar finance-period"><label htmlFor="finance-month" className="muted">Mês de vencimento</label><input id="finance-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></div>
    <div className="stat-grid operations-stats">
      <div className="stat-card"><span className="stat-label"><ArrowUpRight size={15} /> Recebido no período</span><strong className="stat-value">{money(received)}</strong><span className="muted">Receitas confirmadas</span></div>
      <div className="stat-card"><span className="stat-label"><ArrowDownRight size={15} /> Despesas pagas</span><strong className="stat-value">{money(spent)}</strong><span className="muted">Pagamentos confirmados</span></div>
      <div className="stat-card"><span className="stat-label">Resultado do período</span><strong className="stat-value">{money(received - spent)}</strong><span className="muted">Recebido menos despesas pagas</span></div>
      <div className="stat-card"><span className="stat-label">A receber</span><strong className="stat-value">{money(pending)}</strong><span className="muted">Receitas ainda pendentes</span></div>
    </div>
    <section className="card"><div className="card-header"><div><h2 className="card-title">Lançamentos</h2><p className="muted form-hint">Valores agrupados pelo vencimento. Não representa o saldo bancário.</p></div><button className="button secondary" onClick={exportCsv} disabled={!list.length}><Download size={16} /> Exportar CSV</button></div><div className="toolbar"><label className="search-box"><Search size={18} /><input aria-label="Buscar lançamento" placeholder="Buscar lançamento ou categoria" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="finance-toolbar-filters"><select aria-label="Tipo de lançamento" value={type} onChange={e => setType(e.target.value)}><option value="all">Todas as movimentações</option><option value="income">Receitas</option><option value="expense">Despesas</option></select><select aria-label="Situação do lançamento" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas as situações</option><option value="paid">Confirmados</option><option value="pending">Pendentes</option></select></div></div>
      {list.length === 0 ? <EmptyState title="Nenhum lançamento neste filtro" description="Registre uma receita ou despesa, ou selecione outro período." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{list.map(t => { const overdue = t.status === 'pending' && t.dueDate < today(); return <tr key={t.id}><td className="finance-description"><strong>{t.description}</strong><small className="muted">{t.category}{t.studentId ? ` · ${state.students.find(s => s.id === t.studentId)?.name || 'Aluno'}` : ''}</small></td><td>{dateLabel(t.dueDate)}</td><td className={`finance-number ${t.type}`}>{t.type === 'income' ? '+' : '−'} {money(t.amount)}</td><td><span className={`badge ${t.status === 'paid' ? 'sage' : overdue ? 'rose' : 'amber'}`}>{t.status === 'paid' ? (t.type === 'income' ? 'Recebido' : 'Pago') : overdue ? 'Em atraso' : 'Pendente'}</span></td><td><div className="row actions">{t.status === 'pending' && <button className="icon-button" aria-label={`Confirmar ${t.description}`} disabled={paying !== null} onClick={() => markPaid(t)}><Check size={17} /></button>}<button className="icon-button" aria-label={`Editar ${t.description}`} onClick={() => open(t)}><Pencil size={16} /></button><button className="icon-button delete-action" aria-label={`Excluir ${t.description}`} onClick={() => { setError(''); setDeleting(t); }}><Trash2 size={16} /></button></div></td></tr>; })}</tbody></table></div>}
      <div className="table-footer">{list.length} {list.length === 1 ? 'lançamento' : 'lançamentos'} · registro manual de movimentações</div>
    </section>
    {editor && <Modal title={editor.id ? 'Editar lançamento' : 'Novo lançamento'} onClose={() => !busy && setEditor(null)}><form onSubmit={save} className="stack"><div className="form-grid"><Field label="Descrição"><input autoFocus required maxLength={180} value={editor.draft.description} onChange={e => update('description', e.target.value)} placeholder="Ex.: Mensalidade de outubro" /></Field><Field label="Tipo"><select value={editor.draft.type} onChange={e => { update('type', e.target.value as Transaction['type']); update('category', e.target.value === 'income' ? 'Mensalidades' : 'Operação'); }}><option value="income">Receita</option><option value="expense">Despesa</option></select></Field><Field label="Valor (R$)"><input type="number" required min="0.01" max="10000000" step="0.01" value={editor.draft.amount} onChange={e => update('amount', e.target.valueAsNumber)} /></Field><Field label="Categoria"><input required maxLength={80} list="finance-categories" value={editor.draft.category} onChange={e => update('category', e.target.value)} /><datalist id="finance-categories"><option>Mensalidades</option><option>Aulas avulsas</option><option>Workshops</option><option>Aluguel</option><option>Equipe</option><option>Marketing</option><option>Operação</option></datalist></Field><Field label="Vencimento"><input type="date" required value={editor.draft.dueDate} onChange={e => update('dueDate', e.target.value)} /></Field><Field label="Situação"><select value={editor.draft.status} onChange={e => update('status', e.target.value as Transaction['status'])}><option value="pending">Pendente</option><option value="paid">{editor.draft.type === 'income' ? 'Recebido' : 'Pago'}</option></select></Field><Field label="Aluno vinculado (opcional)"><select value={editor.draft.studentId || ''} onChange={e => update('studentId', e.target.value)}><option value="">Sem vínculo</option>{state.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar lançamento'}</button></div></form></Modal>}
    {deleting && <Modal title="Excluir lançamento?" onClose={() => !busy && setDeleting(null)}><p><strong>{deleting.description}</strong> ({money(deleting.amount)}) será removido dos registros e dos indicadores financeiros.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={destroy}>{busy ? 'Excluindo…' : 'Excluir lançamento'}</button></div></Modal>}
  </>;
}
