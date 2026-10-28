import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarPlus, Check, Copy, MessageCircle, RotateCcw, Send, Sprout } from 'lucide-react';
import type { ContentItem, ViewProps } from '../../shared/types';
import { Field } from '../components/ui';
import { today } from '../lib';
import Content from './Content';
import './communications.css';

const playbooks = [
  { id: 'inquiry', title: 'Primeiro contato', detail: 'Acolher quem quer conhecer', stage: '01', text: (g: string, studio: string) => `${g} Que bom receber seu interesse pelo ${studio}! Você já pratica yoga ou está começando agora? Me conte quais dias e horários costumam funcionar para você. Assim posso apresentar as opções do studio e ajudar a encontrar uma prática que faça sentido para sua rotina.` },
  { id: 'trial', title: 'Confirmar experimental', detail: 'Alinhar os detalhes da visita', stage: '02', text: (g: string, studio: string) => `${g} Aqui é do ${studio}. Passando para confirmar os detalhes da sua aula experimental: o dia e o horário que combinamos continuam bons para você? Se precisar ajustar, me avise por aqui. Também fico à disposição para tirar suas dúvidas antes da primeira prática.` },
  { id: 'feedback', title: 'Depois da primeira aula', detail: 'Ouvir antes de oferecer', stage: '03', text: (g: string, studio: string) => `${g} Foi bom ter você na prática do ${studio}! Como se sentiu durante e depois da aula? Se quiser continuar, posso apresentar os planos e os horários disponíveis. Fique à vontade para contar suas dúvidas e o que procura na prática.` },
  { id: 'reconnect', title: 'Retomar o contato', detail: 'Abrir espaço para uma conversa', stage: '04', text: (g: string, studio: string) => `${g} Aqui é do ${studio}. Como você está? Queria saber como a prática de yoga está cabendo na sua rotina e se podemos ajudar a encontrar um horário que funcione melhor. Quando quiser conversar, estou por aqui.` },
  { id: 'renewal', title: 'Conversar sobre renovação', detail: 'Dar clareza ao próximo ciclo', stage: '05', text: (g: string, studio: string) => `${g} Aqui é do ${studio}. Gostaria de conversar sobre o próximo ciclo do seu plano. Você pretende manter a frequência atual ou gostaria de avaliar outra opção? Posso confirmar os valores e os detalhes com você antes de seguirmos.` },
  { id: 'referral', title: 'Convidar uma indicação', detail: 'Crescer a partir das relações', stage: '06', text: (g: string, studio: string) => `${g} Você conhece alguém que gostaria de conhecer a prática de yoga no ${studio}? Se fizer sentido, pode compartilhar nosso contato. Será um prazer acolher essa pessoa e apresentar os horários e as opções para começar. Obrigado por fazer parte do studio!` },
] as const;

function plusDays(date: string, count: number) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + count); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T12:00:00`).getTime()) && plusDays(date, 0) === date; }
function brazilPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  return /^[1-9]\d\d{8,9}$/.test(digits) ? `55${digits}` : null;
}
const failure = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export default function Communications(props: ViewProps) {
  const { state, mutate, notify } = props;
  const [tab, setTab] = useState<'calendar' | 'messages'>('messages');
  const [selected, setSelected] = useState<string>('inquiry');
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [customBody, setCustomBody] = useState<string | null>(null);
  const [followDate, setFollowDate] = useState(plusDays(today(), 1));
  const [planDate, setPlanDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [error, setError] = useState('');
  const [planError, setPlanError] = useState('');
  const template = playbooks.find(item => item.id === selected)!;
  const greeting = name.trim() ? `Olá, ${name.trim().split(/\s+/)[0]}!` : 'Olá!';
  const body = customBody ?? template.text(greeting, state.settings.studioName);
  const normalizedPhone = brazilPhone(phone);
  const followTitle = `Retomar contato com ${name.trim()} · ${template.title}`;
  const existingFollowup = state.tasks.some(task => task.title === followTitle && task.dueDate === followDate);
  const weeklyPlan = useMemo<Omit<ContentItem, 'id'>[]>(() => [
    { title: 'Começar yoga: acolhimento para iniciantes', channel: 'Instagram', objective: 'Ajudar quem ainda está conhecendo a prática', scheduledDate: planDate, status: 'draft', body: `Você não precisa chegar sabendo tudo para começar a praticar yoga. No ${state.settings.studioName}, a conversa pode começar pelas suas dúvidas e pelo que você busca na prática.\n\nO que você gostaria de saber antes da primeira aula? Conte nos comentários ou mande uma mensagem para conhecer as opções do studio.\n\nRoteiro: apresente uma dúvida frequente, mostre o espaço e convide para uma conversa.` },
    { title: 'Por dentro do studio: pessoas e rotina', channel: 'Instagram', objective: 'Mostrar a experiência real do espaço', scheduledDate: validDate(planDate) ? plusDays(planDate, 2) : planDate, status: 'draft', body: `Um pouco da rotina do ${state.settings.studioName}: o cuidado com o espaço, a preparação de uma aula e as pessoas que tornam a prática possível.\n\nRoteiro: registre um detalhe do ambiente, conte como a equipe se prepara e termine convidando quem acompanha a conhecer o studio. Use imagens próprias e peça autorização antes de mostrar alunos.\n\nQuer saber quais horários combinam com sua rotina? Fale com a gente.` },
    { title: 'Convite para conhecer a prática', channel: 'WhatsApp', objective: 'Transformar interesse em conversa', scheduledDate: validDate(planDate) ? plusDays(planDate, 4) : planDate, status: 'draft', body: `Olá! Você gostaria de conhecer a prática de yoga no ${state.settings.studioName}? Me conte quais dias e horários costumam funcionar para você. Posso apresentar as opções disponíveis e tirar suas dúvidas para começar.\n\nNota para revisão: personalize para cada pessoa e use apenas com contatos que esperam receber sua mensagem.` },
  ], [planDate, state.settings.studioName]);
  const missingPlan = weeklyPlan.filter(item => !state.content.some(existing => existing.title === item.title && existing.scheduledDate === item.scheduledDate));
  function selectPerson(id: string) {
    const student = state.students.find(item => item.id === id); setStudentId(id); setName(student?.name || ''); setPhone(student?.phone || ''); setCustomBody(null); setError('');
  }
  async function copy() {
    setError('');
    try { await navigator.clipboard.writeText(body); notify('Mensagem copiada. Revise antes de enviar.'); }
    catch { setError('Seu navegador não permitiu copiar. Selecione o texto no campo da mensagem e copie manualmente.'); document.getElementById('communication-body')?.focus(); }
  }
  function openWhatsApp() {
    if (!normalizedPhone || !body.trim()) return;
    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
  }
  async function createFollowup() {
    setError(''); if (!name.trim() || !validDate(followDate)) { setError('Informe o nome do contato e uma data válida para o lembrete.'); return; }
    if (existingFollowup) { notify('Este lembrete já está na sua rotina.'); return; }
    setBusy(true);
    try { await mutate('tasks', { title: followTitle, area: 'Comunicação', dueDate: followDate, done: false }); notify('Lembrete adicionado à Minha rotina.'); }
    catch (error) { setError(failure(error)); } finally { setBusy(false); }
  }
  async function createPlan() {
    setPlanError(''); if (!validDate(planDate)) { setPlanError('Escolha uma data válida para começar o plano.'); return; }
    setPlanBusy(true); let created = 0;
    try { for (const item of missingPlan) { await mutate('content', { ...item }); created++; } notify(created ? `${created} conteúdos preparados no calendário. Revise os rascunhos antes de publicar.` : 'Este plano já está no calendário para essas datas.'); }
    catch (error) { setPlanError(`${created ? `${created} conteúdo(s) já foram salvos. ` : ''}${failure(error)} Você pode tentar novamente para completar o plano.`); }
    finally { setPlanBusy(false); }
  }
  return <>
    <div className="communication-tabs" role="tablist" aria-label="Áreas de comunicação"><button role="tab" id="messages-tab" aria-selected={tab === 'messages'} aria-controls="messages-panel" className={tab === 'messages' ? 'selected' : ''} onClick={() => setTab('messages')}><MessageCircle size={16} /> Mensagens prontas</button><button role="tab" id="calendar-tab" aria-selected={tab === 'calendar'} aria-controls="calendar-panel" className={tab === 'calendar' ? 'selected' : ''} onClick={() => setTab('calendar')}><CalendarPlus size={16} /> Calendário de conteúdo</button></div>
    {tab === 'calendar' ? <div id="calendar-panel" role="tabpanel" aria-labelledby="calendar-tab"><section className="communication-plan card"><span className="communication-plan-icon"><Sprout size={24} /></span><div className="communication-plan-intro"><h2>Uma semana de comunicação, com direção</h2><p>Prepare três rascunhos: acolher, mostrar o studio e convidar para uma conversa.</p></div><div className="communication-plan-actions"><Field label="Começar em"><input aria-label="Data inicial do plano de conteúdo" type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} /></Field><button className="button primary" onClick={createPlan} disabled={planBusy || !validDate(planDate) || missingPlan.length === 0}>{planBusy ? 'Preparando…' : missingPlan.length === 0 ? <><Check size={16} /> Plano já criado</> : <><CalendarPlus size={16} /> Planejar {missingPlan.length} conteúdos</>}</button></div>{planError && <p className="form-error communication-plan-error" role="alert">{planError}</p>}</section><Content {...props} /></div> : <div id="messages-panel" role="tabpanel" aria-labelledby="messages-tab"><div className="page-heading"><div><p className="eyebrow">CONSISTÊNCIA NO RELACIONAMENTO</p><h1 className="page-title">Uma boa conversa começa aqui</h1><p className="page-subtitle">Escolha o momento, personalize a mensagem e cuide do próximo passo.</p></div><span className="badge sage"><MessageCircle size={14} /> WhatsApp</span></div><div className="communication-layout"><aside className="communication-playbooks"><p className="communication-section-label">MOMENTOS DA JORNADA</p>{playbooks.map(item => <button key={item.id} className={`communication-playbook ${item.id === selected ? 'selected' : ''}`} onClick={() => { setSelected(item.id); setCustomBody(null); setError(''); }}><span className="communication-stage">{item.stage}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={16} /></button>)}<p className="communication-library-note">Modelos de referência, editáveis por você. Escolha a situação com base no relacionamento real com a pessoa.</p></aside><section className="card communication-composer"><div className="card-header"><div><p className="eyebrow">PREPARE COM CUIDADO</p><h2 className="card-title">{template.title}</h2></div><span className="badge neutral">Rascunho</span></div><div className="communication-form"><Field label="Escolher um aluno (opcional)"><select value={studentId} onChange={e => selectPerson(e.target.value)}><option value="">Novo contato / preencher manualmente</option>{[...state.students].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></Field><div className="form-grid"><Field label="Nome do contato"><input maxLength={120} placeholder="Como a pessoa se chama?" value={name} onChange={e => { setName(e.target.value); setStudentId(''); }} /></Field><Field label="WhatsApp no Brasil (com DDD)"><input type="tel" maxLength={25} placeholder="(11) 99999-9999" value={phone} onChange={e => { setPhone(e.target.value); setStudentId(''); }} aria-describedby="communication-phone-help" /></Field></div><p id="communication-phone-help" className={`communication-field-help ${phone.trim() && !normalizedPhone ? 'invalid' : ''}`}>{phone.trim() && !normalizedPhone ? 'Informe um número brasileiro com DDD: 10 ou 11 dígitos. O prefixo +55 é opcional.' : 'Use DDD + número. O prefixo +55 é opcional. O telefone só é usado ao abrir a conversa.'}</p><Field label="Mensagem para revisar e personalizar"><textarea id="communication-body" rows={9} maxLength={4000} value={body} onChange={e => setCustomBody(e.target.value)} /></Field><div className="communication-message-tools"><span>{body.length}/4.000 caracteres</span><button type="button" className="button ghost" onClick={() => setCustomBody(null)} disabled={customBody === null}><RotateCcw size={13} /> Restaurar modelo</button></div><div className="communication-send-actions"><button className="button secondary" disabled={!body.trim()} onClick={copy}><Copy size={16} /> Copiar mensagem</button><button className="button primary" disabled={!normalizedPhone || !body.trim()} onClick={openWhatsApp}><Send size={15} /> Abrir conversa no WhatsApp</button></div><p className="communication-review-note">O WhatsApp abrirá com um rascunho. Confira o destinatário e o texto; o envio é feito por você. A mensagem e o número serão compartilhados com o WhatsApp ao abrir a conversa.</p><div className="communication-followup"><div><h3>Não deixe a conversa se perder</h3><p>Crie um lembrete na sua rotina para acompanhar esse contato.</p></div><div className="communication-followup-actions"><Field label="Data do lembrete"><input type="date" value={followDate} onChange={e => setFollowDate(e.target.value)} /></Field><button className="button secondary" onClick={createFollowup} disabled={busy || !name.trim() || !validDate(followDate) || existingFollowup}>{existingFollowup ? <><Check size={16} /> Lembrete criado</> : <><CalendarPlus size={16} /> {busy ? 'Salvando…' : 'Lembrar de retornar'}</>}</button></div></div>{error && <p className="form-error" role="alert">{error}</p>}</div></section></div></div>}
  </>;
}
