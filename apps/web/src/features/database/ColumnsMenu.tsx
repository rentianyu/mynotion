import { useState } from "react";
import { visibleColumns } from "./viewPipeline.ts";
import { Icon } from "../../ui/Icon.tsx";
import type { PropDef, ViewConfig } from "@mynotion/shared";

export function ColumnsMenu({
  schema,
  config,
  onChange,
}: {
  schema: PropDef[];
  config: ViewConfig;
  onChange: (c: ViewConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = visibleColumns(schema, config);
  const shownIds = new Set(shown.map((p) => p.id));

  const setCols = (patch: Partial<ViewConfig["columns"]>) =>
    onChange({ ...config, columns: { ...(config.columns ?? {}), ...patch } });

  const toggle = (id: string) => {
    const hidden = new Set(config.columns?.hidden ?? []);
    if (shownIds.has(id)) hidden.add(id);
    else hidden.delete(id);
    setCols({ hidden: [...hidden] });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const arr = shown.map((p) => p.id);
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j]!, arr[idx]!];
    setCols({ order: arr });
  };

  const hiddenCols = schema.filter((p) => !shownIds.has(p.id));

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="db-toolbar-btn">
        <Icon name="columns" size={14} /> 列
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div style={pop} onKeyDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: "var(--ink)" }}>属性</div>
            {shown.map((p, i) => (
              <div key={p.id} style={row}>
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center", cursor: "pointer", color: "var(--accent)" }} onClick={() => toggle(p.id)} title="隐藏">
                  <Icon name="check" size={15} />
                </span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--ink)" }}>{p.name}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="icon-btn" style={{ width: 20, height: 20 }} title="上移">
                  <Icon name="chevronDown" size={13} style={{ transform: "rotate(180deg)" }} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === shown.length - 1} className="icon-btn" style={{ width: 20, height: 20 }} title="下移">
                  <Icon name="chevronDown" size={13} />
                </button>
              </div>
            ))}
            {hiddenCols.length > 0 && <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />}
            {hiddenCols.map((p) => (
              <div key={p.id} style={{ ...row, opacity: 0.6 }}>
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center", cursor: "pointer", color: "var(--ink-3)" }} onClick={() => toggle(p.id)} title="显示">
                  <Icon name="plus" size={15} />
                </span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--ink-2)" }}>{p.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const pop: React.CSSProperties = { position: "absolute", top: "100%", left: 0, zIndex: 21, background: "var(--bg-menu)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-menu)", padding: 10, width: 240 };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "2px 0" };
