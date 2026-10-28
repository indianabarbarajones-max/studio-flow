import { randomUUID } from 'node:crypto';
import type { Collection, Entity, Settings, StudioState, Transaction, YogaClass } from '../shared/types.ts';
import { seedState } from './seed.ts';

export const collections: Collection[] = ['students', 'transactions', 'classes', 'tasks', 'content', 'goals'];
export const emptySettings = (): Settings => ({ studioName: 'Meu Studio', ownerName: '', monthlyRevenueTarget: 0, phone: '', email: '', address: '', instagram: '', website: '', description: '', audience: '', tone: '', services: '', studioMemory: '' });

export interface DatabaseAdapter {
  all(sql: string, ...bindings: string[]): Record<string, unknown>[];
  run(sql: string, ...bindings: string[]): void;
  transaction<T>(operation: () => T): T;
  close?(): void;
}

/** Shared data rules for Node SQLite and Cloudflare's persistent SQLite storage. */
export class Repository {
  constructor(private db: DatabaseAdapter, options: { seedDemo?: boolean } = {}) {
    db.run('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id))');
    db.run('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
    if (!this.getMeta<Settings>('settings')) {
      const seed = options.seedDemo ? seedState() : undefined;
      db.transaction(() => {
        if (seed) for (const collection of collections) for (const record of seed[collection]) this.put(collection, record);
        this.setMeta('settings', seed?.settings ?? emptySettings());
        this.setMeta('demo', Boolean(seed));
      });
    }
  }
  setMeta(key: string, data: unknown) {
    this.db.run('INSERT INTO metadata(key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data', key, JSON.stringify(data));
  }
  getMeta<T>(key: string): T | undefined {
    const row = this.db.all('SELECT data FROM metadata WHERE key=?', key)[0];
    return row ? JSON.parse(row.data as string) as T : undefined;
  }
  deleteMeta(key: string) { this.db.run('DELETE FROM metadata WHERE key=?', key); }
  list<T extends Entity>(collection: Collection): T[] {
    return this.db.all('SELECT data FROM records WHERE collection=? ORDER BY rowid', collection).map(row => JSON.parse(row.data as string) as T);
  }
  get(collection: Collection, id: string): Entity | undefined {
    const row = this.db.all('SELECT data FROM records WHERE collection=? AND id=?', collection, id)[0];
    return row ? JSON.parse(row.data as string) as Entity : undefined;
  }
  put(collection: Collection, entity: Entity) {
    this.db.run('INSERT INTO records(collection,id,data) VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data', collection, entity.id, JSON.stringify(entity));
    return entity;
  }
  create(collection: Collection, data: Record<string, unknown>) { return this.put(collection, { ...data, id: randomUUID() } as unknown as Entity); }
  delete(collection: Collection, id: string) {
    this.db.transaction(() => {
      if (collection === 'students') {
        for (const cls of this.list<YogaClass>('classes')) if (cls.studentIds.includes(id)) this.put('classes', { ...cls, studentIds: cls.studentIds.filter(value => value !== id) });
        for (const tx of this.list<Transaction>('transactions')) if (tx.studentId === id) { const { studentId: _removed, ...rest } = tx; this.put('transactions', rest); }
      }
      this.db.run('DELETE FROM records WHERE collection=? AND id=?', collection, id);
    });
  }
  // Not exposed as a route. Requires explicit authorization and a private backup.
  clearData() {
    this.db.transaction(() => {
      this.db.run('DELETE FROM records');
      this.setMeta('settings', emptySettings());
      this.setMeta('demo', false);
    });
  }
  settings(): Settings { return { ...emptySettings(), ...this.getMeta<Settings>('settings') }; }
  setSettings(settings: Settings) { this.setMeta('settings', settings); return settings; }
  state(aiConfigured = false): StudioState {
    const result = { settings: this.settings(), demo: this.getMeta<boolean>('demo') ?? false, aiConfigured } as StudioState;
    for (const collection of collections) (result as unknown as Record<string, unknown>)[collection] = this.list(collection);
    return result;
  }
  close() { this.db.close?.(); }
}
