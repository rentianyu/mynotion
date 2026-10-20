import { all } from "../db.ts";
import { getPageMeta } from "./pages.ts";
import type { SearchGroup, SearchHit, PageMeta } from "@mynotion/shared";

type HitRow = { entity_type: string; entity_id: string; page_id: string; snip: string };

/**
 * 中文全文搜索：trigram 分词下 3+ 字用 MATCH（等价子串），1-2 字退回 LIKE。
 * 短语化并转义双引号，防 FTS 语法注入。
 */
export function search(qRaw: string, limit: number): SearchGroup[] {
  const q = qRaw.trim();
  if (!q) return [];

  let rows: HitRow[];
  if (q.length >= 3) {
    const phrase = '"' + q.replace(/"/g, '""') + '"';
    rows = all<HitRow>(
      `SELECT entity_type, entity_id, page_id,
              snippet(search_fts, 4, '<mark>', '</mark>', '…', 10) AS snip
       FROM search_fts WHERE body MATCH ?1 ORDER BY rank LIMIT ?2`,
      phrase,
      limit,
    );
  } else {
    const like = "%" + q.replace(/[%_]/g, (m) => "\\" + m) + "%";
    rows = all<HitRow>(
      `SELECT entity_type, entity_id, page_id,
              substr(body, 1, 60) AS snip
       FROM search_fts WHERE body LIKE ?1 ESCAPE '\\' LIMIT ?2`,
      like,
      limit,
    );
  }

  // 按页分组
  const byPage = new Map<string, SearchHit[]>();
  for (const r of rows) {
    const hit: SearchHit = { entityType: r.entity_type as "page" | "block", entityId: r.entity_id, snippet: r.snip };
    const list = byPage.get(r.page_id);
    if (list) list.push(hit);
    else byPage.set(r.page_id, [hit]);
  }

  const groups: SearchGroup[] = [];
  for (const [pageId, hits] of byPage) {
    const page: PageMeta | undefined = getPageMeta(pageId);
    if (page) groups.push({ page, hits });
  }
  return groups;
}
