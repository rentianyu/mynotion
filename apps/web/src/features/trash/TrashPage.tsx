import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";

export function TrashPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["trash"], queryFn: api.listTrash });
  const refresh = (): void => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    qc.invalidateQueries({ queryKey: ["tree"] });
  };
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>回收站</h1>
      {data.length === 0 && <div style={{ color: "#888" }}>回收站是空的。</div>}
      {data.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f2f2f2" }}>
          <span>{p.icon ?? "📄"}</span>
          <span style={{ flex: 1 }}>{p.title || "无标题"}</span>
          <button style={btn} onClick={() => void api.restoreFromTrash(p.id).then(refresh)}>
            恢复
          </button>
          <button style={btn} onClick={() => void api.hardDelete(p.id).then(refresh)}>
            彻底删除
          </button>
        </div>
      ))}
    </div>
  );
}

const btn = {
  border: "1px solid #eee",
  background: "#fafafa",
  borderRadius: 6,
  padding: "2px 8px",
  cursor: "pointer",
  fontSize: 13,
};
