import { getDefaultReactSlashMenuItems } from "@blocknote/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { api } from "../../api/client.ts";
import { uuidv7 } from "../../lib/uuid.ts";
import { queryClient } from "../../lib/queryClient.ts";
import type { AppBlockNoteEditor } from "../../blocks/schema.ts";

/** 在默认 slash 项基础上追加「子页面」「数据库」；按 query 过滤标题与别名。 */
export function getAppSlashItems(editor: AppBlockNoteEditor, pageId: string) {
  const subpage: DefaultReactSuggestionItem = {
    title: "子页面",
    subtext: "创建并嵌入一个子页面",
    aliases: ["subpage", "page", "页面", "子页面"],
    group: "基本块",
    icon: <span style={{ fontSize: 16 }}>📄</span>,
    onItemClick: () => {
      const newId = uuidv7();
      void api.createPage({ id: newId, parentId: pageId, title: "" }).then(() => {
        // 树查询是 staleTime: Infinity，不主动失效就只有在别处触发刷新时才看得见
        queryClient.invalidateQueries({ queryKey: ["tree"] });
        editor.insertBlocks([{ type: "subpage", props: { pageId: newId } }], editor.getTextCursorPosition().block, "after");
      });
    },
  };

  const database: DefaultReactSuggestionItem = {
    title: "数据库",
    subtext: "在当前页嵌入一个表格数据库",
    aliases: ["database", "table", "数据库", "表格"],
    group: "基本块",
    icon: <span style={{ fontSize: 16 }}>▦</span>,
    onItemClick: () => {
      const dbId = uuidv7();
      void api
        .createDatabase({ id: dbId, hostPageId: pageId, title: "未命名数据库" })
        .then((bundle) => {
          editor.insertBlocks(
            [{ type: "database", props: { databaseId: dbId, viewId: bundle.views[0]?.id ?? "" } }],
            editor.getTextCursorPosition().block,
            "after",
          );
        });
    },
  };

  const all = [...getDefaultReactSlashMenuItems(editor), subpage, database];

  return async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    const q = query.toLowerCase().trim();
    if (!q) return all;
    return all.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        (it.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
    );
  };
}
