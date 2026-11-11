import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyBetween } from "fractional-indexing";
import { all, db, run, tx } from "../db.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export function migrate(): void {
  const ddl = readFileSync(path.join(here, "schema.sql"), "utf8");
  db.exec(ddl);
  renumberCollidingBlockKeys();
}

type KeyedBlock = { page_id: string; parent_id: string; id: string; sort_key: string };

/**
 * 旧版客户端每次加载都重新播种 sort_key（只用 a0,a1,…），改过的块写回时可能撞上未改动块保留的旧键。
 * 同组键一重复，顺序就只能靠 rowid 兜底，数据库块会被挤到页尾。这里把有冲突的组重新连续编号。
 */
function renumberCollidingBlockKeys(): void {
  const rows = all<KeyedBlock>(
    "SELECT page_id, parent_id, id, sort_key FROM blocks ORDER BY page_id, parent_id, sort_key, rowid",
  );
  const groups = new Map<string, KeyedBlock[]>();
  for (const r of rows) {
    const gk = `${r.page_id}\u0000${r.parent_id}`;
    const list = groups.get(gk);
    if (list) list.push(r);
    else groups.set(gk, [r]);
  }

  let patched = 0;
  tx(() => {
    for (const list of groups.values()) {
      const keys = new Set(list.map((b) => b.sort_key));
      if (keys.size === list.length) continue; // 无重复即视为正常，不打扰
      let prev: string | null = null;
      for (const b of list) {
        const k = generateKeyBetween(prev, null);
        if (k !== b.sort_key) {
          run("UPDATE blocks SET sort_key = ?1 WHERE id = ?2", k, b.id);
          patched++;
        }
        prev = k;
      }
    }
  });
  if (patched > 0) console.log(`已修正 ${patched} 个块的排序键（历史重复键导致的顺序漂移）`);
}
