import pg from 'pg';
import { config } from '../config';

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

let pool: pg.Pool | null = null;

export function getPool(connectionString: string = config.databaseUrl): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

/** Injected pool override for tests (they point at foodbridge_test). */
export function setPool(p: pg.Pool | null): void {
  pool = p;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run `fn` inside a transaction. All multi-statement state changes
 * (review + status update, match accept + pickup creation, ...) use this so
 * they commit or roll back atomically.
 */
export async function withTransaction<T>(
  db: Queryable,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  // If we were handed a Pool, grab a dedicated client; a PoolClient is
  // already inside a transaction owned by the caller.
  if (typeof (db as pg.Pool).connect === 'function') {
    const client = await (db as pg.Pool).connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return fn(db as pg.PoolClient);
}
