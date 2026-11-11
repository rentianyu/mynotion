import { generateKeyBetween } from "fractional-indexing";
import type {
  Database,
  PropDef,
  PropertyValue,
  View,
  ViewConfig,
  ViewType,
} from "@mynotion/shared";
import { all, get, run, tx } from "../db.ts";
import { uuidv7 } from "../lib/uuid.ts";
import { toMeta, getPageMeta, type PageRow } from "./pages.ts";

type DbRow = {
  id: string;
  title: string;
  icon: string | null;
  schema_json: string;
  host_page_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

type ViewRow = {
  id: string;
  database_id: string;
  name: string;
  type: ViewType;
  config_json: string;
  sort_key: string;
};

function toDatabase(r: DbRow): Database {
  return {
    id: r.id,
    title: r.title,
    icon: r.icon,
    hostPageId: r.host_page_id,
    schema: JSON.parse(r.schema_json) as PropDef[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toView(r: ViewRow): View {
  return {
    id: r.id,
    databaseId: r.database_id,
    name: r.name,
    type: r.type,
    config: JSON.parse(r.config_json) as ViewConfig,
    sortKey: r.sort_key,
  };
}

const DEFAULT_SCHEMA: PropDef[] = [
  { id: "title", name: "标题", type: "title" },
  { id: "created", name: "创建时间", type: "created_time" },
];

export type DatabaseBundle = { database: Database; views: View[]; rows: ReturnType<typeof toMeta>[] };

/** 建库：id 可由前端提供（slash 插块同步操作，先生成 id 立即插块、随后 POST）。附默认 schema + 默认表格视图。 */
export function createDatabase(input: {
  id?: string;
  hostPageId: string;
  title?: string;
  icon?: string | null;
  schema?: PropDef[];
}): DatabaseBundle {
  const now = Date.now();
  const id = input.id ?? uuidv7();
  const schema = input.schema ?? DEFAULT_SCHEMA;
  const viewId = uuidv7();
  return tx(() => {
    run(
      `INSERT INTO databases (id, title, icon, schema_json, host_page_id, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?6)
       ON CONFLICT(id) DO NOTHING`,
      id,
      input.title ?? "未命名数据库",
      input.icon ?? null,
      JSON.stringify(schema),
      input.hostPageId,
      now,
    );
    run(
      `INSERT INTO views (id, database_id, name, type, config_json, sort_key, created_at, updated_at)
       VALUES (?1,?2,'表格','table','{}','a0',?3,?3)
       ON CONFLICT(id) DO NOTHING`,
      viewId,
      id,
      now,
    );
    return getDatabaseBundle(id)!;
  });
}

export function listViews(dbId: string): View[] {
  return all<ViewRow>(
    "SELECT id,database_id,name,type,config_json,sort_key FROM views WHERE database_id = ?1 ORDER BY sort_key",
    dbId,
  ).map(toView);
}

export function listRows(dbId: string): ReturnType<typeof toMeta>[] {
  return all<PageRow>(
    "SELECT * FROM pages WHERE database_id = ?1 AND deleted_at IS NULL ORDER BY sort_key",
    dbId,
  ).map(toMeta);
}

export function getDatabaseBundle(dbId: string): DatabaseBundle | undefined {
  const r = get<DbRow>("SELECT * FROM databases WHERE id = ?1 AND deleted_at IS NULL", dbId);
  if (!r) return undefined;
  return { database: toDatabase(r), views: listViews(dbId), rows: listRows(dbId) };
}

/** 改库元信息（目前仅库名）。 */
export function updateDatabase(dbId: string, patch: { title?: string }): Database | undefined {
  const cur = get<DbRow>("SELECT * FROM databases WHERE id = ?1 AND deleted_at IS NULL", dbId);
  if (!cur) return undefined;
  if (patch.title !== undefined) {
    run("UPDATE databases SET title = ?1, updated_at = ?2 WHERE id = ?3", patch.title, Date.now(), dbId);
  }
  return toDatabase(get<DbRow>("SELECT * FROM databases WHERE id = ?1", dbId)!);
}

/**
 * 整体替换 schema。删属性/选项后清理行值中的孤儿 id：
 * 属性被删 → 丢对应值；select/multi_select 选项被删 → 丢指向已删选项的值。
 */
export function updateSchema(dbId: string, schema: PropDef[]): Database {
  return tx(() => {
    run("UPDATE databases SET schema_json = ?1, updated_at = ?2 WHERE id = ?3", JSON.stringify(schema), Date.now(), dbId);

    const propIds = new Set(schema.map((p) => p.id));
    const choicesByProp = new Map<string, Set<string>>();
    for (const p of schema) {
      if (p.type === "select" || p.type === "multi_select") {
        choicesByProp.set(p.id, new Set((p.options?.choices ?? []).map((c) => c.id)));
      }
    }

    const rows = all<{ id: string; properties: string }>(
      "SELECT id, properties FROM pages WHERE database_id = ?1",
      dbId,
    );
    for (const row of rows) {
      const vals = JSON.parse(row.properties) as Record<string, PropertyValue>;
      const next: Record<string, PropertyValue> = {};
      let changed = false;
      for (const [k, v] of Object.entries(vals)) {
        if (!propIds.has(k)) {
          changed = true;
          continue;
        }
        const choices = choicesByProp.get(k);
        if (choices) {
          if (Array.isArray(v)) {
            const kept = v.filter((x) => choices.has(x));
            if (kept.length !== v.length) changed = true;
            next[k] = kept;
            continue;
          }
          if (typeof v === "string" && !choices.has(v)) {
            changed = true;
            continue;
          }
        }
        next[k] = v;
      }
      if (changed) run("UPDATE pages SET properties = ?1 WHERE id = ?2", JSON.stringify(next), row.id);
    }
    return toDatabase(get<DbRow>("SELECT * FROM databases WHERE id = ?1", dbId)!);
  });
}

/** 建库行。行 = 页面：database_id 非空、不进侧边栏树；title 属性映射 pages.title，created_time 映射 created_at。 */
export function createRow(dbId: string, input: { id?: string; title?: string; values?: Record<string, PropertyValue> } = {}): ReturnType<typeof toMeta> {
  const now = Date.now();
  const id = input.id ?? uuidv7();
  const last = get<{ sort_key: string }>(
    "SELECT sort_key FROM pages WHERE database_id = ?1 ORDER BY sort_key DESC LIMIT 1",
    dbId,
  );
  const sortKey = generateKeyBetween(last?.sort_key ?? null, null);
  return tx(() => {
    run(
      `INSERT INTO pages
        (id,title,icon,cover,parent_id,parent_block_id,database_id,sort_key,is_favorite,properties,created_at,updated_at)
       VALUES (?1,?2,NULL,NULL,NULL,NULL,?3,?4,0,?5,?6,?6)
       ON CONFLICT(id) DO NOTHING`,
      id,
      input.title ?? "",
      dbId,
      sortKey,
      JSON.stringify(input.values ?? {}),
      now,
    );
    return getPageMeta(id)!;
  });
}

export type RowPatch = {
  title?: string;
  values?: Record<string, PropertyValue>; // 覆盖式合并到 properties
};

export function updateRow(rowId: string, patch: RowPatch): ReturnType<typeof toMeta> {
  return tx(() => {
    const cur = get<{ properties: string }>("SELECT properties FROM pages WHERE id = ?1", rowId);
    if (!cur) return getPageMeta(rowId)!;
    const merged = { ...(JSON.parse(cur.properties) as Record<string, PropertyValue>), ...(patch.values ?? {}) };
    const sets: string[] = ["properties = ?2", "updated_at = ?3"];
    if (patch.title !== undefined) sets.unshift("title = ?1");
    run(
      `UPDATE pages SET ${sets.join(", ")} WHERE id = ?4`,
      patch.title ?? null,
      JSON.stringify(merged),
      Date.now(),
      rowId,
    );
    if (patch.title !== undefined) {
      // 行 title 变更同步 FTS page 条目（复用标题逻辑）
      run("DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = ?1", rowId);
      run(
        `INSERT INTO search_fts (entity_type, entity_id, page_id, title, body)
         VALUES ('page', ?1, ?1, ?2, ?2)`,
        rowId,
        patch.title,
      );
    }
    return getPageMeta(rowId)!;
  });
}

export function softDeleteRow(rowId: string): void {
  run("UPDATE pages SET deleted_at = ?2 WHERE id = ?1", rowId, Date.now());
}

/** 恢复被软删的库行（撤销删除）。 */
export function restoreRow(rowId: string): ReturnType<typeof toMeta> | undefined {
  const row = get<{ database_id: string | null }>("SELECT database_id FROM pages WHERE id = ?1", rowId);
  if (!row || row.database_id === null) return undefined;
  run("UPDATE pages SET deleted_at = NULL WHERE id = ?1", rowId);
  return getPageMeta(rowId);
}

export function createView(dbId: string, input: { name?: string; type?: ViewType } = {}): View {
  const now = Date.now();
  const id = uuidv7();
  const last = get<{ sort_key: string }>(
    "SELECT sort_key FROM views WHERE database_id = ?1 ORDER BY sort_key DESC LIMIT 1",
    dbId,
  );
  const sortKey = generateKeyBetween(last?.sort_key ?? null, null);
  run(
    `INSERT INTO views (id, database_id, name, type, config_json, sort_key, created_at, updated_at)
     VALUES (?1,?2,?3,?4,'{}',?5,?6,?6)`,
    id,
    dbId,
    input.name ?? "表格",
    input.type ?? "table",
    sortKey,
    now,
  );
  return toView(get<ViewRow>("SELECT id,database_id,name,type,config_json,sort_key FROM views WHERE id = ?1", id)!);
}

export type ViewPatch = { name?: string; type?: ViewType; config?: ViewConfig };

export function updateView(viewId: string, patch: ViewPatch): View {
  const sets: string[] = [];
  const args: SQLArgs = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = ?${i++}`);
    args.push(patch.name);
  }
  if (patch.type !== undefined) {
    sets.push(`type = ?${i++}`);
    args.push(patch.type);
  }
  if (patch.config !== undefined) {
    sets.push(`config_json = ?${i++}`);
    args.push(JSON.stringify(patch.config));
  }
  if (sets.length > 0) {
    sets.push(`updated_at = ?${i++}`);
    args.push(Date.now());
    args.push(viewId);
    run(`UPDATE views SET ${sets.join(", ")} WHERE id = ?${i}`, ...args);
  }
  return toView(get<ViewRow>("SELECT id,database_id,name,type,config_json,sort_key FROM views WHERE id = ?1", viewId)!);
}

export function deleteView(viewId: string): void {
  run("DELETE FROM views WHERE id = ?1", viewId);
}

type SQLArgs = (string | number | null)[];
