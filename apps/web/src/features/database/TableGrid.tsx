import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Cell } from "./cells.tsx";
import { ColumnMenu, AddProperty } from "./columnMenu.tsx";
import { FilterPanel } from "./FilterPanel.tsx";
import { SortPanel } from "./SortPanel.tsx";
import { ColumnsMenu } from "./ColumnsMenu.tsx";
import { applyView, visibleColumns } from "./viewPipeline.ts";
import type { Database, PageMeta, PropDef, View, ViewConfig } from "@mynotion/shared";

const ROW_H = 36;
const TOOLBAR_H = 44;

function defaultWidth(prop: PropDef): number {
  if (prop.id === "title") return 220;
  if (prop.type === "number" || prop.type === "checkbox") return 110;
  if (prop.type === "date" || prop.type === "created_time") return 140;
  return 160;
}

type PopKind = "filter" | "sort" | null;

export function TableGrid({
  db,
  rows,
  view,
  onConfig,
}: {
  db: Database;
  rows: PageMeta[];
  view: View;
  onConfig: (c: ViewConfig) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const config = view.config ?? {};
  const [pop, setPop] = useState<PopKind>(null);
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const cols = visibleColumns(db.schema, config);
  const shownRows = applyView(rows, db.schema, config);

  const widths = config.columns?.widths ?? {};
  const widthOf = (p: PropDef) => widths[p.id] ?? defaultWidth(p);

  const virt = useVirtualizer({
    count: shownRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ROW_H,
  });

  // 跟随整页滚动的内嵌表：可视高度 = 视口底部 − 表格卡顶部，随滚动下移逐渐变高。
  const cardRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(420);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // 页面滚动容器不确定（main / 编辑器容器都可能），用 window 捕获阶段兜住一切 scroll 事件。
    // 不用 rAF 节流：后台标签页会冻结 rAF，导致测量永不执行。
    let last = 0;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const v = Math.max(240, Math.round(window.innerHeight - Math.max(top, TOOLBAR_H) - 16));
      setMaxH((prev) => (prev === v ? prev : v));
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.closest(".db-card")) return; // 表格自身内部滚动不影响可视高度
      const now = Date.now();
      if (now - last < 50) return;
      last = now;
      measure();
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const addRow = () => void api.createRow(db.id).then(() => qc.invalidateQueries({ queryKey: ["db", db.id] }));

  // 删行后可撤销：行是软删，撤销 = 清 deleted_at 并刷新。
  const clearUndo = () => {
    if (undoTimer.current !== null) {
      window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setUndo(null);
  };

  const deleteRow = (row: PageMeta) => {
    void api.deleteRow(row.id).then(() => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      setUndo({ id: row.id, title: row.title || "无标题" });
      undoTimer.current = window.setTimeout(() => setUndo(null), 10000);
      void qc.invalidateQueries({ queryKey: ["db", db.id] });
    });
  };

  const undoDelete = () => {
    if (!undo) return;
    const id = undo.id;
    clearUndo();
    void api.restoreRow(id).then(() => qc.invalidateQueries({ queryKey: ["db", db.id] }));
  };

  // 撤销快捷键：焦点在输入框/编辑器里时交给它们自己的撤销栈。
  useEffect(() => {
    if (!undo) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      e.preventDefault();
      undoDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  useEffect(() => () => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
  }, []);

  const gridTemplate = cols.map((c) => `${widthOf(c)}px`).join(" ") + " 36px";

  // 列宽拖拽：本地实时宽度，松手才提交，避免每像素写库。
  const drag = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const [live, setLive] = useState<{ id: string; w: number } | null>(null);

  const startResize = (e: React.PointerEvent, prop: PropDef) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id: prop.id, startX: e.clientX, startW: widthOf(prop) };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setLive({ id: d.id, w: Math.max(60, d.startW + (ev.clientX - d.startX)) });
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      if (d) {
        const w = Math.max(60, d.startW + (ev.clientX - d.startX));
        onConfig({ ...config, columns: { ...config.columns, widths: { ...widths, [d.id]: w } } });
      }
      drag.current = null;
      setLive(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const effWidth = (p: PropDef) => (live && live.id === p.id ? live.w : widthOf(p));
  const tmpl = cols.map((c) => `${effWidth(c)}px`).join(" ") + " 36px";
  // 网格总宽 = 各列宽 + 末尾删除列 36px。用它撑开滚动内容，保证行/列边框铺满横向滚动区。
  const totalW = cols.reduce((s, c) => s + effWidth(c), 0) + 36;

  const filterCount = (config.filters ?? []).length;
  const sortCount = (config.sorts ?? []).length;

  return (
    <div ref={cardRef} className="db-card" onDragStart={(e) => e.preventDefault()}>
      {/* 工具条 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", padding: "4px 6px", borderBottom: "1px solid var(--border)", position: "relative" }} contentEditable={false}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setPop(pop === "filter" ? null : "filter")} className="db-toolbar-btn">
            <Icon name="filter" size={14} /> 筛选{filterCount ? ` (${filterCount})` : ""}
          </button>
          {pop === "filter" && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setPop(null)} />
              <div style={popover}>
                <FilterPanel schema={db.schema} config={config} onChange={onConfig} />
              </div>
            </>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setPop(pop === "sort" ? null : "sort")} className="db-toolbar-btn">
            <Icon name="sort" size={14} /> 排序{sortCount ? ` (${sortCount})` : ""}
          </button>
          {pop === "sort" && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setPop(null)} />
              <div style={popover}>
                <SortPanel schema={db.schema} config={config} onChange={onConfig} />
              </div>
            </>
          )}
        </div>
        <ColumnsMenu schema={db.schema} config={config} onChange={onConfig} />
        <span style={{ color: "var(--ink-3)", fontSize: 12, paddingLeft: 4 }}>
          {shownRows.length === rows.length ? `${rows.length} 行` : `${shownRows.length} / ${rows.length} 行`}
        </span>
        <button onClick={addRow} className="db-toolbar-btn" style={{ marginLeft: "auto" }}>
          <Icon name="plus" size={14} /> 新建
        </button>
      </div>

      <div ref={parentRef} style={{ maxHeight: maxH, overflow: "auto" }} contentEditable={false}>
        <div style={{ minWidth: totalW }}>
          {/* 表头 */}
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: tmpl, background: varHeaderBg, borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--ink-2)" }}>
            {cols.map((c) => (
              <div key={c.id} className="db-th">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <ColumnMenu dbId={db.id} prop={c} schema={db.schema} />
                <span onPointerDown={(e) => startResize(e, c)} title="拖动调整列宽" className="db-resize" />
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 4px" }}>
              <AddProperty db={db} schema={db.schema} />
            </div>
          </div>

          {/* 虚拟行 */}
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((vi) => {
              const row = shownRows[vi.index]!;
              return (
                <div key={row.id} ref={virt.measureElement} data-index={vi.index} className="db-row" style={{ position: "absolute", top: 0, left: 0, width: "100%", minHeight: ROW_H, transform: `translateY(${vi.start}px)`, display: "grid", gridTemplateColumns: tmpl, fontSize: 14, alignItems: "stretch" }}>
                  {cols.map((c) => (
                    <div key={c.id} className="db-cell">
                      <Cell dbId={db.id} prop={c} row={row} />
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <button onClick={() => deleteRow(row)} title="删除行" className="db-del" style={{ border: "none", background: "none", cursor: "pointer", display: "inline-flex", padding: 2 }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {shownRows.length === 0 && (
          <div style={{ padding: 16, color: "var(--ink-3)", fontSize: 13 }}>{rows.length ? "筛选后无匹配行。" : "暂无行，点右上「＋ 新建」添加。"}</div>
        )}
      </div>

      {undo && (
        <div className="db-undo-toast" role="status">
          <span>已删除「{undo.title}」</span>
          <button onClick={undoDelete}>撤销</button>
          <span style={{ opacity: 0.55, fontSize: 12 }}>Ctrl+Z</span>
        </div>
      )}
    </div>
  );
}

const varHeaderBg = "var(--bg-canvas)";
const popover: React.CSSProperties = { position: "absolute", top: "100%", left: 0, zIndex: 21, background: "var(--bg-menu)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-menu)", marginTop: 2 };
