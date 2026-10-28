export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const monthKey = () => today().slice(0, 7);
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value.slice(0, 10) + 'T12:00:00')) : 'Sem data';
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || 'Não foi possível concluir. Tente novamente.') as Error & {status:number};
    error.status = response.status; throw error;
  }
  return response.status === 204 ? undefined as T : response.json();
}
