import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { Icon } from "../../ui/Icon.tsx";
import { TableGrid } from "./TableGrid.tsx";
import type { ViewConfig } from "@mynotion/shared";

/** 普通 React 组件：通过 React Query 读库，单元格/视图配置改动直接走 REST，完全绕过 BlockNote 文档。 */
export function DatabaseViewHost({ databaseId }: { databaseId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["db", databaseId],
    queryFn: () => api.getDatabase(databaseId),
    enabled: !!databaseId,
  });
  const qc = useQueryClient();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // autoFocus 先于 React 事件生效，onFocus 里 select() 会被浏览器随后重置；进编辑态后再挂载选中。
  useEffect(() => {
    if (titleEditing) titleRef.current?.select();
  }, [titleEditing]);

  if (!databaseId) return null;
  if (isLoading) return <div style={{ padding: 12, color: "var(--ink-3)" }}>加载数据库…</div>;
  if (error || !data) return <div style={{ padding: 12, color: "var(--danger)" }}>数据库加载失败</div>;

  const activeView = data.views.find((v) => v.id === activeViewId) ?? data.views[0];
  if (!activeView) return <div style={{ padding: 12, color: "var(--ink-3)" }}>无视图</div>;

  const refetch = () => qc.invalidateQueries({ queryKey: ["db", databaseId] });

  // 库名：点标题进入编辑，失焦/回车提交（避免每敲一字一次请求 + 中文合成期被覆盖）。
  const saveTitle = (raw: string) => {
    const title = raw.trim();
    if (title === data.database.title) return;
    void api.patchDatabase(databaseId, { title }).then(refetch);
  };

  const saveConfig = (c: ViewConfig) =>
    void api.patchView(activeView.id, { config: c }).then(refetch);

  const addView = () =>
    void api.createView(databaseId, { name: "表格", type: "table" }).then((v) => {
      refetch();
      setActiveViewId(v.id);
    });

  const renameView = (name: string) =>
    void api.patchView(activeView.id, { name }).then(refetch);

  const deleteView = () => {
    if (data.views.length <= 1) return;
    void api.deleteView(activeView.id).then(() => {
      setActiveViewId(null);
      refetch();
    });
  };

  return (
    <div style={{ margin: "8px 0", width: "100%", minWidth: 0 }} contentEditable={false} onKeyDown={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px", flexWrap: "wrap" }}>
        {titleEditing ? (
          <input
            ref={titleRef}
            autoFocus
            defaultValue={data.database.title}
            placeholder="未命名数据库"
            size={Math.max(10, (data.database.title || "未命名数据库").length + 2)}
            onBlur={(e) => {
              setTitleEditing(false);
              saveTitle(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
              if (e.key === "Escape" && !e.nativeEvent.isComposing) {
                e.currentTarget.value = data.database.title;
                e.currentTarget.blur();
              }
            }}
            style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", border: "none", outline: "none", background: "transparent", padding: 0, fontFamily: "inherit", minWidth: 80 }}
          />
        ) : (
          <span
            className="db-title"
            title="点击重命名"
            onClick={() => setTitleEditing(true)}
            style={{ fontSize: 15, fontWeight: 600, color: data.database.title ? "var(--ink)" : "var(--ink-3)" }}
          >
            {data.database.title || "未命名数据库"}
          </span>
        )}
        <div style={{ display: "flex", gap: 2, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
          {data.views.map((v) => (
            <div key={v.id} style={{ position: "relative" }}>
              <button
                onClick={() => setActiveViewId(v.id)}
                onDoubleClick={() => setMenuFor(v.id)}
                style={{
                  border: "none",
                  background: activeView.id === v.id ? "var(--bg-active)" : "transparent",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "3px 8px",
                  color: activeView.id === v.id ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: activeView.id === v.id ? 500 : 400,
                  fontFamily: "inherit",
                }}
              >
                {v.name}
              </button>
              {menuFor === v.id && v.id === activeView.id && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenuFor(null)} />
                  <div style={vmenu} onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      defaultValue={v.name}
                      onChange={(e) => renameView(e.target.value)}
                      placeholder="视图名称"
                      style={{ width: "100%", fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "4px 8px", marginBottom: 6, outline: "none", fontFamily: "inherit", color: "var(--ink)" }}
                    />
                    <button onClick={deleteView} disabled={data.views.length <= 1} style={{ border: "none", background: "none", color: data.views.length <= 1 ? "var(--ink-3)" : "var(--danger)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 }}>
                      删除此视图
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          <button onClick={() => setMenuFor(menuFor ? null : activeView.id)} title="重命名/删除视图" className="db-toolbar-btn" style={{ padding: "3px 6px" }}><Icon name="more" size={16} /></button>
          <button onClick={addView} title="新建视图" className="db-toolbar-btn" style={{ padding: "3px 6px" }}><Icon name="plus" size={16} /></button>
        </div>
      </div>

      <TableGrid db={data.database} rows={data.rows} view={activeView} onConfig={saveConfig} />
    </div>
  );
}

const vmenu: React.CSSProperties = { position: "absolute", top: "100%", right: 0, zIndex: 31, background: "var(--bg-menu)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-menu)", padding: 8, width: 180 };
