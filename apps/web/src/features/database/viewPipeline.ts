import type { Filter, PageMeta, PropDef, PropertyValue, Sort, ViewConfig } from "@mynotion/shared";

/** 取行在某属性上的值：title→pages.title，created_time→created_at，其余→properties[id]。 */
export function cellValue(row: PageMeta, prop: PropDef): PropertyValue | number {
  if (prop.type === "title") return row.title;
  if (prop.type === "created_time") return row.createdAt;
  return row.properties[prop.id] ?? null;
}

const TEXT_TYPES = new Set(["title", "rich_text", "url"]);
const NUM_TYPES = new Set(["number"]);
const DATE_TYPES = new Set(["date"]);

function asStr(v: PropertyValue | number): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function dateStart(v: PropertyValue | number): string | null {
  if (v && typeof v === "object" && "start" in v) return (v as { start: string | null }).start;
  return null;
}

function matchFilter(row: PageMeta, schema: PropDef[], f: Filter): boolean {
  const prop = schema.find((p) => p.id === f.property);
  if (!prop) return true;
  const v = cellValue(row, prop);
  const fv = asStr(f.value);

  if (TEXT_TYPES.has(prop.type)) {
    switch (f.operator) {
      case "is": return asStr(v) === fv;
      case "is_not": return asStr(v) !== fv;
      case "contains": return asStr(v).toLowerCase().includes(fv.toLowerCase());
      case "not_contains": return !asStr(v).toLowerCase().includes(fv.toLowerCase());
      case "is_empty": return asStr(v) === "";
      case "is_not_empty": return asStr(v) !== "";
      default: return true;
    }
  }
  if (NUM_TYPES.has(prop.type)) {
    const a = typeof v === "number" ? v : Number(v);
    const b = Number(fv);
    if (Number.isNaN(a)) return f.operator === "is_empty";
    switch (f.operator) {
      case "eq": return a === b;
      case "neq": return a !== b;
      case "gt": return a > b;
      case "lt": return a < b;
      case "gte": return a >= b;
      case "lte": return a <= b;
      case "is_empty": return false;
      default: return true;
    }
  }
  if (DATE_TYPES.has(prop.type)) {
    const d = dateStart(v);
    if (f.operator === "is_empty") return !d;
    if (!d) return false;
    switch (f.operator) {
      case "before": return d < fv;
      case "after": return d > fv;
      case "on": return d === fv;
      default: return true;
    }
  }
  if (prop.type === "checkbox") {
    return v === true ? fv === "true" : fv === "false";
  }
  if (prop.type === "select") {
    const choices = prop.options?.choices ?? [];
    const name = choices.find((c) => c.id === v)?.name ?? "";
    switch (f.operator) {
      case "is": return v === fv || name === fv;
      case "is_not": return v !== fv && name !== fv;
      case "contains": return name.toLowerCase().includes(fv.toLowerCase());
      case "is_empty": return !v;
      default: return true;
    }
  }
  if (prop.type === "multi_select") {
    const arr = Array.isArray(v) ? v : [];
    const choices = prop.options?.choices ?? [];
    const hit = (target: string) =>
      arr.some((id) => id === target || choices.find((c) => c.id === id)?.name === target);
    switch (f.operator) {
      case "contains": return hit(fv);
      case "not_contains": return !hit(fv);
      case "is_empty": return arr.length === 0;
      case "is_not_empty": return arr.length > 0;
      default: return true;
    }
  }
  return true;
}

function cmp(a: PropertyValue | number, b: PropertyValue | number, prop: PropDef): number {
  if (prop.type === "number") {
    const x = typeof a === "number" ? a : Number(a) || 0;
    const y = typeof b === "number" ? b : Number(b) || 0;
    return x - y;
  }
  if (prop.type === "date") {
    const x = dateStart(a) ?? "";
    const y = dateStart(b) ?? "";
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (prop.type === "checkbox") return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  if (prop.type === "created_time") return Number(a) - Number(b);
  if (prop.type === "select") {
    const ch = prop.options?.choices ?? [];
    return (ch.find((c) => c.id === a)?.name ?? "").localeCompare(ch.find((c) => c.id === b)?.name ?? "", "zh");
  }
  if (prop.type === "multi_select") {
    const av = Array.isArray(a) ? a.length : 0;
    const bv = Array.isArray(b) ? b.length : 0;
    return av - bv;
  }
  return asStr(a).localeCompare(asStr(b), "zh");
}

export function compareRows(a: PageMeta, b: PageMeta, schema: PropDef[], sorts: Sort[]): number {
  for (const s of sorts) {
    const prop = schema.find((p) => p.id === s.property);
    if (!prop) continue;
    const c = cmp(cellValue(a, prop), cellValue(b, prop), prop);
    if (c !== 0) return s.direction === "desc" ? -c : c;
  }
  return 0;
}

/** 表头/列体使用的可见列：按 config.order 排、剔除 hidden。 */
export function visibleColumns(schema: PropDef[], config: ViewConfig): PropDef[] {
  const hidden = new Set(config.columns?.hidden ?? []);
  const cols = schema.filter((p) => !hidden.has(p.id));
  const order = config.columns?.order;
  if (order && order.length) {
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...cols].sort((a, b) => (pos.get(a.id) ?? 9999) - (pos.get(b.id) ?? 9999));
  }
  return cols;
}

export function applyView(rows: PageMeta[], schema: PropDef[], config: ViewConfig): PageMeta[] {
  let r = rows;
  const filters = config.filters ?? [];
  if (filters.length) {
    const conj = config.filterConjunction ?? "and";
    r = r.filter((row) =>
      conj === "and" ? filters.every((f) => matchFilter(row, schema, f)) : filters.some((f) => matchFilter(row, schema, f)),
    );
  }
  const sorts = config.sorts ?? [];
  if (sorts.length) r = [...r].sort((a, b) => compareRows(a, b, schema, sorts));
  return r;
}
