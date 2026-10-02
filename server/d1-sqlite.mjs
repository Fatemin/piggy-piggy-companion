/**
 * [ST0014] The slice of Cloudflare D1's API the Worker uses, on Node's
 * built-in SQLite — so tests and the local dev runner execute the very SQL
 * production runs, without wrangler.
 *
 *   db.prepare(sql).bind(...args).first() / .all() / .run()
 *   db.batch([statements])      — one transaction, like D1's
 */

import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = new URL('./schema.sql', import.meta.url)

class Statement {
  constructor(db, sql, args = []) {
    this.db = db
    this.sql = sql
    this.args = args
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args.map(value => (value === undefined ? null : value)))
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true }
  }

  async run() {
    return this.runSync()
  }

  runSync() {
    const info = this.db.prepare(this.sql).run(...this.args)
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }
  }
}

/** A D1-shaped database at `path` (default: in memory) with the schema applied. */
export function openD1(path = ':memory:') {
  const db = new DatabaseSync(path)
  db.exec(readFileSync(SCHEMA, 'utf8'))
  return {
    prepare: sql => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN')
      try {
        const results = statements.map(statement => statement.runSync())
        db.exec('COMMIT')
        return results
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}
