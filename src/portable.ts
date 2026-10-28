// Used only by the downloadable demonstration. The server application never loads this adapter.

import { localAssistant } from '../server/assistant';
import { object, validateEntity, validateSettings, ValidationError } from '../server/validation';
import type { Collection, Entity, StudioState } from '../shared/types';

const collections: Collection[] = ['students', 'transactions', 'classes', 'tasks', 'content', 'goals'];
const storageKey = 'studio-flow-portable-v2';
let persistent = false;
let loadError = '';
let current: StudioState = {students:[],transactions:[],classes:[],tasks:[],content:[],goals:[],settings:{studioName:'Meu Studio',ownerName:'',monthlyRevenueTarget:0},demo:true,aiConfigured:false};
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const parsed = JSON.parse(stored) as StudioState;
    if (!parsed.settings || !collections.every(key => Array.isArray(parsed[key]))) throw new Error('Formato inválido');
    current = { ...parsed, aiConfigured: false, demo: true };
  }
  localStorage.setItem(storageKey, JSON.stringify(current));
  persistent = true;
} catch {
  // Never replace a saved version that could not be read.
  try { if (localStorage.getItem(storageKey)) loadError = 'Não foi possível ler os dados salvos desta demonstração. Preserve este arquivo e tente abrir no mesmo navegador em que você o usou.'; } catch { /* private/browser-restricted storage; use visibly temporary demo */ }
}

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
function commit(next: StudioState) {
  if (persistent) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { throw new ValidationError('O navegador não conseguiu salvar. Libere espaço ou permita armazenamento local e tente novamente. A alteração não foi aplicada.'); }
  }
  current = next;
}
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('/api/')) return originalFetch(input, options);
  if (url === '/api/auth/status') return json({authenticated:true});
  if (loadError) return json({ error: loadError }, 500);
  try {
    const method = options?.method?.toUpperCase() ?? 'GET';
    const segments = url.slice(5).split('/');
    const collection = segments[0] as Collection;
    const id = segments[1];
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (url === '/api/auth/status') return json({authenticated:true});
    if (url === '/api/integrations') return json({ai:{configured:false,model:''},google:{configured:false,connected:false,calendarId:'primary',missing:[]}});
    if (url === '/api/state' && method === 'GET') return json({ ...current, storage: persistent ? 'browser' : 'memory' });
    if (url === '/api/health' && method === 'GET') return json({ status: 'ok' });
    if (url === '/api/assistant' && method === 'POST') {
      const { message } = object(body);
      if (typeof message !== 'string' || !message.trim() || message.length > 2000) throw new ValidationError('Escreva uma mensagem entre 1 e 2.000 caracteres.');
      const answer = localAssistant(message, current);
      answer.reply = answer.reply.replace('Uma IA generativa ainda não está conectada.', 'Este arquivo de demonstração funciona sem conexão com IA generativa.');
      return json(answer);
    }
    if (url === '/api/settings' && method === 'PATCH') {
      const settings = validateSettings(body, current.settings);
      commit({ ...current, settings });
      return json(settings);
    }
    if (!collections.includes(collection)) return json({ error: 'Página não encontrada.' }, 404);
    const get = (key: Collection, identifier: string) => (current[key] as Entity[]).find(record => record.id === identifier);
    const existing = id ? get(collection, id) : undefined;
    if (id && !existing) return json({ error: 'Registro não encontrado.' }, 404);
    if (method === 'POST' || method === 'PATCH') {
      if (method === 'PATCH' && !id) return json({ error: 'Registro não encontrado.' }, 404);
      const data = validateEntity(collection, body, { get }, existing);
      if(collection === 'classes' && data.syncToGoogle) throw new ValidationError('A conexão Google está disponível na versão online.');
      const record = { ...data, id: id || globalThis.crypto?.randomUUID?.() || `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` } as unknown as Entity;
      const next = structuredClone(current);
      const records = next[collection] as Entity[];
      if (id) records.splice(records.findIndex(item => item.id === id), 1, record);
      else records.push(record);
      commit(next);
      return json(record, method === 'POST' ? 201 : 200);
    }
    if (method === 'DELETE' && id) {
      const next = structuredClone(current);
      const records = next[collection] as Entity[];
      records.splice(records.findIndex(item => item.id === id), 1);
      if (collection === 'students') {
        next.classes = next.classes.map(item => ({ ...item, studentIds: item.studentIds.filter(value => value !== id) }));
        next.transactions = next.transactions.map(item => { if (item.studentId !== id) return item; const { studentId: _, ...rest } = item; return rest; });
      }
      commit(next);
      return new Response(null, { status: 204 });
    }
    return json({ error: 'Operação não disponível.' }, 405);
  } catch (error) {
    return json({ error: error instanceof ValidationError ? error.message : 'Não foi possível concluir nesta demonstração. Tente novamente.' }, 400);
  }
};
