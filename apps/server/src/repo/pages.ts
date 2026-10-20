import { generateKeyBetween } from "fractional-indexing";
import type { PageMeta, PropertyValue } from "@mynotion/shared";
import { all, get, run, tx } from "../db.ts";
import { uuidv7 } from "../lib/uuid.ts";

export type PageRow = {
  id: string;
  title: string;
  icon: string | null;
  cover: string | null;
  parent_id: string | null;
  parent_block_id: string | null;
  database_id: string | null;
  sort_key: string;
  is_favorite: number;
  properties: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export function toMeta(r: PageRow): PageMeta {
  return {
    id: r.id,
    title: r.title,
    icon: r.icon,
    cover: r.cover,
    parentId: r.parent_id,
    parentBlockId: r.parent_block_id,
    databaseId: r.database_id,
    sortKey: r.sort_key,
    isFavorite: r.is_favorite === 1,
    properties: JSON.parse(r.properties) as Record<string, PropertyValue>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getPageMeta(id: string): PageMeta | undefined {
  const r = get<PageRow>("SELECT * FROM pages WHERE id = ?1", id);
  return r ? toMeta(r) : undefined;
}

export type NewPage = {
  id?: string;
  title?: string;
  parentId?: string | null;
  parentBlockId?: string | null;
  databaseId?: string | null;
  sortKey?: string;
  properties?: Record<string, PropertyValue>;
};

/** 同页兄弟里算一个排在末尾的 sort_key；无兄弟则起始键。 */
export function lastSortKey(parentId: string | null): string | null {
  if (parentId == null) return null;
  const r = get<{ sort_key: string }>(
    "SELECT sort_key FROM pages WHERE parent_id = ?1 ORDER BY sort_key DESC LIMIT 1",
    parentId,
  );
  return r?.sort_key ?? null;
}

/**
 * 建页 / 建库行。id 可由前端提供（幂等：slash 插块是同步操作，
 * 前端先生成 id 立即插块、随后 POST，服务端接受客户端 id、重试安全）。
 */
export function createPage(input: NewPage): PageMeta {
  const now = Date.now();
  const id = input.id ?? uuidv7();
  const sortKey = input.sortKey ?? generateKeyBetween(lastSortKey(input.parentId ?? null), null);
  return tx(() => {
    run(
      `INSERT INTO pages
        (id,title,icon,cover,parent_id,parent_block_id,database_id,sort_key,is_favorite,properties,created_at,updated_at)
       VALUES (?1,?2,NULL,NULL,?3,?4,?5,?6,0,?7,?8,?8)
       ON CONFLICT(id) DO NOTHING`,
      id,
      input.title ?? "",
      input.parentId ?? null,
      input.parentBlockId ?? null,
      input.databaseId ?? null,
      sortKey,
      JSON.stringify(input.properties ?? {}),
      now,
    );
    // FTS：页面标题条目
    syncPageTitle(id);
    return getPageMeta(id)!;
  });
}

/** 标题变更后重写该页的 FTS page 条目（PATCH /api/pages/:id 与行内 title 编辑共用）。 */
export function syncPageTitle(id: string): void {
  const p = get<{ title: string }>("SELECT title FROM pages WHERE id = ?1", id);
  run("DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = ?1", id);
  if (p) {
    run(
      `INSERT INTO search_fts (entity_type, entity_id, page_id, title, body)
       VALUES ('page', ?1, ?1, ?2, ?2)`,
      id,
      p.title,
    );
  }
}

/** 侧边栏树：只取普通页（非库行、非某文档 subpage 的目标页），软删过滤。 */
export function listTree(): PageMeta[] {
  const rows = all<PageRow>(
    `SELECT * FROM pages
     WHERE deleted_at IS NULL AND database_id IS NULL AND parent_block_id IS NULL
     ORDER BY sort_key`,
  );
  return rows.map(toMeta);
}

/** 软删一个页面及其子树（递归 CTE）。blocks 保存管线的级联也复用此函数。 */
export function softDeletePageTree(pageId: string, now = Date.now()): void {
  run(
    `WITH RECURSIVE subtree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT p.id FROM pages p JOIN subtree s ON p.parent_id = s.id WHERE p.deleted_at IS NULL
     )
     UPDATE pages SET deleted_at = ?2 WHERE id IN (SELECT id FROM subtree)`,
    pageId,
    now,
  );
}

/** 恢复页面及其被级联软删的子树。 */
export function restorePageTree(pageId: string): void {
  run(
    `WITH RECURSIVE subtree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT p.id FROM pages p JOIN subtree s ON p.parent_id = s.id
     )
     UPDATE pages SET deleted_at = NULL WHERE id IN (SELECT id FROM subtree)`,
    pageId,
  );
}

/** 回收站顶层项：已软删且其父未删（或无父）的页，避免子树重复列出。 */
export function listTrash(): PageMeta[] {
  const rows = all<PageRow>(
    `SELECT * FROM pages
     WHERE deleted_at IS NOT NULL AND database_id IS NULL
       AND (parent_id IS NULL OR parent_id NOT IN (SELECT id FROM pages WHERE deleted_at IS NOT NULL))
     ORDER BY deleted_at DESC`,
  );
  return rows.map(toMeta);
}

/** 彻底删除：物理删页及其所有后代（含 blocks 靠 FK 级联）。 */
export function hardDeletePageTree(pageId: string): void {
  const ids = all<{ id: string }>(
    `WITH RECURSIVE subtree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT p.id FROM pages p JOIN subtree s ON p.parent_id = s.id
     ) SELECT id FROM subtree`,
    pageId,
  );
  for (const row of ids) {
    // 先清 FTS（无 FK 约束到 pages），blocks 由 FK CASCADE 处理
    run("DELETE FROM search_fts WHERE page_id = ?1", row.id);
    run("DELETE FROM pages WHERE id = ?1", row.id);
  }
}

/** 拖拽改层级/排序：更新 parent_id + sort_key。 */
export function reparentPage(pageId: string, parentId: string | null, sortKey: string): PageMeta {
  run("UPDATE pages SET parent_id = ?2, sort_key = ?3 WHERE id = ?1", pageId, parentId, sortKey);
  return getPageMeta(pageId)!;
}
