import type { BlockRow } from "@mynotion/shared";
import { all, get, run, tx } from "../db.ts";
import { extractText } from "../lib/extractText.ts";
import { restorePageTree, softDeletePageTree } from "./pages.ts";

type BlockDbRow = {
  id: string;
  page_id: string;
  parent_id: string;
  type: string;
  props: string;
  content: string;
  sort_key: string;
};

type OutBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: unknown;
  children?: OutBlock[];
};

/** 一次读全页 block，内存按 parent_id 分组、组内按 sort_key 字符串排序，从哨兵（page_id）递归拼装。 */
export function getDocumentBlocks(pageId: string): { blocks: OutBlock[]; keys: Record<string, string> } {
  const rows = all<BlockDbRow>(
    "SELECT id,page_id,parent_id,type,props,content,sort_key FROM blocks WHERE page_id = ?1 ORDER BY sort_key, rowid",
    pageId,
  );
  const keys: Record<string, string> = {};
  for (const r of rows) keys[r.id] = r.sort_key;
  const byParent = new Map<string, BlockDbRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parent_id);
    if (list) list.push(r);
    else byParent.set(r.parent_id, [r]);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));

  const build = (parentId: string): OutBlock[] =>
    (byParent.get(parentId) ?? []).map((r) => {
      const block: OutBlock = {
        id: r.id,
        type: r.type,
        props: JSON.parse(r.props) as Record<string, unknown>,
        content: JSON.parse(r.content),
      };
      const kids = build(r.id);
      if (kids.length > 0) block.children = kids;
      return block;
    });

  return { blocks: build(pageId), keys };
}

function syncBlockFts(row: BlockRow, pageId: string): void {
  run("DELETE FROM search_fts WHERE entity_type = 'block' AND entity_id = ?1", row.id);
  const title = get<{ title: string }>("SELECT title FROM pages WHERE id = ?1", pageId)?.title ?? "";
  const body = extractText(row.content) || extractText(row.props);
  run(
    `INSERT INTO search_fts (entity_type, entity_id, page_id, title, body)
     VALUES ('block', ?1, ?2, ?3, ?4)`,
    row.id,
    pageId,
    title,
    body,
  );
}

function softDeleteDatabase(dbId: string, now: number): void {
  run("UPDATE databases SET deleted_at = ?2 WHERE id = ?1", dbId, now);
  run("UPDATE pages SET deleted_at = ?2 WHERE database_id = ?1 AND deleted_at IS NULL", dbId, now);
}

/** 文档里仍存在引用该库的块（撤销/移动）→ 复活库和同批级联软删的行。 */
function reviveDatabase(dbId: string): void {
  const d = get<{ deleted_at: number | null }>("SELECT deleted_at FROM databases WHERE id = ?1", dbId);
  if (!d || d.deleted_at === null) return;
  run("UPDATE databases SET deleted_at = NULL WHERE id = ?1", dbId);
  run("UPDATE pages SET deleted_at = NULL WHERE database_id = ?1 AND deleted_at = ?2", dbId, d.deleted_at);
}

export type SaveResult = { upserted: number; deleted: number };

/**
 * 一个 HTTP 写请求 = 一个事务。deletes 里若是 subpage/database 块，级联软删其引用实体；
 * upserts 原样存（sort_key 由前端用 fractional-indexing 算好）；FTS 同事务双写。
 */
export function saveDocument(
  pageId: string,
  upserts: BlockRow[],
  deletes: string[],
): SaveResult {
  const now = Date.now();
  return tx(() => {
    // 1. 级联软删：删除前先读出块的类型与 props
    for (const id of deletes) {
      const b = get<{ type: string; props: string }>(
        "SELECT type, props FROM blocks WHERE id = ?1",
        id,
      );
      if (!b) continue;
      const props = JSON.parse(b.props) as Record<string, string>;
      if (b.type === "subpage" && props.pageId) softDeletePageTree(props.pageId, now);
      if (b.type === "database" && props.databaseId) softDeleteDatabase(props.databaseId, now);
    }

    // 2. upsert 块 + FTS 双写
    for (const row of upserts) {
      const props = row.props as Record<string, unknown>;
      if (row.type === "database" && typeof props.databaseId === "string") {
        reviveDatabase(props.databaseId);
      }
      if (row.type === "subpage" && typeof props.pageId === "string") {
        const p = get<{ deleted_at: number | null }>("SELECT deleted_at FROM pages WHERE id = ?1", props.pageId);
        if (p && p.deleted_at !== null) restorePageTree(props.pageId);
      }
      run(
        `INSERT INTO blocks (id,page_id,parent_id,type,props,content,sort_key,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
         ON CONFLICT(id) DO UPDATE SET
           parent_id=excluded.parent_id, type=excluded.type, props=excluded.props,
           content=excluded.content, sort_key=excluded.sort_key, updated_at=excluded.updated_at`,
        row.id,
        pageId,
        row.parentId,
        row.type,
        JSON.stringify(row.props),
        JSON.stringify(row.content),
        row.sortKey,
        now,
      );
      syncBlockFts(row, pageId);
    }

    // 3. 删除块 + FTS 清理
    for (const id of deletes) {
      run("DELETE FROM blocks WHERE id = ?1", id);
      run("DELETE FROM search_fts WHERE entity_type = 'block' AND entity_id = ?1", id);
    }

    run("UPDATE pages SET updated_at = ?2 WHERE id = ?1", pageId, now);
    return { upserted: upserts.length, deleted: deletes.length };
  });
}
