import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { useUiStore } from "./uiStore.ts";

/**
 * 子页面被删除/恢复后，服务端会同步摘除或放回宿主页正文里的子页面芯片。
 * 编辑器只在创建时读一次 initialBlocks，所以必须先把宿主页文档重新拉到手，
 * 再抬重挂载计数——反过来的话重建时用的还是旧缓存，芯片看着没变化。
 */
export async function reloadHostDocs(qc: QueryClient, ids: string[]): Promise<void> {
  const hostIds = [...new Set(ids)];
  if (hostIds.length === 0) return;
  await Promise.all(
    hostIds.map((id) => qc.fetchQuery({ queryKey: ["doc", id], queryFn: () => api.getDocument(id) })),
  );
  useUiStore.getState().bumpDoc(hostIds);
}
