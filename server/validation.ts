import type { Collection, Settings } from '../shared/types.ts';
import type { Store } from './store.ts';

export class ValidationError extends Error {}
const fail = (message: string): never => { throw new ValidationError(message); };
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Envie um objeto JSON válido.');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max = 200, optional = false): string {
  if (typeof value !== 'string') return fail(`${name}: informe um texto.`);
  const result = value.trim();
  if ((!optional && !result) || result.length > max) return fail(`${name}: use ${optional ? 'até' : 'entre 1 e'} ${max} caracteres.`);
  return result;
}
function number(value: unknown, name: string, max = 100000000, positive = false, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (positive ? 0.01 : 0) || value > max || (integer && !Number.isInteger(value))) return fail(`${name}: informe um número ${positive ? 'positivo' : 'não negativo'}${integer ? ' inteiro' : ''} até ${max}.`);
  return value;
}
function money(value: unknown, name: string): number {
  const cents = number(value, name) * 100;
  if (Math.abs(cents - Math.round(cents)) > 0.000001) return fail(`${name}: use no máximo duas casas decimais.`);
  return Math.round(cents) / 100;
}
function date(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(`${name}: use uma data válida (AAAA-MM-DD).`);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > '2200-12-31') return fail(`${name}: data inválida.`);
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail(`${name}: opção inválida.`);
  return value as T;
}
function bool(value: unknown, name: string): boolean { if (typeof value !== 'boolean') return fail(`${name}: informe verdadeiro ou falso.`); return value; }
function allowedKeys(input: Record<string, unknown>, keys: string[]) { if (Object.keys(input).some(key => !keys.includes(key))) fail('Há campos desconhecidos ou protegidos na solicitação.'); }
const keys: Record<Collection, string[]> = {
  students: ['name', 'email', 'phone', 'plan', 'monthlyFee', 'status', 'renewalDate'],
  transactions: ['description', 'category', 'type', 'amount', 'dueDate', 'status', 'studentId'],
  classes: ['title', 'date', 'startTime', 'duration', 'capacity', 'instructor', 'studentIds', 'syncToGoogle'],
  tasks: ['title', 'area', 'dueDate', 'done'],
  content: ['title', 'channel', 'objective', 'scheduledDate', 'status', 'body'],
  goals: ['title', 'current', 'target', 'unit', 'deadline'],
};
export function validateEntity(collection: Collection, raw: unknown, store: Pick<Store, 'get'>, existing?: object): Record<string, unknown> {
  const input = object(raw);
  allowedKeys(input, keys[collection]);
  const d = { ...existing, ...input } as Record<string, unknown>;
  switch (collection) {
    case 'students': {
      const email = text(d.email ?? '', 'E-mail', 254, true);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail inválido.');
      return { name: text(d.name, 'Nome'), email, phone: text(d.phone ?? '', 'Telefone', 40, true), plan: text(d.plan, 'Plano'), monthlyFee: money(d.monthlyFee, 'Mensalidade'), status: choice(d.status, ['active', 'trial', 'paused'], 'Situação'), renewalDate: date(d.renewalDate, 'Renovação') };
    }
    case 'transactions': {
      const studentId = d.studentId;
      if (studentId !== undefined && studentId !== '' && (typeof studentId !== 'string' || !store.get('students', studentId))) fail('Aluno vinculado não encontrado.');
      return { description: text(d.description, 'Descrição'), category: text(d.category, 'Categoria', 80), type: choice(d.type, ['income', 'expense'], 'Tipo'), amount: money(d.amount, 'Valor'), dueDate: date(d.dueDate, 'Vencimento'), status: choice(d.status, ['paid', 'pending'], 'Situação'), ...(studentId ? { studentId } : {}) };
    }
    case 'classes': {
      const capacity = number(d.capacity, 'Vagas', 500, true, true);
      if (typeof d.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime)) fail('Horário inválido (HH:MM).');
      if (!Array.isArray(d.studentIds) || d.studentIds.some(id => typeof id !== 'string' || !store.get('students', id))) fail('A lista de alunos contém um cadastro inexistente.');
      const ids = d.studentIds as string[];
      if (new Set(ids).size !== ids.length) fail('Um aluno não pode ser inscrito duas vezes na mesma aula.');
      if (ids.length > capacity) fail('A quantidade de alunos ultrapassa as vagas da aula.');
      return { title: text(d.title, 'Nome da aula'), date: date(d.date, 'Data'), startTime: d.startTime, duration: number(d.duration, 'Duração', 480, true, true), capacity, instructor: text(d.instructor, 'Instrutor'), studentIds: ids, syncToGoogle: bool(d.syncToGoogle ?? false, 'Enviar ao Google Agenda') };
    }
    case 'tasks': return { title: text(d.title, 'Tarefa'), area: text(d.area, 'Área', 80), dueDate: date(d.dueDate, 'Prazo'), done: bool(d.done, 'Conclusão') };
    case 'content': return { title: text(d.title, 'Título'), channel: choice(d.channel, ['Instagram', 'WhatsApp'], 'Canal'), objective: text(d.objective, 'Objetivo'), scheduledDate: date(d.scheduledDate, 'Data'), status: choice(d.status, ['idea', 'draft', 'scheduled', 'published'], 'Etapa'), body: text(d.body ?? '', 'Conteúdo', 12000, true) };
    case 'goals': return { title: text(d.title, 'Meta'), current: number(d.current, 'Progresso'), target: number(d.target, 'Objetivo', 100000000, true), unit: text(d.unit, 'Unidade', 40), deadline: date(d.deadline, 'Prazo') };
  }
}
export function validateSettings(raw: unknown, current: Settings): Settings {
  const input = object(raw);
  const optionalFields = ['phone', 'email', 'address', 'instagram', 'website', 'description', 'audience', 'tone', 'services', 'studioMemory'] as const;
  allowedKeys(input, ['studioName', 'ownerName', 'monthlyRevenueTarget', ...optionalFields]);
  const data = { ...current, ...input };
  const result: Settings = { studioName: text(data.studioName, 'Nome do studio', 100), ownerName: text(data.ownerName, 'Seu nome', 100, true), monthlyRevenueTarget: money(data.monthlyRevenueTarget, 'Meta de receita') };
  const limits: Record<typeof optionalFields[number], number> = { phone: 40, email: 254, address: 500, instagram: 300, website: 500, description: 3000, audience: 3000, tone: 1500, services: 3000, studioMemory: 12000 };
  for (const field of optionalFields) result[field] = text(data[field] ?? '', field, limits[field], true);
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) fail('E-mail do studio inválido.');
  if (result.website) {
    try { const url = new URL(result.website); if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) fail('Site: informe um endereço HTTP ou HTTPS válido.'); }
    catch { fail('Site: informe um endereço HTTP ou HTTPS válido.'); }
  }
  return result;
}
