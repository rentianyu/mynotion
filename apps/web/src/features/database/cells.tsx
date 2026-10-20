import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { Icon } from "../../ui/Icon.tsx";
import type { Choice, PageMeta, PropDef, PropertyValue } from "@mynotion/shared";

const COLORS: Record<string, string> = {
  gray: "#e3e3e3",
  brown: "#d3a589",
  orange: "#f6c177",
  yellow: "#e4d267",
  green: "#a5d6a0",
  blue: "#90c4e8",
  purple: "#c9a6e0",
  pink: "#f0a6c8",
  red: "#f0a0a0",
};

export function choiceColor(color: string): string {
  return COLORS[color] ?? COLORS.gray!;
}

function formatNumber(v: number, format?: "number" | "percent" | "dollars"): string {
  if (format === "percent") return `${v}%`;
  if (format === "dollars") return `$${v.toFixed(2)}`;
  return String(v);
}

function Chip({ name, color }: { name: string; color: string }) {
  return (
    <span
      style={{
        background: choiceColor(color),
        color: "#37352f",
        borderRadius: "var(--radius-sm)",
        padding: "1px 6px",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        width: 15,
        height: 15,
        borderRadius: 3,
        border: checked ? "none" : "1.5px solid var(--border-strong)",
        background: checked ? "var(--accent)" : "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
      }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 12 5 5L20 6" />
        </svg>
      )}
    </span>
  );
}

/** 只读展示。 */
export function CellDisplay({ prop, row }: { prop: PropDef; row: PageMeta }) {
  const v = row.properties[prop.id];
  const choices = prop.options?.choices ?? [];
  const find = (id: string) => choices.find((c) => c.id === id);
  switch (prop.type) {
    case "title":
      return <span>{row.title || ""}</span>;
    case "created_time":
      return <span style={{ color: "var(--ink-3)" }}>{new Date(row.createdAt).toLocaleDateString()}</span>;
    case "checkbox":
      return <Checkbox checked={v === true} />;
    case "number":
      return <span>{typeof v === "number" ? formatNumber(v, prop.options?.format) : ""}</span>;
    case "select": {
      const c = typeof v === "string" ? find(v) : undefined;
      return c ? <Chip name={c.name} color={c.color} /> : <span />;
    }
    case "multi_select": {
      const arr = Array.isArray(v) ? v : [];
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {arr.map((id) => {
            const c = find(id);
            return c ? <Chip key={id} name={c.name} color={c.color} /> : null;
          })}
        </span>
      );
    }
    case "date": {
      const d = v as { start: string | null } | null;
      return <span style={{ color: "var(--ink-2)" }}>{d?.start ?? ""}</span>;
    }
    case "url":
      return typeof v === "string" && v ? (
        <a href={v} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
          {v}
        </a>
      ) : (
        <span />
      );
    default:
      return <span>{typeof v === "string" ? v : ""}</span>;
  }
}

type CellProps = { dbId: string; prop: PropDef; row: PageMeta };

const cellBox: React.CSSProperties = {
  padding: "6px 10px",
  minHeight: 36,
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

/** 即点即改单元格。全部原生控件 + keydown 阻止冒泡，避免污染 ProseMirror。 */
export function Cell({ dbId, prop, row }: CellProps) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  const commit = (patch: { title?: string; values?: Record<string, PropertyValue> }) => {
    void api.patchRow(row.id, patch).then(() => qc.invalidateQueries({ queryKey: ["db", dbId] }));
  };

  // checkbox / created_time 不可点编辑
  if (prop.type === "checkbox") {
    return (
      <div
        contentEditable={false}
        style={cellBox}
        onClick={() => commit({ values: { [prop.id]: row.properties[prop.id] !== true } })}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CellDisplay prop={prop} row={row} />
      </div>
    );
  }
  if (prop.type === "created_time") {
    return (
      <div style={cellBox}>
        <CellDisplay prop={prop} row={row} />
      </div>
    );
  }

  const isPicker = prop.type === "select" || prop.type === "multi_select";

  return (
    <div
      ref={ref}
      contentEditable={false}
      style={{ ...cellBox, position: "relative", cursor: isPicker ? "pointer" : "text" }}
      onClick={() => (isPicker ? setOpen((o) => !o) : setEditing(true))}
    >
      {!editing && <CellDisplay prop={prop} row={row} />}
      {editing && (
        <TextEditor
          prop={prop}
          row={row}
          onDone={() => setEditing(false)}
          commit={commit}
        />
      )}
      {open && (
        <Picker
          prop={prop}
          row={row}
          commit={commit}
          close={() => setOpen(false)}
          anchorRef={ref}
        />
      )}
    </div>
  );
}

function TextEditor({
  prop,
  row,
  commit,
  onDone,
}: {
  prop: PropDef;
  row: PageMeta;
  commit: (p: { title?: string; values?: Record<string, PropertyValue> }) => void;
  onDone: () => void;
}) {
  const v = prop.type === "title" ? row.title : (row.properties[prop.id] as string | number | null);
  const initial =
    prop.type === "date" ? ((row.properties[prop.id] as { start: string | null } | null)?.start ?? "") : String(v ?? "");
  const [val, setVal] = useState(initial);

  const submit = () => {
    if (prop.type === "title") commit({ title: val });
    else if (prop.type === "date") commit({ values: { [prop.id]: { start: val || null, end: null } } });
    else if (prop.type === "number") commit({ values: { [prop.id]: val === "" ? null : Number(val) } });
    else commit({ values: { [prop.id]: val } });
    onDone();
  };

  useEffect(() => {
    const el = document.getElementById("cell-input-" + row.id + "-" + prop.id) as HTMLInputElement | null;
    el?.focus();
  }, [row.id, prop.id]);

  return (
    <input
      id={"cell-input-" + row.id + "-" + prop.id}
      type={prop.type === "number" ? "number" : prop.type === "date" ? "date" : "text"}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
        if (e.key === "Escape" && !e.nativeEvent.isComposing) onDone();
      }}
      style={{ width: "100%", fontSize: 14, border: "none", outline: "2px solid var(--accent)", padding: 2, borderRadius: "var(--radius-sm)", fontFamily: "inherit", color: "var(--ink)" }}
    />
  );
}

function Picker({
  prop,
  row,
  commit,
  close,
  anchorRef,
}: {
  prop: PropDef;
  row: PageMeta;
  commit: (p: { values?: Record<string, PropertyValue> }) => void;
  close: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const choices = prop.options?.choices ?? [];
  const cur = row.properties[prop.id];
  const isMulti = prop.type === "multi_select";
  const selected = new Set<string>(isMulti ? (Array.isArray(cur) ? cur : []) : typeof cur === "string" ? [cur] : []);

  const toggle = (c: Choice) => {
    if (isMulti) {
      const next = new Set(selected);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      commit({ values: { [prop.id]: [...next] } });
    } else {
      commit({ values: { [prop.id]: selected.has(c.id) ? null : c.id } });
      close();
    }
  };

  const el = anchorRef.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const W = 220;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
  const spaceBelow = window.innerHeight - r.bottom - 8;
  const spaceAbove = r.top - 8;
  const flip = spaceBelow < 200 && spaceAbove > spaceBelow;
  const box: React.CSSProperties = {
    position: "fixed",
    left,
    width: W,
    zIndex: 1001,
    background: "var(--bg-menu)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-menu)",
    padding: 4,
    maxHeight: Math.max(160, flip ? spaceAbove : spaceBelow),
    overflow: "auto",
    ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
  };

  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 1000 }} onClick={close} />
      <div style={box} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {choices.length === 0 && <div style={{ padding: 8, color: "var(--ink-3)", fontSize: 13 }}>无选项</div>}
        {choices.map((c) => (
          <div
            key={c.id}
            onClick={() => toggle(c)}
            className="menu-item"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
          >
            <span style={{ width: 14, display: "inline-flex", justifyContent: "center", color: "var(--accent)" }}>{selected.has(c.id) ? <Icon name="check" size={14} /> : null}</span>
            <Chip name={c.name} color={c.color} />
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
