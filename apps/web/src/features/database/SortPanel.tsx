import type { PropDef, Sort, ViewConfig } from "@mynotion/shared";
import { Icon } from "../../ui/Icon.tsx";

export function SortPanel({
  schema,
  config,
  onChange,
}: {
  schema: PropDef[];
  config: ViewConfig;
  onChange: (c: ViewConfig) => void;
}) {
  const sorts = config.sorts ?? [];
  const set = (next: Sort[]) => onChange({ ...config, sorts: next });
  const sel: React.CSSProperties = { fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "3px 6px", fontFamily: "inherit", color: "var(--ink)", background: "var(--bg-canvas)" };

  const add = () => {
    const prop = schema[0];
    if (!prop) return;
    set([...sorts, { property: prop.id, direction: "asc" }]);
  };

  return (
    <div style={{ padding: 12, minWidth: 360, fontSize: 13, color: "var(--ink)" }} onKeyDown={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <strong>排序</strong>
        <button onClick={add} className="db-toolbar-btn" style={{ marginLeft: "auto" }}>
          <Icon name="plus" size={14} /> 添加
        </button>
      </div>
      {sorts.length === 0 && <div style={{ color: "var(--ink-3)" }}>无排序规则。</div>}
      {sorts.map((s, i) => (
        <div key={s.property + i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span style={{ color: "var(--ink-3)", width: 30 }}>{i === 0 ? "" : "然后"}</span>
          <select value={s.property} onChange={(e) => set(sorts.map((x, xi) => (xi === i ? { ...x, property: e.target.value } : x)))} style={sel}>
            {schema.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={s.direction} onChange={(e) => set(sorts.map((x, xi) => (xi === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))} style={sel}>
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
          <button onClick={() => set(sorts.filter((_, xi) => xi !== i))} className="icon-btn" style={{ color: "var(--ink-3)" }}><Icon name="trash" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
