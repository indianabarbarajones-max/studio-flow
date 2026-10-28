import { useState, type FormEvent } from 'react';
import { Copy, Instagram, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ContentItem, ViewProps } from '../../shared/types';
import { Modal, Field, EmptyState } from '../components/ui';
import { today, dateLabel } from '../lib';
import './planning.css';

const stages: { value: ContentItem['status']; label: string; color: string }[] = [{ value: 'idea', label: 'Ideias', color: 'neutral' }, { value: 'draft', label: 'Em produção', color: 'amber' }, { value: 'scheduled', label: 'Planejados', color: 'sage' }, { value: 'published', label: 'Publicados', color: 'sage' }];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.';

export default function Content({ state, mutate, remove, notify }: ViewProps) {
  const [editing, setEditing] = useState<ContentItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ContentItem | null>(null);
  const [channel, setChannel] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = editing && editing !== 'new' ? editing : null;
  const items = state.content.filter(item => channel === 'all' || item.channel === channel);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await mutate('content', { title: String(data.get('title')).trim(), channel: data.get('channel'), objective: data.get('objective'), scheduledDate: data.get('scheduledDate'), status: data.get('status'), body: data.get('body') }, current?.id); setEditing(null); notify('Conteúdo salvo no planejamento.'); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function copy(item: ContentItem) {
    try { await navigator.clipboard.writeText(item.body); notify('Texto copiado. Revise antes de publicar.'); }
    catch { notify('Não foi possível copiar. Abra o conteúdo para selecionar o texto.'); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">PRESENÇA COM PROPÓSITO</p><h1 className="page-title">Comunicação & conteúdo</h1><p className="page-subtitle">Da primeira ideia à publicação, com intenção e consistência.</p></div><button className="button primary" onClick={() => { setError(''); setEditing('new'); }}><Plus size={17} /> Novo conteúdo</button></div>
    <div className="toolbar"><div className="segmented" aria-label="Filtrar canal">{[['all', 'Todos os canais'], ['Instagram', 'Instagram'], ['WhatsApp', 'WhatsApp']].map(([value, label]) => <button key={value} className={channel === value ? 'selected' : ''} onClick={() => setChannel(value)}>{label}</button>)}</div><span className="muted">{items.length} conteúdos no planejamento</span></div>
    <div className="content-board">{stages.map(stage => { const cards = items.filter(item => item.status === stage.value).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)); return <section className="content-column" key={stage.value}><div className="content-column-heading"><h2>{stage.label}</h2><span className={`badge ${stage.color}`}>{cards.length}</span></div>{cards.length ? cards.map(item => <article className="content-card" key={item.id}><div className="row content-channel">{item.channel === 'Instagram' ? <Instagram size={15} /> : <MessageCircle size={15} />}<span>{item.channel}</span></div><h3>{item.title}</h3><p className="content-objective">{item.objective}</p>{item.body && <p className="content-excerpt">{item.body}</p>}<div className="content-card-footer"><span>{dateLabel(item.scheduledDate)}</span><div className="row">{item.body && <button className="icon-button" title="Copiar texto" aria-label={`Copiar ${item.title}`} onClick={() => copy(item)}><Copy size={15} /></button>}<button className="icon-button" aria-label={`Editar ${item.title}`} onClick={() => { setError(''); setEditing(item); }}><Pencil size={15} /></button><button className="icon-button" aria-label={`Excluir ${item.title}`} onClick={() => { setError(''); setDeleting(item); }}><Trash2 size={15} /></button></div></div></article>) : <div className="content-column-empty">Espaço para a próxima ideia.</div>}</section>; })}</div>
    {!state.content.length && <EmptyState title="Sua comunicação começa aqui." description="Registre uma ideia, defina o objetivo e escolha uma data para publicar." />}
    <p className="planning-footnote"><Instagram size={15} /> Este calendário organiza o trabalho. Publicações e mensagens são feitas por você nos canais escolhidos.</p>
    {editing && <Modal title={current ? 'Editar conteúdo' : 'Novo conteúdo'} onClose={() => !busy && setEditing(null)}><form onSubmit={save} className="stack"><Field label="Título ou tema"><input name="title" maxLength={200} required defaultValue={current?.title} placeholder="Ex.: como começar a praticar yoga" autoFocus /></Field><div className="form-grid"><Field label="Canal"><select name="channel" defaultValue={current?.channel ?? 'Instagram'}><option>Instagram</option><option>WhatsApp</option></select></Field><Field label="Etapa"><select name="status" defaultValue={current?.status ?? 'idea'}>{stages.map(stage => <option value={stage.value} key={stage.value}>{stage.label}</option>)}</select></Field><Field label="Objetivo"><input name="objective" maxLength={200} required defaultValue={current?.objective ?? 'Relacionamento'} placeholder="Ex.: atrair alunos para aula experimental" /></Field><Field label="Data planejada"><input name="scheduledDate" type="date" required defaultValue={current?.scheduledDate ?? today()} /></Field></div><Field label="Texto / roteiro"><textarea name="body" maxLength={10000} rows={7} defaultValue={current?.body ?? ''} placeholder="Escreva o conteúdo, a chamada para ação e suas observações…" /></Field>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar conteúdo'}</button></div></form></Modal>}
    {deleting && <Modal title="Excluir conteúdo?" onClose={() => !busy && setDeleting(null)}><p>“{deleting.title}” será removido do seu planejamento.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={async () => { setBusy(true); try { await remove('content', deleting.id); setDeleting(null); notify('Conteúdo excluído.'); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } }}>Excluir conteúdo</button></div></Modal>}
  </>;
}
