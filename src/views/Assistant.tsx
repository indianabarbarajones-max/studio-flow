import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Check, CircleHelp, Leaf, RotateCcw, Sparkles } from 'lucide-react';
import type { AssistantResponse, ViewProps } from '../../shared/types';
import './planning.css';

type ChatMessage = { id: number; role: 'user' | 'assistant'; text: string; mode?: 'local' | 'ai' };
const prompts = ['O que devo priorizar hoje?', 'Organize um plano de conteúdo semanal', 'Prepare uma mensagem para um interessado', 'Sugira um conteúdo para o Instagram'];

export default function Assistant({ state }: ViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedPrompt, setFailedPrompt] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);
  async function send(prompt: string, retry = false) {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(''); setFailedPrompt(prompt);
    if (!retry) setMessages(previous => [...previous, { id: ++count.current, role: 'user', text: prompt.trim() }]);
    setInput('');
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: prompt.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'O assistente não respondeu. Tente novamente.');
      const answer = result as AssistantResponse;
      setMessages(previous => [...previous, { id: ++count.current, role: 'assistant', text: answer.reply, mode: answer.mode }]);
      setFailedPrompt('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível conectar ao assistente.'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(input); }
  return <>
    <div className="page-heading"><div><p className="eyebrow">MAIS CLAREZA PARA DECIDIR</p><h1 className="page-title">Seu assistente de gestão</h1><p className="page-subtitle">Apoio para organizar a rotina, criar conteúdo e cuidar dos relacionamentos.</p></div><span className={`badge ${state.aiConfigured ? 'sage' : 'neutral'}`}><span className="status-dot" />{state.aiConfigured ? 'IA configurada' : 'Análise local'}</span></div>
    <div className="assistant-layout"><section className="card assistant-chat"><div className="assistant-chat-heading"><div className="assistant-avatar"><Leaf size={21} /></div><div><h2>Converse com o seu studio</h2><p>{state.aiConfigured ? 'Orientação com IA baseada nos indicadores do studio.' : 'Regras locais e modelos prontos, sem IA conectada.'}</p></div>{messages.length > 0 && <button className="icon-button" aria-label="Limpar conversa" title="Limpar conversa" disabled={busy} onClick={() => { setMessages([]); setError(''); setFailedPrompt(''); }}><RotateCcw size={17} /></button>}</div>
      <div className="chat-messages" aria-live="polite" aria-busy={busy}>{messages.length === 0 && <div className="assistant-welcome"><span className="assistant-welcome-icon"><Sparkles size={28} /></span><h2>Vamos cuidar do seu negócio?</h2><p>{state.aiConfigured ? 'Peça ajuda para analisar seus indicadores, organizar a rotina ou preparar um texto.' : 'Consulte um resumo dos seus indicadores, prioridades da rotina e modelos de comunicação.'}</p><div className="prompt-grid">{prompts.map(prompt => <button key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}<ArrowUp size={14} /></button>)}</div></div>}{messages.map(message => <article key={message.id} className={`chat-message ${message.role}`}><span className="chat-message-author">{message.role === 'user' ? 'Você' : message.mode === 'ai' ? 'Assistente · IA' : 'Assistente · análise local'}</span><p>{message.text}</p></article>)}{busy && <div className="chat-loading" role="status"><span /><span /><span /> Preparando sua resposta…</div>}{error && <div className="chat-error" role="alert"><p>{error}</p>{failedPrompt && <button className="button secondary" disabled={busy} onClick={() => send(failedPrompt, true)}>Tentar novamente</button>}</div>}<div ref={bottom} /></div>
      <form className="chat-composer" onSubmit={submit}>{state.aiConfigured && <p className="assistant-data-note">Seu pedido, o perfil, a memória do studio e indicadores agregados serão enviados à OpenAI.</p>}<div className="chat-input-wrap"><label className="sr-only" htmlFor="assistant-message">Seu pedido para o assistente</label><textarea id="assistant-message" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} rows={2} placeholder="Ex.: o que merece minha atenção nesta semana?" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input); } }} /><button className="chat-send" disabled={busy || !input.trim()} aria-label="Enviar mensagem"><ArrowUp size={20} /></button></div><p>Revise as sugestões antes de agir. O assistente não altera dados nem envia mensagens aos alunos.</p></form>
    </section><aside className="assistant-sidebar"><div className="card"><span className="growth-icon"><CircleHelp size={20} /></span><h3>Contexto que faz diferença</h3><p>Com a IA conectada, as respostas usam o perfil e a memória que vocês salvam em Configurações, além dos indicadores.</p><ul><li><Check size={15} /> Perfil e memória do studio</li><li><Check size={15} /> Alunos ativos e experimentais</li><li><Check size={15} /> Agenda, tarefas e metas</li></ul></div><div className="assistant-note"><span className="eyebrow">{state.aiConfigured ? 'USE COM INTENÇÃO' : 'SOBRE ESTE MODO'}</span><h3>{state.aiConfigured ? 'Uma segunda perspectiva' : 'Um começo prático'}</h3><p>{state.aiConfigured ? 'A IA pode ajudar a encontrar caminhos, mas suas decisões e o relacionamento com os alunos continuam com você. Evite dados pessoais nas mensagens.' : 'Sem uma chave de IA configurada, você recebe análises por regras e textos de referência. A conexão com IA é configurada no servidor.'}</p></div></aside></div>
  </>;
}
