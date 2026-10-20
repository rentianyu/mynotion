// 双端共享的 API 契约类型。运行时零导出（全部 `export type`），
// 因此在 Node type-stripping 与 Vite 下都只需类型解析，不涉及包导出解析。

export type PropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url"
  | "created_time";

export type Choice = {
  id: string;
  name: string;
  color: string;
};

export type PropDef = {
  id: string;
  name: string;
  type: PropertyType;
  options?: {
    choices?: Choice[];
    format?: "number" | "percent" | "dollars";
  };
};

export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | { start: string | null; end: string | null };

export type PageMeta = {
  id: string;
  title: string;
  icon: string | null;
  cover: string | null;
  parentId: string | null;
  parentBlockId: string | null;
  databaseId: string | null;
  sortKey: string;
  isFavorite: boolean;
  properties: Record<string, PropertyValue>;
  createdAt: number;
  updatedAt: number;
};

/** 线上格式的扁平 block 行，与 `blocks` 表列一一对应。 */
export type BlockRow = {
  id: string;
  parentId: string;
  type: string;
  props: Record<string, unknown>;
  content: unknown[];
  sortKey: string;
};

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after"
  | "on"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type Filter = {
  id: string;
  property: string;
  operator: FilterOperator;
  value: PropertyValue;
};

export type Sort = {
  property: string;
  direction: "asc" | "desc";
};

export type ViewType = "table" | "board" | "calendar";

export type ViewConfig = {
  columns?: {
    order?: string[];
    hidden?: string[];
    widths?: Record<string, number>;
  };
  filters?: Filter[];
  filterConjunction?: "and" | "or";
  sorts?: Sort[];
  group?: string | null;
};

export type View = {
  id: string;
  databaseId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  sortKey: string;
};

export type Database = {
  id: string;
  title: string;
  icon: string | null;
  hostPageId: string;
  schema: PropDef[];
  createdAt: number;
  updatedAt: number;
};

/** `GET /api/pages/:id/document` 的响应：页面元数据 + 已组好树的 BlockNote 文档。 */
export type DocumentResponse = {
  page: PageMeta;
  /** BlockNote 原生 Block 形状，服务端已按 sortKey 组树，前端可直接喂给 initialContent。 */
  blocks: unknown[];
};

/** `PUT /api/pages/:id/blocks` 的请求体。 */
export type SaveBlocksRequest = {
  upserts: BlockRow[];
  deletes: string[];
};

export type SearchHit = {
  entityType: "page" | "block";
  entityId: string;
  snippet: string;
};

export type SearchGroup = {
  page: PageMeta;
  hits: SearchHit[];
};
