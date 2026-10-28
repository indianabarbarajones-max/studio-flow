import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Repository } from './repository.ts';

export { collections, emptySettings } from './repository.ts';

export class Store extends Repository {
  constructor(path: string, options: { seedDemo?: boolean } = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    super({
      all: (sql, ...bindings) => db.prepare(sql).all(...bindings),
      run: (sql, ...bindings) => { db.prepare(sql).run(...bindings); },
      transaction: operation => {
        db.exec('BEGIN IMMEDIATE');
        try { const result = operation(); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      close: () => db.close(),
    }, options);
  }
}
