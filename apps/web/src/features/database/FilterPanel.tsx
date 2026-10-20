import type { Filter, FilterOperator, PropDef, PropertyType, ViewConfig } from "@mynotion/shared";
import { Icon } from "../../ui/Icon.tsx";

const LABELS: Record<FilterOperator, string> = {
  is: "是",
  is_not: "不是",
  contains: "包含",
  not_contains: "不包含",
  is_empty: "为空",
  is_not_empty: "不为空",
  before: "早于",
  after: "晚于",
  on: "等于",
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
};

const OPS: Record<PropertyType, FilterOperator[]> = {
  title: ["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty"],
  rich_text: ["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty"],
  url: ["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty"],
  number: ["eq", "neq", "gt", "lt", "gte", "lte"],
  date: ["before", "after", "on", "is_empty"],
  created_time: ["before", "after", "on"],
  checkbox: ["is"],
  select: ["is", "is_not", "contains", "is_empty"],
  multi_select: ["contains", "not_contains", "is_empty", "is_not_empty"],
};

const NO_VALUE = new Set<FilterOperator>(["is_empty", "is_not_empty"]);

const TEXTY = new Set<PropertyType>(["title", "rich_text", "url"]);

export function FilterPanel({
  schema,
  config,
  onChange,
}: {
  schema: PropDef[];
  config: ViewConfig;
  onChange: (c: ViewConfig) => void;
}) {
  const filters = config.filters ?? [];
  const set = (next: Filter[]) => onChange({ ...config, filters: next });

  const addFilter = () => {
    const prop = schema.find((p) => p.type !== "created_time") ?? schema[0];
    if (!prop) return;
    const f: Filter = { id: "f_" + Math.random().toString(36).slice(2, 8), property: prop.id, operator: OPS[prop.type][0]!, value: "" };
    set([...filters, f]);
  };

  const upd = (id: string, patch: Partial<Filter>) =>
    set(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div style={{ padding: 12, minWidth: 420, fontSize: 13, color: "var(--ink)" }} onKeyDown={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong>筛选</strong>
        {filters.length > 1 && (
          <button
            onClick={() => onChange({ ...config, filterConjunction: config.filterConjunction === "or" ? "and" : "or" })}
            className="db-toolbar-btn"
          >
            {config.filterConjunction === "or" ? "任一匹配 (OR)" : "全部匹配 (AND)"}
          </button>
        )}
        <button onClick={addFilter} className="db-toolbar-btn" style={{ marginLeft: "auto" }}>
          <Icon name="plus" size={14} /> 添加
        </button>
      </div>
      {filters.length === 0 && <div style={{ color: "var(--ink-3)" }}>无筛选条件。</div>}
      {filters.map((f) => {
        const prop = schema.find((p) => p.id === f.property);
        if (!prop) return null;
        return (
          <div key={f.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: "var(--ink-3)", width: 30 }}>{filters.indexOf(f) === 0 ? "" : (config.filterConjunction ?? "and") === "or" ? "或" : "且"}</span>
            <select value={f.property} onChange={(e) => { const np = schema.find((p) => p.id === e.target.value)!; upd(f.id, { property: np.id, operator: OPS[np.type][0]!, value: "" }); }} style={sel}>
              {schema.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={f.operator} onChange={(e) => upd(f.id, { operator: e.target.value as FilterOperator })} style={sel}>
              {OPS[prop.type].map((op) => <option key={op} value={op}>{LABELS[op]}</option>)}
            </select>
            {!NO_VALUE.has(f.operator) && <ValueInput prop={prop} value={f.value} onCommit={(v) => upd(f.id, { value: v })} />}
            <button onClick={() => set(filters.filter((x) => x.id !== f.id))} className="icon-btn" style={{ color: "var(--ink-3)" }}><Icon name="trash" size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

const sel: React.CSSProperties = { fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "3px 6px", fontFamily: "inherit", color: "var(--ink)", background: "var(--bg-canvas)" };

function ValueInput({ prop, value, onCommit }: { prop: PropDef; value: unknown; onCommit: (v: string) => void }) {
  if (prop.type === "number") return <input type="number" defaultValue={String(value ?? "")} onChange={(e) => onCommit(e.target.value)} style={sel} />;
  if (prop.type === "date" || prop.type === "created_time") return <input type="date" defaultValue={String(value ?? "")} onChange={(e) => onCommit(e.target.value)} style={sel} />;
  if (prop.type === "checkbox") return (
    <select value={String(value ?? "true")} onChange={(e) => onCommit(e.target.value)} style={sel}><option value="true">是</option><option value="false">否</option></select>
  );
  if (prop.type === "select" || prop.type === "multi_select") return (
    <select value={String(value ?? "")} onChange={(e) => onCommit(e.target.value)} style={sel}>
      <option value="">选择…</option>
      {(prop.options?.choices ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
  if (TEXTY.has(prop.type)) return <input defaultValue={String(value ?? "")} onChange={(e) => onCommit(e.target.value)} style={{ ...sel, width: 120 }} />;
  return null;
}
