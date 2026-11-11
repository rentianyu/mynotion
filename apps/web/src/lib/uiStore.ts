import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /**
   * pageId → 重挂载计数。正文里的子页面芯片由服务端在删除/恢复子页时同步摘除或放回，
   * 编辑器只在创建时吃一次 initialBlocks，所以宿主页要凭这个计数强制重建一次。
   */
  docRev: Record<string, number>;
  bumpDoc: (ids: string[]) => void;
};

export const useUiStore = create<UiState>((set) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  docRev: {},
  bumpDoc: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const next = { ...s.docRev };
      for (const id of ids) next[id] = (next[id] ?? 0) + 1;
      return { docRev: next };
    }),
}));

type TreeState = {
  /** pageId → 是否折叠其子树。默认展开，只记下用户手动折过的页。 */
  collapsed: Record<string, boolean>;
  toggleCollapsed: (id: string) => void;
  expand: (id: string) => void;
};

// 折叠是阅读偏好，不是数据：存本地，刷新/重开都保持原样。
export const useTreeStore = create<TreeState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggleCollapsed: (id) =>
        set((s) => {
          const next = { ...s.collapsed };
          if (next[id]) delete next[id];
          else next[id] = true;
          return { collapsed: next };
        }),
      expand: (id) =>
        set((s) => {
          if (!s.collapsed[id]) return s;
          const next = { ...s.collapsed };
          delete next[id];
          return { collapsed: next };
        }),
    }),
    { name: "mynotion-tree" },
  ),
);
