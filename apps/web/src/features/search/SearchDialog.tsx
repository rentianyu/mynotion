import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { useUiStore } from "../../lib/uiStore.ts";

/** 服务端 snippet 只插入 <mark>，正文是用户文本：先全转义再还原 mark，避免 XSS。 */
function safeSnippet(snip: string): string {
  const escaped = snip
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
}

export function SearchDialog() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q),
    enabled: open && q.trim().length > 0,
    staleTime: 0,
  });

  useEffect(() => {
    if (open) {
      setRaw("");
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // 全局 Ctrl+K / Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const groups = data?.groups ?? [];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100 }} onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 600, margin: "80px auto", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,.2)" }}
      >
        <input
          ref={inputRef}
          value={raw}
          placeholder="搜索标题与正文…"
          onChange={(e) => {
            setRaw(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setQ(e.target.value), 250);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && groups[0]) {
              navigate(`/p/${groups[0].page.id}`);
              setOpen(false);
            }
          }}
          style={{ width: "100%", padding: 16, fontSize: 16, border: "none", outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ maxHeight: 380, overflow: "auto" }}>
          {groups.map((g) => (
            <div
              key={g.page.id}
              onClick={() => {
                navigate(`/p/${g.page.id}`);
                setOpen(false);
              }}
              style={{ padding: "10px 16px", borderTop: "1px solid #f2f2f2", cursor: "pointer" }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {g.page.icon ?? "📄"} {g.page.title || "无标题"}
              </div>
              {g.hits.slice(0, 3).map((h) => (
                <div
                  key={h.entityId}
                  style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: safeSnippet(h.snippet) }}
                />
              ))}
            </div>
          ))}
          {q.trim() && groups.length === 0 && <div style={{ padding: 16, color: "#999" }}>无结果</div>}
        </div>
      </div>
    </div>
  );
}
