import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Store } from './store.ts';

export interface AuthRequest { headers: { cookie?: string }; ip?: string; body?: { pin?: unknown } }
interface CookieOptions { httpOnly?: boolean; secure?: boolean; sameSite?: 'lax'; path?: string; maxAge?: number }
export interface AuthResponse {
  setHeader(name: string, value: string | number): unknown;
  status(code: number): AuthResponse;
  json(body: unknown): unknown;
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
}

type Sessions = Record<string, number>;
type Limits = Record<string, { count: number; until: number }>;
const DAY = 86400000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class PinAuth {
  private salt: string;
  private hash: Buffer;
  readonly cookieName: string;
  constructor(private store: Pick<Store, 'getMeta' | 'setMeta'>, pin: string, private secure = false, private now = () => Date.now()) {
    if (!/^\d{4,12}$/.test(pin)) throw new Error('APP_PIN deve conter entre 4 e 12 dígitos.');
    this.cookieName = secure ? '__Host-studio_session' : 'studio_session';
    this.salt = store.getMeta<string>('auth:salt') || randomBytes(24).toString('hex');
    this.hash = scryptSync(pin, this.salt, 32);
    if (store.getMeta<string>('auth:pin-hash') !== this.hash.toString('hex')) store.setMeta('auth:sessions', {});
    store.setMeta('auth:salt', this.salt);
    store.setMeta('auth:pin-hash', this.hash.toString('hex'));
  }
  private sessions(): Sessions {
    const all = this.store.getMeta<Sessions>('auth:sessions') || {};
    const live = Object.fromEntries(Object.entries(all).filter(([, expires]) => expires > this.now()));
    if (Object.keys(all).length !== Object.keys(live).length) this.store.setMeta('auth:sessions', live);
    return live;
  }
  session(req: AuthRequest): string | undefined {
    const token = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith(this.cookieName + '='))?.slice(this.cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const key = digest(token);
    return this.sessions()[key] ? key : undefined;
  }
  // Persisted, bounded buckets survive service restarts. Neither tokens nor IPs are stored in clear.
  limit(scope: string, key: string, max: number, windowMs: number): number {
    const values = this.store.getMeta<Limits>('limits:' + scope) || {};
    const live = Object.fromEntries(Object.entries(values).filter(([, entry]) => entry.until > this.now()));
    const id = digest(key);
    const entry = live[id] || { count: 0, until: this.now() + windowMs };
    if (entry.count >= max) return Math.ceil((entry.until - this.now()) / 1000);
    if (!live[id] && Object.keys(live).length >= 1000) return 60;
    live[id] = { ...entry, count: entry.count + 1 };
    this.store.setMeta('limits:' + scope, live);
    return 0;
  }
  login(req: AuthRequest, res: AuthResponse) {
    const globalWait = this.limit('login-global', 'shared', 100, 60 * 60 * 1000);
    const wait = globalWait || this.limit('login-ip', req.ip || 'unknown', 6, 15 * 60 * 1000);
    if (wait) { res.setHeader('Retry-After', wait); return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }); }
    const candidate = req.body?.pin;
    if (typeof candidate !== 'string' || !/^\d{4,12}$/.test(candidate) || !timingSafeEqual(scryptSync(candidate, this.salt, 32), this.hash)) return res.status(401).json({ error: 'PIN incorreto.' });
    const failed = this.store.getMeta<Limits>('limits:login-ip') || {};
    delete failed[digest(req.ip || 'unknown')]; this.store.setMeta('limits:login-ip', failed);
    const token = randomBytes(32).toString('hex');
    const all = this.sessions();
    if (Object.keys(all).length >= 500) delete all[Object.entries(all).sort((a,b) => a[1]-b[1])[0][0]];
    all[digest(token)] = this.now() + 7 * DAY;
    this.store.setMeta('auth:sessions', all);
    res.cookie(this.cookieName, token, { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/', maxAge: 7 * DAY });
    return res.json({ authenticated: true });
  }
  logout(req: AuthRequest, res: AuthResponse) {
    const key = this.session(req); const all = this.sessions();
    if (key) { delete all[key]; this.store.setMeta('auth:sessions', all); }
    res.clearCookie(this.cookieName, { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' });
    return res.json({ authenticated: false });
  }
}
