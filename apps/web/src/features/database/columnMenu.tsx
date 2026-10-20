import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { Icon } from "../../ui/Icon.tsx";
import { choiceColor } from "./cells.tsx";
import type { Choice, Database, PropDef, PropertyType } from "@mynotion/shared";

const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

const EDITABLE_TYPES: { type: PropertyType; label: string }[] = [
  { type: "rich_text", label: "文本" },
  { type: "number", label: "数字" },
  { type: "select", label: "单选" },
  { type: "multi_select", label: "多选" },
  { type: "date", label: "日期" },
  { type: "checkbox", label: "复选框" },
  { type: "url", label: "网址" },
];

function rnd(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 10);
}

function useSchemaCommit(dbId: string) {
  const qc = useQueryClient();
  return (schema: PropDef[]) => {
    void api.patchSchema(dbId, schema).then(() => qc.invalidateQueries({ queryKey: ["db", dbId] }));
  };
}

/**
 * 本地草稿输入框：编辑期间只更新本地 state，失焦或回车（且非输入法合成中）才提交。
 * 避免每敲一个字就发请求 + invalidate 导致服务端回传的 value 在中文输入法合成中途覆盖输入框。
 */
function LocalInput({
  value,
  onCommit,
  disabled,
  placeholder,
  autoFocus,
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          commit();
          e.currentTarget.blur();
        }
      }}
      style={style}
    />
  );
}

function Overlay({ anchorRef, onClose, children }: { anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode }) {
  const el = anchorRef.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const W = 240;
  const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
  const gap = 4;
  const spaceBelow = window.innerHeight - r.bottom - 12;
  const spaceAbove = r.top - 12;
  const flip = spaceBelow < 240 && spaceAbove > spaceBelow;
  const box: React.CSSProperties = {
    position: "fixed",
    left,
    width: W,
    zIndex: 1001,
    background: "var(--bg-menu)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-menu)",
    padding: 8,
    ...(flip
      ? { bottom: window.innerHeight - r.top + gap, maxHeight: Math.max(160, spaceAbove) }
      : { top: r.bottom + gap, maxHeight: Math.max(160, spaceBelow) }),
  };
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 1000 }} onClick={onClose} />
      <div style={{ ...box, overflowY: "auto" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </>,
    document.body,
  );
}

/** 选择/多选属性的选项管理。 */
function ChoiceList({ prop, onChange }: { prop: PropDef; onChange: (choices: Choice[]) => void }) {
  const choices = prop.options?.choices ?? [];
  const [draft, setDraft] = useState("");
  const setColor = (id: string, color: string) =>
    onChange(choices.map((c) => (c.id === id ? { ...c, color } : c)));
  const setName = (id: string, name: string) =>
    onChange(choices.map((c) => (c.id === id ? { ...c, name } : c)));
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", margin: "4px 0" }}>选项</div>
      {choices.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setColor(c.id, COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length] ?? "gray")}
              style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", border: "none", background: choiceColor(c.color), cursor: "pointer" }}
            />
          </div>
          <LocalInput
            value={c.name}
            onCommit={(v) => setName(c.id, v)}
            style={{ flex: 1, fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "2px 6px", outline: "none", fontFamily: "inherit", color: "var(--ink)" }}
          />
          <button onClick={() => onChange(choices.filter((x) => x.id !== c.id))} className="icon-btn" style={{ color: "var(--ink-3)" }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <input
        placeholder="新建选项，回车添加"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.nativeEvent.isComposing && draft.trim()) {
            onChange([...choices, { id: rnd("c_"), name: draft.trim(), color: "gray" }]);
            setDraft("");
          }
        }}
        style={{ width: "100%", fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "4px 8px", outline: "none", fontFamily: "inherit", color: "var(--ink)" }}
      />
    </div>
  );
}

/** 列头菜单：改名 / 改类型 / 选项 / 删除。 */
export function ColumnMenu({ dbId, prop, schema }: { dbId: string; prop: PropDef; schema: PropDef[] }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const commit = useSchemaCommit(dbId);
  const structural = prop.id === "title" || prop.id === "created";

  const set = (patch: Partial<PropDef>) =>
    commit(schema.map((p) => (p.id === prop.id ? { ...p, ...patch } : p)));

  return (
    <div ref={anchorRef} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)} className="icon-btn" style={{ color: "var(--ink-3)" }} title={prop.name}>
        <Icon name="more" size={15} />
      </button>
      {open && (
        <Overlay anchorRef={anchorRef} onClose={() => setOpen(false)}>
          <LocalInput
            value={prop.name}
            disabled={structural}
            onCommit={(v) => set({ name: v })}
            style={{ width: "100%", fontSize: 14, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "4px 8px", marginBottom: 6, outline: "none", fontFamily: "inherit", color: "var(--ink)" }}
          />
          <label style={{ fontSize: 12, color: "var(--ink-3)" }}>类型</label>
          <select
            value={prop.type}
            disabled={structural}
            onChange={(e) => set({ type: e.target.value as PropertyType })}
            style={{ width: "100%", fontSize: 13, marginBottom: 6, fontFamily: "inherit", color: "var(--ink)" }}
          >
            {structural ? (
              <option value={prop.type}>{prop.type}</option>
            ) : (
              EDITABLE_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))
            )}
          </select>
          {(prop.type === "select" || prop.type === "multi_select") && (
            <ChoiceList prop={prop} onChange={(choices) => set({ options: { ...prop.options, choices } })} />
          )}
          {!structural && (
            <button
              onClick={() => {
                commit(schema.filter((p) => p.id !== prop.id));
                setOpen(false);
              }}
              style={{ marginTop: 8, border: "none", background: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 }}
            >
              删除属性
            </button>
          )}
        </Overlay>
      )}
    </div>
  );
}

/** 表尾「+ 新建属性」按钮，弹类型选择。 */
export function AddProperty({ db, schema }: { db: Database; schema: PropDef[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);
  const commit = useSchemaCommit(db.id);

  const add = (type: PropertyType) => {
    const id = rnd("p_");
    const prop: PropDef = {
      id,
      name: name.trim() || (EDITABLE_TYPES.find((t) => t.type === type)?.label ?? "属性"),
      type,
      options: type === "select" || type === "multi_select" ? { choices: [] } : undefined,
    };
    commit([...schema, prop]);
    setName("");
    setOpen(false);
  };

  return (
    <div ref={anchorRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="新建属性"
        className="icon-btn"
        style={{ color: "var(--ink-3)" }}
      >
        <Icon name="plus" size={15} />
      </button>
      {open && (
        <Overlay anchorRef={anchorRef} onClose={() => setOpen(false)}>
          <input
            autoFocus
            placeholder="属性名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "4px 8px", marginBottom: 6, outline: "none", fontFamily: "inherit", color: "var(--ink)" }}
          />
          {EDITABLE_TYPES.map((t) => (
            <div key={t.type} onClick={() => add(t.type)} className="menu-item" style={{ padding: "6px 8px", cursor: "pointer", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--ink)" }}>
              {t.label}
            </div>
          ))}
        </Overlay>
      )}
    </div>
  );
}
