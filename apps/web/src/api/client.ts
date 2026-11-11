import type {
  DocumentResponse,
  PageMeta,
  SaveBlocksRequest,
  BlockRow,
  SearchGroup,
  Database,
  View,
  ViewConfig,
  PropDef,
  PropertyValue,
  ViewType,
} from "@mynotion/shared";
const BASE = "/api";

export type DatabaseBundle = { database: Database; views: View[]; rows: PageMeta[] };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  createPage(input: {
    id?: string;
    title?: string;
    parentId?: string | null;
    parentBlockId?: string | null;
  }): Promise<PageMeta> {
    return req("/pages", { method: "POST", body: JSON.stringify(input) });
  },
  getTree(): Promise<PageMeta[]> {
    return req("/tree");
  },
  getDocument(id: string): Promise<DocumentResponse> {
    return req<DocumentResponse>(`/pages/${id}/document`);
  },
  getPageMeta(id: string): Promise<PageMeta> {
    return req<DocumentResponse>(`/pages/${id}/document`).then((d) => d.page);
  },
  saveBlocks(id: string, body: SaveBlocksRequest): Promise<{ upserted: number; deleted: number }> {
    return req(`/pages/${id}/blocks`, { method: "PUT", body: JSON.stringify(body) });
  },
  patchPage(id: string, patch: { title?: string; icon?: string | null; cover?: string | null; isFavorite?: boolean }): Promise<PageMeta> {
    return req(`/pages/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  reparent(id: string, parentId: string | null, sortKey: string): Promise<PageMeta> {
    return req(`/pages/${id}/reparent`, {
      method: "PATCH",
      body: JSON.stringify({ parentId, sortKey }),
    });
  },
  deletePage(id: string): Promise<{ ok: true; hostPageIds: string[] }> {
    return req(`/pages/${id}`, { method: "DELETE" });
  },
  restorePage(id: string): Promise<{ page: PageMeta; hostPageIds: string[] }> {
    return req(`/pages/${id}/restore`, { method: "POST" });
  },
  listTrash(): Promise<PageMeta[]> {
    return req("/trash");
  },
  search(q: string): Promise<{ groups: SearchGroup[] }> {
    return req(`/search?q=${encodeURIComponent(q)}&limit=20`);
  },
  hardDelete(id: string): Promise<{ ok: true }> {
    return req(`/trash/${id}`, { method: "DELETE" });
  },
  restoreFromTrash(id: string): Promise<{ ok: true; hostPageIds: string[] }> {
    return req(`/trash/${id}/restore`, { method: "POST" });
  },
  createDatabase(input: {
    id?: string;
    hostPageId: string;
    title?: string;
    icon?: string | null;
    schema?: PropDef[];
  }): Promise<DatabaseBundle> {
    return req("/databases", { method: "POST", body: JSON.stringify(input) });
  },
  getDatabase(id: string): Promise<DatabaseBundle> {
    return req(`/databases/${id}`);
  },
  patchDatabase(id: string, patch: { title?: string }): Promise<Database> {
    return req(`/databases/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  patchSchema(id: string, schema: PropDef[]): Promise<Database> {
    return req(`/databases/${id}/schema`, { method: "PATCH", body: JSON.stringify({ schema }) });
  },
  createRow(dbId: string, input: { id?: string; title?: string; values?: Record<string, PropertyValue> } = {}): Promise<PageMeta> {
    return req(`/databases/${dbId}/rows`, { method: "POST", body: JSON.stringify(input) });
  },
  patchRow(rowId: string, patch: { title?: string; values?: Record<string, PropertyValue> }): Promise<PageMeta> {
    return req(`/rows/${rowId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteRow(rowId: string): Promise<{ ok: true }> {
    return req(`/rows/${rowId}`, { method: "DELETE" });
  },
  restoreRow(rowId: string): Promise<PageMeta> {
    return req(`/rows/${rowId}/restore`, { method: "POST" });
  },
  createView(dbId: string, input: { name?: string; type?: ViewType }): Promise<View> {
    return req(`/databases/${dbId}/views`, { method: "POST", body: JSON.stringify(input) });
  },
  patchView(id: string, patch: { name?: string; type?: ViewType; config?: ViewConfig }): Promise<View> {
    return req(`/views/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteView(id: string): Promise<{ ok: true }> {
    return req(`/views/${id}`, { method: "DELETE" });
  },
};

/** flush 用 keepalive，导航中不被取消。 */
export function saveBlocksKeepalive(id: string, body: SaveBlocksRequest): Promise<void> {
  return fetch(`${BASE}/pages/${id}/blocks`, {
    method: "PUT",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    keepalive: true,
  }).then(() => undefined);
}

export type { BlockRow };
