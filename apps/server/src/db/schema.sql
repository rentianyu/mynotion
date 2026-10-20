-- MyNotion 数据模型单一真相。由 migrate.ts 在启动时执行，全部 IF NOT EXISTS 可重复运行。
-- Node 24 type-stripping 不能 import .sql，用 fs.readFileSync 读取。

CREATE TABLE IF NOT EXISTS pages (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  icon            TEXT,
  cover           TEXT,
  parent_id       TEXT REFERENCES pages(id),
  parent_block_id TEXT,
  database_id     TEXT REFERENCES databases(id),
  sort_key        TEXT NOT NULL,
  is_favorite     INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  properties      TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id, sort_key);
CREATE INDEX IF NOT EXISTS idx_pages_db     ON pages(database_id, sort_key);

CREATE TABLE IF NOT EXISTS databases (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT '',
  icon         TEXT,
  schema_json  TEXT NOT NULL,
  host_page_id TEXT NOT NULL REFERENCES pages(id),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);

CREATE TABLE IF NOT EXISTS views (
  id          TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '表格',
  type        TEXT NOT NULL DEFAULT 'table' CHECK (type IN ('table','board','calendar')),
  config_json TEXT NOT NULL DEFAULT '{}',
  sort_key    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_views_db ON views(database_id, sort_key);

CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  page_id    TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  parent_id  TEXT NOT NULL,
  type       TEXT NOT NULL,
  props      TEXT NOT NULL DEFAULT '{}',
  content    TEXT NOT NULL DEFAULT '[]',
  sort_key   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_blocks_sibs ON blocks(parent_id, sort_key);

-- FTS5 + trigram：中文正文全文搜索的决定性能力（trigram 走子串匹配，绕开 unicode61 不分词）。
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  entity_type UNINDEXED,
  entity_id   UNINDEXED,
  page_id     UNINDEXED,
  title       UNINDEXED,
  body,
  tokenize = 'trigram'
);
