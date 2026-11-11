import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { reloadHostDocs } from "../../lib/reloadHostDocs.ts";
import { Icon } from "../../ui/Icon.tsx";
import type { PageMeta } from "@mynotion/shared";

const EMOJIS = ["📄","📝","📌","✅","🎯","💡","📚","🗂️","🔥","⭐","🌱","🏠","💼","🧠","🎨","📅","🚀","🔖","🧩","🍎"];

export function PageHeader({ page }: { page: PageMeta }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState<string | null>(page.icon);
  const [cover, setCover] = useState<string | null>(page.cover);
  const [fav, setFav] = useState<boolean>(page.isFavorite);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverEditing, setCoverEditing] = useState(false);
  const [coverDraft, setCoverDraft] = useState("");
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(page.title);
    setIcon(page.icon);
    setCover(page.cover);
    setFav(page.isFavorite);
  }, [page.title, page.icon, page.cover, page.isFavorite, page.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tree"] });
    qc.invalidateQueries({ queryKey: ["page-meta", page.id] });
  };

  const commitTitle = (next: string): void => {
    void api.patchPage(page.id, { title: next }).then(invalidate);
  };

  const setCoverUrl = (url: string | null) => {
    setCover(url);
    void api.patchPage(page.id, { cover: url }).then(invalidate);
  };

  return (
    <div className="page-header" style={{ position: "relative" }}>
      {cover && (
        <div
          style={{
            position: "relative",
            height: 200,
            borderRadius: 6,
            overflow: "hidden",
            marginBottom: 18,
            background: `url(${cover}) center/cover no-repeat`,
          }}
        >
          <button
            className="hover-only"
            onClick={() => setCoverUrl(null)}
            style={ghostBtnOnImage}
          >
            <Icon name="trash" size={14} /> 移除封面
          </button>
        </div>
      )}

      {/* 弱操作行：添加图标 / 添加封面（Notion 式，hover 显现） */}
      <div style={{ display: "flex", gap: 2, marginBottom: icon ? 2 : 6, minHeight: 26 }}>
        {!icon && (
          <button className="text-btn hover-only" onClick={() => setPickerOpen(true)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="smile" size={15} /> 添加图标
            </span>
          </button>
        )}
        {!cover && (
          <button
            className="text-btn hover-only"
            onClick={() => {
              setCoverDraft("");
              setCoverEditing(true);
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="image" size={15} /> 添加封面
            </span>
          </button>
        )}
      </div>

      {icon && <div style={{ fontSize: 78, lineHeight: 1, marginBottom: 6 }}>{icon}</div>}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <input
          value={title}
          placeholder="无标题"
          onChange={(e) => {
            setTitle(e.target.value);
            if (commitTimer.current) clearTimeout(commitTimer.current);
            commitTimer.current = setTimeout(() => commitTitle(e.target.value), 400);
          }}
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            border: "none",
            outline: "none",
            width: "100%",
            background: "transparent",
            color: "var(--ink)",
            fontFamily: "inherit",
            lineHeight: 1.1,
          }}
        />
        <div style={{ display: "flex", gap: 2, paddingTop: 8 }}>
          <button
            className="icon-btn hover-only"
            onClick={() =>
              setFav((f) => {
                const nf = !f;
                void api.patchPage(page.id, { isFavorite: nf }).then(invalidate);
                return nf;
              })
            }
            title={fav ? "取消收藏" : "收藏"}
            style={fav ? { color: "var(--ink)", opacity: 1 } : undefined}
          >
            <Icon name={fav ? "starFilled" : "star"} size={18} />
          </button>
          <button
            className="icon-btn hover-only"
            onClick={() =>
              void api.deletePage(page.id).then((res) => {
                qc.invalidateQueries({ queryKey: ["tree"] });
                void reloadHostDocs(qc, res.hostPageIds ?? []);
                navigate("/");
              })
            }
            title="删除页面"
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      </div>

      {coverEditing && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            autoFocus
            placeholder="粘贴封面图片 URL，回车应用"
            value={coverDraft}
            onChange={(e) => setCoverDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && coverDraft.trim()) {
                setCoverUrl(coverDraft.trim());
                setCoverEditing(false);
              }
              if (e.key === "Escape") setCoverEditing(false);
            }}
            style={{
              flex: 1,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              padding: "6px 10px",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              color: "var(--ink)",
            }}
          />
          <button className="text-btn" onClick={() => setCoverEditing(false)}>取消</button>
        </div>
      )}

      {pickerOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setPickerOpen(false)} />
          <div
            style={{
              position: "absolute",
              top: icon ? 90 : 34,
              left: 0,
              zIndex: 21,
              width: 320,
              background: "var(--bg-menu)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-menu)",
              padding: 8,
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 2,
            }}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setIcon(e);
                  setPickerOpen(false);
                  void api.patchPage(page.id, { icon: e }).then(() => qc.invalidateQueries({ queryKey: ["tree"] }));
                }}
                style={{ fontSize: 20, border: "none", background: "transparent", cursor: "pointer", padding: 4, borderRadius: "var(--radius-sm)" }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ghostBtnOnImage: CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "rgba(255,255,255,0.9)",
  color: "var(--ink)",
  fontSize: 13,
  padding: "4px 8px",
  cursor: "pointer",
  boxShadow: "var(--shadow-menu)",
};
