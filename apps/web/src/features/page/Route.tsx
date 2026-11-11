import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { useUiStore } from "../../lib/uiStore.ts";
import { EditorHost } from "../../editor/EditorHost.tsx";
import { PageHeader } from "./PageHeader.tsx";

export function PageRoute() {
  const { pageId = "" } = useParams();
  const rev = useUiStore((s) => s.docRev[pageId] ?? 0);
  const { data, isLoading, error } = useQuery({
    queryKey: ["doc", pageId],
    queryFn: () => api.getDocument(pageId),
    // EditorHost 用 initialContent 只在创建时吃一次数据、且 key=pageId。若沿用全局
    // staleTime:Infinity 的缓存，切走再切回会用「编辑前的旧快照」重建编辑器 → 看起来内容丢了
    // （其实已存到服务端）。编辑器状态由 autosave 单独维护，这里不缓存：离开即回收、回来必拉最新。
    staleTime: 0,
    gcTime: 0,
  });

  if (isLoading) return <div style={{ padding: 24, color: "var(--ink-3)" }}>加载中…</div>;
  if (error) return <div style={{ padding: 24, color: "var(--danger)" }}>页面加载失败：{String(error)}</div>;
  if (!data) return null;

  // key 换页/外部改动时重挂载 → 新 editor 实例（initialContent 只在创建时生效）。
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 60vh" }}>
      <PageHeader page={data.page} />
      <EditorHost key={`${pageId}:${rev}`} page={data.page} initialBlocks={data.blocks} initialKeys={data.keys} />
    </div>
  );
}
