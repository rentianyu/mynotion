import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(here, "..", "..", "..", "data");
export const DB_PATH = process.env.DATA_FILE ?? path.join(DATA_DIR, "mynotion.db");

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA foreign_keys = ON;");

const stmtCache = new Map<string, StatementSync>();

export function sql(query: string): StatementSync {
  let stmt = stmtCache.get(query);
  if (!stmt) {
    stmt = db.prepare(query);
    stmtCache.set(query, stmt);
  }
  return stmt;
}

export function all<T = Record<string, unknown>>(query: string, ...params: SQLInputValue[]): T[] {
  return sql(query).all(...params) as T[];
}

export function get<T = Record<string, unknown>>(query: string, ...params: SQLInputValue[]): T | undefined {
  return sql(query).get(...params) as T | undefined;
}

export function run(query: string, ...params: SQLInputValue[]): void {
  sql(query).run(...params);
}

/**
 * 一个 HTTP 写请求 = 一个事务。node:sqlite 全同步 + Node 单线程，
 * 请求处理器内不会有并发交错，事务只为崩溃原子性服务。
 */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function sqliteVersion(): string {
  return get<{ v: string }>("SELECT sqlite_version() AS v")!.v;
}
