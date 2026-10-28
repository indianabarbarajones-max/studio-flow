import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CalendarDays, Check, CheckCircle2, Link2, LoaderCircle, Save, Settings2, Sparkles, Unplug } from 'lucide-react';
import type { IntegrationStatus, Settings as StudioSettings, ViewProps } from '../../shared/types';
import { Field, Modal } from '../components/ui';
import { request } from '../lib';
import './settings.css';

const text = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export default function Settings({ state, refresh, notify }: ViewProps) {
  const [draft, setDraft] = useState<StudioSettings>({ ...state.settings });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [integration, setIntegration] = useState<IntegrationStatus>();
  const [integrationError, setIntegrationError] = useState('');
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState('');
  useEffect(() => { setDraft({ ...state.settings }); }, [state.settings]);
  const loadConnections = useCallback(async () => {
    setLoadingConnections(true); setIntegrationError('');
    if (state.storage) {
      setIntegration({ ai: { configured: false, model: '' }, google: { configured: false, connected: false, calendarId: 'primary', missing: [] } });
      setLoadingConnections(false); return;
    }
    try { setIntegration(await request<IntegrationStatus>('/api/integrations')); }
    catch (e) { setIntegrationError(text(e)); }
    finally { setLoadingConnections(false); }
  }, [state.storage]);
  useEffect(() => { void loadConnections(); }, [loadConnections]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('google');
    if (!status) return;
    setConnectionNotice(status === 'connected' ? 'Google Agenda conectado. Agora escolha quais compromissos deseja sincronizar na Agenda.' : 'A conexão com o Google não foi concluída. Tente novamente ou confira a configuração da integração.');
    url.searchParams.delete('google'); url.searchParams.delete('error');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  function update<K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) { setDraft(current => ({ ...current, [key]: value })); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try { await request('/api/settings', { method: 'PATCH', body: JSON.stringify(draft) }); await refresh?.(); notify('As configurações e a memória do studio foram salvas.'); }
    catch (e) { setError(text(e)); }
    finally { setSaving(false); }
  }
  async function disconnect() {
    setDisconnecting(true); setIntegrationError('');
    try {
      await request('/api/integrations/google/disconnect', { method: 'POST', body: '{}' });
      await loadConnections(); await refresh?.(); setConfirmDisconnect(false);
      setConnectionNotice('Google Agenda desconectado. Os eventos já enviados continuam na sua conta Google.');
    } catch (e) { setIntegrationError(text(e)); }
    finally { setDisconnecting(false); }
  }
  const google = integration?.google;
  return <>
    <div className="page-heading"><div><p className="eyebrow">O SEU JEITO DE CUIDAR DO STUDIO</p><h1 className="page-title">Configurações</h1><p className="page-subtitle">Dados reais, voz da marca e conexões para uma rotina mais simples.</p></div><span className="settings-heading-icon"><Settings2 size={22} /></span></div>
    {connectionNotice && <div className="settings-connection-notice" role="status"><CalendarDays size={18} /><p>{connectionNotice}</p><button className="text-button" onClick={() => setConnectionNotice('')}>Fechar</button></div>}
    <div className="settings-layout"><form className="settings-form" onSubmit={save}>
      <section className="card settings-section"><div className="card-header"><div><p className="eyebrow">COMECE POR AQUI</p><h2 className="card-title">Seu studio</h2><p className="muted">Essas informações personalizam o espaço de trabalho e os modelos de comunicação.</p></div><span className="settings-section-number">01</span></div><div className="form-grid">
        <Field label="Nome do studio"><input name="studioName" value={draft.studioName} onChange={e => update('studioName', e.target.value)} required maxLength={100} placeholder="Nome do seu studio" autoComplete="organization" /></Field>
        <Field label="Nome da pessoa responsável"><input name="ownerName" value={draft.ownerName} onChange={e => update('ownerName', e.target.value)} maxLength={100} placeholder="Como podemos chamar você?" autoComplete="name" /></Field>
        <Field label="WhatsApp do studio"><input name="phone" type="tel" value={draft.phone || ''} onChange={e => update('phone', e.target.value)} maxLength={40} placeholder="(11) 99999-9999" autoComplete="tel" /></Field>
        <Field label="E-mail do studio"><input name="email" type="email" value={draft.email || ''} onChange={e => update('email', e.target.value)} maxLength={254} placeholder="contato@seustudio.com.br" autoComplete="email" /></Field>
        <Field label="Instagram"><input name="instagram" value={draft.instagram || ''} onChange={e => update('instagram', e.target.value)} maxLength={300} placeholder="@seustudio" /></Field>
        <Field label="Site"><input name="website" type="url" value={draft.website || ''} onChange={e => update('website', e.target.value)} maxLength={500} placeholder="https://seustudio.com.br" autoComplete="url" /></Field>
        <div className="span-2"><Field label="Endereço"><input name="address" value={draft.address || ''} onChange={e => update('address', e.target.value)} maxLength={500} placeholder="Rua, número, bairro e cidade" autoComplete="street-address" /></Field></div>
      </div><details className="settings-finance-detail"><summary>Meta financeira opcional</summary><Field label="Meta mensal de recebimentos (R$)"><input name="monthlyRevenueTarget" type="number" required min="0" step="0.01" value={draft.monthlyRevenueTarget} onChange={e => update('monthlyRevenueTarget', e.target.valueAsNumber)} /></Field></details></section>
      <section className="card settings-section"><div className="card-header"><div><p className="eyebrow">MAIS CONSISTÊNCIA NA COMUNICAÇÃO</p><h2 className="card-title">Identidade e marketing</h2><p className="muted">Dê contexto para que os conteúdos tenham a voz do seu negócio.</p></div><span className="settings-section-number">02</span></div><div className="settings-fields">
        <Field label="Como você descreve o studio?"><textarea name="description" rows={3} value={draft.description || ''} onChange={e => update('description', e.target.value)} maxLength={3000} placeholder="O que torna seu espaço especial, sua proposta e seus valores." /></Field>
        <Field label="Modalidades, serviços e planos"><textarea name="services" rows={3} value={draft.services || ''} onChange={e => update('services', e.target.value)} maxLength={3000} placeholder="Descreva as práticas oferecidas, planos e como funciona a primeira aula." /></Field>
        <div className="form-grid"><Field label="Quem você quer alcançar?"><textarea name="audience" rows={4} value={draft.audience || ''} onChange={e => update('audience', e.target.value)} maxLength={3000} placeholder="Perfil dos alunos, suas dúvidas e o que procuram na prática." /></Field><Field label="Tom de voz da marca"><textarea name="tone" rows={4} value={draft.tone || ''} onChange={e => update('tone', e.target.value)} maxLength={1500} placeholder="Ex.: acolhedor e claro; evitar frases prontas e promessas de resultados." /></Field></div>
      </div></section>
      <section className="card settings-section"><div className="card-header"><div><p className="eyebrow">CONTEXTO QUE FICA</p><h2 className="card-title">Memória do studio</h2><p className="muted">Registre decisões, preferências e orientações que toda a equipe deve seguir.</p></div><span className="settings-section-number"><Sparkles size={18} /></span></div><Field label="O que o assistente precisa saber sobre o studio?"><textarea name="studioMemory" rows={8} maxLength={12000} value={draft.studioMemory || ''} onChange={e => update('studioMemory', e.target.value)} placeholder="Ex.: nossa prioridade deste mês é divulgar as aulas para iniciantes. Antes de oferecer um plano, perguntar quais horários funcionam. Usar a expressão prática de yoga em vez de treino. Publicar três vezes por semana." /></Field><div className="settings-memory-caption"><p>A IA usa este contexto salvo junto com os indicadores do app. Você pode colar aqui um resumo das preferências que já usa no ChatGPT.</p><span>{(draft.studioMemory || '').length.toLocaleString('pt-BR')}/12.000</span></div></section>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="settings-save-bar"><span><CheckCircle2 size={16} /> Um contexto compartilhado por toda a equipe</span><button className="button primary" disabled={saving}>{saving ? <LoaderCircle size={16} /> : <Save size={16} />}{saving ? 'Salvando…' : 'Salvar configurações'}</button></div>
    </form><aside className="settings-connections"><div className="settings-connections-heading"><Link2 size={17} /><h2>Conexões</h2></div>
      <section className="card settings-integration"><span className="settings-integration-icon"><CalendarDays size={22} /></span><h3>Google Agenda</h3><span className={`badge ${google?.connected ? 'sage' : 'neutral'}`}>{loadingConnections ? 'Verificando…' : google?.connected ? 'Conectado' : google?.configured ? 'Pronto para conectar' : 'Configuração pendente'}</span><p>{state.storage ? 'As conexões externas ficam disponíveis na versão online com dados compartilhados.' : google?.connected ? 'Os compromissos marcados para sincronizar aparecem na agenda principal da conta conectada.' : 'Conecte uma conta Google e escolha, em cada compromisso, se ele deve aparecer por lá.'}</p>
        {!state.storage && google?.configured && !google.connected && <button type="button" className="button primary" onClick={() => { window.location.href = '/api/integrations/google/connect'; }}><Link2 size={16} /> Conectar Google Agenda</button>}
        {google?.connected && <><div className="settings-connection-detail"><Check size={14} /> Agenda principal · sincronização por escolha</div><button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}><Unplug size={15} /> Desconectar conta</button></>}
        {!state.storage && google && !google.configured && <div className="settings-integration-help">A conexão Google precisa ser configurada na hospedagem do app. Assim que estiver pronta, o botão de autorização aparecerá aqui.</div>}
      </section>
      <section className="card settings-integration"><span className="settings-integration-icon ai"><Sparkles size={22} /></span><h3>Assistente com IA</h3><span className={`badge ${(integration?.ai.configured ?? state.aiConfigured) ? 'sage' : 'neutral'}`}>{(integration?.ai.configured ?? state.aiConfigured) ? 'API configurada' : 'Análise local'}</span><p>{(integration?.ai.configured ?? state.aiConfigured) ? 'O assistente usa a conexão de API do app, os indicadores e as informações salvas nestas configurações.' : 'Por enquanto, o assistente oferece análises por regras e modelos prontos. Para usar IA generativa, configure uma chave de API na hospedagem.'}</p><div className="settings-integration-help">A assinatura ChatGPT Plus e a memória da sua conta não podem ser conectadas diretamente ao app. A API tem uso e cobrança separados. A memória do studio mantém aqui o contexto que você deseja compartilhar.</div><a className="settings-link" href="#assistant">Abrir assistente <ArrowUpRight size={15} /></a></section>
      {integrationError && <div className="settings-connection-error" role="alert"><p>{integrationError}</p><button type="button" className="text-button" onClick={() => void loadConnections()} disabled={loadingConnections}>Tentar novamente</button></div>}
      <p className="settings-sync-note">As configurações são compartilhadas pela equipe na versão online. Alterações só entram em vigor depois de salvar.</p>
    </aside></div>
    {confirmDisconnect && <Modal title="Desconectar Google Agenda?" onClose={() => !disconnecting && setConfirmDisconnect(false)}><p className="muted">Novas sincronizações ficarão pausadas. Os eventos já enviados permanecem na sua conta Google.</p>{integrationError && <p className="form-error" role="alert">{integrationError}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={disconnecting} onClick={() => setConfirmDisconnect(false)}>Manter conexão</button><button type="button" className="button danger" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? 'Desconectando…' : 'Desconectar'}</button></div></Modal>}
  </>;
}
