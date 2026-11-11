import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router";
import { api } from "../../api/client.ts";
import { uuidv7 } from "../../lib/uuid.ts";
import { useUiStore } from "../../lib/uiStore.ts";
import { Icon } from "../../ui/Icon.tsx";
import { PageTree } from "./PageTree.tsx";

export function Sidebar() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const { data = [] } = useQuery({ queryKey: ["tree"], queryFn: api.getTree });

  const newPage = async (): Promise<void> => {
    const id = uuidv7();
    await api.createPage({ id, parentId: null });
    qc.invalidateQueries({ queryKey: ["tree"] });
    navigate(`/p/${id}`);
  };

  const favorites = data.filter((p) => p.isFavorite);

  return (
    <aside
      style={{
        width: 260,
        background: "var(--bg-sidebar)",
        padding: "8px 8px 12px",
        height: "100vh",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* workspace 头部 */}
      <div
        className="nav-item"
        style={{ padding: "6px 8px", marginBottom: 4, fontWeight: 500, color: "var(--ink)" }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: "var(--ink)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          M
        </span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>MyNotion</span>
        <Icon name="chevronDown" size={16} style={{ color: "var(--ink-3)" }} />
      </div>

      <div className="nav-item" onClick={() => setSearchOpen(true)}>
        <Icon name="search" size={18} />
        <span style={{ flex: 1 }}>搜索</span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>⌘K</span>
      </div>
      <div className="nav-item" onClick={() => void newPage()}>
        <Icon name="plus" size={18} />
        <span>新建页面</span>
      </div>

      {favorites.length > 0 && (
        <>
          <div className="side-section-label">
            <Icon name="starFilled" size={12} style={{ color: "var(--ink-3)" }} />
            收藏
          </div>
          {favorites.map((p) => (
            <div
              key={p.id}
              className={"nav-item" + (location.pathname === `/p/${p.id}` ? " active" : "")}
              onClick={() => navigate(`/p/${p.id}`)}
            >
              <span style={{ width: 18, textAlign: "center", fontSize: 15, flexShrink: 0 }}>{p.icon ?? "📄"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "无标题"}</span>
            </div>
          ))}
        </>
      )}

      <PageTree pages={data} />

      <div style={{ borderTop: "1px solid var(--border)", marginTop: "auto", paddingTop: 6 }}>
        <Link to="/trash" className="nav-item" style={{ textDecoration: "none", color: "var(--ink-2)" }}>
          <Icon name="trash" size={18} />
          <span>回收站</span>
        </Link>
      </div>
    </aside>
  );
}
